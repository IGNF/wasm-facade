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

/** The reference target's Markdown as cards: one per declaration, its kind's badge, a table of contents and counts */
const kinds: Record<string, { kind: string; letter: string; one: string; many: string }> = {
  Functions: { kind: 'function', letter: 'f', one: 'function', many: 'functions' },
  Classes: { kind: 'class', letter: 'C', one: 'class', many: 'classes' },
  Options: { kind: 'options', letter: 'O', one: 'options', many: 'options' },
  Unions: { kind: 'union', letter: 'U', one: 'union', many: 'unions' },
};

const reference = (html: string) => {
  const title = /<h1>(.*?)<\/h1>/.exec(html)?.[1] ?? 'API';
  const badge = (kind: string) =>
    `<span class="badge ${kind}" aria-hidden="true">${Object.values(kinds).find((k) => k.kind === kind)?.letter}</span>`;
  // A list item `<code>signature</code> → <code>type</code>: what it does` as its signature beside its description
  const rows = (list: string) =>
    list.replace(
      /<li>(.*?<\/code>\)?): (.*?)<\/li>/g,
      '<li><span class="sig">$1</span><span class="desc">$2</span></li>',
    );
  const toc: string[] = [];
  const counts: string[] = [];
  const sections = html
    .split(/(?=<h2>)/)
    .filter((part) => part.startsWith('<h2>'))
    .map((part) => {
      const heading = /<h2>(.*?)<\/h2>/.exec(part)?.[1] ?? '';
      const known = kinds[heading];

      if (!known) return rows(part);

      const body = part.slice(part.indexOf('</h2>') + 5);
      // Classes and options: one card per `###`; functions and unions: one card per list item
      const entries = body.includes('<h3>')
        ? body
            .split(/(?=<h3>)/)
            .filter((entry) => entry.startsWith('<h3>'))
            .map((entry) => {
              const name = /<h3><code>(.*?)<\/code><\/h3>/.exec(entry)?.[1] ?? '';

              return {
                name,
                html: rows(entry.replace(/<h3>(.*?)<\/h3>/, `<h3>${badge(known.kind)}$1</h3>`)),
              };
            })
        : [...body.matchAll(/<li>(.*?)<\/li>/g)].map(([, item = '']) => {
            const [, signature = '', rest = ''] = /^(.*?<\/code>(?: → <code>.*?<\/code>)?): (.*)$/.exec(item) ?? [];
            const name = /<code>([\w$]+)/.exec(signature)?.[1] ?? '';
            const values = [...rest.matchAll(/<code>(.*?)<\/code> \((.*?)\)/g)];
            const described = values.length
              ? `<ul>${values.map(([, value, what]) => `<li><span class="sig"><code>${value}</code></span><span class="desc">${what}</span></li>`).join('')}</ul>`
              : `<p>${rest}</p>`;

            return { name, html: `<h3>${badge(known.kind)}${signature}</h3>${described}` };
          });

      toc.push(
        `<p>${heading}</p><ul>${entries.map((e) => `<li><a href="#${e.name}">${badge(known.kind)}${e.name}</a></li>`).join('')}</ul>`,
      );
      counts.push(`<li>${badge(known.kind)}${entries.length} ${entries.length === 1 ? known.one : known.many}</li>`);

      return `<h2>${heading}</h2>${entries.map((e) => `<article class="entry" id="${e.name}">${e.html}</article>`).join('')}`;
    });

  return {
    title: `<h1>${title}</h1>`,
    counts: `<ul class="counts">${counts.join('')}</ul>`,
    toc: `<nav class="toc" aria-label="Declarations">${toc.join('')}</nav>`,
    reference: `<div class="doc-body">${sections.join('')}</div>`,
  };
};

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

// The fonts served by the site itself, not by a font service: a visitor's address goes to no third party
const fonts = {
  'bricolage-grotesque': '@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-opsz-normal.woff2',
  'jetbrains-mono': '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2',
};

mkdirSync(join(out, 'fonts'));
Object.entries(fonts).forEach(([name, file]) => {
  const from = join(root, 'node_modules', file);

  copyFileSync(from, join(out, 'fonts', `${name}.woff2`));
  copyFileSync(join(from, '../../LICENSE'), join(out, 'fonts', `${name}-OFL.txt`));
});

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

const bundle = async (entry: string, to: string) => {
  const built = await Bun.build({
    entrypoints: [join(root, entry)],
    outdir: dirname(join(out, to)),
    naming: to.split('/').at(-1),
    target: 'browser',
    format: 'esm',
    minify: true,
  });

  if (!built.success) throw new Error(`site: the bundle of ${entry}: ${built.logs.join('\n')}`);
};

await bundle('site/demo/main.ts', 'demo/main.js');
await bundle('site/home.ts', 'home.js');
copyFileSync(join(pkg, 'filters_bg.wasm'), join(out, 'demo/filters_bg.wasm'));

page(
  'site/reference/index.html',
  'reference/index.html',
  reference(await marked.parse(read('examples/filters/docs/api.md'))),
);

// GitHub Pages serves the folders as they are (no Jekyll)
writeFileSync(join(out, '.nojekyll'), '');
console.log(`site: written in ${out}`);
