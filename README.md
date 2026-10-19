# Mermaid Viewer — Pele & Mermaid

Live previews for `.mmd` and `.mermaid` files, in your browser or beside your
VS Code editor. Includes pan and zoom, themes, local exports, and an interface
in English, Italian, French, German, and Spanish.

## Interface preview

VS Code: syntax highlighting, Mermaid file icons, and a side-by-side preview
without extra side margins. The compact toolbar keeps the file name, zoom,
settings, and export controls on one row.

![Syntax highlighting and side-by-side preview in VS Code](docs/images/vscode-preview.png)

Browser app with the **Ocean** theme:

![Browser preview with the Ocean theme](docs/images/preview-ocean.png)

The **Plum** webview theme in a 420 px panel:

<img src="docs/images/webview-plum.png" alt="Compact Plum webview with a responsive vertical layout" width="420">

<img src="docs/images/webview-options.png" alt="Settings for rendering engine, responsive layout, and theme" width="420">

Screenshots use [the example diagram](examples/anteprima.mmd). Some screenshots
show the Italian interface.

## VS Code extension

1. Install `artifacts/mermaid-viewer.vsix` using **Extensions → … → Install from VSIX…**.
2. Open a `.mmd` or `.mermaid` file.
3. Click **Open Preview to the Side** in the editor toolbar, or run
   **Mermaid Viewer: Open Preview to the Side** from the command palette.
   The command is also available in the Explorer context menu.
4. Keyboard shortcut: `Cmd+K V` on macOS, `Ctrl+K V` on Windows/Linux.

The TextMate grammar highlights keywords, comments, arrows, strings, and colors.
Bracket pairing and `%%` comments are supported. Mermaid file icons have light
and dark variants; an icon theme with explicit file associations may override them.

The preview follows unsaved edits with a 100 ms debounce. Each file has its own
panel, which is reused when you invoke the command again. The extension requires
no Bun installation, server, or Internet connection.

Choose **Pele / Mermaid** and **Responsive** in **Preview settings**. Preferences
survive hiding the panel. Defaults for new previews are configurable in VS Code:

```json
{
  "mermaidViewer.engine": "pele",
  "mermaidViewer.responsive": true
}
```

The automatic theme follows VS Code. The webview fills the panel width without
VS Code's default side padding. Opening or dropping other files is disabled inside
the webview: open documents through the editor or Explorer.

Engine, Responsive, theme, language, and Markdown controls are in **Preview settings**,
next to **Export**. Narrow panels truncate the file name and show an export icon
instead of its label. A subtle divider appears when space allows. Menu and control
animations respect the system's reduced-motion preference.

SVG, PNG, and PDF exports use the native save dialog. PDFs are generated locally
on demand, without an external browser or online service.

## Language

Select **Automatic**, **English**, **Italiano**, **Français**, **Deutsch**, or
**Español** under **Preview settings → Language**. Automatic follows the browser
language or VS Code's display language, falling back to English for unsupported
languages. Switching languages updates the interface immediately and saves the
selection. Diagram content and file names are never translated.

VS Code command names, settings descriptions, panel titles, and host notifications
follow VS Code's display language. Diagnostic details supplied by the renderers,
operating system, or server retain their original wording.

## Browser app

Requires [Bun](https://bun.sh). Renderer assets are included in the repository;
no dependency installation or build is needed to start the app.

```bash
./mmv path/to/diagram.mmd
# Or start without an initial file:
bun server.ts
```

The server listens on `127.0.0.1:4321` and opens your browser. Use **Open…**, recent
files, or drag and drop. Files opened through the picker refresh on save. Dropping
a file may only provide a snapshot if the browser does not support filesystem
handles. Edits preserve the current zoom and position.

| Option | Default | Description |
|---|---|---|
| `PORT` | `4321` | Starting port; up to 12 ports are tried |
| `NO_OPEN` | — | Set to `1` to prevent automatically opening the browser |

If another viewer instance is already listening, the launcher opens the new file
in a tab of that instance. Allowed roots are the home directory, `/Volumes`, and
the startup directory. Real paths are checked, including symbolic links.

## Renderers and sizing

[Pele](https://pele.run/) is the default engine. Only its core and required diagram
types are loaded. Mermaid loads when selected. Both render locally: diagram source
is never sent to an external service.

| | Responsive on | Responsive off |
|---|---|---|
| Pele | Adapts the layout to available space; may wrap labels and change direction | Preserves direction and natural dimensions |
| Mermaid | Preserves the Mermaid layout and fits the zoom to the panel | Natural dimensions, initially at 100% zoom |

Toggling Responsive always recenters the diagram: enabling it fits the view;
disabling it centers at natural size (100%). Pele layout changes use a 120 ms
debounce and only run when the width changes. Height-only changes and fixed-mode
resizes do not rebuild the SVG. After manual pan or zoom, the point at the center
of the view is preserved. Zoom and **Fit and center** remain available in fixed
mode. Changing the engine or mode resets framing; file edits preserve the view.

Pele interprets Mermaid syntax using its own layout, so positions and edge routes
may differ. It does not support arbitrary HTML labels or external plugins;
Mermaid `themeVariables` do not apply to Pele. Switch to Mermaid to compare the
output. Rendering errors never silently change the engine. See
[Pele compatibility](https://pele.run/compatibility) and the
[research notes (Italian)](docs/pele.md).

Nine themes are available: Automatic, Light, Dark, Neutral, Forest, **Ocean**,
**Plum**, **Sand**, and **Graphite**. The four additional palettes style both the
interface and diagram with either engine. **Markdown in labels** converts bold,
italic, and code labels to Mermaid markdown strings without changing the source
file. Browser preferences are saved in localStorage. Diagram links and images
are disabled.

## Export and controls

- **SVG**: vector output with explicit dimensions, background, and embedded Pele
  theme variables.
- **PNG 1× / 2× / 4×**: Pele uses its SVG directly; Mermaid is rendered with SVG
  labels. Some multiline Mermaid labels cannot be exported as PNG; an error is
  shown in that case. The scale is reduced above 16,384 pixels per side or
  32 million pixels in total.
- **PDF**: the extension creates a PDF containing a 2× PNG on a page sized to the
  diagram, with the same resolution limits as PNG. Text is rasterized and cannot
  be selected. Some multiline Mermaid labels require Pele or SVG export. The
  browser app uses vector printing: select “Save as PDF”.

| Control | Action |
|---|---|
| Drag / scroll wheel | Pan |
| Cmd/Ctrl + wheel, pinch | Zoom around the pointer |
| `+`, `−` | Zoom |
| `0`, percentage button | Center at 100% |
| `F`, double click, Fit and center | Fit to the viewport |
| Cmd/Ctrl + O | Open a file (browser only) |

Empty source clears the preview. A rendering error keeps the last valid diagram
and displays the error as text. Source length is limited to 50,000 characters.

## Development and verification

```bash
bun install --frozen-lockfile
bun run test                # renderers, watcher, server, grammar, localization and Mermaid fixtures
bun run test:extension      # tests in the installed VS Code Extension Host
bun run package:extension   # creates artifacts/mermaid-viewer.vsix
```

On macOS, `test:extension` uses `/Applications/Visual Studio Code.app`. On other
systems, set `VSCODE_EXECUTABLE` to the VS Code executable. Tests use a temporary
profile and do not install the extension into your personal profile. Press F5 in
the repository to try it in an Extension Development Host.

`tests/browser.js` is an asynchronous expression you can run in the viewer's
console. It checks lazy rendering, responsive/fixed modes, updates, and SVG/PNG/PDF
exports in an iframe with CSP and messaging equivalent to the webview. Extension
Host tests cover activation, side previews, unsaved edits, panel reuse, and disposal.

```bash
node test.mjs path/to/folder # Mermaid regression checks on your own files
bun run vendor              # regenerate local assets from lockfile versions
```

The frontend is plain JavaScript. `public/renderers.js` isolates the engines and
serializes Mermaid, whose configuration is global. Outdated render results are
ignored. `public/i18n.js` handles locale selection and static UI bindings;
`public/translations.js` contains the frontend dictionaries. VS Code contributions
use `package.nls*.json`, and host messages use `extension/locales.json`.

`watch-file.ts` shares one watcher per path across tabs. It watches the directory
to handle atomic saves and compares contents every 500 ms, including on network
filesystems. `extension/extension.cjs` hosts the same frontend using local resources,
CSP, and message transport instead of HTTP/SSE.

Renderers are vendored for offline use without a build. Their licenses are under
`public/vendor`. The VSIX includes ready-to-use assets.

## License

[MIT](LICENSE). Author: [@mmattia09](https://github.com/mmattia09).
