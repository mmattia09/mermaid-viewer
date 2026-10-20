import { test, expect } from 'bun:test';
import { JSDOM } from 'jsdom';
import { translations } from '../public/translations.js';
import { resolveLanguage, setLanguage, t, bindTranslations } from '../public/i18n.js';

test('locales cover all strings and resolve regional and unsupported languages', () => {
  for (const locale of Object.keys(translations)) {
    expect(Object.keys(translations[locale]).sort()).toEqual(Object.keys(translations.en).sort());
    for (const [key, value] of Object.entries(translations[locale])) {
      expect(value.length).toBeGreaterThan(0);
      expect(value.match(/\{\w+\}/g) || []).toEqual(translations.en[key].match(/\{\w+\}/g) || []);
    }
  }
  expect(resolveLanguage('fr-CA')).toBe('fr');
  expect(resolveLanguage('de_DE')).toBe('de');
  expect(resolveLanguage('ja')).toBe('en');
  setLanguage('es');
  expect(t('exported', { file: 'test.svg' })).toBe('Exportado: test.svg');
});

test('UI bindings switch repeatedly without destroying icons or form values', () => {
  const dom = new JSDOM('<body><button title="Esporta diagramma" data-i18n-title="exportDiagram"><svg></svg><span data-i18n="export">Esporta</span></button><label><span data-i18n="engine">Motore di rendering</span><select><option value="pele">Pele</option></select></label></body>');
  const previous = { document: globalThis.document, Node: globalThis.Node, NodeFilter: globalThis.NodeFilter };
  Object.assign(globalThis, { document: dom.window.document, Node: dom.window.Node, NodeFilter: dom.window.NodeFilter });
  try {
    const apply = bindTranslations(document.body);
    for (const locale of ['fr', 'de', 'it', 'en']) {
      setLanguage(locale); apply();
      expect(document.querySelector('button').textContent).toBe(t('export'));
      expect(document.querySelector('button').title).toBe(t('exportDiagram'));
      expect(document.querySelector('svg')).not.toBeNull();
      expect(document.querySelector('select').value).toBe('pele');
    }
  } finally { Object.assign(globalThis, previous); setLanguage('en'); dom.window.close(); }
});
