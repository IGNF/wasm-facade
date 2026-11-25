/** wasm-facade's core: Rust's types in TypeScript, the generic patterns, the configuration's defaults, the regions, the
 * built-in targets on the example repository's API; and the example repository checked end to end (extractor
 * included) from its own folder */
import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { configOf } from '../src/config.ts';
import { checkedApi, tsTypeOf } from '../src/model.ts';
import { region } from '../src/output.ts';
import { classes, converters, functions, options, unions } from '../src/patterns.ts';
import { BUILT_IN } from '../src/run.ts';

const repo = join(import.meta.dir, '../../examples/filters');
const api = checkedApi(JSON.parse(readFileSync(join(repo, 'wasm-facade/api.json'), 'utf8')));

describe("Rust's types in TypeScript", () => {
  test('numbers, strings, slices as typed arrays, Option, Result, the enums declared, the project’s own', () => {
    expect(tsTypeOf(api, 'f64')).toBe('number');
    expect(tsTypeOf(api, '&mut[u8]')).toBe('Uint8Array');
    expect(tsTypeOf(api, 'Vec<f32>')).toBe('Float32Array');
    expect(tsTypeOf(api, 'Option<String>')).toBe('string | undefined');
    expect(tsTypeOf(api, 'Result<u64, JsValue>')).toBe('bigint');
    expect(tsTypeOf(api, 'Edge')).toBe('Edge');
    expect(tsTypeOf(api, 'Rgba', { Rgba: '[number, number, number, number]' })).toBe(
      '[number, number, number, number]',
    );
    expect(() => tsTypeOf(api, 'HashMap<u8, u8>')).toThrow("wasm-facade.toml's [types]");
  });

  test('an api.json of another schema is refused', () => {
    expect(() => checkedApi({ schema: 2, items: [], calls: {} })).toThrow('schema 2');
  });
});

describe('the generic patterns', () => {
  test('a union, options with their defaults, a function and its converter', () => {
    expect(unions(api).map((u) => u.values.map((v) => v.value))).toEqual([['clamp', 'wrap']]);
    expect(options(api)[0]?.fields.map((f) => [f.name, f.default])).toEqual([
      ['radius', '2'],
      ['edge', "'clamp'"],
    ]);
    expect(functions(api).map((f) => f.name)).toEqual(['histogram']);
    expect(converters(functions(api)[0] ?? { api: {} })).toEqual({ image: 'pixels' });
  });

  test('a class: its constructor, property, methods, event', () => {
    const [blur] = classes(api);

    expect(blur?.options?.name).toBe('BlurOptions');
    expect(blur?.ctor?.params.map((p) => p.name)).toEqual(['radius', 'edge']);
    expect(blur?.properties.map((p) => [p.name, p.setter !== undefined])).toEqual([['radius', true]]);
    expect(blur?.methods.map((m) => [m.export, m.async])).toEqual([
      ['apply', false],
      ['applyLater', true],
      ['applyWhere', false],
    ]);
    expect(blur?.events.map((e) => [e.name, e.payload])).toEqual([['progress', 'number']]);
  });
});

test("the configuration's defaults where its file says nothing", () => {
  const dir = mkdtempSync(join(tmpdir(), 'wasm-facade-'));

  writeFileSync(join(dir, 'wasm-facade.toml'), '[targets.typescript]\n');

  const config = configOf(dir);

  expect(config.extractor).toEqual(['wasm-facade']);
  expect(config.api).toBe('wasm-facade/api.json');
  expect(config.extract).toEqual({ out: 'wasm-facade/api.json' });
  expect(Object.keys(config.targets)).toEqual(['typescript']);
});

test('a region replaced between its markers, the rest kept', () => {
  expect(region('a\n# <api:x> made\nold\n# </api:x>\nb\n', 'x', 'new', '#')).toBe(
    'a\n# <api:x> made\nnew\n# </api:x>\nb\n',
  );
  expect(() => region('a\n', 'x', '', '//')).toThrow('no region');
});

test('the built-in targets are the example repository’s files, once formatted', () => {
  const config = configOf(repo);
  const written = ['typescript', 'react', 'reference'].flatMap((name) =>
    (BUILT_IN[name]?.outputs({ api, config, options: config.targets[name] ?? {} }) ?? []).map((o) => o.path),
  );

  expect(written).toEqual(['src/api.ts', 'src/hooks.ts', 'docs/api.md']);
});

test('the example repository, a repository of its own, is as its declarations make it (wasm-facade check)', async () => {
  const result = await $`bun ${join(import.meta.dir, '../src/cli.ts')} check`
    .cwd(join(repo, 'filters'))
    .nothrow()
    .quiet();

  expect(result.stderr.toString()).toBe('');
  expect(result.stdout.toString()).toContain('every target as declared');
}, 600_000);
