#!/usr/bin/env bun
/**
 * apigen's command line, from any folder of a repository with an `apigen.toml` (found from the current folder up):
 *
 *   apigen generate    the API extracted, every enabled target written
 *   apigen check       the same compared, nothing written: exits 1 on any difference (a lint, a CI step)
 */
import { rootOf } from './config.ts';
import { run } from './run.ts';

const command = process.argv[2];

if (command !== 'generate' && command !== 'check') {
  console.error('usage: apigen generate | apigen check');
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
  console.error(`apigen: not what the declarations make (apigen generate):\n  ${stale.join('\n  ')}`);
  process.exit(1);
}
console.log(check ? 'apigen: every target as declared' : 'apigen: generated');
