// Copies the pdf.js worker that ships with the installed pdfjs-dist into
// public/ so it is served as a static asset at /pdf.worker.min.mjs.
//
// Why a copy instead of `new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)`:
// that pattern makes Next's SWC try to parse the worker as a script and it
// chokes on the worker's top-level `import.meta` ("cannot be used outside of
// module code"), breaking `next build`. A self-hosted copy keeps the worker
// version-locked to the API (no CDN drift) and 100% client-side.
//
// Runs on postinstall + prebuild so the file always matches the installed version.
import { copyFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs");
const destDir = join(root, "public");
const dest = join(destDir, "pdf.worker.min.mjs");

mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
console.log(`[copy-pdf-worker] ${src} -> ${dest}`);
