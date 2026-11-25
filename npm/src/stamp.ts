/**
 * What makes `generate` incremental: the stamp of its inputs (the API, the configuration, the plugins and the local
 * modules they import, the `inputs` of wasm-facade.toml, wasm-facade's version) and of the files it wrote, kept in
 * `cache` (default `node_modules/.cache/wasm-facade`). The same inputs and the files as written: nothing to do.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import type { Config } from './config.ts';
import { VERSION } from './version.ts';

const hash = (text: string): string => createHash('sha256').update(text).digest('hex');

const read = (path: string): string => (existsSync(path) ? readFileSync(path, 'utf8') : '');

const EXTENSIONS = ['', '.ts', '.tsx', '.mts', '.js', '.mjs', '/index.ts', '/index.js'];

/** A module and the local modules it imports, followed transitively (relative specifiers only) */
export const modulesOf = (entry: string): string[] => {
  const seen = new Set<string>();
  const visit = (path: string) => {
    if (seen.has(path) || !existsSync(path)) return;
    seen.add(path);

    const specifiers = read(path).matchAll(/(?:from\s*|import\s*\(\s*|import\s+)['"](\.{1,2}\/[^'"]+)['"]/g);

    for (const [, specifier] of specifiers) {
      const base = resolve(dirname(path), specifier ?? '');
      const found = EXTENSIONS.map((ext) => base + ext).find((p) => existsSync(p) && !p.endsWith('/'));

      if (found) visit(found);
    }
  };

  visit(entry);

  return [...seen].sort();
};

/** The files whose text makes what `generate` writes, from the root */
export const inputsOf = (config: Config): string[] => {
  const plugins = Object.values(config.targets)
    .filter((t) => t.enabled !== false && typeof t.plugin === 'string')
    .flatMap((t) => modulesOf(join(config.root, t.plugin as string)));
  const files = [
    join(config.root, 'wasm-facade.toml'),
    join(config.root, config.api),
    ...plugins,
    ...config.inputs.map((p) => join(config.root, p)),
  ];

  return [...new Set(files)].map((p) => relative(config.root, p));
};

interface Stamp {
  inputs: string;
  outputs: Record<string, string>;
}

const stampPath = (config: Config): string => join(config.root, config.cache, 'stamp.json');

const inputsHash = (config: Config): string =>
  hash(JSON.stringify([VERSION, ...inputsOf(config).map((p) => [p, hash(read(join(config.root, p)))])]));

/** Whether the inputs are those of the last `generate` and every file it wrote is still as written */
export const fresh = (config: Config): boolean => {
  const stamp = JSON.parse(read(stampPath(config)) || 'null') as Stamp | null;

  return (
    stamp !== null &&
    stamp.inputs === inputsHash(config) &&
    Object.entries(stamp.outputs).every(
      ([path, sum]) => existsSync(join(config.root, path)) && hash(read(join(config.root, path))) === sum,
    )
  );
};

/** The stamp of a `generate` that wrote (or found as made) `outputs` */
export const stamp = (config: Config, outputs: string[]): void => {
  const value: Stamp = {
    inputs: inputsHash(config),
    outputs: Object.fromEntries(outputs.map((p) => [p, hash(read(join(config.root, p)))])),
  };

  mkdirSync(dirname(stampPath(config)), { recursive: true });
  writeFileSync(stampPath(config), `${JSON.stringify(value, null, 2)}\n`);
};
