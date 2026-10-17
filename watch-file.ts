import { readFile } from 'node:fs/promises';
import { watch } from 'node:fs';
import { dirname } from 'node:path';

// One poller per path, shared by all tabs. Contents remain authoritative on SMB.
const watches = new Map<string, { listeners: Set<(text: string) => void>; stop: () => void; text?: string }>();
export function watchFile(path: string, listener: (text: string) => void) {
  let entry = watches.get(path);
  if (!entry) {
    let closed = false;
    let reading = false;
    let pending = false;
    let debounce: ReturnType<typeof setTimeout>;
    entry = { listeners: new Set(), stop: () => {} };
    const current = entry;
    const check = async () => {
      if (closed) return;
      if (reading) { pending = true; return; }
      reading = true;
      try {
        const text = await readFile(path, 'utf8');
        if (!closed && text !== current.text) {
          current.text = text;
          current.listeners.forEach(callback => callback(text));
        }
      } catch { /* Atomic saves and temporary disconnections retry at the next poll. */ }
      finally { reading = false; if (pending) { pending = false; void check(); } }
    };
    let watcher: ReturnType<typeof watch> | undefined;
    try {
      // Watch the directory so replacing the file does not invalidate the watcher.
      watcher = watch(dirname(path), () => { clearTimeout(debounce); debounce = setTimeout(check, 40); });
      watcher.on('error', () => watcher?.close());
    } catch { /* Polling also works where native filesystem watching is unavailable. */ }
    const interval = setInterval(check, 500);
    current.stop = () => { closed = true; clearInterval(interval); clearTimeout(debounce); watcher?.close(); };
    watches.set(path, entry);
    void check();
  }
  entry.listeners.add(listener);
  if (entry.text !== undefined) listener(entry.text);
  const current = entry;
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    current.listeners.delete(listener);
    if (!current.listeners.size) { current.stop(); watches.delete(path); }
  };
}
