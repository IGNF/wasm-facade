/**
 * `wasm-facade generate --watch`: generated once, then again whenever a Rust file of the repository, the configuration,
 * a plugin (or a local module it imports) or one of the `inputs` changes. A failure is shown and the watch goes on.
 */
import { type FSWatcher, watch as watchFs } from 'node:fs';
import { join, sep } from 'node:path';
import { configOf } from './config.ts';
import { inputsOf } from './stamp.ts';

/** Folders never watched: builds, dependencies, version control */
const IGNORED = ['target', 'node_modules', '.git', 'dist'];

const ignored = (path: string): boolean => path.split(sep).some((part) => IGNORED.includes(part));

/** Whether a change of `path` (from the root) may change what is generated */
export const relevant = (path: string, inputs: string[]): boolean =>
  !ignored(path) && (path.endsWith('.rs') || path.endsWith('Cargo.toml') || inputs.includes(path));

export const watch = (root: string, generate: () => Promise<void>): FSWatcher => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void> = Promise.resolve();
  const again = () => {
    running = running.then(() => generate().catch((e: unknown) => console.error(e instanceof Error ? e.message : e)));
  };

  again();

  return watchFs(root, { recursive: true }, (_event, file) => {
    if (!file) return;

    const path = file.toString();
    let inputs: string[] = [];

    try {
      inputs = inputsOf(configOf(root));
    } catch {
      inputs = ['wasm-facade.toml'];
    }
    // The API written by the extractor is an output of a run, not a reason for another
    if (path === join(configOf(root).api) || !relevant(path, inputs)) return;
    clearTimeout(timer);
    timer = setTimeout(again, 100);
  });
};
