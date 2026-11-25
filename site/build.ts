/**
 * The site (GitHub Pages): the overview, the demo (the example crate built to wasm, called through its generated
 * facade) and the example's generated reference, written into `site/dist`.
 *
 *   bun site/build.ts                         the site, the example's wasm built first
 *   bun site/build.ts --repository=<url>      with a link to the repository in the menu
 *
 * Needs the `wasm32-unknown-unknown` target and the wasm-bindgen CLI of the example's locked wasm-bindgen.
 */

import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { marked } from 'marked';

const root = join(import.meta.dir, '..');
const example = join(root, 'examples/filters');
const out = join(root, 'site/dist');
const pkg = join(example, 'pkg');

const run = (command: string, args: string[], cwd = root) => {
  const done = spawnSync(command, args, { cwd, stdio: 'inherit' });

  if (done.status !== 0) throw new Error(`site: ${command} ${args.join(' ')} failed`);
};

const read = (path: string) => readFileSync(join(root, path), 'utf8');

const repository = process.argv.find((arg) => arg.startsWith('--repository='))?.slice('--repository='.length);
const menu = repository ? `<a href="${repository}">Repository</a>` : '';

// The wasm-bindgen CLI must be the version of the crate the example locks, or the module does not load
const locked = /name = "wasm-bindgen"\nversion = "([^"]+)"/.exec(read('examples/filters/Cargo.lock'))?.[1];
const installed = /wasm-bindgen ([\d.]+)/.exec(
  spawnSync('wasm-bindgen', ['--version'], { encoding: 'utf8' }).stdout ?? '',
)?.[1];

if (!locked || installed !== locked) {
  throw new Error(
    `site: wasm-bindgen ${installed ?? 'not found'}, the example locks ${locked}: cargo install wasm-bindgen-cli --version ${locked} --locked`,
  );
}

run('cargo', ['build', '--release', '--target', 'wasm32-unknown-unknown', '-p', 'filters'], example);
// The module beside its declarations (pkg/filters.d.ts, kept in git so that the facade type-checks without this build)
run('wasm-bindgen', [
  '--target',
  'web',
  '--no-typescript',
  '--out-dir',
  pkg,
  join(example, 'target/wasm32-unknown-unknown/release/filters.wasm'),
]);

rmSync(out, { recursive: true, force: true });

const page = (from: string, to: string, fill: Record<string, string> = {}) => {
  const filled = Object.entries({ repository: menu, ...fill }).reduce(
    (html, [key, value]) => html.replace(`<!--${key}-->`, () => value),
    read(from),
  );

  mkdirSync(dirname(join(out, to)), { recursive: true });
  writeFileSync(join(out, to), filled);
};

page('site/index.html', 'index.html');
copyFileSync(join(root, 'site/style.css'), join(out, 'style.css'));

// The demo: the files it shows embedded (`</` escaped: they sit in a script element)
const files = {
  rust: read('examples/filters/filters/src/lib.rs'),
  ts: read('examples/filters/src/api.ts'),
  hooks: read('examples/filters/src/hooks.ts'),
  config: read('examples/filters/wasm-facade.toml'),
};

page('site/demo/index.html', 'demo/index.html');
writeFileSync(
  join(out, 'demo/index.html'),
  readFileSync(join(out, 'demo/index.html'), 'utf8').replace(
    'id="files">{}</script>',
    () => `id="files">${JSON.stringify(files).replaceAll('</', '<\\/')}</script>`,
  ),
);

const built = await Bun.build({
  entrypoints: [join(root, 'site/demo/main.ts')],
  outdir: join(out, 'demo'),
  naming: 'main.js',
  target: 'browser',
  format: 'esm',
  minify: true,
});

if (!built.success) throw new Error(`site: the demo's bundle: ${built.logs.join('\n')}`);
copyFileSync(join(pkg, 'filters_bg.wasm'), join(out, 'demo/filters_bg.wasm'));

page('site/reference/index.html', 'reference/index.html', {
  reference: await marked.parse(read('examples/filters/docs/api.md')),
});

// GitHub Pages serves the folders as they are (no Jekyll)
writeFileSync(join(out, '.nojekyll'), '');
console.log(`site: written in ${out}`);
