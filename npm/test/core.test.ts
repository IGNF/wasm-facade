/** wasm-facade's core: Rust's types in TypeScript, the generic patterns, the configuration's defaults, the regions, the
 * built-in targets on the example repository's API; and the example repository checked end to end (extractor
 * included) from its own folder */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { configOf } from '../src/config.ts';
import { cached, extractorOf, platformDir, prebuilt } from '../src/extractor.ts';
import { checkedApi, pyDoc, pyLiteral, pyTypeOf, tsTypeOf } from '../src/model.ts';
import { region } from '../src/output.ts';
import { classes, converters, functions, options, settingCalls, settings, unions } from '../src/patterns.ts';
import { BUILT_IN, targetsOf } from '../src/run.ts';
import { fresh, inputsOf, stamp } from '../src/stamp.ts';
import { VERSION } from '../src/version.ts';
import { relevant } from '../src/watch.ts';

/** How this runtime runs a TypeScript file: Bun as it is, Node by stripping its types */
const TS = process.versions.bun ? [] : ['--experimental-strip-types', '--no-warnings'];

const repo = join(import.meta.dirname, '../../examples/filters');
const api = checkedApi(JSON.parse(readFileSync(join(repo, 'wasm-facade/api.json'), 'utf8')));

describe("Rust's types in TypeScript", () => {
  test('numbers, strings, slices as typed arrays, Option, Result, the enums declared, the project’s own', () => {
    assert.equal(tsTypeOf(api, 'f64'), 'number');
    assert.equal(tsTypeOf(api, '&mut[u8]'), 'Uint8Array');
    assert.equal(tsTypeOf(api, 'Vec<f32>'), 'Float32Array');
    assert.equal(tsTypeOf(api, 'Option<String>'), 'string | undefined');
    assert.equal(tsTypeOf(api, 'Result<u64, JsValue>'), 'bigint');
    assert.equal(tsTypeOf(api, 'Edge'), 'Edge');
    assert.equal(
      tsTypeOf(api, 'Rgba', { Rgba: '[number, number, number, number]' }),
      '[number, number, number, number]',
    );
    assert.throws(
      () => tsTypeOf(api, 'HashMap<u8, u8>'),
      (e: Error) => e.message.includes("wasm-facade.toml's [types]"),
    );
  });

  test('an api.json of another schema is refused', () => {
    assert.throws(
      () => checkedApi({ schema: 2, items: [], calls: {} }),
      (e: Error) => e.message.includes('schema 2'),
    );
  });
});

describe('the generic patterns', () => {
  test('a union, options with their defaults, a function and its converter', () => {
    assert.deepEqual(
      unions(api).map((u) => u.values.map((v) => v.value)),
      [['clamp', 'wrap']],
    );
    assert.deepEqual(
      options(api)[0]?.fields.map((f) => [f.name, f.default]),
      [
        ['radius', '2'],
        ['edge', "'clamp'"],
      ],
    );
    assert.deepEqual(
      functions(api).map((f) => f.name),
      ['histogram'],
    );
    assert.deepEqual(converters(functions(api)[0] ?? { api: {} }), { image: 'pixels' });
  });

  test('a class: its constructor, property, methods, event', () => {
    const [blur] = classes(api);

    assert.equal(blur?.options?.name, 'BlurOptions');
    assert.deepEqual(
      blur?.ctor?.params.map((p) => p.name),
      ['radius', 'edge'],
    );
    assert.deepEqual(
      blur?.properties.map((p) => [p.name, p.setter !== undefined]),
      [['radius', true]],
    );
    assert.deepEqual(
      blur?.methods.map((m) => [m.export, m.async]),
      [
        ['apply', false],
        ['applyLater', true],
        ['applyWhere', false],
      ],
    );
    assert.deepEqual(
      blur?.events.map((e) => [e.name, e.payload]),
      [['progress', 'number']],
    );
  });
});

test('settings: a setter, a getter where kept, the call applying it, the settings it takes together', () => {
  const field = (name: string, keys: Record<string, string | boolean>) => ({ name, type: 'f64', doc: '', api: keys });
  const host = checkedApi({
    schema: 1,
    calls: { setRange: { doc: '', params: [] }, setTilt: { doc: '', params: [] } },
    items: [
      {
        kind: 'struct',
        name: 'ViewSettings',
        doc: '',
        api: { settings: true },
        fields: [
          field('min_zoom', { call: 'setRange', spread: 'range', store: 'range[0]', getter: true, default: '0' }),
          field('max_zoom', { call: 'setRange', spread: 'range', store: 'range[1]', getter: true }),
          field('tilt', { call: 'setTilt' }),
        ],
      },
    ],
  });
  const all = settings(host);

  assert.deepEqual(
    all.map((s) => [s.setter, s.getter, s.store, s.call, s.default]),
    [
      ['setMinZoom', 'getMinZoom', 'range[0]', 'setRange', '0'],
      ['setMaxZoom', 'getMaxZoom', 'range[1]', 'setRange', undefined],
      ['setTilt', undefined, 'tilt', 'setTilt', undefined],
    ],
  );
  assert.deepEqual(
    settingCalls(all).map((g) => [g.call, g.settings.map((s) => s.name)]),
    [
      ['setRange', ['minZoom', 'maxZoom']],
      ['setTilt', ['tilt']],
    ],
  );
  assert.throws(
    () => settings(host, { callKey: 'engine' }),
    (e: Error) => e.message.includes('names no call'),
  );
});

test('Rust in Python: hints, literals, documentation in snake_case', () => {
  assert.equal(pyTypeOf(api, 'Option<f64>'), 'float | None');
  assert.equal(pyTypeOf(api, '&mut [u8]'), 'bytes | Sequence[int]');
  assert.equal(pyTypeOf(api, 'Vec<u32>'), 'Sequence[int]');
  assert.equal(pyTypeOf(api, 'Edge'), 'Edge');
  assert.equal(pyLiteral("'clamp'"), '"clamp"');
  assert.equal(pyLiteral('true'), 'True');
  assert.equal(pyLiteral('[1, 2]'), undefined);
  assert.equal(pyDoc('Sets `minZoom`'), 'Sets `min_zoom`');
});

test("the configuration's defaults where its file says nothing", () => {
  const dir = mkdtempSync(join(tmpdir(), 'wasm-facade-'));

  writeFileSync(join(dir, 'wasm-facade.toml'), '[targets.typescript]\n');

  const config = configOf(dir);

  assert.equal(config.extractor, undefined);
  assert.equal(config.api, 'wasm-facade/api.json');
  assert.deepEqual(config.extract, { out: 'wasm-facade/api.json' });
  assert.deepEqual(Object.keys(config.targets), ['typescript']);
});

test("a plugin in TypeScript, loaded from the repository's root", async () => {
  const dir = mkdtempSync(join(tmpdir(), 'wasm-facade-'));
  const plugin = "const target: { name: string; outputs: () => [] } = { name: 'mine', outputs: () => [] };\n";

  writeFileSync(join(dir, 'wasm-facade.toml'), '[targets.mine]\nplugin = "mine.ts"\n');
  writeFileSync(join(dir, 'mine.ts'), `${plugin}export default target;\n`);

  const [loaded] = await targetsOf(configOf(dir));

  assert.equal(loaded?.target.name, 'mine');
});

test("generate's stamp: its inputs (a plugin and what it imports), its files as written", () => {
  const dir = mkdtempSync(join(tmpdir(), 'wasm-facade-'));
  const write = (path: string, text: string) => writeFileSync(join(dir, path), text);

  write('wasm-facade.toml', '[targets.mine]\nplugin = "mine.ts"\n');
  write('mine.ts', "import { names } from './names';\nexport default { name: 'mine', outputs: () => [] };\n");
  write('names.ts', 'export const names = [];\n');
  write('api.json', '{}');
  write('out.ts', 'made');

  const config = { ...configOf(dir), api: 'api.json' };

  assert.deepEqual(inputsOf(config), ['wasm-facade.toml', 'api.json', 'mine.ts', 'names.ts']);
  assert.equal(fresh(config), false);
  stamp(config, ['out.ts']);
  assert.equal(fresh(config), true);
  write('names.ts', 'export const names = [1];\n');
  assert.equal(fresh(config), false, 'a module the plugin imports changed');
  stamp(config, ['out.ts']);
  write('out.ts', 'edited');
  assert.equal(fresh(config), false, 'a file written was edited');
});

test('what the watch reacts to: Rust, the inputs; not the builds', () => {
  assert.equal(relevant('crates/a/src/lib.rs', []), true);
  assert.equal(relevant('wasm-facade.toml', ['wasm-facade.toml']), true);
  assert.equal(relevant('target/debug/build/x.rs', []), false);
  assert.equal(relevant('src/api.ts', ['wasm-facade.toml']), false);
});

test("the extractor: the configuration's if given, the package's own of its version else", () => {
  const config = configOf(repo);

  assert.deepEqual(extractorOf(config), config.extractor);
  assert.equal(platformDir('linux', 'arm64'), 'linux-arm64');

  const pkg = mkdtempSync(join(tmpdir(), 'wasm-facade-'));
  const exe = process.platform === 'win32' ? 'wasm-facade.exe' : 'wasm-facade';

  assert.equal(prebuilt(pkg), undefined);
  mkdirSync(join(pkg, 'bin', platformDir()), { recursive: true });
  writeFileSync(join(pkg, 'bin', platformDir(), exe), '');
  assert.equal(prebuilt(pkg), join(pkg, 'bin', platformDir(), exe));
  assert.ok(cached().endsWith(join('wasm-facade', VERSION)));
});

test('a plugin from a package the repository depends on', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'wasm-facade-'));
  const pkg = join(dir, 'node_modules', 'wasm-facade-plugin-mine');

  mkdirSync(pkg, { recursive: true });
  writeFileSync(join(dir, 'package.json'), '{}');
  writeFileSync(join(dir, 'wasm-facade.toml'), '[targets.mine]\nplugin = "wasm-facade-plugin-mine"\n');
  writeFileSync(
    join(pkg, 'package.json'),
    '{ "name": "wasm-facade-plugin-mine", "type": "module", "main": "index.js" }',
  );
  writeFileSync(join(pkg, 'index.js'), "export default { name: 'mine', outputs: () => [] };\n");

  const [loaded] = await targetsOf(configOf(dir));

  assert.equal(loaded?.target.name, 'mine');
  assert.ok(inputsOf(configOf(dir)).includes(join('node_modules', 'wasm-facade-plugin-mine', 'index.js')));
});

test('a region replaced between its markers, the rest kept', () => {
  assert.equal(
    region('a\n# <api:x> made\nold\n# </api:x>\nb\n', 'x', 'new', '#'),
    'a\n# <api:x> made\nnew\n# </api:x>\nb\n',
  );
  assert.throws(
    () => region('a\n', 'x', '', '//'),
    (e: Error) => e.message.includes('no region'),
  );
});

test('the built-in targets are the example repository’s files, once formatted', () => {
  const config = configOf(repo);
  const names = ['typescript', 'react', 'reference', 'python', 'python-reference', 'react-native', 'web-component'];
  const written = names.flatMap((name) =>
    (BUILT_IN[name]?.outputs({ api, config, options: config.targets[name] ?? {} }) ?? []).map((o) => o.path),
  );

  assert.deepEqual(written, [
    'src/api.ts',
    'src/hooks.ts',
    'docs/api.md',
    'python/filters/_api.py',
    'docs/python.md',
    'src/native.api.ts',
    'src/element.api.ts',
  ]);
});

test('the example repository, a repository of its own, is as its declarations make it (wasm-facade check)', {
  timeout: 600_000,
}, async () => {
  const result = spawnSync(process.execPath, [...TS, join(import.meta.dirname, '../src/cli.ts'), 'check'], {
    cwd: join(repo, 'filters'),
    encoding: 'utf8',
  });

  assert.equal(result.stderr, '');
  assert.ok(result.stdout.includes('every target as declared'));
});
