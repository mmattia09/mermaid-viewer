const vscode = require('vscode');
const { readFile } = require('node:fs/promises');
const { basename } = require('node:path');
const { randomBytes } = require('node:crypto');

function activate(context) {
  const panels = new Map();
  const publicRoot = vscode.Uri.joinPath(context.extensionUri, 'public');
  const command = vscode.commands.registerCommand('mermaidViewer.openPreview', async (uri) => {
    try {
      uri ??= vscode.window.activeTextEditor?.document.uri;
      if (!uri) return vscode.window.showInformationMessage('Apri un file .mmd o .mermaid.');
      if (!/\.(mmd|mermaid)$/i.test(uri.path) && uri.scheme !== 'untitled') {
        return vscode.window.showInformationMessage('Seleziona un file .mmd o .mermaid.');
      }
      const key = uri.toString();
      if (panels.has(key)) { panels.get(key).reveal(vscode.ViewColumn.Beside, true); return; }
      const document = await vscode.workspace.openTextDocument(uri);
      const panel = vscode.window.createWebviewPanel('mermaidViewer.preview', `Anteprima: ${basename(uri.path)}`,
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
        { enableScripts: true, localResourceRoots: [publicRoot] });
      panel.iconPath = { light: vscode.Uri.joinPath(context.extensionUri, 'icons/mermaid-light.svg'), dark: vscode.Uri.joinPath(context.extensionUri, 'icons/mermaid-dark.svg') };
      panels.set(key, panel);
      let timer;
      let disposed = false;
      const send = () => {
        if (disposed) return;
        const config = vscode.workspace.getConfiguration('mermaidViewer', uri);
        panel.webview.postMessage({ type: 'document', text: document.getText(), name: basename(document.uri.path),
          settings: { engine: config.get('engine', 'pele'), responsive: config.get('responsive', true) } });
      };
      const listeners = [
        panel.webview.onDidReceiveMessage(async message => {
          if (message?.type === 'ready') send();
          if (message?.type === 'export' && ['svg', 'png', 'pdf'].includes(message.ext) && typeof message.data === 'string' && message.data.length <= 64_000_000) {
            try {
              const target = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.joinPath(document.uri, '..', basename(document.uri.path).replace(/\.[^.]+$/, '') + '.' + message.ext),
                filters: { [message.ext.toUpperCase()]: [message.ext] },
              });
              if (target) await vscode.workspace.fs.writeFile(target, Buffer.from(message.data, 'base64'));
            } catch (error) { vscode.window.showErrorMessage(`Esportazione non riuscita: ${error.message}`); }
          }
        }),
        vscode.workspace.onDidChangeTextDocument(event => {
          if (event.document !== document) return;
          clearTimeout(timer); timer = setTimeout(send, 100);
        }),
        vscode.workspace.onDidChangeConfiguration(event => { if (event.affectsConfiguration('mermaidViewer', uri)) send(); }),
        panel.onDidChangeViewState(() => { if (panel.visible) send(); }),
      ];
      panel.onDidDispose(() => {
        disposed = true; clearTimeout(timer); panels.delete(key);
        listeners.forEach(listener => listener.dispose());
      });
      try {
        let html = await readFile(vscode.Uri.joinPath(publicRoot, 'index.html').fsPath, 'utf8');
        if (disposed) return;
        const nonce = randomBytes(18).toString('base64');
        const resource = file => panel.webview.asWebviewUri(vscode.Uri.joinPath(publicRoot, file)).toString();
        html = html.replace(/(src|href)="\/([^\"]+)"/g, (_, attr, file) => `${attr}="${resource(file)}"`)
          .replace('<html lang="it">', '<html lang="it" data-host="vscode">')
          .replace('<script ', `<script nonce="${nonce}" `)
          .replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src ${panel.webview.cspSource} 'nonce-${nonce}'; style-src ${panel.webview.cspSource} 'unsafe-inline'; img-src ${panel.webview.cspSource} blob: data:; font-src ${panel.webview.cspSource}; connect-src 'none';">`);
        panel.webview.html = html;
      } catch (error) { panel.dispose(); throw error; }
    } catch (error) { vscode.window.showErrorMessage(`Anteprima non disponibile: ${error.message}`); }
  });
  context.subscriptions.push(command, { dispose: () => { for (const panel of panels.values()) panel.dispose(); } });
}
module.exports = { activate };
