import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';

const destination = 'public/vendor';
const packages = {
  pele: { directory: 'dist/esm', prefix: 'pele/', files: { LICENSE: 'pele/LICENSE' } },
  mermaid: { files: { 'dist/mermaid.min.js': 'mermaid.min.js', LICENSE: 'mermaid.LICENSE' } },
  jspdf: { files: { 'dist/jspdf.umd.min.js': 'jspdf.umd.min.js', LICENSE: 'jspdf.LICENSE' } },
};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function listFiles(root, relative = '') {
  const files = [];
  for (const item of await readdir(join(root, relative), { withFileTypes: true })) {
    const path = join(relative, item.name);
    if (item.isDirectory()) files.push(...await listFiles(root, path));
    else files.push(path);
  }
  return files.sort();
}

const sources = new Map();
const manifest = { packages: {}, files: {} };
for (const [name, definition] of Object.entries(packages)) {
  const root = join('node_modules', name);
  const metadata = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  manifest.packages[name] = { version: metadata.version, license: metadata.license };
  if (definition.directory) {
    for (const file of await listFiles(join(root, definition.directory))) {
      sources.set(definition.prefix + file, join(root, definition.directory, file));
    }
  }
  for (const [file, target] of Object.entries(definition.files)) sources.set(target, join(root, file));
}
for (const [target, source] of [...sources].sort(([a], [b]) => a.localeCompare(b, 'en'))) {
  manifest.files[target] = hash(await readFile(source));
}
const serialized = JSON.stringify(manifest, null, 2) + '\n';
if (process.argv.includes('--check')) {
  const actual = await readFile(join(destination, 'manifest.json'), 'utf8');
  if (actual !== serialized) throw new Error('Vendor manifest differs from installed packages. Run bun run vendor.');
  const actualFiles = (await listFiles(destination)).filter(file => file !== 'manifest.json');
  if (JSON.stringify(actualFiles) !== JSON.stringify([...sources.keys()].sort())) throw new Error('Unexpected or missing vendor files');
  for (const [file, expected] of Object.entries(manifest.files)) {
    if (hash(await readFile(join(destination, file))) !== expected) throw new Error(`Vendor checksum mismatch: ${file}`);
  }
  console.log(`Verified ${sources.size} vendor assets and licenses against installed packages.`);
} else {
  // Validate and hash every source before replacing existing assets.
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  for (const [target, source] of sources) {
    const path = join(destination, target);
    await mkdir(dirname(path), { recursive: true });
    await copyFile(source, path);
  }
  await writeFile(join(destination, 'manifest.json'), serialized);
  console.log(`Vendored ${sources.size} assets with a reproducible SHA-256 manifest.`);
}
