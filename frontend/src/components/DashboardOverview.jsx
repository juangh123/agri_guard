import { useTranslation } from '../i18n/config';
import React, { useMemo } from 'react';
import { ShieldCheck, Clock, AlertTriangle, FileCheck, Activity } from 'lucide-react';

const ANOMALY_DATA = [
  { day: '01', anomaly: 0.2, threshold: 1.5 },
  { day: '05', anomaly: 0.5, threshold: 1.5 },
  { day: '10', anomaly: 0.8, threshold: 1.5 },
  { day: '15', anomaly: 1.6, threshold: 1.5 },
  { day: '20', anomaly: 2.1, threshold: 1.5 },
  { day: '25', anomaly: 1.8, threshold: 1.5 },
  { day: '30', anomaly: 0.9, threshold: 1.5 },
];

const SOURCE_DATA = [
  { name: 'VIIRS (Thermal)', value: 45 },
  { name: 'GEOGLOWS (Water)', value: 35 },
  { name: 'GNSS (Boundary)', value: 15 },
  { name: 'IoT (On-site)', value: 5 },
];
const SOURCE_COLORS = ['#EF4444', '#0284C7', '#16A34A', '#D97706'];

const DANGER_STATUSES = ['DISASTER', 'WARNING', 'DETECTED', 'TRIGGERED'];
const ANOMALY_MAX = 2.5;

function MonthlyClaimChart({ data }) {
  if (data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm font-semibold text-muted-foreground">
        —
      </div>
    );
  }

  const rawClaimMax = Math.max(...data.map((item) => Number(item.claims) || 0));
  const claimMax = Math.max(4, Math.ceil(rawClaimMax / 4) * 4);
  const rawPayoutMax = Math.max(...data.map((item) => Number(item.payout) || 0));
  const payoutMax = Math.max(0.5, Math.ceil(rawPayoutMax * 10) / 10);
  const ticks = [1, 0.75, 0.5, 0.25, 0];

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex min-h-0 flex-1 gap-2">
        <div className="flex w-7 flex-col justify-between pb-7 pt-0.5 text-right text-[10px] font-semibold text-muted-foreground">
          {ticks.map((tick) => (
            <span key={`claim-${tick}`}>{Math.round(claimMax * tick)}</span>
          ))}
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="relative flex-1">
            <div className="absolute inset-0 flex flex-col justify-between" aria-hidden="true">
              {ticks.map((tick) => (
                <span key={`grid-${tick}`} className="border-t border-border/70" />
              ))}
            </div>
            <div className="absolute inset-0 flex items-end justify-around gap-2 px-1">
              {data.map((item) => {
                const claims = Number(item.claims) || 0;
                const payout = Number(item.payout) || 0;
                const claimHeight = claimMax ? (claims / claimMax) * 100 : 0;
                const payoutHeight = payoutMax ? (payout / payoutMax) * 100 : 0;
                return (
                  <div
                    key={item.month}
                    className="flex h-full flex-1 items-end justify-center gap-1"
                    aria-label={`${item.month}: ${claims} claims, $${payout.toFixed(1)}k settled`}
                  >
                    <span
                      title={`${item.month}: ${claims} claims`}
                      className="w-2.5 max-w-5 rounded-t-sm bg-sky-600 transition-[height] duration-500 sm:w-3"
                      style={{ height: `${Math.max(claimHeight, claims ? 4 : 0)}%` }}
                    />
                    <span
                      title={`${item.month}: $${payout.toFixed(1)}k settled`}
                      className="w-2.5 max-w-5 rounded-t-sm bg-primary transition-[height] duration-500 sm:w-3"
                      style={{ height: `${payout ? Math.max(payoutHeight, 4) : 0}%` }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex h-7 items-end justify-around gap-2 px-1 text-[10px] font-semibold text-muted-foreground">
            {data.map((item) => (
              <span key={`month-${item.month}`} className="flex-1 text-center">{item.month}</span>
            ))}
          </div>
        </div>

        <div className="flex w-10 flex-col justify-between pb-7 pt-0.5 text-[10px] font-semibold text-muted-foreground">
          {ticks.map((tick) => (
            <span key={`payout-${tick}`}>${(payoutMax * tick).toFixed(1)}k</span>
          ))}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap justify-center gap-x-5 gap-y-1 text-[10px] font-bold text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-sky-600" />
          Total Claims
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-primary" />
          Completed Settlement ($k)
        </span>
      </div>
    </div>
  );
}

function SourceDonut({ data, colors }) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  let consumed = 0;

  return (
    <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" role="img" aria-label="Data source contribution">
      <circle cx="60" cy="60" r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth="18" />
      {data.map((item, index) => {
        const length = total ? (item.value / total) * circumference : 0;
        const offset = -consumed;
        consumed += length;
        return (
          <circle
            key={item.name}
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke={colors[index % colors.length]}
            strokeWidth="18"
            strokeDasharray={`${length} ${circumference - length}`}
            strokeDashoffset={offset}
          >
            <title>{`${item.name}: ${item.value}%`}</title>
          </circle>
        );
      })}
    </svg>
  );
}

function AnomalyChart({ data, thresholdLabel, anomalyLabel }) {
  const xFor = (index) => (data.length > 1 ? (index / (data.length - 1)) * 100 : 0);
  const yFor = (value) => Math.max(0, Math.min(100, (1 - value / ANOMALY_MAX) * 100));
  const points = data.map((item, index) => ({
    ...item,
    x: xFor(index),
    y: yFor(item.anomaly),
  }));
  const linePath = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  const areaPath = points.length
    ? `M ${points[0].x} 100 L ${points.map((point) => `${point.x} ${point.y}`).join(' L ')} L ${points.at(-1).x} 100 Z`
    : '';
  const thresholdY = yFor(1.5);
  const yTicks = [2.5, 2, 1.5, 1, 0.5, 0];

  return (
    <div className="flex h-full w-full gap-2">
      <div className="flex w-7 flex-col justify-between pb-7 text-right text-[10px] font-semibold text-muted-foreground">
        {yTicks.map((tick) => (
          <span key={tick}>{tick}</span>
        ))}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="relative flex-1">
          <div className="absolute inset-0 flex flex-col justify-between" aria-hidden="true">
            {yTicks.map((tick) => (
              <span key={`anomaly-grid-${tick}`} className="border-t border-border/70" />
            ))}
          </div>
          <svg
            className="absolute inset-0 h-full w-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            role="img"
            aria-label={`${anomalyLabel} with ${thresholdLabel} 1.5`}
          >
            <defs>
              <linearGradient id="anomaly-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f97316" stopOpacity="0.5" />
                <stop offset="95%" stopColor="#f97316" stopOpacity="0" />
              </linearGradient>
            </defs>
            {areaPath && <path d={areaPath} fill="url(#anomaly-fill)" />}
            <path
              d={`M 0 ${thresholdY} L 100 ${thresholdY}`}
              fill="none"
              stroke="#ef4444"
              strokeWidth="2"
              strokeDasharray="5 5"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={linePath}
              fill="none"
              stroke="#f97316"
              strokeWidth="3"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <div className="absolute inset-0" aria-hidden="true">
            {points.map((point) => (
              <span
                key={`anomaly-${point.day}`}
                title={`Day ${point.day}: ${point.anomaly}`}
                className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-orange-500 shadow-sm"
                style={{ left: `${point.x}%`, top: `${point.y}%` }}
              />
            ))}
          </div>
        </div>
        <div className="flex h-7 items-end justify-between text-[10px] font-semibold text-muted-foreground">
          {data.map((item) => (
            <span key={`day-${item.day}`}>{item.day}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function formatMoney(value) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(value || 0));
}

export default function DashboardOverview({ farms = [], alerts = [], claims = [], onNavigateClaims }) {
  const { t } = useTranslation();

  /* Derive headline metrics only from records returned by the backend. */
  const metrics = useMemo(() => {
    const paidClaims = claims.filter((c) => String(c.status).toUpperCase() === 'PAID');
    const pendingClaims = claims.filter((c) => String(c.status).toUpperCase() === 'PENDING');
    const pipelineClaims = claims.filter((c) => !['REJECTED'].includes(String(c.status).toUpperCase()));
    const totalPipeline = pipelineClaims.reduce((sum, c) => sum + Number(c.payout_amount || 0), 0);
    const paidDurations = paidClaims
      .filter((c) => c.paid_at && c.triggered_at)
      .map((c) => (new Date(c.paid_at).getTime() - new Date(c.triggered_at).getTime()) / 3_600_000)
      .filter((hours) => Number.isFinite(hours) && hours >= 0);
    const averagePayoutTime = paidDurations.length
      ? `${(paidDurations.reduce((sum, hours) => sum + hours, 0) / paidDurations.length).toFixed(1)}h`
      : '—';
    const riskZoneKeys = new Set(
      alerts
        .filter((a) => DANGER_STATUSES.includes(String(a.status || '').toUpperCase()))
        .map((a) => `${a.farm || a.farm_name}:${String(a.event_type || 'UNKNOWN').toUpperCase()}`)
    );
    const riskZones = riskZoneKeys.size;

    return {
      policies: farms.length.toLocaleString(),
      pipelineValue: formatMoney(totalPipeline),
      claimStatusCounts: `${pendingClaims.length} PENDING · ${paidClaims.length} PAID`,
      payoutTime: averagePayoutTime,
      payoutTimeTrend: paidClaims.length ? '' : 'PENDING',
      riskZones: String(riskZones),
      riskTrend: riskZones > 0 ? t('risk_alerts_active') : t('risk_none_active'),
    };
  }, [farms, claims, alerts, t]);

  /* Build monthly chart from real claims when available */
  const monthlyData = useMemo(() => {
    if (claims.length === 0) return [];
    const buckets = {};
    claims.forEach((c) => {
      const d = new Date(c.triggered_at || c.created_at || Date.now());
      const key = d.toLocaleString('en-US', { month: 'short' });
      if (!buckets[key]) buckets[key] = { month: key, claims: 0, payout: 0 };
      buckets[key].claims += 1;
      if (String(c.status || '').toUpperCase() === 'PAID') {
        buckets[key].payout += Number(c.payout_amount || 0) / 1000;
      }
    });
    return Object.values(buckets).slice(-6);
  }, [claims]);

  const recentClaims = useMemo(() => {
    const sorted = [...claims].sort(
      (a, b) => new Date(b.triggered_at || 0) - new Date(a.triggered_at || 0)
    );
    const seen = new Set();
    return sorted
      .filter((claim) => {
        const farmKey = claim.farm || claim.farm_name;
        const eventKey = String(claim.event_type || "UNKNOWN").toUpperCase();
        const key = `${farmKey}:${eventKey}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 6);
  }, [claims]);

  return (
    <div className="space-y-6">
      {/* Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title={t('active_policies')}
          value={metrics.policies}
          trend=""
          status="good"
          icon={<ShieldCheck className="h-6 w-6" />}
        />
        <MetricCard
          title={t('claims_auto_paid')}
          value={metrics.pipelineValue}
          trend={metrics.claimStatusCounts}
          status="info"
          icon={<FileCheck className="h-6 w-6" />}
        />
        <MetricCard
          title={t('avg_payout_time')}
          value={metrics.payoutTime}
          trend={metrics.payoutTimeTrend}
          status={metrics.payoutTimeTrend ? 'warning' : 'good'}
          icon={<Clock className="h-6 w-6" />}
        />
        <MetricCard
          title={t('high_risk_zones')}
          value={metrics.riskZones}
          trend={metrics.riskTrend}
          status={Number(metrics.riskZones) > 0 ? 'danger' : 'good'}
          icon={<AlertTriangle className="h-6 w-6" />}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card-surface p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-bold text-foreground">{t('monthly_claim_volume')}</h3>
              <p className="text-xs text-muted-foreground">{t('monthly_claim_desc')}</p>
            </div>
            <select className="bg-muted text-foreground border border-border text-xs rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-primary/30 font-semibold">
              <option>2026 YTD</option>
              <option>2025</option>
            </select>
          </div>
          <div className="h-72 w-full">
            <MonthlyClaimChart data={monthlyData} />
          </div>
        </div>

        {/* Pie Chart - Data Sources */}
        <div className="card-surface p-6 flex flex-col">
          <h3 className="text-lg font-bold text-foreground mb-1">{t('multi_source_consensus')}</h3>
          <p className="text-xs text-muted-foreground mb-4">{t('consensus_desc')}</p>
          <div className="flex-1 w-full -ml-2 min-h-[180px]">
            <SourceDonut data={SOURCE_DATA} colors={SOURCE_COLORS} />
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {SOURCE_DATA.map((item, i) => (
              <div key={i} className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: SOURCE_COLORS[i] }}></span>
                {item.name}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Anomaly trigger chart */}
      <div className="card-surface p-6">
        <div className="flex flex-col sm:flex-row justify-between sm:items-end gap-3 mb-6">
          <div>
            <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Activity className="h-5 w-5 text-destructive" />
              {t('temp_anomaly_index')}
            </h3>
            <p className="text-xs text-muted-foreground mt-1">{t('temp_anomaly_desc')}</p>
          </div>
          <div className="flex items-center gap-4 text-xs font-bold text-muted-foreground bg-muted/60 px-3 py-1.5 rounded-lg border border-border">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-red-500"></span> {t('threshold_label')} (1.5)
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-orange-400 opacity-60"></span> {t('recorded_anomaly')}
            </div>
          </div>
        </div>
        <div className="h-64 w-full">
          <AnomalyChart
            data={ANOMALY_DATA}
            thresholdLabel={t('threshold_label')}
            anomalyLabel={t('recorded_anomaly')}
          />
        </div>
      </div>

      {/* Recent claims quick list */}
      {recentClaims.length > 0 && (
        <div className="card-surface p-6">
          <h3 className="text-lg font-bold text-foreground mb-4">{t('recent_claims_title')}</h3>
          <div className="divide-y divide-border">
            {recentClaims.map((claim) => (
              <button
                key={claim.id || claim.claim_no}
                onClick={() => onNavigateClaims?.(claim.claim_no)}
                className="w-full flex items-center justify-between gap-3 py-3 text-left hover:bg-muted/40 px-2 rounded-lg transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold text-primary font-mono truncate">{claim.claim_no}</p>
                  <p className="text-xs text-muted-foreground">{claim.farm_name || t("farm_number", { id: claim.farm })}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm font-extrabold text-foreground">{formatMoney(claim.payout_amount)}</span>
                  <ClaimStatusBadge status={claim.status} />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function ClaimStatusBadge({ status }) {
  const s = String(status || '').toUpperCase();
  const styles = {
    PAID: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30',
    PENDING: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
    REJECTED: 'bg-red-500/10 text-red-600 border-red-500/30',
    DETECTED: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
    TRIGGERED: 'bg-blue-500/10 text-blue-600 border-blue-500/30',
    NOTIFIED: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/30',
    VERIFIED: 'bg-blue-500/10 text-blue-600 border-blue-500/30',
  };
  return (
    <span className={`status-chip ${styles[s] || 'bg-muted text-muted-foreground border-border'}`}>{s}</span>
  );
}

function MetricCard({ title, value, trend, icon, status }) {
  const statusStyles = {
    good: 'text-emerald-600 bg-emerald-500/10 border-emerald-500/30',
    info: 'text-sky-600 bg-sky-500/10 border-sky-500/30',
    warning: 'text-amber-600 bg-amber-500/10 border-amber-500/30',
    danger: 'text-red-600 bg-red-500/10 border-red-500/30',
  };
  const iconStyles = {
    good: 'bg-emerald-500/10 text-emerald-600',
    info: 'bg-sky-500/10 text-sky-600',
    warning: 'bg-amber-500/10 text-amber-600',
    danger: 'bg-red-500/10 text-red-600',
  };
  const trendStyles = {
    good: 'text-emerald-600',
    info: 'text-sky-600',
    warning: 'text-amber-600',
    danger: 'text-red-600',
  };

  return (
    <div className="card-surface p-5 transition-all duration-300 hover:shadow-md hover:-translate-y-0.5">
      <div className="flex items-start justify-between mb-4">
        <div className={`p-3 rounded-xl ${iconStyles[status]}`}>
          {icon}
        </div>
        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-md border uppercase tracking-wider ${statusStyles[status]}`}>
          {status}
        </span>
      </div>
      <h4 className="text-muted-foreground text-sm font-semibold mb-1">{title}</h4>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-2xl md:text-3xl font-extrabold text-foreground tracking-tight">{value}</span>
        <span className={`text-xs font-bold ${trendStyles[status]}`}>{trend}</span>
      </div>
    </div>
  );
}
