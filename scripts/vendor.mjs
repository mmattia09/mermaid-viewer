import { cp, mkdir, rm } from 'node:fs/promises';
await mkdir('public/vendor', { recursive: true });
await rm('public/vendor/pele', { recursive: true, force: true });
await cp('node_modules/pele/dist/esm', 'public/vendor/pele', { recursive: true });
await cp('node_modules/pele/LICENSE', 'public/vendor/pele/LICENSE');
await cp('node_modules/mermaid/dist/mermaid.min.js', 'public/vendor/mermaid.min.js');
await cp('node_modules/mermaid/LICENSE', 'public/vendor/mermaid.LICENSE');
await cp('node_modules/jspdf/dist/jspdf.umd.min.js', 'public/vendor/jspdf.umd.min.js');
await cp('node_modules/jspdf/LICENSE', 'public/vendor/jspdf.LICENSE');
