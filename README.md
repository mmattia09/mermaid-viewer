# mermaid-viewer

[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=for-the-badge)](LICENSE)
[![Bun](https://img.shields.io/badge/runtime-bun-f9f1e1?style=for-the-badge)](https://bun.sh)
[![Zero runtime dependencies](https://img.shields.io/badge/runtime%20deps-0-34c759?style=for-the-badge)](#how-its-built)

A live preview for [Mermaid](https://mermaid.js.org) diagrams — the VS Code extension
experience, in the browser: open a `.mmd` from the command line and the page redraws
on every save **keeping zoom and position**, so you can work on one detail without
losing your framing. Unlimited zoom, markdown rendered inside the cells, export to
SVG, PNG and PDF.

Born to reread hand-written concept maps, it works with any `.mmd` or `.mermaid`
file. No build step, no account, no network: a local server that serves a static page
and watches a file.

```bash
mmv "path/to/file.mmd"
```

> The app's interface is in Italian.

## Features

- **Live reload that keeps your place** — every save re-renders the diagram, but zoom
  and position stay where they were. A dot next to the filename shows whether the
  connection is alive.
- **Unlimited pan and zoom** — drag, wheel, pinch, zoom at the pointer, *fit to
  window*, back to 100%.
- **Markdown inside cells** — `**bold**`, `*italic*` and `` `code` `` rendered even in
  labels written without backticks, by rewriting the source on the fly without
  touching the file. Toggleable with a checkbox.
- **Export to SVG, PNG 1×/2×/4× and PDF** — vector where it matters, with the PNG
  limits stated up front instead of saving empty files (see [How it
  works](#how-it-works)).
- **Five themes** — auto (follows the system), light, dark, neutral, forest. The
  choice sticks.
- **Built-in file picker** — browse folders from the browser (⌘O), with recent files
  one click away, or drag a `.mmd` into the window.
- **A single instance** — if the port is already taken by the viewer, the file is
  handed to the running instance in a new tab instead of failing the command.
- **No runtime dependencies** — Mermaid ships inside the repository, everything else
  is plain JavaScript. Not a single network request goes out.

## How it works

`mmv` starts a local server on `127.0.0.1`, opens the browser on the page and keeps
listening. The file is served over HTTP and watched through an
[SSE](https://developer.mozilla.org/docs/Web/API/Server-sent_events) channel: on every
change the new text reaches the page, which re-renders and nothing else.

### How changes are detected

The watcher compares the file's **contents** every 500 ms; `fs.watch` is only an
accelerator on local disks. It looks crude, but it is the only thing that survives all
three cases:

- **atomic saves** — many editors write a temporary file and rename it over the
  original, so `fs.watch` stays attached to the old inode and goes silent;
- **network shares (SMB)** — `fs.watch` reports nothing at all, and the macOS SMB
  client caches attributes: `stat()` keeps returning the **same `mtime`** even after a
  rewrite. The bytes read back are always current, though, so comparing contents works
  where comparing `mtime` fails silently;
- **local disk** — everything works here, and `fs.watch` makes the response instant.

### Markdown inside cells

Mermaid only interprets markdown inside labels wrapped in backticks, and hand-written
maps usually don't do that:

```
A("**Counter-Reformation**: the Church reacts")
```

With the **Markdown** option on (the default) the source is rewritten before it
reaches Mermaid, so the bold shows up without editing your files. Comment lines
starting with `%%` and labels already in markdown form are left alone.

### Why PNG sometimes isn't possible

Diagrams are rendered with `htmlLabels: true`, otherwise Mermaid can't handle
multi-line labels between backticks and fails with *"splitLineToFitWidth does not
support newlines in the line"*. But `htmlLabels: true` emits `<foreignObject>`, and an
SVG containing those **cannot be rasterised**: the canvas is marked *tainted* and
`toBlob()` throws a `SecurityError`.

So for PNG the diagram is rendered again with `htmlLabels: false`, which emits
`<text>`. On diagrams without multi-line labels that works; on the others it doesn't,
and the button says so instead of saving an empty file. SVG and PDF always work. Past
roughly 16384 px per side the PNG scale factor is lowered automatically, because
Chrome would produce a blank image.

### How it's built

No build step: what's in the repository is what runs.

```
mmv                       command-line launcher
server.ts                 Bun server: static files, folder browsing, SSE watch
public/index.html
public/app.js             rendering, pan/zoom, export
public/md-labels.js       label rewriting for markdown
public/style.css
public/vendor/mermaid.min.js
test.mjs                  regression run over a folder of .mmd files
```

## Installation

### Requirements

[Bun](https://bun.sh) 1.1 or newer. The `mmv` launcher is a bash script, so it needs a
POSIX shell: macOS and Linux are fine, Windows needs WSL or Git Bash. Opening the
browser automatically uses the macOS `open` command; elsewhere the server still starts
and you just open the address it prints.

```bash
git clone https://github.com/mmattia09/mermaid-viewer.git
cd mermaid-viewer
chmod +x mmv
```

Nothing needs installing to use it: `bun install` only pulls the dev dependencies,
which are there for the tests and for updating Mermaid.

### Alias

```bash
alias mmv='~/mermaid-viewer/mmv'
```

Put it in `~/.zshrc` or `~/.bashrc`, with the path where you cloned the repository.
Then:

```bash
mmv diagram.mmd
```

With no arguments the viewer starts empty: use **Apri…** or drag a file into the
window.

### Updating Mermaid

```bash
bun install
bun run vendor
```

## Configuration

There is no config file: everything comes from environment variables or from the
controls in the toolbar.

| Variable | Default | What it does |
|---|---|---|
| `PORT` | `4321` | Starting port. If it's taken by another instance the file is handed over to it; if an unrelated program holds it, up to 12 following ports are tried |
| `NO_OPEN` | — | With `NO_OPEN=1` the browser is not opened: the server only prints the address |

Set them for a single run:

```bash
PORT=5000 NO_OPEN=1 mmv diagram.mmd
```

or for good, next to the alias in `~/.zshrc`:

```bash
alias mmv='PORT=5000 ~/mermaid-viewer/mmv'
```

The server listens on `127.0.0.1` only and can browse just three roots: the user's
home, `/Volumes` and the folder it was launched from. The rest of the filesystem is
out of reach. Recognised extensions are `.mmd` and `.mermaid`.

The chosen theme, the last folder opened and the recent files live in the browser's
`localStorage`.

### Controls

| | |
|---|---|
| drag | move the diagram |
| wheel / two fingers | move |
| ⌘ or ctrl + wheel, pinch | zoom at the pointer |
| double click, `F` | fit to window |
| `+` `−` | zoom |
| `0` | back to 100% |
| ⌘O | open a file |

The percentage button takes you back to 100%.

## Tests

```bash
bun install
bun test.mjs path/to/folder
```

Every `.mmd` found is rendered twice, raw and after `prepareMarkdown()`. It uses
`render()` and not `parse()` on purpose: a diagram can pass the parser and then fail
while being drawn, and that is exactly how the multi-line label problem went unnoticed.

## Contributing

Bug reports and ideas → [GitHub Issues](https://github.com/mmattia09/mermaid-viewer/issues).
For a pull request:

1. Open an issue first if the change is large, so you don't work for nothing.
2. One branch per topic, small commits, Italian imperative commit messages like the
   ones already there.
3. Before opening the PR, run the tests against a folder of real diagrams and check
   that SVG, PNG and PDF export still work.
4. No runtime dependencies and no build step: if a feature needs an extra package,
   let's discuss it in the issue.

The code style is the one in the existing files — ES modules, no framework, comments
only where the *why* isn't obvious from the code.

## Authors

By [@mmattia09](https://github.com/mmattia09). Built with the help of
[Claude Code](https://claude.com/claude-code).

## License

[MIT](LICENSE).
