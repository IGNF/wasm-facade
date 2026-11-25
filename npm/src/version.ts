/** wasm-facade's version, its npm package's: the extractor's it runs, and part of `generate`'s stamp */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// `src/` from the sources, `dist/` once built: the package's manifest is one folder up from both
const manifest = join(dirname(fileURLToPath(import.meta.url)), '../package.json');

export const VERSION: string = (JSON.parse(readFileSync(manifest, 'utf8')) as { version: string }).version;
