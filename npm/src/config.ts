/**
 * `wasm-facade.toml`, at the root of the repository using wasm-facade (the CLI looks for it from the current folder up): every
 * key has a default, a conventional repository gives almost nothing.
 *
 * ```toml
 * extractor = ["wasm-facade"]             # the command running the crate's extractor (default: `wasm-facade` on the PATH)
 * api = "wasm-facade/api.json"            # where the extractor writes the API (the `[extract]` table's `out`)
 * converters = "src/converters.ts"   # the project's converters, imported by the facade (none by default)
 * wasm = "./pkg/my_crate.js"         # the wasm-bindgen module the facade imports
 *
 * [extract]                          # the extractor's: cfg, attribute, exported, call_keys, members ("all"), out
 * cfg = "wasm_facade"
 *
 * [types]                            # the project's Rust types in TypeScript
 * Rgba = "[number, number, number, number]"
 *
 * [format]                           # a formatter per extension, the file's text on its stdin (`{name}`: its name)
 * ".ts" = ["bunx", "biome", "format", "--stdin-file-path={name}"]
 *
 * [targets.typescript]               # a target by its name: built in (typescript, react, reference) or a plugin
 * out = "src/api.ts"
 * [targets.python]
 * plugin = "scripts/wasm-facade/python.ts" # a local plugin: a module whose default export is a Target
 * enabled = false
 * ```
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface TargetConfig {
  /** A local plugin's module, from the root (built-in targets have none) */
  plugin?: string;
  /** Default true */
  enabled?: boolean;
  [option: string]: unknown;
}

export interface Config {
  root: string;
  extractor: string[];
  api: string;
  converters: string | undefined;
  wasm: string | undefined;
  extract: Record<string, unknown>;
  types: Record<string, string>;
  format: Record<string, string[]>;
  targets: Record<string, TargetConfig>;
}

export const FILE = 'wasm-facade.toml';

/** The folder of `wasm-facade.toml` from `from` up */
export const rootOf = (from: string): string => {
  for (let dir = from; ; dir = dirname(dir)) {
    if (existsSync(join(dir, FILE))) return dir;
    if (dirname(dir) === dir) throw new Error(`wasm-facade: no ${FILE} in ${from} nor above`);
  }
};

const record = <T>(value: unknown): Record<string, T> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, T>) : {};

const strings = (value: unknown, fallback: string[]): string[] =>
  Array.isArray(value) && value.every((v) => typeof v === 'string') ? value : fallback;

/** The configuration of the repository at `root`: its file over the defaults */
export const configOf = (root: string): Config => {
  const file = record<unknown>(Bun.TOML.parse(readFileSync(join(root, FILE), 'utf8')));
  const extract = record<unknown>(file.extract);
  const given = typeof file.api === 'string' ? file.api : 'wasm-facade/api.json';
  const api = typeof extract.out === 'string' ? extract.out : given;

  return {
    root,
    extractor: strings(file.extractor, ['wasm-facade']),
    api,
    converters: typeof file.converters === 'string' ? file.converters : undefined,
    wasm: typeof file.wasm === 'string' ? file.wasm : undefined,
    extract: { ...extract, out: api },
    types: record<string>(file.types),
    format: Object.fromEntries(
      Object.entries(record<unknown>(file.format)).map(([ext, command]) => [ext, strings(command, [])]),
    ),
    targets: record<TargetConfig>(file.targets),
  };
};
