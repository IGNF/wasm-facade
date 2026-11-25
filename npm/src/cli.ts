#!/usr/bin/env node
/**
 * wasm-facade's command line, from any folder of a repository with an `wasm-facade.toml` (found from the current folder up):
 *
 *   wasm-facade generate    the API extracted, every enabled target written
 *   wasm-facade check       the same compared, nothing written: exits 1 on any difference (a lint, a CI step)
 */
import { rootOf } from './config.ts';
import { run } from './run.ts';

const command = process.argv[2];

if (command !== 'generate' && command !== 'check') {
  console.error('usage: wasm-facade generate | wasm-facade check');
  process.exit(2);
}

const check = command === 'check';
const report = await run(rootOf(process.cwd()), check);

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
  process.exit(1);
}
console.log(check ? 'wasm-facade: every target as declared' : 'wasm-facade: generated');
