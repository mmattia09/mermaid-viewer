const vscode = require('vscode');
const locales = require('./locales.json');
const { createPanelRegistry } = require('./panel-registry.cjs');
const { createPreviewPanel } = require('./preview-panel.cjs');

function activate(context) {
  const requestedLanguage = vscode.env.language.toLowerCase().split(/[-_]/)[0];
  const language = Object.hasOwn(locales, requestedLanguage) ? requestedLanguage : 'en';
  const strings = locales[language];
  const panels = createPanelRegistry();
  const command = vscode.commands.registerCommand('mermaidViewer.openPreview', async uri => {
    try {
      uri ??= vscode.window.activeTextEditor?.document.uri;
      if (!uri) return vscode.window.showInformationMessage(strings.open);
      if (!/\.(mmd|mermaid)$/i.test(uri.path) && uri.scheme !== 'untitled') {
        return vscode.window.showInformationMessage(strings.select);
      }
      const panel = await panels.getOrCreate(uri.toString(), () => createPreviewPanel(vscode, context, uri, strings, language));
      panel.reveal(vscode.ViewColumn.Beside, true);
    } catch (error) { vscode.window.showErrorMessage(`${strings.previewError}: ${error.message}`); }
  });
  context.subscriptions.push(command, panels);
}
module.exports = { activate };
