import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Sprout,
  CloudRainWind,
  AlertTriangle,
  CheckCircle2,
  Map as MapIcon,
  Wallet,
  Smartphone,
  PhoneCall,
  ShieldCheck,
  ArrowRight,
  Flame,
  Sun,
  Waves,
} from "lucide-react";

const EVENT_ICONS = { FLOOD: Waves, WILDFIRE: Flame, DROUGHT: Sun, HEATWAVE: Flame };

function formatMoney(value) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount);
}

/* Claim lifecycle: which of the 3 farmer-facing steps are complete */
function claimProgress(status) {
  const order = ["DETECTED", "VERIFIED", "TRIGGERED", "NOTIFIED", "PENDING", "PAID"];
  const idx = order.indexOf(String(status || "").toUpperCase());
  if (status === "REJECTED") return { step: 0, rejected: true };
  if (idx < 0) return { step: 0, rejected: false };
  if (idx <= 0) return { step: 1, rejected: false };
  if (idx <= 4) return { step: 2, rejected: false };
  return { step: 3, rejected: false };
}

/**
 * FarmerHome — simplified, mobile-first home for smallholder farmers.
 * Design goals: plain language, big touch targets, one-glance status,
 * readable in sunlight, friendly on low-end devices.
 */
export default function FarmerHome({ farms = [], claims = [], alerts = [], onNavigate }) {
  const { t } = useTranslation();

  const myFarm = farms[0];
  const farmName = myFarm?.properties?.name || myFarm?.name || t("farmer_default_farm_name");
  const cropType = myFarm?.properties?.crop_type || myFarm?.crop_type || "";

  const latestAlert = alerts[0];
  const latestClaim = useMemo(
    () => [...claims].sort((a, b) => new Date(b.triggered_at || 0) - new Date(a.triggered_at || 0))[0],
    [claims]
  );

  const hasDangerAlert = Boolean(
    latestAlert && ["DISASTER", "WARNING", "DETECTED", "TRIGGERED"].includes(String(latestAlert.status || "").toUpperCase())
  );

  const progress = latestClaim ? claimProgress(latestClaim.status) : null;
  const AlertIcon = EVENT_ICONS[String(latestAlert?.event_type || "").toUpperCase()] || CloudRainWind;

  const steps = [
    { label: t("farmer_step_detected") },
    { label: t("farmer_step_verified") },
    { label: t("farmer_step_paid") },
  ];

  const actions = [
    { id: "map", label: t("farmer_action_map"), icon: MapIcon, className: "bg-emerald-600 text-white" },
    { id: "timeline", label: t("farmer_action_payments"), icon: Wallet, className: "bg-card text-foreground border-2 border-border" },
    { id: "sms", label: t("farmer_action_sms"), icon: Smartphone, className: "bg-card text-foreground border-2 border-border" },
  ];

  return (
    <div className="mx-auto max-w-lg space-y-4 pb-6">
      {/* Greeting */}
      <div className="pt-1">
        <p className="text-sm text-muted-foreground">{t("farmer_greeting")}</p>
        <h2 className="text-2xl font-extrabold tracking-tight text-foreground">{farmName}</h2>
        {cropType && (
          <p className="mt-0.5 inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
            <Sprout className="h-4 w-4 text-primary" /> {cropType}
          </p>
        )}
      </div>

      {/* Disaster alert banner */}
      {hasDangerAlert && (
        <button
          onClick={() => onNavigate?.("map")}
          className="flex w-full items-center gap-3 rounded-2xl bg-destructive p-4 text-left text-destructive-foreground shadow-lg"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/20">
            <AlertTriangle className="h-7 w-7" />
          </span>
          <span className="flex-1">
            <span className="block text-base font-extrabold">{t("farmer_alert_banner_title")}</span>
            <span className="block text-sm opacity-90">
              {latestAlert.event_type} · {t("farmer_alert_banner_desc")}
            </span>
          </span>
          <ArrowRight className="h-5 w-5 shrink-0" />
        </button>
      )}

      {/* Crop status — one-glance card */}
      <div className={`rounded-3xl p-5 shadow-md border-2 ${
        hasDangerAlert
          ? "border-destructive/40 bg-destructive/5"
          : "border-primary/30 bg-primary/5"
      }`}>
        <div className="flex items-center gap-4">
          <span className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-white shadow-md ${
            hasDangerAlert ? "bg-destructive" : "bg-primary"
          }`}>
            {hasDangerAlert ? <AlertIcon className="h-9 w-9" /> : <Sprout className="h-9 w-9" />}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-muted-foreground">{t("farmer_crop_status")}</p>
            <p className={`text-xl font-extrabold leading-tight ${hasDangerAlert ? "text-destructive" : "text-primary"}`}>
              {hasDangerAlert ? t("farmer_status_danger") : t("farmer_status_healthy")}
            </p>
          </div>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {hasDangerAlert ? t("farmer_status_danger_desc") : t("farmer_status_healthy_desc")}
        </p>
      </div>

      {/* Insurance coverage */}
      <div className="card-surface flex items-center gap-3 p-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <ShieldCheck className="h-6 w-6" />
        </span>
        <div className="flex-1">
          <p className="text-base font-bold text-foreground">{t("farmer_coverage_active")}</p>
          <p className="text-sm text-muted-foreground">{t("farmer_coverage_desc")}</p>
        </div>
      </div>

      {/* Latest payout — 3 big steps */}
      <div className="card-surface p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-extrabold text-foreground">{t("farmer_latest_payout")}</h3>
          {latestClaim && (
            <span className="text-xl font-extrabold text-primary">{formatMoney(latestClaim.payout_amount)}</span>
          )}
        </div>

        {latestClaim ? (
          <>
            <div className="flex items-center">
              {steps.map((step, idx) => {
                const done = progress.step > idx;
                const isLast = idx === steps.length - 1;
                return (
                  <React.Fragment key={step.label}>
                    <div className="flex flex-col items-center gap-1.5">
                      <span className={`flex h-11 w-11 items-center justify-center rounded-full border-2 transition-colors ${
                        done ? "border-primary bg-primary text-primary-foreground" : "border-border bg-muted text-muted-foreground"
                      }`}>
                        {done ? <CheckCircle2 className="h-6 w-6" /> : <span className="text-sm font-bold">{idx + 1}</span>}
                      </span>
                      <span className={`text-center text-xs font-bold leading-tight ${done ? "text-primary" : "text-muted-foreground"}`}>
                        {step.label}
                      </span>
                    </div>
                    {!isLast && <div className={`mx-2 mb-6 h-1 flex-1 rounded-full ${progress.step > idx + 1 || (progress.step === 3 && idx === 1) ? "bg-primary" : progress.step > idx ? "bg-primary" : "bg-border"}`} />}
                  </React.Fragment>
                );
              })}
            </div>
            {progress.step === 3 && (
              <p className="mt-4 rounded-xl bg-primary/10 p-3 text-center text-sm font-bold text-primary">
                {t("farmer_payout_received")}
              </p>
            )}
            <button
              onClick={() => onNavigate?.("timeline")}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-secondary px-4 py-3 text-base font-bold text-secondary-foreground"
            >
              {t("farmer_view_details")}
              <ArrowRight className="h-5 w-5" />
            </button>
          </>
        ) : (
          <p className="py-4 text-center text-sm text-muted-foreground">{t("farmer_no_claims")}</p>
        )}
      </div>

      {/* Quick actions — thumb-size */}
      <div className="grid grid-cols-3 gap-3">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.id}
              onClick={() => onNavigate?.(action.id)}
              className={`flex flex-col items-center justify-center gap-2 rounded-2xl p-4 shadow-sm transition-transform active:scale-95 ${action.className}`}
            >
              <Icon className="h-7 w-7" />
              <span className="text-center text-xs font-extrabold leading-tight">{action.label}</span>
            </button>
          );
        })}
      </div>

      {/* Help line */}
      <a
        href="tel:+254700000000"
        className="flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border p-4 text-base font-bold text-muted-foreground transition-colors hover:border-primary hover:text-primary"
      >
        <PhoneCall className="h-5 w-5" />
        {t("farmer_action_help")}
      </a>
    </div>
  );
}
