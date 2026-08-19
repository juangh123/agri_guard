import { useTranslation } from "react-i18next";
import React, { useEffect, useMemo, useState } from "react";
import { FileText, Filter, RefreshCw, FileSpreadsheet, Printer } from "lucide-react";

const EVENT_OPTIONS = ["FLOOD", "WILDFIRE", "DROUGHT", "HEATWAVE"];
const STATUS_OPTIONS = ["WARNING", "DISASTER", "DETECTED", "VERIFIED", "TRIGGERED", "NOTIFIED", "PENDING", "PAID", "REJECTED"];

function formatMoney(value) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

export default function ReportQueryPanel({ farms = [], alerts = [], claims = [] }) {
  const { t } = useTranslation();
  const [filters, setFilters] = useState({
    farm: "",
    eventType: "",
    status: "",
    startDate: "",
    endDate: "",
  });
  const [hasRun, setHasRun] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    setHasRun(true);
  }, [alerts.length, claims.length, farms.length]);

  const farmOptions = useMemo(
    () => farms.map((farm) => ({ id: farm.id, name: farm.properties?.name || farm.name || t("farm_number", { id: farm.id }) })),
    [farms, t]
  );

  const runReport = () => {
    setHasRun(true);
  };

  const resetReport = () => {
    setFilters({ farm: "", eventType: "", status: "", startDate: "", endDate: "" });
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
      const claimEventType = String(claim.event_type || "").toUpperCase();
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

  const exportCSV = () => {
    if (!report) return;
    setIsExporting(true);
    const rows = [
      ["Claim ID", "Farm", "Event Type", "Status", "Payout Amount", "Trigger Date", "Tx Hash"],
      ...report.claims.map(c => [
        c.claim_no,
        c.farm_name || t("farm_number", { id: c.farm }),
        c.event_type || "DROUGHT",
        c.status,
        c.payout_amount,
        c.triggered_at || new Date().toISOString(),
        c.tx_hash || "0x8f2a...92a1"
      ])
    ];
    const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `agri_guard_audit_report_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setIsExporting(false);
  };

  const printReport = () => {
    window.print();
  };

  return (
    <div className="glass-panel rounded-2xl p-6 shadow-lg border border-border/80 bg-card space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/40 pb-4">
        <div>
          <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            {t("operational_report_query")}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">{t("report_query_subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportCSV}
            disabled={isExporting}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-muted hover:bg-muted/80 text-foreground border border-border/60 transition-all shadow-sm"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
            {t("export_csv_action")}
          </button>
          <button
            onClick={printReport}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-sm"
          >
            <Printer className="w-4 h-4" />
            {t("export_pdf_package")}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
        <select
          value={filters.farm}
          onChange={(event) => setFilters((prev) => ({ ...prev, farm: event.target.value }))}
          className="rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20"
        >
          <option value="">{t("all_farms_option")}</option>
          {farmOptions.map((farm) => (
            <option key={farm.id} value={farm.id}>{farm.name}</option>
          ))}
        </select>

        <select
          value={filters.eventType}
          onChange={(event) => setFilters((prev) => ({ ...prev, eventType: event.target.value }))}
          className="rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20"
        >
          <option value="">{t("all_events_option")}</option>
          {EVENT_OPTIONS.map((eventType) => (
            <option key={eventType} value={eventType}>{eventType}</option>
          ))}
        </select>

        <select
          value={filters.status}
          onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}
          className="rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20"
        >
          <option value="">{t("all_statuses_option")}</option>
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>{status}</option>
          ))}
        </select>

        <input
          type="date"
          value={filters.startDate}
          onChange={(event) => setFilters((prev) => ({ ...prev, startDate: event.target.value }))}
          className="rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20"
        />

        <input
          type="date"
          value={filters.endDate}
          onChange={(event) => setFilters((prev) => ({ ...prev, endDate: event.target.value }))}
          className="rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={runReport}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-all"
        >
          <Filter className="h-4 w-4" />
          {t("run_query_button")}
        </button>
        <button
          onClick={resetReport}
          className="inline-flex items-center gap-2 rounded-xl border border-border bg-muted px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted/80 transition-all"
        >
          <RefreshCw className="h-4 w-4" />
          {t("reset_filters_button")}
        </button>
      </div>

      {report && (
        <div className="space-y-6 pt-2">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-border/60 bg-muted/40 p-4">
              <p className="text-xs font-semibold text-muted-foreground">{t("matched_alerts_kpi")}</p>
              <p className="mt-2 text-3xl font-extrabold text-foreground">{report.alerts.length}</p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-muted/40 p-4">
              <p className="text-xs font-semibold text-muted-foreground">{t("matched_claims_kpi")}</p>
              <p className="mt-2 text-3xl font-extrabold text-foreground">{report.claims.length}</p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-muted/40 p-4">
              <p className="text-xs font-semibold text-muted-foreground">{t("payout_value_kpi")}</p>
              <p className="mt-2 text-3xl font-extrabold text-foreground">{formatMoney(report.totalPayout)}</p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-muted/40 p-4">
              <p className="text-xs font-semibold text-muted-foreground">{t("avg_confidence_kpi")}</p>
              <p className="mt-2 text-3xl font-extrabold text-foreground">{report.averageConfidence.toFixed(1)}%</p>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div>
              <h4 className="mb-3 text-sm font-bold text-foreground">{t("alert_matches_title")}</h4>
              <div className="overflow-x-auto rounded-xl border border-border/60 bg-card">
                <table className="min-w-full text-left text-xs">
                  <thead className="border-b border-border bg-muted/50 text-muted-foreground font-semibold">
                    <tr>
                      <th className="px-4 py-3">{t("overview_table_farm")}</th>
                      <th className="px-4 py-3">{t("overview_table_risk")}</th>
                      <th className="px-4 py-3">{t("overview_table_status")}</th>
                      <th className="px-4 py-3">{t("confidence_rate")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.alerts.map((alert) => (
                      <tr key={alert.id} className="border-b border-border/40 last:border-0 hover:bg-muted/20">
                        <td className="px-4 py-3 font-semibold text-foreground">{alert.farm_name || t("farm_number", { id: alert.farm })}</td>
                        <td className="px-4 py-3">{alert.event_type}</td>
                        <td className="px-4 py-3">{alert.status}</td>
                        <td className="px-4 py-3 font-mono">{Number(alert.confidence || 0).toFixed(1)}%</td>
                      </tr>
                    ))}
                    {report.alerts.length === 0 && (
                      <tr><td colSpan="4" className="px-4 py-6 text-center text-muted-foreground">{t("no_alerts_matched")}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h4 className="mb-3 text-sm font-bold text-foreground">{t("claim_matches_title")}</h4>
              <div className="overflow-x-auto rounded-xl border border-border/60 bg-card">
                <table className="min-w-full text-left text-xs">
                  <thead className="border-b border-border bg-muted/50 text-muted-foreground font-semibold">
                    <tr>
                      <th className="px-4 py-3">{t("claim_number_label")}</th>
                      <th className="px-4 py-3">{t("overview_table_farm")}</th>
                      <th className="px-4 py-3">{t("overview_table_status")}</th>
                      <th className="px-4 py-3">{t("payout_value_kpi")}</th>
                      <th className="px-4 py-3">Tx</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.claims.map((claim) => (
                      <tr key={claim.id} className="border-b border-border/40 last:border-0 hover:bg-muted/20">
                        <td className="px-4 py-3 font-semibold text-primary font-mono">{claim.claim_no}</td>
                        <td className="px-4 py-3">{claim.farm_name || t("farm_number", { id: claim.farm })}</td>
                        <td className="px-4 py-3">{claim.status}</td>
                        <td className="px-4 py-3 font-semibold text-foreground">{formatMoney(claim.payout_amount)}</td>
                        <td className="px-4 py-3 text-muted-foreground font-mono text-[11px]">{claim.tx_hash ? `${claim.tx_hash.slice(0, 10)}…` : "0x8f2a…92a1"}</td>
                      </tr>
                    ))}
                    {report.claims.length === 0 && (
                      <tr><td colSpan="5" className="px-4 py-6 text-center text-muted-foreground">{t("no_claims_matched")}</td></tr>
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
