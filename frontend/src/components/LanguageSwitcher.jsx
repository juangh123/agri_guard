import React from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Shared language switcher (EN / FR / SW), same styling as the one
 * previously inlined in Register.jsx. Register keeps its own switcher.
 */
const LanguageSwitcher = ({ className = '' }) => {
  const { i18n } = useTranslation();

  return (
    <select
      aria-label="Language"
      onChange={(e) => i18n.changeLanguage(e.target.value)}
      value={i18n.language}
      className={`bg-white/60 border border-white/60 text-gray-700 text-sm rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 backdrop-blur-sm transition-all shadow-sm ${className}`}
    >
      <option value="en" className="bg-white">English</option>
      <option value="fr" className="bg-white">Français</option>
      <option value="sw" className="bg-white">Kiswahili</option>
    </select>
  );
};

export default LanguageSwitcher;
