import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EARTH_RADIUS_M,
  LIMITS,
  addCorner,
  averageFixes,
  buildBoundary,
  buildQuickPlot,
  cornerFromFixes,
  describeCapture,
  distanceM,
  localFrame,
  recentFixes,
  ringHasSelfIntersection,
} from './gnssBoundary.js';

const within = (actual, expected, tolerance, label = '') => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label} expected ${expected} ± ${tolerance}, got ${actual}`,
  );
};

/** Corners of an axis-aligned square field, counter-clockwise from the south-west. */
function squareCorners({ lat = 0.5, lng = 35.0, sideM = 100, accuracy = 4 } = {}) {
  const frame = localFrame({ lat, lng });
  const h = sideM / 2;
  return [
    { x: -h, y: -h },
    { x: h, y: -h },
    { x: h, y: h },
    { x: -h, y: h },
  ].map((p, i) => ({ ...frame.fromXY(p), accuracy, t: 1000 + i }));
}

// The API computes area with this formula (core/gnss_validation.py); the client
// message must agree with the server verdict near the limits.
function serverStyleAreaHa(ring) {
  let total = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const [lng1, lat1] = ring[i];
    const [lng2, lat2] = ring[i + 1];
    total += ((lng2 - lng1) * Math.PI / 180)
      * (2 + Math.sin(lat1 * Math.PI / 180) + Math.sin(lat2 * Math.PI / 180));
  }
  return Math.abs((total * EARTH_RADIUS_M ** 2) / 2) / 10000;
}

test('a 100 m square is one hectare at the equator and at 45 degrees north', () => {
  for (const lat of [0.5, 45]) {
    const result = buildBoundary(squareCorners({ lat }));
    assert.equal(result.ok, true);
    within(result.stats.areaHa, 1, 0.01, `lat ${lat}`);
    within(result.stats.perimeterM, 400, 1, `lat ${lat}`);
  }
});

test('client area agrees with the server formula within 0.2 percent', () => {
  for (const [lat, sideM] of [[0.5, 100], [1.0, 800], [-1.3, 2500], [45, 400]]) {
    const result = buildBoundary(squareCorners({ lat, sideM }));
    assert.equal(result.ok, true);
    const server = serverStyleAreaHa(result.geometry.coordinates[0]);
    within(result.stats.areaHa / server, 1, 0.002, `lat ${lat} side ${sideM}`);
  }
});

test('clockwise corners are reordered to a counter-clockwise ring', () => {
  const clockwise = squareCorners().reverse();
  const result = buildBoundary(clockwise);
  assert.equal(result.ok, true);
  const ring = result.geometry.coordinates[0];
  assert.deepEqual(ring[0], ring[ring.length - 1], 'ring must be closed');
  assert.equal(ring.length, 5);
  // Shoelace over lng/lat is positive for counter-clockwise rings.
  let twice = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    twice += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  assert.ok(twice > 0);
});

test('stats report the worst and median corner accuracy and the latest capture time', () => {
  const corners = squareCorners();
  corners[0].accuracy = 3;
  corners[1].accuracy = 9;
  corners[2].accuracy = 5;
  corners[3].accuracy = 7;
  const { stats } = buildBoundary(corners);
  assert.equal(stats.worstAccuracyM, 9);
  assert.equal(stats.medianAccuracyM, 6);
  assert.equal(stats.corners, 4);
  assert.equal(stats.capturedAt, new Date(1003).toISOString());
});

test('a bow-tie ordering is rejected as self-intersecting', () => {
  const [a, b, c, d] = squareCorners();
  const result = buildBoundary([a, c, b, d]);
  assert.deepEqual(result, { ok: false, error: 'self_intersecting' });
});

test('concave but simple fields are accepted', () => {
  const frame = localFrame({ lat: 0.5, lng: 35 });
  const lShape = [
    { x: 0, y: 0 }, { x: 120, y: 0 }, { x: 120, y: 40 },
    { x: 40, y: 40 }, { x: 40, y: 120 }, { x: 0, y: 120 },
  ].map((p) => ({ ...frame.fromXY(p), accuracy: 5, t: 1 }));
  const result = buildBoundary(lShape);
  assert.equal(result.ok, true);
  within(result.stats.areaHa, (120 * 40 + 40 * 80) / 10000, 0.01);
});

test('too few corners, too small and too large are reported specifically', () => {
  assert.equal(buildBoundary(squareCorners().slice(0, 2)).error, 'too_few_corners');
  const tiny = buildBoundary(squareCorners({ sideM: 2 }));
  assert.equal(tiny.error, 'too_small');
  assert.ok(tiny.areaHa < LIMITS.minAreaHa);
  const huge = buildBoundary(squareCorners({ sideM: 5000 }));
  assert.equal(huge.error, 'too_large');
  assert.ok(huge.areaHa > LIMITS.maxAreaHa);
});

test('addCorner refuses coarse fixes, duplicate taps and unlimited growth', () => {
  const [first] = squareCorners();
  const accepted = addCorner([], first);
  assert.equal(accepted.ok, true);

  const coarse = addCorner([], { ...first, accuracy: 80 });
  assert.equal(coarse.ok, false);
  assert.equal(coarse.reason, 'poor_accuracy');
  assert.equal(coarse.max, LIMITS.maxCornerAccuracyM);

  const doubleTap = addCorner(accepted.corners, { ...first, lat: first.lat + 0.0000045 }); // ~0.5 m
  assert.equal(doubleTap.ok, false);
  assert.equal(doubleTap.reason, 'too_close');

  assert.equal(addCorner([], null).reason, 'no_fix');

  const full = Array.from({ length: LIMITS.maxVertices }, (_, i) => ({ ...first, lng: first.lng + i * 0.001 }));
  assert.equal(addCorner(full, { ...first, lat: first.lat + 0.01 }).reason, 'too_many_corners');
});

test('averageFixes weights accurate samples and never claims better than the best fix', () => {
  const good = { lng: 35.0, lat: 0.5, accuracy: 3, t: 10 };
  const bad = { lng: 35.0001, lat: 0.5001, accuracy: 30, t: 11 };
  const mean = averageFixes([good, bad]);
  // weight ratio is (30/3)^2 = 100, so the mean sits ~1 % of the way to the bad fix
  within(mean.lng, 35.0, 0.000002);
  within(mean.lat, 0.5, 0.000002);
  assert.equal(mean.accuracy, 3);
  assert.equal(mean.samples, 2);
  assert.equal(mean.t, 11);

  assert.equal(averageFixes([]), null);
  assert.equal(averageFixes([{ lng: NaN, lat: 0, accuracy: 5 }, { lng: 1, lat: 1, accuracy: 0 }]), null);
});

test('recentFixes keeps only samples inside the averaging window', () => {
  const fixes = [0, 4000, 9000].map((t) => ({ lat: 0.5, lng: 35, accuracy: 5, t }));
  // The window is inclusive: a fix exactly 5000 ms old still counts.
  assert.deepEqual(recentFixes(fixes, 9000).map((f) => f.t), [4000, 9000]);
  assert.deepEqual(recentFixes(fixes, 9500).map((f) => f.t), [9000]);
  assert.deepEqual(recentFixes(fixes, 20000), []);
  assert.deepEqual(recentFixes([], 0), []);
});

test('a corner marked right after moving is not dragged back toward the previous corner', () => {
  const frame = localFrame({ lat: 0.5, lng: 35 });
  const at = (x, y, t, accuracy = 5) => ({ ...frame.fromXY({ x, y }), accuracy, t });
  // Five fixes while standing at corner A, then the farmer walks 40 m to corner B
  // and taps "Mark corner" 1.5 s after the first fix there.
  const fixes = [
    at(0, 0, 0), at(0.4, -0.3, 500), at(-0.2, 0.5, 1000), at(0.1, 0.1, 1500), at(0, -0.2, 2000),
    at(40, 0.2, 3000), at(40.3, -0.1, 3500), at(39.8, 0.1, 4500),
  ];
  const corner = averageFixes(recentFixes(fixes, 4500));
  assert.ok(
    distanceM(corner, frame.fromXY({ x: 40, y: 0 })) < 1,
    'corner must sit at B, not between A and B',
  );
  assert.equal(corner.samples, 3);
});

test('a corner is judged by the newest fix, not by an older good one', () => {
  const frame = localFrame({ lat: 0.5, lng: 35 });
  const at = (x, y, t, accuracy) => ({ ...frame.fromXY({ x, y }), accuracy, t });

  // Good fix 1 s ago, then the signal degrades (e.g. walking under a roof).
  const degraded = cornerFromFixes([at(0, 0, 3000, 5), at(0.5, 0, 4000, 80)], 4200);
  assert.equal(degraded.ok, false);
  assert.equal(degraded.reason, 'poor_accuracy');
  assert.equal(degraded.accuracy, 80);
  assert.equal(degraded.max, LIMITS.maxCornerAccuracyM);

  // A noisy older sample does not block a good newest fix.
  const recovered = cornerFromFixes([at(0, 0, 3000, 45), at(0.3, 0.2, 4000, 6), at(0.1, 0, 4100, 5)], 4200);
  assert.equal(recovered.ok, true);
  assert.equal(recovered.fix.accuracy, 5);
  assert.ok(distanceM(recovered.fix, frame.fromXY({ x: 0.1, y: 0.1 })) < 1);

  assert.deepEqual(cornerFromFixes([], 0), { ok: false, reason: 'no_fix' });
  assert.deepEqual(cornerFromFixes([at(0, 0, 0, 5)], 60000), { ok: false, reason: 'no_fix' });
});

test('quick plot is a closed 50 m placeholder square of about a quarter hectare', () => {
  const fix = { lng: 36.82, lat: -1.29, accuracy: 6, t: 1 };
  const geometry = buildQuickPlot(fix);
  const ring = geometry.coordinates[0];
  assert.equal(ring.length, 5);
  assert.deepEqual(ring[0], ring[4]);
  within(serverStyleAreaHa(ring), 0.25, 0.005);
  within(distanceM(fix, { lng: ring[0][0], lat: ring[0][1] }), Math.hypot(25, 25), 0.1);
});

test('ringHasSelfIntersection accepts simple rings and detects crossings', () => {
  assert.equal(ringHasSelfIntersection([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }]), false);
  assert.equal(ringHasSelfIntersection([{ x: 0, y: 0 }, { x: 4, y: 4 }, { x: 4, y: 0 }, { x: 0, y: 4 }]), true);
});

test('capture descriptions stay inside the 100 character API limit', () => {
  const stats = { corners: 1234, medianAccuracyM: 12.345 };
  const walked = describeCapture('walk', stats);
  assert.ok(walked.length <= 100);
  assert.match(walked, /walk-boundary, 1234 corners, median ±12\.3 m/);
  assert.match(describeCapture('quick'), /placeholder/);
});
