/**
 * The plugin API: a target writes one binding from the API. Built in: `typescript` (the facade), `react` (hooks),
 * `reference` (markdown). A project's own are modules whose default export is a `Target`, named in `wasm-facade.toml`
 * (`[targets.<name>] plugin = "…"`). A target reads the API through patterns (pure functions of the API, importable
 * by any target: `patterns.ts`); no target imports another.
 */
import type { Config, TargetConfig } from './config.ts';
import type { Api } from './model.ts';

/** What a target writes, formatted by the configuration's formatter for its extension: a whole file (the default, that
 * a repository may leave out of git; hand-written code extends it: a base class, an interface, spread constants), or
 * with `region` the lines of a hand-written file between its markers (`// <api:name>` … `// </api:name>`, `#` in
 * Python) */
export interface Output {
  path: string;
  region?: string;
  text: string;
}

export interface Context {
  api: Api;
  /** The whole configuration, and this target's table */
  config: Config;
  options: TargetConfig;
}

export interface Target {
  name: string;
  outputs(context: Context): Output[];
  /** A command run once every output is written (a file made from them by its own script), `--check` given to it in a
   * check; `skipped` says why it cannot run */
  command?(context: Context, check: boolean): { run: string[]; skipped?: string } | undefined;
}

/** A target's option as a string, its default else */
export const option = (options: TargetConfig, key: string, fallback: string): string => {
  const value = options[key];

  return typeof value === 'string' ? value : fallback;
};
