/**
 * `wasm-facade.toml`, at the root of the repository using wasm-facade (the CLI looks for it from the current folder up): every
 * key has a default, a conventional repository gives almost nothing.
 *
 * ```toml
 * extractor = ["cargo", "run", "--"]    # the command running the extractor (default: the package's own, extractor.ts)
 * api = "wasm-facade/api.json"            # where the extractor writes the API (the `[extract]` table's `out`)
 * converters = "src/converters.ts"   # the project's converters, imported by the facade (none by default)
 * wasm = "./pkg/my_crate.js"         # the wasm-bindgen module the facade imports
 * inputs = ["scripts/names.json"]    # files the plugins read, besides their modules (for `generate`'s stamp)
 * cache = "node_modules/.cache/wasm-facade" # where `generate` keeps its stamp
 * accessors = "properties"          # a class's properties: `get radius()`/`set radius(v)`, or "methods": `getRadius()`/`setRadius(v)`
 *
 * [imports]                          # the project's TypeScript types the generated code names (a class's `deps`): their module
 * GeoMap = "src/map.ts"              # a file from the root (with its extension), else a package as written ("@scope/pkg")
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
import { dirname, join, relative } from 'node:path';
import { parse } from 'smol-toml';

export interface TargetConfig {
  /** A local plugin's module, from the root (built-in targets have none) */
  plugin?: string;
  /** Default true */
  enabled?: boolean;
  [option: string]: unknown;
}

export interface Config {
  root: string;
  /** The command running the extractor, if given: the package's own else (`extractor.ts`) */
  extractor: string[] | undefined;
  api: string;
  converters: string | undefined;
  wasm: string | undefined;
  extract: Record<string, unknown>;
  types: Record<string, string>;
  format: Record<string, string[]>;
  targets: Record<string, TargetConfig>;
  /** Files besides the API, the configuration and the plugins (and their local imports) that what is generated reads */
  inputs: string[];
  /** Where `generate` keeps the stamp making it incremental, from the root */
  cache: string;
  /** How a class's properties are written: accessors (`get radius()`, `set radius(v)`, the default) or a pair of
   * methods (`getRadius()`, `setRadius(v)`) */
  accessors: Accessors;
  /** The project's TypeScript types the generated code names, by name: their module (a file from the root, else a
   * package) */
  imports: Record<string, string>;
}

export type Accessors = 'properties' | 'methods';

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
  const file = record<unknown>(parse(readFileSync(join(root, FILE), 'utf8')));
  const extract = record<unknown>(file.extract);
  const given = typeof file.api === 'string' ? file.api : 'wasm-facade/api.json';
  const api = typeof extract.out === 'string' ? extract.out : given;

  return {
    root,
    extractor: Array.isArray(file.extractor) ? strings(file.extractor, []) : undefined,
    api,
    converters: typeof file.converters === 'string' ? file.converters : undefined,
    wasm: typeof file.wasm === 'string' ? file.wasm : undefined,
    extract: { ...extract, out: api },
    types: record<string>(file.types),
    format: Object.fromEntries(
      Object.entries(record<unknown>(file.format)).map(([ext, command]) => [ext, strings(command, [])]),
    ),
    targets: record<TargetConfig>(file.targets),
    inputs: strings(file.inputs, []),
    cache: typeof file.cache === 'string' ? file.cache : 'node_modules/.cache/wasm-facade',
    accessors: accessorsOf(file.accessors),
    imports: record<string>(file.imports),
  };
};

const accessorsOf = (value: unknown): Accessors => {
  if (value === undefined || value === 'properties' || value === 'methods') return value ?? 'properties';
  throw new Error(`wasm-facade: ${FILE}'s accessors is "properties" or "methods", not ${JSON.stringify(value)}`);
};

/** A file from the root (`src/map.ts`): a path with an extension, not a package (`@scope/pkg`) */
const isFile = (module: string): boolean => /\.[cm]?[jt]sx?$/.test(module);

/** The `import type` lines of the file `from` (from the root) for the `[imports]` types its code names (comments left
 * out), grouped by module */
export const typeImports = (config: Pick<Config, 'imports'>, from: string, code: string): string[] => {
  const named = code
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\/\*\*|\*)/.test(line))
    .join('\n');
  const modules = new Map<string, string[]>();

  for (const [name, module] of Object.entries(config.imports ?? {}))
    if (new RegExp(`(?<![\\w$.])${name.replace(/[$]/g, '\\$')}(?![\\w$])`).test(named))
      modules.set(module, [...(modules.get(module) ?? []), name]);

  return [...modules].map(([module, names]) => {
    const rel = isFile(module) ? relative(dirname(from), module) : module;
    const specifier = isFile(module) && !rel.startsWith('.') ? `./${rel}` : rel;

    return `import type { ${names.sort().join(', ')} } from '${specifier}';`;
  });
};
