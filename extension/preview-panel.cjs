const { readFile } = require('node:fs/promises');
const { basename } = require('node:path');
const { randomBytes } = require('node:crypto');
const { buildWebviewHTML } = require('./webview-html.cjs');

const EXPORT_TYPES = new Set(['svg', 'png', 'pdf']);
const MAX_EXPORT_BASE64 = 64_000_000;

async function createPreviewPanel(vscode, context, uri, strings, language) {
  const document = await vscode.workspace.openTextDocument(uri);
  const publicRoot = vscode.Uri.joinPath(context.extensionUri, 'public');
  const panel = vscode.window.createWebviewPanel('mermaidViewer.preview', `${strings.preview}: ${basename(uri.path)}`,
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
    { enableScripts: true, localResourceRoots: [publicRoot] });
  panel.iconPath = {
    light: vscode.Uri.joinPath(context.extensionUri, 'icons/mermaid-light.svg'),
    dark: vscode.Uri.joinPath(context.extensionUri, 'icons/mermaid-dark.svg'),
  };
  let timer;
  let disposed = false;
  const send = () => {
    if (disposed) return;
    const config = vscode.workspace.getConfiguration('mermaidViewer', uri);
    void panel.webview.postMessage({
      type: 'document', text: document.getText(), name: basename(document.uri.path),
      settings: { engine: config.get('engine'), responsive: config.get('responsive') },
    });
  };
  const listeners = [
    panel.webview.onDidReceiveMessage(async message => {
      if (message?.type === 'ready') send();
      if (message?.type !== 'export' || !EXPORT_TYPES.has(message.ext) ||
          typeof message.data !== 'string' || message.data.length > MAX_EXPORT_BASE64) return;
      try {
        const target = await vscode.window.showSaveDialog({
          defaultUri: vscode.Uri.joinPath(document.uri, '..', basename(document.uri.path).replace(/\.[^.]+$/, '') + '.' + message.ext),
          filters: { [message.ext.toUpperCase()]: [message.ext] },
        });
        if (target) await vscode.workspace.fs.writeFile(target, Buffer.from(message.data, 'base64'));
      } catch (error) { vscode.window.showErrorMessage(`${strings.exportError}: ${error.message}`); }
    }),
    vscode.workspace.onDidChangeTextDocument(event => {
      if (event.document !== document) return;
      clearTimeout(timer);
      timer = setTimeout(send, 100);
    }),
    vscode.workspace.onDidChangeConfiguration(event => { if (event.affectsConfiguration('mermaidViewer', uri)) send(); }),
    panel.onDidChangeViewState(() => { if (panel.visible) send(); }),
  ];
  panel.onDidDispose(() => {
    disposed = true;
    clearTimeout(timer);
    listeners.forEach(listener => listener.dispose());
  });
  try {
    const template = await readFile(vscode.Uri.joinPath(publicRoot, 'index.html').fsPath, 'utf8');
    if (disposed) throw new Error('Preview closed during initialization');
    panel.webview.html = buildWebviewHTML(template, {
      language, nonce: randomBytes(18).toString('base64'), cspSource: panel.webview.cspSource,
      resource: file => panel.webview.asWebviewUri(vscode.Uri.joinPath(publicRoot, file)).toString(),
    });
    return panel;
  } catch (error) { panel.dispose(); throw error; }
}
module.exports = { createPreviewPanel };
