const escapeAttribute = value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');

function buildWebviewHTML(template, { language, nonce, cspSource, resource }) {
  for (const marker of ['data-viewer-root', '<!-- host-meta -->', 'data-viewer-entry']) {
    if (!template.includes(marker)) throw new Error(`Missing webview template marker: ${marker}`);
  }
  const policy = `default-src 'none'; script-src ${cspSource} 'nonce-${nonce}'; style-src ${cspSource} 'unsafe-inline'; img-src ${cspSource} blob: data:; font-src ${cspSource}; connect-src 'none';`;
  return template
    .replace(/(src|href)="\/([^\"]+)"/g, (_, attr, file) => `${attr}="${escapeAttribute(resource(file))}"`)
    .replace('data-viewer-root', `data-host="vscode" data-language="${escapeAttribute(language)}"`)
    .replace('data-viewer-entry', `nonce="${escapeAttribute(nonce)}"`)
    .replace('<!-- host-meta -->', `<meta http-equiv="Content-Security-Policy" content="${escapeAttribute(policy)}">`);
}
module.exports = { buildWebviewHTML };
