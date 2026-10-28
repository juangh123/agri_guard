import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Crosshair, Flag, Footprints, MapPin, RotateCcw, Satellite, Undo2 } from 'lucide-react';
import { useTranslation } from '../i18n/config';
import {
  LIMITS,
  addCorner,
  buildBoundary,
  buildQuickPlot,
  cornerFromFixes,
  describeCapture,
} from '../utils/gnssBoundary';

const MODES = ['walk', 'quick'];

function accuracyTone(accuracy) {
  if (accuracy <= 10) return 'text-primary';
  if (accuracy <= LIMITS.maxCornerAccuracyM) return 'text-amber-600';
  return 'text-destructive';
}

/**
 * Registration step for the farm boundary.
 *
 * "Walk the boundary" (default): stand at each corner and mark it; every corner
 * is the weighted mean of the last few seconds of fixes, and the ring is closed
 * from the last corner to the first. "Quick point" keeps the old single-fix
 * path, labelled honestly as a 50 m placeholder square.
 *
 * `onChange` receives null until a usable boundary exists, then
 * { kind, geometry, device, accuracy, capturedAt, stats? }.
 */
const BoundaryCapture = ({ onChange }) => {
  const { t } = useTranslation();
  const [mode, setMode] = useState('walk');
  const [corners, setCorners] = useState([]);
  const [boundary, setBoundary] = useState(null);
  const [quick, setQuick] = useState(null);
  const [live, setLive] = useState(null);
  const [watching, setWatching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const watchId = useRef(null);
  const fixes = useRef([]);

  const stopWatch = useCallback(() => {
    if (watchId.current !== null && 'geolocation' in navigator) {
      navigator.geolocation.clearWatch(watchId.current);
    }
    watchId.current = null;
    setWatching(false);
  }, []);

  useEffect(() => stopWatch, [stopWatch]);

  const explain = useCallback((result) => {
    switch (result.reason || result.error) {
      case 'poor_accuracy':
        return t('boundary_reject_poor_accuracy', { accuracy: Math.round(result.accuracy), max: result.max });
      case 'too_close':
        return t('boundary_reject_too_close', { min: result.min });
      case 'no_fix':
        return t('boundary_waiting_fix');
      case 'too_many_corners':
        return t('boundary_error_too_many', { max: result.max });
      case 'too_few_corners':
        return t('boundary_error_too_few', { min: result.min });
      case 'self_intersecting':
        return t('boundary_error_self_intersecting');
      case 'too_small':
        return t('boundary_error_too_small', { area: result.areaHa.toFixed(3), min: result.min });
      case 'too_large':
        return t('boundary_error_too_large', { area: result.areaHa.toFixed(0), max: result.max });
      default:
        return t('error_gps_fail');
    }
  }, [t]);

  const reset = useCallback(() => {
    stopWatch();
    fixes.current = [];
    setCorners([]);
    setBoundary(null);
    setQuick(null);
    setLive(null);
    setMessage('');
    onChange(null);
  }, [onChange, stopWatch]);

  const switchMode = (next) => {
    if (next === mode) return;
    reset();
    setMode(next);
  };

  const startWatch = () => {
    if (!('geolocation' in navigator)) {
      setMessage(t('error_gps_unsupported'));
      return;
    }
    setMessage('');
    fixes.current = [];
    setWatching(true);
    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        if (![latitude, longitude, accuracy].every(Number.isFinite)) return;
        // Receipt time, not position.timestamp: it is compared with Date.now().
        const fix = { lng: longitude, lat: latitude, accuracy, t: Date.now() };
        fixes.current = [...fixes.current.slice(-49), fix];
        setLive(fix);
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          setMessage(t('error_gps_fail'));
          stopWatch();
          return;
        }
        // POSITION_UNAVAILABLE and TIMEOUT are transient (signal lost under
        // canopy, a quiet update interval). The browser keeps the watch alive,
        // so keep it and show "waiting" until the next fix arrives.
        setLive(null);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
  };

  const markCorner = () => {
    const candidate = cornerFromFixes(fixes.current, Date.now());
    const result = candidate.ok ? addCorner(corners, candidate.fix) : candidate;
    if (!result.ok) {
      setMessage(explain(result));
      return;
    }
    setMessage('');
    setCorners(result.corners);
  };

  const undoCorner = () => {
    setMessage('');
    setCorners((current) => current.slice(0, -1));
  };

  const closeBoundary = () => {
    const result = buildBoundary(corners);
    if (!result.ok) {
      setMessage(explain(result));
      return;
    }
    setMessage('');
    stopWatch();
    setBoundary(result);
    onChange({
      kind: 'walk',
      geometry: result.geometry,
      stats: result.stats,
      device: describeCapture('walk', result.stats),
      accuracy: result.stats.worstAccuracyM,
      capturedAt: result.stats.capturedAt,
    });
  };

  const quickFix = () => {
    if (!('geolocation' in navigator)) {
      setMessage(t('error_gps_unsupported'));
      return;
    }
    setBusy(true);
    setMessage('');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        const fix = { lng: longitude, lat: latitude, accuracy: Number.isFinite(accuracy) ? accuracy : null, t: Date.now() };
        setQuick(fix);
        setBusy(false);
        onChange({
          kind: 'quick',
          geometry: buildQuickPlot(fix),
          device: describeCapture('quick'),
          accuracy: fix.accuracy,
          capturedAt: new Date(fix.t).toISOString(),
        });
      },
      (error) => {
        console.error(error);
        setMessage(t('error_gps_fail'));
        setBusy(false);
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  const tabClass = (active) => `flex-1 py-2 px-3 rounded-lg text-sm font-bold transition-colors ${
    active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
  }`;
  const buttonClass = 'flex items-center justify-center gap-2 min-h-[44px] py-3 px-4 rounded-xl text-sm font-extrabold transition-all disabled:opacity-50 disabled:cursor-not-allowed';
  const secondaryButton = `${buttonClass} border border-border text-foreground hover:bg-muted`;

  return (
    <div>
      <div role="tablist" aria-label={t('location_label')} className="flex gap-1 p-1 mb-3 rounded-xl bg-muted">
        {MODES.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={mode === key}
            onClick={() => switchMode(key)}
            className={tabClass(mode === key)}
          >
            {t(key === 'walk' ? 'boundary_mode_walk' : 'boundary_mode_quick')}
          </button>
        ))}
      </div>

      {mode === 'quick' && (
        <>
          <p className="text-xs text-muted-foreground mb-3 leading-relaxed">{t('boundary_quick_note')}</p>
          {quick ? (
            <div className="flex items-center gap-2.5 p-3.5 bg-primary/10 text-primary border border-primary/30 rounded-xl text-sm font-bold">
              <CheckCircle2 className="h-6 w-6 shrink-0" />
              <span className="font-mono">{quick.lat.toFixed(5)}, {quick.lng.toFixed(5)}</span>
              {quick.accuracy !== null && (
                <span className="ms-auto font-mono text-xs font-semibold opacity-80">
                  {t('gnss_fix_accuracy', { accuracy: quick.accuracy.toFixed(1) })}
                </span>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={quickFix}
              disabled={busy}
              className={`${buttonClass} w-full border-2 border-dashed border-primary/50 text-primary hover:bg-primary/5 hover:border-primary`}
            >
              <MapPin className={`h-6 w-6 ${busy ? 'animate-bounce' : ''}`} />
              {busy ? t('acquiring_loc') : t('get_location')}
            </button>
          )}
        </>
      )}

      {mode === 'walk' && (
        <>
          <p className="text-xs text-muted-foreground mb-3 leading-relaxed">{t('boundary_walk_intro')}</p>

          {boundary ? (
            <div className="p-3.5 bg-primary/10 text-primary border border-primary/30 rounded-xl text-sm font-bold">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="h-6 w-6 shrink-0" />
                <span>
                  {t('boundary_summary', {
                    area: boundary.stats.areaHa.toFixed(2),
                    corners: boundary.stats.corners,
                    accuracy: boundary.stats.worstAccuracyM.toFixed(1),
                  })}
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm min-h-[24px]" aria-live="polite">
                <Satellite className="h-5 w-5 shrink-0 text-muted-foreground" />
                {watching && live ? (
                  <span className={`font-mono font-bold ${accuracyTone(live.accuracy)}`}>
                    {t('boundary_live_accuracy', { accuracy: live.accuracy.toFixed(1) })}
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    {watching ? t('boundary_waiting_fix') : t('boundary_gnss_off')}
                  </span>
                )}
                {corners.length > 0 && (
                  <span className="ms-auto font-semibold text-foreground">
                    {t('boundary_corners_count', { count: corners.length })}
                  </span>
                )}
              </div>

              {!watching ? (
                <button
                  type="button"
                  onClick={startWatch}
                  className={`${buttonClass} w-full border-2 border-dashed border-primary/50 text-primary hover:bg-primary/5 hover:border-primary`}
                >
                  <Crosshair className="h-6 w-6" />
                  {t('boundary_start')}
                </button>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={markCorner}
                    disabled={!live}
                    className={`${buttonClass} col-span-2 bg-primary text-primary-foreground hover:bg-primary/90`}
                  >
                    <Flag className="h-5 w-5" />
                    {t('boundary_mark_corner', { n: corners.length + 1 })}
                  </button>
                  <button type="button" onClick={undoCorner} disabled={corners.length === 0} className={secondaryButton}>
                    <Undo2 className="h-4 w-4" />
                    {t('boundary_undo_corner')}
                  </button>
                  <button
                    type="button"
                    onClick={closeBoundary}
                    disabled={corners.length < LIMITS.minCorners}
                    className={secondaryButton}
                  >
                    <Footprints className="h-4 w-4" />
                    {t('boundary_close')}
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {message && (
        <p role="alert" className="mt-3 text-xs font-semibold text-destructive leading-relaxed">{message}</p>
      )}

      {(boundary || quick || corners.length > 0) && (
        <button
          type="button"
          onClick={reset}
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-primary transition-colors"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {t('boundary_redo')}
        </button>
      )}
    </div>
  );
};

export default BoundaryCapture;
