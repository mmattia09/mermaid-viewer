import { translations } from './translations.js';
export const languages = { en: 'English', it: 'Italiano', fr: 'Français', de: 'Deutsch', es: 'Español' };
export function resolveLanguage(locale) {
  const code = String(locale || '').toLowerCase().split(/[-_]/)[0];
  return code in languages ? code : 'en';
}
let language = 'en';
export function setLanguage(locale) { language = resolveLanguage(locale); return language; }
export function t(key, values = {}) {
  return (translations[language][key] ?? translations.en[key] ?? key)
    .replace(/\{(\w+)\}/g, (match, name) => values[name] ?? match);
}
// Capture only static UI strings once; never translate file names or diagram content.
export function bindTranslations(root) {
  const bindings = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    if (node.nodeType === Node.TEXT_NODE) {
      const key = node.textContent.trim();
      if (key in translations.en) {
        const target = node, original = node.textContent;
        bindings.push(() => { target.textContent = original.replace(key, t(key)); });
      }
    } else {
      for (const attr of ['title', 'aria-label']) {
        const key = node.getAttribute(attr);
        if (key && key in translations.en) {
          const target = node;
          bindings.push(() => target.setAttribute(attr, t(key)));
        }
      }
    }
  }
  return () => bindings.forEach(apply => apply());
}
