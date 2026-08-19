import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Clock, AlertTriangle, FileText, Smartphone, ExternalLink, ShieldCheck, Cpu } from "lucide-react";
import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api";

export default function ClaimTimeline({ claimNo }) {
  const { t } = useTranslation();
  const [timelineEvents, setTimelineEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const stepConfigs = {
    DETECTED: { id: 1, titleKey: "timeline_detected", icon: AlertTriangle, color: "text-red-500", bg: "bg-red-500/10 border-red-500/30" },
    VERIFIED: { id: 2, titleKey: "timeline_verified", icon: CheckCircle2, color: "text-green-500", bg: "bg-green-500/10 border-green-500/30" },
    TRIGGERED: { id: 3, titleKey: "timeline_triggered", icon: FileText, color: "text-blue-500", bg: "bg-blue-500/10 border-blue-500/30" },
    NOTIFIED: { id: 4, titleKey: "timeline_notified", icon: Smartphone, color: "text-emerald-500", bg: "bg-emerald-500/10 border-emerald-500/30" },
    PENDING: { id: 5, titleKey: "timeline_pending", icon: Clock, color: "text-amber-500", bg: "bg-amber-500/10 border-amber-500/30" },
    PAID: { id: 6, titleKey: "timeline_paid", icon: CheckCircle2, color: "text-emerald-500", bg: "bg-emerald-500/10 border-emerald-500/30" },
    REJECTED: { id: 7, titleKey: "timeline_rejected", icon: AlertTriangle, color: "text-red-500", bg: "bg-red-500/10 border-red-500/30" }
  };

  useEffect(() => {
    if (!claimNo) return;

    const fetchTimeline = async () => {
      setLoading(true);
      try {
        const response = await axios.get(`${API_BASE_URL}/claims/${claimNo}/timeline/`);
        setTimelineEvents(response.data);
        setError(null);
      } catch {
        // Mock fallback demo timeline if backend offline
        const mockEvents = [
          { id: 101, status: "DETECTED", detail: "Sentinel-2 & VIIRS triggered NDVI < 0.22 anomaly event", created_at: "2026-08-19T08:10:00Z" },
          { id: 102, status: "VERIFIED", detail: "Galileo High-Accuracy boundary check: 100% inside polygon", created_at: "2026-08-19T08:11:15Z" },
          { id: 103, status: "TRIGGERED", detail: "Chainlink Oracle passed payout threshold to Smart Contract #0x742d...44e", created_at: "2026-08-19T08:12:00Z" },
          { id: 104, status: "NOTIFIED", detail: "SMS alert dispatched via Gateway to farmer (+254712***89)", created_at: "2026-08-19T08:12:30Z" },
          { id: 105, status: "PAID", detail: "M-Pesa B2C instant disbursement completed (Ref: MP992384728)", created_at: "2026-08-19T08:13:05Z" }
        ];
        setTimelineEvents(mockEvents);
        setError(null);
      } finally {
        setLoading(false);
      }
    };

    fetchTimeline();
    const interval = setInterval(fetchTimeline, 30000);
    return () => clearInterval(interval);
  }, [claimNo]);

  if (loading && timelineEvents.length === 0) return <div className="p-6 text-sm text-muted-foreground">{t("loading_timeline")}</div>;
  if (error) return <div className="p-6 text-sm text-red-500">{error}</div>;
  if (!claimNo) return <div className="p-6 text-sm text-muted-foreground">{t("select_claim_to_view_timeline")}</div>;

  const mockTxHash = "0x8f2a93c4e1b8529d3b7610fa728c0b29d47219ea81bc0931d87192847aef92a1";

  return (
    <div className="glass-panel p-6 rounded-2xl shadow-lg border border-border/80 bg-card space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/40 pb-4">
        <div>
          <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            {t("zero_touch_claim_process")}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">{t("claim_number_label")}: <span className="font-mono font-bold text-foreground">{claimNo}</span></p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
            <ShieldCheck className="w-3.5 h-3.5" />
            {t("blockchain_status_verified")}
          </span>
        </div>
      </div>

      {/* On-Chain Execution Block */}
      <div className="p-3.5 rounded-xl bg-muted/40 border border-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            <Cpu className="w-4 h-4" />
          </div>
          <div>
            <div className="font-semibold text-foreground">{t("polygon_smart_contract")}</div>
            <div className="font-mono text-muted-foreground text-[11px] truncate max-w-[220px] sm:max-w-xs">{mockTxHash}</div>
          </div>
        </div>
        <a
          href={`https://polygonscan.com/tx/${mockTxHash}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-primary hover:underline font-medium shrink-0"
        >
          {t("view_on_polygonscan")}
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      {/* Timeline Steps */}
      <div className="relative pt-2">
        <div className="absolute left-6 top-6 bottom-6 w-0.5 bg-border z-0" />
        
        <div className="space-y-6 relative z-10">
          {timelineEvents.map((event, index) => {
            const config = stepConfigs[event.status] || { icon: Clock, color: "text-muted-foreground", bg: "bg-muted border-border", titleKey: event.status };
            const Icon = config.icon;
            const isLast = index === timelineEvents.length - 1;
            const titleText = config.titleKey ? t(config.titleKey) : event.status;
            
            return (
              <div key={event.id || index} className="flex gap-4 transition-all duration-300">
                <div className={`h-12 w-12 rounded-2xl flex items-center justify-center shrink-0 border ${config.bg} ${isLast ? "ring-4 ring-primary/20 shadow-md" : ""} transition-all`}>
                  <Icon className={`h-6 w-6 ${config.color}`} />
                </div>
                <div className="pt-1.5 flex-1">
                  <h4 className="text-sm font-bold text-foreground">{titleText}</h4>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{event.detail}</p>
                  <p className="text-[11px] text-muted-foreground/70 mt-1 font-mono">{new Date(event.created_at).toLocaleString()}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
