import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Search,
  SlidersHorizontal,
  MapPin,
  FileText,
  AlertTriangle,
  Layers,
  Moon,
  Sun,
  Shield,
  User,
  Building,
  X,
  ArrowRight,
  Globe
} from "lucide-react";
import { SUPPORTED_LANGUAGES } from "../i18n/config";

export function CommandPalette({ isOpen, onClose, onNavigate, onRoleChange, onThemeChange }) {
  const { t, i18n } = useTranslation();
  const [search, setSearch] = useState("");

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const actions = [
    { id: "view_overview", title: t("overview"), category: t("cmd_quick_nav"), icon: Layers, action: () => { onNavigate("overview"); onClose(); } },
    { id: "view_map", title: t("map_monitoring"), category: t("cmd_quick_nav"), icon: MapPin, action: () => { onNavigate("map"); onClose(); } },
    { id: "view_claims", title: t("claim_timeline"), category: t("cmd_quick_nav"), icon: FileText, action: () => { onNavigate("timeline"); onClose(); } },
    { id: "view_reports", title: t("audit_reports"), category: t("cmd_quick_nav"), icon: FileText, action: () => { onNavigate("reports"); onClose(); } },
    { id: "view_settings", title: t("settings"), category: t("cmd_quick_nav"), icon: SlidersHorizontal, action: () => { onNavigate("settings"); onClose(); } },
    { id: "view_sms", title: t("sms_alerts"), category: t("cmd_quick_nav"), icon: AlertTriangle, action: () => { onNavigate("sms"); onClose(); } },
    { id: "role_insurer", title: t("switch_role") + ": " + t("role_insurer"), category: t("role_mode"), icon: Shield, action: () => { onRoleChange("insurer"); onClose(); } },
    { id: "role_farmer", title: t("switch_role") + ": " + t("role_farmer"), category: t("role_mode"), icon: User, action: () => { onRoleChange("farmer"); onClose(); } },
    { id: "role_gov", title: t("switch_role") + ": " + t("role_regulator"), category: t("role_mode"), icon: Building, action: () => { onRoleChange("regulator"); onClose(); } },
    { id: "theme_default", title: t("theme_mode") + ": " + t("theme_default"), category: t("theme_mode"), icon: Sun, action: () => { onThemeChange("default"); onClose(); } },
    { id: "theme_dark", title: t("theme_mode") + ": " + t("theme_dark"), category: t("theme_mode"), icon: Moon, action: () => { onThemeChange("dark"); onClose(); } },
    { id: "theme_contrast", title: t("theme_mode") + ": " + t("theme_high_contrast"), category: t("theme_mode"), icon: AlertTriangle, action: () => { onThemeChange("high-contrast"); onClose(); } },
    ...SUPPORTED_LANGUAGES.map(lang => ({
      id: "lang_" + lang.code,
      title: t("cmd_switch_lang") + ": " + lang.nativeName + " (" + lang.name + ")",
      category: t("cmd_switch_lang"),
      icon: Globe,
      action: () => { i18n.changeLanguage(lang.code); onClose(); }
    }))
  ];

  const filtered = actions.filter(item =>
    item.title.toLowerCase().includes(search.toLowerCase()) ||
    item.category.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div
        className="bg-card border border-border/80 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center px-4 py-3 border-b border-border/60 gap-3 bg-muted/20">
          <Search className="w-5 h-5 text-muted-foreground shrink-0" />
          <input
            type="text"
            className="flex-1 bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground text-base"
            placeholder={t("cmd_palette_placeholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="max-h-96 overflow-y-auto p-2 space-y-1">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              {t("no_search_results")}
            </div>
          ) : (
            filtered.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={item.action}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left rtl:text-right hover:bg-primary/10 hover:border-primary/30 border border-transparent transition-all group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground group-hover:text-primary group-hover:bg-primary/20 shrink-0 transition-colors">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="truncate">
                      <div className="text-sm font-medium text-foreground group-hover:text-primary transition-colors truncate">
                        {item.title}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {item.category}
                      </div>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-primary group-hover:translate-x-1 rtl:group-hover:-translate-x-1 transition-all shrink-0" />
                </button>
              );
            })
          )}
        </div>
        <div className="px-4 py-2 bg-muted/40 border-t border-border/40 flex items-center justify-between text-xs text-muted-foreground">
          <span>{t("cmd_open_tip")}</span>
          <span className="kbd px-2 py-0.5 rounded bg-muted border border-border font-mono text-[11px]">ESC</span>
        </div>
      </div>
    </div>
  );
}

export default CommandPalette;