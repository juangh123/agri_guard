import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
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

const loadedLanguages = new Set(['en']);
const loadingLanguages = new Map();
const supportedLanguageCodes = new Set(SUPPORTED_LANGUAGES.map(({ code }) => code));

function normalizeLanguage(language) {
  return String(language || 'en').split('-')[0];
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
        i18n.addResourceBundle(code, 'translation', resource.translation, true, true);
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

export async function changeLanguage(language) {
  const requested = normalizeLanguage(language);
  const code = supportedLanguageCodes.has(requested) ? requested : 'en';

  try {
    await ensureLanguage(code);
  } catch (error) {
    console.warn(`Failed to load ${code} translations:`, error);
    return i18n.changeLanguage('en');
  }

  return i18n.changeLanguage(code);
}

const storedLanguage = localStorage.getItem('agriguard_language');
const preferredLanguage = supportedLanguageCodes.has(normalizeLanguage(storedLanguage))
  ? normalizeLanguage(storedLanguage)
  : 'en';

const initialization = i18n
  .use(initReactI18next)
  .init({
    resources: { en },
    lng: 'en',
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  });

// Keep <html lang/dir> in sync (RTL support for Arabic).
function applyDocumentLanguage(language) {
  const base = normalizeLanguage(language);
  document.documentElement.lang = base;
  document.documentElement.dir = base === 'ar' ? 'rtl' : 'ltr';
}

applyDocumentLanguage('en');

i18n.on('languageChanged', (language) => {
  const base = normalizeLanguage(language);
  localStorage.setItem('agriguard_language', base);
  applyDocumentLanguage(base);
});

export const i18nReady = initialization.then(() => (
  preferredLanguage === 'en' ? undefined : changeLanguage(preferredLanguage)
));

export default i18n;
