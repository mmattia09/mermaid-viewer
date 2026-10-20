import { translations } from './translations.js';

export const languages = { en: 'English', it: 'Italiano', fr: 'Français', de: 'Deutsch', es: 'Español' };
export function resolveLanguage(locale) {
  const code = String(locale || '').toLowerCase().split(/[-_]/)[0];
  return Object.hasOwn(languages, code) ? code : 'en';
}
let language = 'en';
export function setLanguage(locale) { language = resolveLanguage(locale); return language; }
export function t(key, values = {}) {
  return (translations[language][key] ?? translations.en[key] ?? key)
    .replace(/\{(\w+)\}/g, (match, name) => values[name] ?? match);
}

/** Explicit bindings never inspect or alter diagram text or filenames. */
export function bindTranslations(root) {
  const bindings = [];
  for (const attr of ['textContent', 'title', 'aria-label']) {
    const marker = attr === 'textContent' ? 'data-i18n' : `data-i18n-${attr}`;
    for (const element of root.querySelectorAll(`[${marker}]`)) {
      const key = element.getAttribute(marker);
      if (!Object.hasOwn(translations.en, key)) throw new Error(`Unknown translation key: ${key}`);
      bindings.push(() => {
        if (attr === 'textContent') element.textContent = t(key);
        else element.setAttribute(attr, t(key));
      });
    }
  }
  return () => bindings.forEach(apply => apply());
}
