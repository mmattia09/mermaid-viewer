# Pele investigation

Reviewed https://pele.run/, /api, /compatibility, /security, /theming and the
interactive playground before implementation (2026-10-17). Package: pele 1.6.0.

- Independent Mermaid-syntax parser/layout; output is not pixel-compatible with Mermaid.
- `pele/lazy` loads diagram types on demand. Keep imports on that entry point.
- `renderAsync(source, { maxWidth, responsive, autoDirection })` supports responsive
  layout; fixed mode must omit maxWidth and disable autoDirection as well.
- Narrow layouts can wrap/rearrange nodes, including LR → TB below 640px.
- CSS variables theme SVG without rebuilding it. Export must resolve those variables.
- SVG text supports formatting, not arbitrary HTML. No JavaScript click callbacks.
- Mermaid themeVariables do not control Pele colors; external plugins are unsupported.
- Default limits: 50k source characters, 4M SVG characters, 5k flowchart edges.
- Display errors as text. Disable diagram links/images in the shared preview to keep
  local diagrams offline and prevent unintended navigation in the webview.
- Use an application-owned ResizeObserver with debouncing and latest-result checks
  to preserve the existing viewer's pan/zoom and share behavior between engines.

VS Code reference: https://code.visualstudio.com/api/extension-guides/webview
Use ViewColumn.Beside, localResourceRoots, CSP and message passing. Send document
contents after a ready handshake; never interpolate source text in webview HTML.
