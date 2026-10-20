import { readdir, readFile, stat, realpath } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';

/** Resolve and authorize files once for each read, including watcher refreshes. */
export function createFileAccess(roots: string[]) {
  const EXTS = ['.mmd', '.mermaid'];

  /** Radici sfogliabili: tutto il resto del filesystem è fuori portata. */
  const ROOTS = roots
    .map((p) => resolve(p))
    .filter((p, i, a) => a.indexOf(p) === i);

  const inRoots = (p: string) => ROOTS.some((r) => p === r || p.startsWith(r + '/'));
  const isDiagram = (n: string) => EXTS.some((e) => n.toLowerCase().endsWith(e));

  async function openFile(p: string) {
    const abs = await realpath(resolve(p));
    if (!inRoots(abs) || !isDiagram(abs)) throw new Error('file non consentito');
    const st = await stat(abs);
    if (!st.isFile()) throw new Error('non è un file');
    return { path: abs, name: basename(abs), text: await readFile(abs, 'utf8') };
  }

  /** Elenco di una cartella: sottocartelle + soli diagrammi, per il selettore. */
  async function browse(p: string) {
    const abs = await realpath(resolve(p));
    if (!inRoots(abs)) throw new Error('cartella fuori dalle radici consentite');

    const entries = await readdir(abs, { withFileTypes: true });
    const dirs: string[] = [];
    const files: string[] = [];
    for (const e of entries) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      if (e.isDirectory()) dirs.push(e.name);
      else if (isDiagram(e.name)) files.push(e.name);
    }

    const collator = new Intl.Collator('it', { numeric: true });
    const parent = dirname(abs);
    return {
      path: abs,
      parent: parent !== abs && inRoots(parent) ? parent : null,
      roots: ROOTS,
      dirs: dirs.sort(collator.compare),
      files: files.sort(collator.compare),
    };
  }

  return { openFile, browse };
}
