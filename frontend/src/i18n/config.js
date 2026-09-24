import { useCallback, useMemo, useSyncExternalStore } from 'react';
import en from './resources/en.js';

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'zh', label: '中文' },
  { code: 'sw', label: 'Kiswahili' },
  { code: 'fr', label: 'Français' },
  { code: 'es', label: 'Español' },
  { code: 'pt', label: 'Português' },
  { code: 'ar', label: 'العربية' },
];

const LANGUAGE_LOADERS = {
  ar: () => import('./resources/ar.js'),
  es: () => import('./resources/es.js'),
  fr: () => import('./resources/fr.js'),
  pt: () => import('./resources/pt.js'),
  sw: () => import('./resources/sw.js'),
  zh: () => import('./resources/zh.js'),
};

const resources = { en: en.translation };
const loadedLanguages = new Set(['en']);
const loadingLanguages = new Map();
const languageListeners = new Set();
const supportedLanguageCodes = new Set(SUPPORTED_LANGUAGES.map(({ code }) => code));

let currentLanguage = 'en';
let languageRequestVersion = 0;

function normalizeLanguage(language) {
  return String(language || 'en').split('-')[0];
}

function applyDocumentLanguage(language) {
  const base = normalizeLanguage(language);
  document.documentElement.lang = base;
  document.documentElement.dir = base === 'ar' ? 'rtl' : 'ltr';
}

function getLanguage() {
  return currentLanguage;
}

function subscribeLanguage(listener) {
  languageListeners.add(listener);
  return () => languageListeners.delete(listener);
}

function setLanguage(language) {
  const code = supportedLanguageCodes.has(language) ? language : 'en';
  currentLanguage = code;
  localStorage.setItem('agriguard_language', code);
  applyDocumentLanguage(code);
  languageListeners.forEach((listener) => listener());
}

async function ensureLanguage(language) {
  const code = normalizeLanguage(language);
  const load = LANGUAGE_LOADERS[code];

  if (!load || loadedLanguages.has(code)) {
    return code;
  }

  if (!loadingLanguages.has(code)) {
    const request = load()
      .then(({ default: resource }) => {
        resources[code] = resource.translation;
        loadedLanguages.add(code);
      })
      .finally(() => {
        loadingLanguages.delete(code);
      });
    loadingLanguages.set(code, request);
  }

  await loadingLanguages.get(code);
  return code;
}

function interpolate(template, options) {
  if (typeof template !== 'string') return template;

  return template.replace(/\{\{\s*([^{}\s]+)\s*\}\}/g, (_, key) => (
    options[key] === undefined || options[key] === null ? '' : String(options[key])
  ));
}

function translateForLanguage(language, key, options = {}) {
  const languageBundle = resources[language] || resources.en;
  const fallbackBundle = resources.en;
  let resolvedKey = key;

  if (options.count !== undefined) {
    const pluralKey = `${key}_${Number(options.count) === 1 ? 'one' : 'other'}`;
    if (languageBundle[pluralKey] !== undefined || fallbackBundle[pluralKey] !== undefined) {
      resolvedKey = pluralKey;
    }
  }

  const template = languageBundle[resolvedKey]
    ?? fallbackBundle[resolvedKey]
    ?? options.defaultValue
    ?? key;

  return interpolate(template, options);
}

export function translate(key, options = {}) {
  return translateForLanguage(currentLanguage, key, options);
}

export function useTranslation() {
  const language = useSyncExternalStore(subscribeLanguage, getLanguage, () => 'en');
  const t = useCallback((key, options) => translateForLanguage(language, key, options), [language]);
  const i18n = useMemo(() => ({ language }), [language]);

  return { t, i18n };
}

export async function changeLanguage(language) {
  const requestVersion = ++languageRequestVersion;
  const requested = normalizeLanguage(language);
  const code = supportedLanguageCodes.has(requested) ? requested : 'en';
  const previousLanguage = currentLanguage;
  const changed = code !== currentLanguage;

  // Update the controlled selector immediately. Waiting for the translation
  // chunk lets the native select snap back and can cancel the user's choice.
  if (changed) {
    setLanguage(code);
  }

  try {
    await ensureLanguage(code);
  } catch (error) {
    console.warn(`Failed to load ${code} translations:`, error);
    if (requestVersion === languageRequestVersion && currentLanguage === code) {
      setLanguage(previousLanguage);
    }
    return currentLanguage;
  }

  // Notify again after the bundle is available so the optimistic selection
  // renders translated content. Stale requests must not override a newer choice.
  if (changed && currentLanguage === code) {
    setLanguage(code);
  }

  return currentLanguage;
}

const storedLanguage = localStorage.getItem('agriguard_language');
const preferredLanguage = supportedLanguageCodes.has(normalizeLanguage(storedLanguage))
  ? normalizeLanguage(storedLanguage)
  : 'en';

applyDocumentLanguage('en');

export const i18nReady = preferredLanguage === 'en'
  ? Promise.resolve()
  : changeLanguage(preferredLanguage);
