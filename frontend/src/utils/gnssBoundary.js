// Field-boundary capture from GNSS fixes. Pure functions only (no DOM, no
// geolocation calls) so the geometry can be unit-tested with `node --test`.
//
// Workflow the UI builds on: the farmer stands at each corner of the field and
// marks it. A corner is the weighted mean of the fixes received in the last few
// seconds, so one noisy sample does not become a vertex. The ring is closed
// from the last corner back to the first.
//
// Limits mirror core/gnss_validation.py. The server re-checks everything; these
// copies exist to give the farmer an immediate, specific message.

export const EARTH_RADIUS_M = 6371007.2; // WGS84 authalic radius, same as the API

export const LIMITS = {
  minAreaHa: 0.01,
  maxAreaHa: 1000,
  maxVertices: 1000,
  // The UI refuses to mark a corner from a fix coarser than this. Phones in the
  // open usually report 3-15 m; indoors or under canopy they drift to 50 m+.
  maxCornerAccuracyM: 30,
  // A double tap must not create two corners on the same spot.
  minCornerSpacingM: 2,
  minCorners: 3,
  // Fixes older than this are not averaged into a corner.
  averagingWindowMs: 5000,
  // Only fixes near the newest one are averaged, so a corner marked soon after
  // walking from the previous one is not pulled back toward it. The radius is
  // the larger of this floor and twice the newest fix's reported accuracy.
  minClusterRadiusM: 5,
};

const toRad = (deg) => (deg * Math.PI) / 180;

/** Equirectangular local frame around `origin`; metres, x east, y north. */
export function localFrame(origin) {
  const cosLat = Math.cos(toRad(origin.lat));
  return {
    toXY: (p) => ({
      x: EARTH_RADIUS_M * cosLat * toRad(p.lng - origin.lng),
      y: EARTH_RADIUS_M * toRad(p.lat - origin.lat),
    }),
    fromXY: ({ x, y }) => ({
      lng: origin.lng + ((x / (EARTH_RADIUS_M * cosLat)) * 180) / Math.PI,
      lat: origin.lat + ((y / EARTH_RADIUS_M) * 180) / Math.PI,
    }),
  };
}

export function distanceM(a, b) {
  const { toXY } = localFrame(a);
  const { x, y } = toXY(b);
  return Math.hypot(x, y);
}

/**
 * Combine recent fixes into one position.
 *
 * Inverse-variance weighting favours the more accurate samples. The reported
 * accuracy is the best single sample, NOT the statistically combined value:
 * consecutive GNSS fixes share errors (multipath, atmosphere), so averaging does
 * not earn a claim of better accuracy than the receiver itself reported.
 */
export function averageFixes(fixes) {
  const usable = fixes.filter(
    (f) => Number.isFinite(f.lat) && Number.isFinite(f.lng) && Number.isFinite(f.accuracy) && f.accuracy > 0,
  );
  if (usable.length === 0) return null;

  let weightSum = 0;
  let lng = 0;
  let lat = 0;
  for (const f of usable) {
    const w = 1 / (f.accuracy * f.accuracy);
    weightSum += w;
    lng += f.lng * w;
    lat += f.lat * w;
  }
  return {
    lng: lng / weightSum,
    lat: lat / weightSum,
    accuracy: Math.min(...usable.map((f) => f.accuracy)),
    samples: usable.length,
    t: Math.max(...usable.map((f) => f.t ?? 0)),
  };
}

/**
 * Fixes to average for a corner: those inside the trailing time window AND near
 * the newest fix, which is the best estimate of where the farmer stands now.
 */
export function recentFixes(fixes, now, limits = LIMITS) {
  const inWindow = fixes.filter((f) => now - f.t <= limits.averagingWindowMs);
  const anchor = inWindow[inWindow.length - 1];
  if (!anchor) return [];
  const radius = Math.max(limits.minClusterRadiusM, 2 * (anchor.accuracy || 0));
  return inWindow.filter((f) => distanceM(anchor, f) <= radius);
}

/**
 * Turn the receiver's recent fixes into a corner candidate.
 *
 * The newest fix decides whether the receiver is good enough right now: an
 * older, better fix must not hide a signal that has just degraded.
 * Returns { ok: true, fix } or { ok: false, reason, ... }.
 */
export function cornerFromFixes(fixes, now, limits = LIMITS) {
  const recent = recentFixes(fixes, now, limits);
  if (recent.length === 0) return { ok: false, reason: 'no_fix' };
  const newest = recent[recent.length - 1];
  if (newest.accuracy > limits.maxCornerAccuracyM) {
    return {
      ok: false,
      reason: 'poor_accuracy',
      accuracy: newest.accuracy,
      max: limits.maxCornerAccuracyM,
    };
  }
  const fix = averageFixes(recent);
  return fix ? { ok: true, fix } : { ok: false, reason: 'no_fix' };
}

/**
 * Try to add `fix` as the next corner.
 * Returns { ok: true, corners } or { ok: false, reason, ...detail }.
 */
export function addCorner(corners, fix, limits = LIMITS) {
  if (!fix) return { ok: false, reason: 'no_fix' };
  if (fix.accuracy > limits.maxCornerAccuracyM) {
    return {
      ok: false,
      reason: 'poor_accuracy',
      accuracy: fix.accuracy,
      max: limits.maxCornerAccuracyM,
    };
  }
  if (corners.length >= limits.maxVertices) {
    return { ok: false, reason: 'too_many_corners', max: limits.maxVertices };
  }
  const previous = corners[corners.length - 1];
  if (previous && distanceM(previous, fix) < limits.minCornerSpacingM) {
    return { ok: false, reason: 'too_close', min: limits.minCornerSpacingM };
  }
  return { ok: true, corners: [...corners, fix] };
}

function cross(o, a, b) {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function segmentsProperlyIntersect(p1, p2, p3, p4) {
  const d1 = cross(p3, p4, p1);
  const d2 = cross(p3, p4, p2);
  const d3 = cross(p1, p2, p3);
  const d4 = cross(p1, p2, p4);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** True when any two non-adjacent edges of the closed ring cross. */
export function ringHasSelfIntersection(points) {
  const n = points.length;
  for (let i = 0; i < n; i += 1) {
    const a1 = points[i];
    const a2 = points[(i + 1) % n];
    for (let j = i + 1; j < n; j += 1) {
      const adjacent = j === i + 1 || (i === 0 && j === n - 1);
      if (adjacent) continue;
      if (segmentsProperlyIntersect(a1, a2, points[j], points[(j + 1) % n])) return true;
    }
  }
  return false;
}

function signedArea(points) {
  let twice = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    twice += a.x * b.y - b.x * a.y;
  }
  return twice / 2;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Turn marked corners into a GeoJSON polygon plus the numbers a surveyor would
 * ask for. Returns { ok: true, geometry, stats } or { ok: false, error, ... }.
 */
export function buildBoundary(corners, limits = LIMITS) {
  if (corners.length < limits.minCorners) {
    return { ok: false, error: 'too_few_corners', min: limits.minCorners };
  }

  const frame = localFrame(corners[0]);
  let xy = corners.map((c) => frame.toXY(c));

  if (ringHasSelfIntersection(xy)) return { ok: false, error: 'self_intersecting' };

  let area = signedArea(xy);
  // GeoJSON exterior rings are counter-clockwise (RFC 7946).
  let ordered = corners;
  if (area < 0) {
    ordered = [...corners].reverse();
    xy = [...xy].reverse();
    area = -area;
  }

  const areaHa = area / 10000;
  if (areaHa < limits.minAreaHa) {
    return { ok: false, error: 'too_small', areaHa, min: limits.minAreaHa };
  }
  if (areaHa > limits.maxAreaHa) {
    return { ok: false, error: 'too_large', areaHa, max: limits.maxAreaHa };
  }

  let perimeterM = 0;
  for (let i = 0; i < xy.length; i += 1) {
    const b = xy[(i + 1) % xy.length];
    perimeterM += Math.hypot(b.x - xy[i].x, b.y - xy[i].y);
  }

  const ring = ordered.map((c) => [c.lng, c.lat]);
  ring.push([...ring[0]]);

  const accuracies = corners.map((c) => c.accuracy);
  const times = corners.map((c) => c.t).filter(Number.isFinite);
  return {
    ok: true,
    geometry: { type: 'Polygon', coordinates: [ring] },
    stats: {
      corners: corners.length,
      areaHa,
      perimeterM,
      // The boundary is only as good as its worst corner.
      worstAccuracyM: Math.max(...accuracies),
      medianAccuracyM: median(accuracies),
      capturedAt: times.length ? new Date(Math.max(...times)).toISOString() : null,
    },
  };
}

/**
 * Fallback for a single fix: a square placeholder centred on it. This is NOT a
 * surveyed boundary and the device string sent with it says so.
 */
export function buildQuickPlot(fix, halfSideM = 25) {
  const frame = localFrame(fix);
  const ring = [
    { x: -halfSideM, y: -halfSideM },
    { x: halfSideM, y: -halfSideM },
    { x: halfSideM, y: halfSideM },
    { x: -halfSideM, y: halfSideM },
  ].map((p) => {
    const { lng, lat } = frame.fromXY(p);
    return [lng, lat];
  });
  ring.push([...ring[0]]);
  return { type: 'Polygon', coordinates: [ring] };
}

/** Receiver description stored with the farm; the API limits it to 100 chars. */
export function describeCapture(kind, stats) {
  if (kind === 'walk') {
    return `browser-geolocation walk-boundary, ${stats.corners} corners, median ±${stats.medianAccuracyM.toFixed(1)} m`.slice(0, 100);
  }
  return 'browser-geolocation single fix, 50 m placeholder square';
}
