/** wasm-facade's core: Rust's types in TypeScript, the generic patterns, the configuration's defaults, the regions, the
 * built-in targets on the example repository's API; and the example repository checked end to end (extractor
 * included) from its own folder */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { configOf } from '../src/config.ts';
import { checkedApi, tsTypeOf } from '../src/model.ts';
import { region } from '../src/output.ts';
import { classes, converters, functions, options, unions } from '../src/patterns.ts';
import { BUILT_IN, targetsOf } from '../src/run.ts';

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

test("the configuration's defaults where its file says nothing", () => {
  const dir = mkdtempSync(join(tmpdir(), 'wasm-facade-'));

  writeFileSync(join(dir, 'wasm-facade.toml'), '[targets.typescript]\n');

  const config = configOf(dir);

  assert.deepEqual(config.extractor, ['wasm-facade']);
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
  const written = ['typescript', 'react', 'reference'].flatMap((name) =>
    (BUILT_IN[name]?.outputs({ api, config, options: config.targets[name] ?? {} }) ?? []).map((o) => o.path),
  );

  assert.deepEqual(written, ['src/api.ts', 'src/hooks.ts', 'docs/api.md']);
});

test('the example repository, a repository of its own, is as its declarations make it (wasm-facade check)', async () => {
  const result = spawnSync(process.execPath, [...TS, join(import.meta.dirname, '../src/cli.ts'), 'check'], {
    cwd: join(repo, 'filters'),
    encoding: 'utf8',
  });

  assert.equal(result.stderr, '');
  assert.ok(result.stdout.includes('every target as declared'));
});
