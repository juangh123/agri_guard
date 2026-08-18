import React, { useEffect, useMemo, useState } from 'react';
import { FileText, Filter, RefreshCw } from 'lucide-react';

const EVENT_OPTIONS = ['FLOOD', 'WILDFIRE', 'DROUGHT', 'HEATWAVE'];
const STATUS_OPTIONS = ['WARNING', 'DISASTER', 'DETECTED', 'VERIFIED', 'TRIGGERED', 'NOTIFIED', 'PENDING', 'PAID', 'REJECTED'];

function formatMoney(value) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

export default function ReportQueryPanel({ farms = [], alerts = [], claims = [] }) {
  const [filters, setFilters] = useState({
    farm: '',
    eventType: '',
    status: '',
    startDate: '',
    endDate: '',
  });
  const [hasRun, setHasRun] = useState(true);

  // Automatically refresh the report as soon as real dashboard data arrives, so
  // the page never looks unresponsive while waiting for the user to click.
  useEffect(() => {
    setHasRun(true);
  }, [alerts.length, claims.length, farms.length]);

  const farmOptions = useMemo(
    () => farms.map((farm) => ({ id: farm.id, name: farm.properties?.name || farm.name || `Farm #${farm.id}` })),
    [farms]
  );

  const runReport = () => {
    setHasRun(true);
  };

  const resetReport = () => {
    setFilters({ farm: '', eventType: '', status: '', startDate: '', endDate: '' });
    setHasRun(true);
  };

  const report = useMemo(() => {
    if (!hasRun) return null;

    const matchesDate = (value) => {
      if (!value) return true;
      const time = new Date(value).getTime();
      if (filters.startDate && time < new Date(filters.startDate).getTime()) return false;
      if (filters.endDate) {
        const end = new Date(filters.endDate);
        end.setHours(23, 59, 59, 999);
        if (time > end.getTime()) return false;
      }
      return true;
    };

    const alertMatches = alerts.filter((alert) => {
      if (filters.farm && String(alert.farm) !== String(filters.farm)) return false;
      if (filters.eventType && alert.event_type !== filters.eventType) return false;
      if (filters.status && alert.status !== filters.status) return false;
      return matchesDate(alert.created_at);
    });

    const claimMatches = claims.filter((claim) => {
      if (filters.farm && String(claim.farm) !== String(filters.farm)) return false;
      const claimEventType = String(claim.event_type || '').toUpperCase();
      if (filters.eventType && claimEventType !== filters.eventType) return false;
      if (filters.status && claim.status !== filters.status) return false;
      return matchesDate(claim.triggered_at);
    });

    const totalPayout = claimMatches.reduce((sum, claim) => sum + Number(claim.payout_amount || 0), 0);
    const averageConfidence = alertMatches.length
      ? alertMatches.reduce((sum, alert) => sum + Number(alert.confidence || 0), 0) / alertMatches.length
      : 0;

    return {
      alerts: alertMatches,
      claims: claimMatches,
      totalPayout,
      averageConfidence,
      generatedAt: new Date(),
    };
  }, [alerts, claims, filters, hasRun]);

  return (
    <div className="glass-panel rounded-2xl p-6 shadow-lg border border-white/60">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600" />
            Operational Report Query
          </h3>
          <p className="text-xs text-gray-500">Filter real alerts and claims by farm, event, status, and date range.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
        <select
          value={filters.farm}
          onChange={(event) => setFilters((prev) => ({ ...prev, farm: event.target.value }))}
          className="rounded-xl border border-gray-200 bg-white/70 px-3 py-2.5 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500/20"
        >
          <option value="">All Farms</option>
          {farmOptions.map((farm) => (
            <option key={farm.id} value={farm.id}>{farm.name}</option>
          ))}
        </select>

        <select
          value={filters.eventType}
          onChange={(event) => setFilters((prev) => ({ ...prev, eventType: event.target.value }))}
          className="rounded-xl border border-gray-200 bg-white/70 px-3 py-2.5 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500/20"
        >
          <option value="">All Events</option>
          {EVENT_OPTIONS.map((eventType) => (
            <option key={eventType} value={eventType}>{eventType}</option>
          ))}
        </select>

        <select
          value={filters.status}
          onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}
          className="rounded-xl border border-gray-200 bg-white/70 px-3 py-2.5 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500/20"
        >
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>{status}</option>
          ))}
        </select>

        <input
          type="date"
          value={filters.startDate}
          onChange={(event) => setFilters((prev) => ({ ...prev, startDate: event.target.value }))}
          className="rounded-xl border border-gray-200 bg-white/70 px-3 py-2.5 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500/20"
        />
        <input
          type="date"
          value={filters.endDate}
          onChange={(event) => setFilters((prev) => ({ ...prev, endDate: event.target.value }))}
          className="rounded-xl border border-gray-200 bg-white/70 px-3 py-2.5 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500/20"
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={runReport}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
        >
          <Filter className="h-4 w-4" />
          Run Query
        </button>
        <button
          type="button"
          onClick={resetReport}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white/70 px-4 py-2.5 text-sm font-bold text-gray-700 hover:bg-white"
        >
          <RefreshCw className="h-4 w-4" />
          Reset
        </button>
      </div>

      {report && (
        <div className="mt-6 space-y-6">
          <p className="text-xs text-gray-400">Report generated at {report.generatedAt.toLocaleString()}. Change filters and click Run Query to refresh.</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-white/60 bg-white/50 p-4">
              <p className="text-xs font-semibold text-gray-500">Matched Alerts</p>
              <p className="mt-2 text-3xl font-extrabold text-gray-900">{report.alerts.length}</p>
            </div>
            <div className="rounded-2xl border border-white/60 bg-white/50 p-4">
              <p className="text-xs font-semibold text-gray-500">Matched Claims</p>
              <p className="mt-2 text-3xl font-extrabold text-gray-900">{report.claims.length}</p>
            </div>
            <div className="rounded-2xl border border-white/60 bg-white/50 p-4">
              <p className="text-xs font-semibold text-gray-500">Payout Value</p>
              <p className="mt-2 text-3xl font-extrabold text-gray-900">{formatMoney(report.totalPayout)}</p>
            </div>
            <div className="rounded-2xl border border-white/60 bg-white/50 p-4">
              <p className="text-xs font-semibold text-gray-500">Avg. Confidence</p>
              <p className="mt-2 text-3xl font-extrabold text-gray-900">{report.averageConfidence.toFixed(1)}%</p>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div>
              <h4 className="mb-3 text-sm font-bold text-gray-800">Alert Matches</h4>
              <div className="overflow-x-auto rounded-xl border border-white/60 bg-white/40">
                <table className="min-w-full text-left text-xs">
                  <thead className="border-b border-gray-200 bg-white/50 text-gray-500">
                    <tr>
                      <th className="px-4 py-3">Farm</th>
                      <th className="px-4 py-3">Event</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.alerts.map((alert) => (
                      <tr key={alert.id} className="border-b border-gray-100 last:border-0">
                        <td className="px-4 py-3 font-semibold text-gray-800">{alert.farm_name || `Farm #${alert.farm}`}</td>
                        <td className="px-4 py-3">{alert.event_type}</td>
                        <td className="px-4 py-3">{alert.status}</td>
                        <td className="px-4 py-3">{Number(alert.confidence || 0).toFixed(1)}%</td>
                      </tr>
                    ))}
                    {report.alerts.length === 0 && (
                      <tr><td colSpan="4" className="px-4 py-6 text-center text-gray-400">No alerts matched.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h4 className="mb-3 text-sm font-bold text-gray-800">Claim Matches</h4>
              <div className="overflow-x-auto rounded-xl border border-white/60 bg-white/40">
                <table className="min-w-full text-left text-xs">
                  <thead className="border-b border-gray-200 bg-white/50 text-gray-500">
                    <tr>
                      <th className="px-4 py-3">Claim</th>
                      <th className="px-4 py-3">Farm</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Payout</th>
                      <th className="px-4 py-3">Tx</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.claims.map((claim) => (
                      <tr key={claim.id} className="border-b border-gray-100 last:border-0">
                        <td className="px-4 py-3 font-semibold text-blue-700">{claim.claim_no}</td>
                        <td className="px-4 py-3">{claim.farm_name || `Farm #${claim.farm}`}</td>
                        <td className="px-4 py-3">{claim.status}</td>
                        <td className="px-4 py-3">{formatMoney(claim.payout_amount)}</td>
                        <td className="px-4 py-3 text-gray-500">{claim.tx_hash ? `${claim.tx_hash.slice(0, 12)}…` : '—'}</td>
                      </tr>
                    ))}
                    {report.claims.length === 0 && (
                      <tr><td colSpan="5" className="px-4 py-6 text-center text-gray-400">No claims matched.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
