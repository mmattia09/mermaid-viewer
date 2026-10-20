import { languages } from './i18n.js';
import { themes } from './themes.js';

const schema = {
  engine: { fallback: 'pele', values: ['pele', 'mermaid'] },
  theme: { fallback: 'auto', values: ['auto', 'default', 'dark', 'neutral', 'forest', ...Object.keys(themes)] },
  language: { fallback: 'auto', values: ['auto', ...Object.keys(languages)] },
  responsive: { fallback: true },
  markdown: { fallback: true },
};

/** Storage failures must not prevent previews in private browsing or a webview. */
export function createStorage(vscode, browserStorage = () => globalThis.localStorage) {
  const saved = vscode?.getState() || {};
  return {
    getItem(key) {
      try { return vscode ? saved[key] ?? null : browserStorage().getItem(key); }
      catch { return null; }
    },
    setItem(key, value) {
      try {
        if (vscode) { saved[key] = String(value); vscode.setState(saved); }
        else browserStorage().setItem(key, String(value));
      } catch { /* Preferences remain usable in memory. */ }
    },
  };
}

export function normalizePreference(key, value) {
  const { fallback, values } = schema[key];
  if (values) return values.includes(value) ? value : fallback;
  return value === true || value === 'true' ? true : value === false || value === 'false' ? false : fallback;
}

export function readPreferences(storage) {
  return Object.fromEntries(Object.keys(schema).map(key => [key, normalizePreference(key, storage.getItem(`mv-${key}`))]));
}
