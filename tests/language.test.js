import { test, expect } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { Registry } from 'vscode-textmate';
import { loadWASM, OnigScanner, OnigString } from 'vscode-oniguruma';
const wasm = await readFile(new URL('../node_modules/vscode-oniguruma/release/onig.wasm', import.meta.url));
await loadWASM(wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength));
const raw = JSON.parse(await readFile(new URL('../syntaxes/mermaid.tmLanguage.json', import.meta.url), 'utf8'));
const registry = new Registry({
  onigLib: Promise.resolve({ createOnigScanner: patterns => new OnigScanner(patterns), createOnigString: text => new OnigString(text) }),
  loadGrammar: async scope => scope === raw.scopeName ? raw : null,
});
const grammar = await registry.loadGrammar('source.mermaid');
function scopes(source, word) {
  const offset = source.indexOf(word);
  return grammar.tokenizeLine(source).tokens.find(t => t.startIndex <= offset && t.endIndex > offset).scopes.join(' ');
}
test('Mermaid grammar tokenizes diagram declarations, directions, edges and labels', () => {
  expect(scopes('flowchart LR', 'flowchart')).toContain('keyword.control.diagram');
  expect(scopes('flowchart LR', 'LR')).toContain('constant.language.direction');
  expect(scopes('A[Start] --> B[Finish]', '-->')).toContain('keyword.operator.arrow');
  expect(scopes('A["Titolo"] --> B', 'Titolo')).toContain('string.quoted.double');
  expect(scopes('%% flowchart LR', 'flowchart')).toContain('comment.line');
  expect(scopes('sequenceDiagram', 'sequenceDiagram')).toContain('keyword.control.diagram');
  expect(scopes('A->>B: Hi', '->>')).toContain('keyword.operator.arrow');
  expect(scopes('classDef ready fill:#abc', '#abc')).toContain('constant.other.color');
});
test('Multiline strings retain scope and terminate correctly', () => {
  const first = grammar.tokenizeLine('A["hello');
  const second = grammar.tokenizeLine('world"] --> B', first.ruleStack);
  expect(second.tokens[0].scopes).toContain('string.quoted.double.mermaid');
  expect(second.tokens.at(-1).scopes).not.toContain('string.quoted.double.mermaid');
});
