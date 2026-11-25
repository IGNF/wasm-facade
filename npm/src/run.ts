/**
 * `generate` and `check`: the extractor run in the repository (`extractor` of wasm-facade.toml, its `[extract]` given as
 * JSON), its API read, each enabled target loaded by name (built in, or its `plugin` module) and its outputs written,
 * then the targets' commands. `check` writes nothing and lists what is not what the declarations make.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { type Config, configOf } from './config.ts';
import { extractorOf } from './extractor.ts';
import { type Api, checkedApi } from './model.ts';
import { apply } from './output.ts';
import { pluginPath } from './plugin.ts';
import { exec } from './process.ts';
import { fresh, stamp } from './stamp.ts';
import type { Context, Target } from './target.ts';
import { react } from './targets/react.ts';
import { reference } from './targets/reference.ts';
import { typescript } from './targets/typescript.ts';

export const BUILT_IN: Record<string, Target> = { typescript, react, reference };

const isTarget = (value: unknown): value is Target =>
  typeof value === 'object' && value !== null && 'name' in value && 'outputs' in value;

/** The enabled targets of the configuration, in its order: built in by name, else their plugin's default export */
export const targetsOf = async (config: Config): Promise<{ target: Target; context: Omit<Context, 'api'> }[]> => {
  const enabled = Object.entries(config.targets).filter(([, options]) => options.enabled !== false);
  const loaded = [];

  for (const [name, options] of enabled) {
    const plugin = options.plugin;
    const target = plugin
      ? ((await import(pathToFileURL(pluginPath(config.root, plugin)).href)) as { default?: unknown }).default
      : BUILT_IN[name];

    if (!isTarget(target))
      throw new Error(
        `wasm-facade: the target ${name}: no ${plugin ? `default export Target in ${plugin}` : 'built-in target of that name'}`,
      );
    loaded.push({ target, context: { config, options } });
  }

  return loaded;
};

/** The API the extractor makes, written (or with `check` compared) at the configuration's path */
export const extract = async (config: Config, check: boolean): Promise<Api> => {
  const args = ['extract', ...(check ? ['--check'] : []), '--config', JSON.stringify(config.extract)];
  const extractor = extractorOf(config);
  const ran = exec([...extractor, ...args], config.root, { inherit: true });

  if (ran.status !== 0) throw new Error(`wasm-facade: the extractor failed (${extractor.join(' ')})`);

  return readApi(config);
};

export interface Report {
  /** The files written, or with `check` those that differ */
  changed: string[];
  /** The commands that failed, and those skipped with why */
  failed: string[];
  skipped: string[];
  /** With `generate`: its inputs and its files as the last time, nothing done */
  fresh: boolean;
}

export interface RunOptions {
  /** `check`: compare, write nothing */
  check?: boolean;
  /** false: read the API at its path as it is, no extractor run (a repository committing `api.json`, its Rust not
   * built: after an install) */
  extract?: boolean;
  /** true: every target run though nothing changed */
  force?: boolean;
}

/** The API read at the configuration's path, as it is */
export const readApi = (config: Config): Api =>
  checkedApi(JSON.parse(readFileSync(join(config.root, config.api), 'utf8')));

export const run = async (root: string, opts: RunOptions | boolean = {}): Promise<Report> => {
  const {
    check = false,
    extract: extracting = true,
    force = false,
  } = typeof opts === 'boolean' ? { check: opts } : opts;
  const config = configOf(root);
  const api = extracting ? await extract(config, check) : readApi(config);

  if (!check && !force && fresh(config)) return { changed: [], failed: [], skipped: [], fresh: true };

  const targets = await targetsOf(config);
  const outputs = targets.flatMap(({ target, context }) => target.outputs({ ...context, api }));
  const changed = await apply(config, outputs, check);
  const failed: string[] = [];
  const skipped: string[] = [];

  for (const { target, context } of targets) {
    const command = target.command?.({ ...context, api }, check);

    if (!command) continue;
    if (command.skipped) {
      skipped.push(`${target.name}: ${command.skipped}`);
      continue;
    }

    const result = exec(command.run, root);

    if (result.status !== 0) failed.push(`${target.name}: ${result.stderr || result.stdout}`);
  }

  if (!check && failed.length === 0) stamp(config, [...new Set(outputs.map((o) => o.path))]);

  return { changed, failed, skipped, fresh: false };
};
