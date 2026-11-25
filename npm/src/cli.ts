#!/usr/bin/env node
/**
 * wasm-facade's command line, from any folder of a repository with an `wasm-facade.toml` (found from the current folder up):
 *
 *   wasm-facade generate    the API extracted, every enabled target written; nothing done when the inputs (the API,
 *                           the configuration, the plugins) and the files written are those of the last time
 *     --no-extract          the API read as it is (the committed `api.json`), the extractor not run
 *     --force               every target run, though nothing changed
 *     --watch               again whenever a Rust file, the configuration or a plugin changes
 *   wasm-facade check       the same compared, nothing written: exits 1 on any difference (a lint, a CI step)
 */
import { rootOf } from './config.ts';
import { type Report, run } from './run.ts';
import { watch } from './watch.ts';

const [command, ...flags] = process.argv.slice(2);
const FLAGS: Record<string, string[]> = { generate: ['--no-extract', '--force', '--watch'], check: [] };
const known = FLAGS[command ?? ''];
const unknown = flags.filter((f) => !known?.includes(f));

if (!known || unknown.length > 0) {
  console.error('usage: wasm-facade generate [--no-extract] [--force] [--watch] | wasm-facade check');
  process.exit(2);
}

const check = command === 'check';
const root = rootOf(process.cwd());
const options = { check, extract: !flags.includes('--no-extract'), force: flags.includes('--force') };

/** The report shown; the problems, if any */
const shown = (report: Report): string[] => {
  report.skipped.forEach((line) => {
    console.log(`skipped: ${line}`);
  });
  if (!check) {
    report.changed.forEach((path) => {
      console.log(`written: ${path}`);
    });
  }

  const stale = check ? [...report.changed, ...report.failed] : report.failed;

  if (stale.length > 0) {
    console.error(`wasm-facade: not what the declarations make (wasm-facade generate):\n  ${stale.join('\n  ')}`);
  } else if (check) {
    console.log('wasm-facade: every target as declared');
  } else {
    console.log(report.fresh ? 'wasm-facade: up to date' : 'wasm-facade: generated');
  }

  return stale;
};

if (flags.includes('--watch')) {
  watch(root, async () => {
    shown(await run(root, options));
  });
  console.log('wasm-facade: watching (ctrl-c to stop)');
} else if (shown(await run(root, options)).length > 0) {
  process.exit(1);
}
