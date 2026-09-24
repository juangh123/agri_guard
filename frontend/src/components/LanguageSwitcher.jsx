import React from "react";
import { SUPPORTED_LANGUAGES, changeLanguage, useTranslation } from "../i18n/config";

export function LanguageSwitcher({ className = "" }) {
  const { i18n } = useTranslation();
  const current = (i18n.language || "en").split("-")[0];

  return (
    <select
      aria-label="Language"
      onChange={(e) => changeLanguage(e.target.value)}
      value={current}
      className={`bg-muted/60 border border-border/80 text-foreground text-xs rounded-xl px-3 py-1.5 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary backdrop-blur-sm transition-all shadow-sm ${className}`}
    >
      {SUPPORTED_LANGUAGES.map((lang) => (
        <option key={lang.code} value={lang.code} className="bg-card text-foreground">
          {lang.label}
        </option>
      ))}
    </select>
  );
}

export default LanguageSwitcher;
