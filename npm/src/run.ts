/**
 * `generate` and `check`: the extractor run in the repository (`extractor` of apigen.toml, its `[extract]` given as
 * JSON), its API read, each enabled target loaded by name (built in, or its `plugin` module) and its outputs written,
 * then the targets' commands. `check` writes nothing and lists what is not what the declarations make.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { $ } from 'bun';
import { type Config, configOf } from './config.ts';
import { type Api, checkedApi } from './model.ts';
import { apply } from './output.ts';
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
      ? ((await import(join(config.root, plugin))) as { default?: unknown }).default
      : BUILT_IN[name];

    if (!isTarget(target))
      throw new Error(
        `apigen: the target ${name}: no ${plugin ? `default export Target in ${plugin}` : 'built-in target of that name'}`,
      );
    loaded.push({ target, context: { config, options } });
  }

  return loaded;
};

/** The API the extractor makes, written (or with `check` compared) at the configuration's path */
export const extract = async (config: Config, check: boolean): Promise<Api> => {
  await $`${config.extractor} extract ${check ? ['--check'] : []} --config ${JSON.stringify(config.extract)}`.cwd(
    config.root,
  );

  return checkedApi(JSON.parse(readFileSync(join(config.root, config.api), 'utf8')));
};

export interface Report {
  /** The files written, or with `check` those that differ */
  changed: string[];
  /** The commands that failed, and those skipped with why */
  failed: string[];
  skipped: string[];
}

export const run = async (root: string, check: boolean): Promise<Report> => {
  const config = configOf(root);
  const api = await extract(config, check);
  const targets = await targetsOf(config);
  const changed = await apply(
    config,
    targets.flatMap(({ target, context }) => target.outputs({ ...context, api })),
    check,
  );
  const failed: string[] = [];
  const skipped: string[] = [];

  for (const { target, context } of targets) {
    const command = target.command?.({ ...context, api }, check);

    if (!command) continue;
    if (command.skipped) {
      skipped.push(`${target.name}: ${command.skipped}`);
      continue;
    }

    const result = await $`${command.run}`.cwd(root).nothrow().quiet();

    if (result.exitCode !== 0) failed.push(`${target.name}: ${result.stderr.toString() || result.stdout.toString()}`);
  }

  return { changed, failed, skipped };
};
