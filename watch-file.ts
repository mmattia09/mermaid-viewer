import { readFile } from 'node:fs/promises';
import { watch } from 'node:fs';
import { dirname } from 'node:path';

type DirectorySubscription = { listeners: Set<() => void>; watcher?: ReturnType<typeof watch> };
const directories = new Map<string, DirectorySubscription>();

// Native watchers are shared by directory; polling remains per file for SMB.
function watchDirectory(directory: string, listener: () => void) {
  let entry = directories.get(directory);
  if (!entry) {
    entry = { listeners: new Set() };
    const current = entry;
    try {
      current.watcher = watch(directory, () => current.listeners.forEach(notify => notify()));
      current.watcher.on('error', () => current.watcher?.close());
    } catch { /* Content polling is authoritative when native watching is unavailable. */ }
    directories.set(directory, current);
  }
  entry.listeners.add(listener);
  const current = entry;
  return () => {
    current.listeners.delete(listener);
    if (!current.listeners.size) { current.watcher?.close(); directories.delete(directory); }
  };
}

// One poller per path, shared by all tabs. Contents remain authoritative on SMB.
const watches = new Map<string, { listeners: Set<(text: string) => void>; stop: () => void; text?: string }>();
export function watchFile(path: string, listener: (text: string) => void, read = () => readFile(path, 'utf8')) {
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
        const text = await read();
        if (!closed && text !== current.text) {
          current.text = text;
          current.listeners.forEach(callback => callback(text));
        }
      } catch { /* Atomic saves and temporary disconnections retry at the next poll. */ }
      finally { reading = false; if (pending) { pending = false; void check(); } }
    };
    const unwatchDirectory = watchDirectory(dirname(path), () => {
      clearTimeout(debounce);
      debounce = setTimeout(check, 40);
    });
    const interval = setInterval(check, 500);
    current.stop = () => { closed = true; clearInterval(interval); clearTimeout(debounce); unwatchDirectory(); };
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
