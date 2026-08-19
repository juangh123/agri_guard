import { useTranslation } from 'react-i18next';
import React, { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, Legend } from 'recharts';
import { ShieldCheck, Clock, AlertTriangle, FileCheck, Activity } from 'lucide-react';

const MONTHLY_FALLBACK = [
  { month: 'Mar', claims: 250, payout: 110 },
  { month: 'Apr', claims: 320, payout: 180 },
  { month: 'May', claims: 150, payout: 60 },
  { month: 'Jun', claims: 90, payout: 40 },
  { month: 'Jul', claims: 110, payout: 52 },
  { month: 'Aug', claims: 140, payout: 66 },
];

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

function formatMoney(value) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(value || 0));
}

export default function DashboardOverview({ farms = [], alerts = [], claims = [], onNavigateClaims }) {
  const { t } = useTranslation();

  /* Derive headline metrics from live data, falling back to demo figures
     only when the backend has not returned anything yet. */
  const metrics = useMemo(() => {
    const paidClaims = claims.filter((c) => String(c.status).toUpperCase() === 'PAID');
    const totalPaid = paidClaims.reduce((sum, c) => sum + Number(c.payout_amount || 0), 0);
    const riskZones = alerts.filter((a) => DANGER_STATUSES.includes(String(a.status || '').toUpperCase())).length;

    const hasData = farms.length > 0 || claims.length > 0 || alerts.length > 0;
    return {
      policies: farms.length > 0 ? farms.length.toLocaleString() : '12,450',
      paidValue: claims.length > 0 ? formatMoney(totalPaid) : '$465k',
      paidCount: claims.length > 0 ? `${paidClaims.length} ${t('claims_unit')}` : `320 ${t('claims_unit')}`,
      payoutTime: '18h',
      riskZones: alerts.length > 0 ? String(riskZones) : '4',
      riskTrend: riskZones > 0 ? t('risk_alerts_active') : t('risk_none_active'),
      isLive: hasData,
    };
  }, [farms, claims, alerts, t]);

  /* Build monthly chart from real claims when available */
  const monthlyData = useMemo(() => {
    if (claims.length === 0) return MONTHLY_FALLBACK;
    const buckets = {};
    claims.forEach((c) => {
      const d = new Date(c.triggered_at || c.created_at || Date.now());
      const key = d.toLocaleString('en-US', { month: 'short' });
      if (!buckets[key]) buckets[key] = { month: key, claims: 0, payout: 0 };
      buckets[key].claims += 1;
      buckets[key].payout += Number(c.payout_amount || 0) / 1000;
    });
    return Object.values(buckets).slice(-6);
  }, [claims]);

  const recentClaims = useMemo(
    () => [...claims].sort((a, b) => new Date(b.triggered_at || 0) - new Date(a.triggered_at || 0)).slice(0, 6),
    [claims]
  );

  return (
    <div className="space-y-6">
      {/* Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title={t('active_policies')}
          value={metrics.policies}
          trend="+12% YTD"
          status="good"
          icon={<ShieldCheck className="h-6 w-6" />}
        />
        <MetricCard
          title={t('claims_auto_paid')}
          value={metrics.paidValue}
          trend={metrics.paidCount}
          status="info"
          icon={<FileCheck className="h-6 w-6" />}
        />
        <MetricCard
          title={t('avg_payout_time')}
          value={metrics.payoutTime}
          trend="-6h vs industry"
          status="good"
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
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12, fontWeight: 500 }} dy={10} />
                <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12, fontWeight: 500 }} />
                <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12, fontWeight: 500 }} />
                <Tooltip
                  cursor={{ fill: 'hsl(var(--muted) / 0.5)' }}
                  contentStyle={{
                    borderRadius: '12px',
                    border: '1px solid hsl(var(--border))',
                    backgroundColor: 'hsl(var(--popover))',
                    color: 'hsl(var(--popover-foreground))',
                    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.15)',
                  }}
                  itemStyle={{ fontWeight: 600 }}
                  labelStyle={{ fontWeight: 700, marginBottom: '4px' }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', fontWeight: 600, paddingTop: '10px' }} />
                <Bar yAxisId="left" dataKey="claims" name={t('total_claims')} fill="#0284C7" radius={[4, 4, 0, 0]} maxBarSize={40} />
                <Bar yAxisId="right" dataKey="payout" name={t('payout_amount')} fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pie Chart - Data Sources */}
        <div className="card-surface p-6 flex flex-col">
          <h3 className="text-lg font-bold text-foreground mb-1">{t('multi_source_consensus')}</h3>
          <p className="text-xs text-muted-foreground mb-4">{t('consensus_desc')}</p>
          <div className="flex-1 w-full -ml-2 min-h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={SOURCE_DATA}
                  cx="50%"
                  cy="45%"
                  innerRadius={55}
                  outerRadius={75}
                  paddingAngle={5}
                  dataKey="value"
                  stroke="none"
                >
                  {SOURCE_DATA.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={SOURCE_COLORS[index % SOURCE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    borderRadius: '12px',
                    border: '1px solid hsl(var(--border))',
                    backgroundColor: 'hsl(var(--popover))',
                    color: 'hsl(var(--popover-foreground))',
                    fontWeight: 'bold',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
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
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={ANOMALY_DATA} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorAnomaly" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f97316" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12, fontWeight: 500 }} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12, fontWeight: 500 }} />
              <Tooltip
                contentStyle={{
                  borderRadius: '12px',
                  border: '1px solid hsl(var(--border))',
                  backgroundColor: 'hsl(var(--popover))',
                  color: 'hsl(var(--popover-foreground))',
                  boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.15)',
                }}
                itemStyle={{ fontWeight: 600 }}
                labelStyle={{ fontWeight: 700, marginBottom: '4px' }}
              />
              <Area type="monotone" dataKey="threshold" stroke="#ef4444" strokeWidth={2} strokeDasharray="5 5" fill="none" name={t('threshold_label')} />
              <Area type="monotone" dataKey="anomaly" stroke="#f97316" strokeWidth={3} fillOpacity={1} fill="url(#colorAnomaly)" name={t('recorded_anomaly')} />
            </AreaChart>
          </ResponsiveContainer>
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
    REJECTED: 'bg-red-500/10 text-red-600 border-red-500/30',
    DETECTED: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
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
