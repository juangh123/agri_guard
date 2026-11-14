import React, { useRef, useState } from 'react';
import { BadgeCheck, CheckCircle2, FileUp, FlaskConical } from 'lucide-react';
import { useTranslation } from '../i18n/config';
import { api } from '../utils/api';

// Mirrors core.gnss_logs.MAX_LOG_BYTES; the server enforces it regardless.
export const MAX_LOG_BYTES = 1_500_000;
export const SAMPLE_LOG_URL = '/samples/SYNTHETIC_mwangi_walk.nmea';

/**
 * "Receiver file" boundary capture.
 *
 * The farmer picks the NMEA or GPX file their GNSS receiver recorded while they
 * walked the field edge (or occupied each corner). The file text is sent to the
 * server, which builds the boundary and computes the accuracy itself; this
 * component only shows that preview. On sign-up the same text is sent again and
 * the server parses it again, so nothing shown here is trusted.
 */
const ReceiverLogImport = ({ onChange, onMessage }) => {
  const { t } = useTranslation();
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const analyse = async (content, filename) => {
    setBusy(true);
    onMessage('');
    try {
      const { data } = await api.post('/gnss/parse-log/', { content, filename, format: 'auto' }, { auth: false });
      const { evidence } = data;
      setResult({ filename, evidence });
      onChange({
        kind: 'receiver',
        geometry: data.geometry,
        log: { content, filename, format: 'auto' },
        device: `receiver log: ${filename}`.slice(0, 100),
        accuracy: data.accuracy_m,
        capturedAt: evidence.started_at,
        evidence,
      });
    } catch (err) {
      setResult(null);
      onChange(null);
      onMessage(err.response?.data?.error || t('receiver_error_generic'));
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > MAX_LOG_BYTES) {
      onMessage(t('receiver_error_too_large', { max: (MAX_LOG_BYTES / 1_000_000).toFixed(1) }));
      return;
    }
    await analyse(await file.text(), file.name);
  };

  const useSample = async () => {
    setBusy(true);
    try {
      const response = await fetch(SAMPLE_LOG_URL);
      if (!response.ok) throw new Error(String(response.status));
      await analyse(await response.text(), SAMPLE_LOG_URL.split('/').pop());
    } catch {
      setBusy(false);
      onMessage(t('receiver_error_generic'));
    }
  };

  const reset = () => {
    setResult(null);
    onMessage('');
    onChange(null);
  };

  const buttonClass = 'flex items-center justify-center gap-2 min-h-[44px] py-3 px-4 rounded-xl text-sm font-extrabold transition-all disabled:opacity-50 disabled:cursor-not-allowed';

  if (result) {
    const ev = result.evidence;
    const rejected = Object.values(ev.rejected || {}).reduce((sum, n) => sum + n, 0);
    const basis = ev.accuracy_basis === 'gst' ? t('receiver_basis_gst')
      : ev.accuracy_basis === 'hdop_model' ? t('receiver_basis_hdop')
      : ev.accuracy_basis === 'mixed' ? t('receiver_basis_mixed') : t('gnss_unset');
    return (
      <div className="p-3.5 bg-primary/10 text-primary border border-primary/30 rounded-xl text-sm" data-testid="receiver-result">
        <div className="flex items-center gap-2.5 font-bold">
          <CheckCircle2 className="h-6 w-6 shrink-0" />
          <span>
            {t('receiver_summary', {
              area: Number(ev.area_ha).toFixed(2),
              vertices: ev.vertices,
              accuracy: ev.accuracy_p95_m !== null ? Number(ev.accuracy_p95_m).toFixed(1) : '?',
            })}
          </span>
        </div>
        <div className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide">
          <BadgeCheck className="h-3.5 w-3.5" />
          {t('receiver_server_verified')}
        </div>
        <dl className="mt-2 grid grid-cols-[auto,1fr] gap-x-3 gap-y-0.5 text-xs text-foreground">
          <dt className="text-muted-foreground">{t('receiver_file')}</dt>
          <dd className="font-mono truncate text-end" title={result.filename}>{result.filename}</dd>
          <dt className="text-muted-foreground">{t('receiver_method')}</dt>
          <dd className="text-end">{ev.method === 'surveyed_corners' ? t('receiver_method_corners') : t('receiver_method_walk')}</dd>
          <dt className="text-muted-foreground">{t('receiver_fixes')}</dt>
          <dd className="font-mono text-end">{t('receiver_fixes_value', { used: ev.fixes_used, total: ev.fixes_total, rejected })}</dd>
          <dt className="text-muted-foreground">{t('receiver_accuracy_basis')}</dt>
          <dd className="text-end">{basis}</dd>
          {ev.constellations_used?.length > 0 && (
            <>
              <dt className="text-muted-foreground">{t('receiver_constellations')}</dt>
              <dd className="text-end">{ev.constellations_used.join(' · ')}</dd>
            </>
          )}
        </dl>
        {result.filename.startsWith('SYNTHETIC_') && (
          <p className="mt-2 text-[11px] font-semibold text-amber-700">{t('receiver_sample_note')}</p>
        )}
        <button type="button" onClick={reset} className="mt-2 text-xs font-bold underline underline-offset-2">
          {t('receiver_choose_other')}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground leading-relaxed">{t('receiver_intro')}</p>
      <input
        ref={inputRef}
        type="file"
        accept=".nmea,.nma,.txt,.log,.gpx,text/plain,application/gpx+xml"
        className="sr-only"
        onChange={onFile}
        data-testid="receiver-file-input"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className={`${buttonClass} w-full border-2 border-dashed border-primary/50 text-primary hover:bg-primary/5 hover:border-primary`}
      >
        <FileUp className={`h-6 w-6 ${busy ? 'animate-pulse' : ''}`} />
        {busy ? t('receiver_analysing') : t('receiver_choose_file')}
      </button>
      <button
        type="button"
        onClick={useSample}
        disabled={busy}
        className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-primary transition-colors py-1"
      >
        <FlaskConical className="h-3.5 w-3.5" />
        {t('receiver_use_sample')}
      </button>
    </div>
  );
};

export default ReceiverLogImport;
