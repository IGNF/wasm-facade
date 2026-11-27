/** wasm-facade's core: Rust's types in TypeScript, the generic patterns, the configuration's defaults, the regions, the
 * built-in targets on the example repository's API; and the example repository checked end to end (extractor
 * included) from its own folder */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import type { Config } from '../src/config.ts';
import { configOf } from '../src/config.ts';
import { cached, extractorOf, platformDir, prebuilt } from '../src/extractor.ts';
import { checkedApi, kebab, pyDoc, pyLiteral, pyTypeOf, tsTypeOf } from '../src/model.ts';
import { region } from '../src/output.ts';
import {
  classes,
  converters,
  events,
  functions,
  hosts,
  options,
  records,
  returned,
  settingCalls,
  settings,
  taken,
  unions,
} from '../src/patterns.ts';
import { BUILT_IN, targetsOf } from '../src/run.ts';
import { fresh, inputsOf, stamp } from '../src/stamp.ts';
import { facade } from '../src/targets/typescript.ts';
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
      [
        ['red', 'green', 'blue', 'alpha'],
        ['clamp', 'wrap'],
      ],
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
      ['histogram', 'interleave', 'stats'],
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
      [
        ['radius', true],
        ['edge', true],
      ],
    );
    assert.deepEqual(
      blur?.kept.map((k) => [k.name, k.emits]),
      [
        ['radius', 'change'],
        ['edge', 'change'],
      ],
    );
    assert.deepEqual(blur?.emitted, ['change']);
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

test('a host: the methods of a hand-written class, its trailing Options optional, its animations', () => {
  const [preview] = hosts(api);

  assert.equal(preview?.name, 'Preview');
  assert.equal(preview?.trait, 'PreviewHost');
  assert.deepEqual(
    preview?.methods.map((m) => [m.name, m.async, m.animation, m.params.map((p) => [p.name, p.optional, p.ts])]),
    [
      [
        'show',
        true,
        false,
        [
          ['image', false, 'ImageData'],
          ['options', true, undefined],
        ],
      ],
      [
        'fadeTo',
        false,
        true,
        [
          ['radius', false, undefined],
          ['duration', true, undefined],
        ],
      ],
      ['pixels', false, false, []],
      ['snapshot', false, false, []],
      ['clear', false, false, []],
    ],
  );
});

test('records: read-only fields, an Option optional; a tuple struct labelled', () => {
  assert.deepEqual(
    records(api).map((r) => [r.name, r.tuple, r.fields.map((f) => [f.name, f.optional])]),
    [
      ['Planes', false, ['red', 'green', 'blue', 'alpha'].map((name) => [name, false])],
      [
        'Size',
        true,
        [
          ['width', false],
          ['height', false],
        ],
      ],
      [
        'Snapshot',
        false,
        [
          ['size', false],
          ['radius', false],
          ['shownAt', true],
        ],
      ],
      [
        'Stats',
        false,
        [
          ['pixels', false],
          ['mean', false],
          ['range', true],
        ],
      ],
    ],
  );
  assert.equal(tsTypeOf(api, 'Snapshot'), 'Snapshot');
  assert.equal(pyTypeOf(api, 'Size'), 'Size');
});

test("events: a host's, each named by its variant in lowercase (or its name), its payload its one field", () => {
  const [preview] = events(api);

  assert.equal(preview?.host, 'Preview');
  assert.equal(preview?.name, 'PreviewEvents');
  assert.deepEqual(
    preview?.events.map((e) => [e.name, e.payload]),
    [
      ['shown', 'Snapshot'],
      ['radiuschange', 'f64'],
      ['cleared', undefined],
    ],
  );
  assert.equal(kebab('Preview'), 'preview');
  assert.equal(kebab('min_zoom'), 'min-zoom');
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

/** A class whose facade keeps its options (a plain object, a typed array among them), emits from a field's setter,
 * holds properties by key, takes a record of buffers and returns a record checked: its API and a wasm module faked */
const field = (name: string, type: string, keys: Record<string, string | boolean> = {}) => ({
  name,
  type,
  doc: '',
  api: keys,
});
const method = (
  name: string,
  params: [string, string][],
  keys = {},
  flags: string[] = [],
  returns: string | null = null,
) => ({
  name,
  export: camelOf(name),
  doc: '',
  params: params.map(([n, type]) => ({ name: n, type })),
  returns,
  async: false,
  flags,
  api: keys,
});
const camelOf = (name: string) => name.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
const drawn = checkedApi({
  schema: 1,
  calls: {},
  items: [
    {
      kind: 'struct',
      name: 'LineStyle',
      doc: '',
      api: { options: true },
      fields: [
        field('color', 'String', { default: "'#000'", emits: 'restyle' }),
        field('anchor', 'Anchor', { default: '{ x: 0, y: 0 }' }),
        field('dashes', 'Vec<f64>', { default: 'new Float64Array([4, 2])' }),
      ],
    },
    {
      kind: 'struct',
      name: 'Label',
      doc: '',
      api: { record: true, emits: 'label' },
      fields: [field('text', 'String'), field('size', 'Option<f64>')],
    },
    {
      kind: 'struct',
      name: 'Path',
      doc: '',
      api: { record: true },
      fields: [field('xs', 'Vec<f32>'), field('ys', 'Vec<f32>')],
    },
    {
      kind: 'struct',
      name: 'Bounds',
      doc: '',
      api: { record: true },
      fields: [field('width', 'f64'), field('height', 'Option<f64>')],
    },
    {
      kind: 'class',
      name: 'Line',
      doc: '',
      api: { class: true, options: 'LineStyle' },
      methods: [
        method(
          'new',
          [
            ['color', 'String'],
            ['anchor', 'Anchor'],
            ['dashes', 'Vec<f64>'],
          ],
          {},
          ['constructor'],
        ),
        method('set_color', [['color', 'String']], {}, ['setter']),
        method('set_anchor', [['anchor', 'Anchor']], {}, ['setter']),
        method('set_dashes', [['dashes', 'Vec<f64>']], {}, ['setter']),
        method(
          'set_label_property',
          [
            ['id', 'u32'],
            ['name', '&str'],
            ['value', 'JsValue'],
          ],
          { keyed: 'Label' },
        ),
        method(
          'draw',
          [
            ['xs', '&[f32]'],
            ['width', 'u32'],
            ['ys', '&[f32]'],
          ],
          { takes: 'Path' },
        ),
        method('bounds', [], { returns: 'Bounds' }, [], 'JsValue'),
      ],
    },
  ],
});
const FAKE_WASM = `export const made = [];
export class Line {
  constructor(...args) { this.log = [['new', ...args]]; made.push(this); }
  set color(v) { this.log.push(['color', v]); }
  set anchor(v) { this.log.push(['anchor', v]); }
  set dashes(v) { this.log.push(['dashes', v]); }
  setLabelProperty(...args) { this.log.push(['label', ...args]); }
  draw(...args) { this.log.push(['draw', ...args]); }
  bounds() { return this.returning; }
  free() {}
}
`;

test('a class: its options kept and read from the copy, a field emitting, properties by key, a record taken, one returned', () => {
  const [line] = classes(drawn);
  const [draw, bounds] = line?.methods ?? [];

  assert.deepEqual(
    line?.kept.map((k) => [k.name, k.setter !== undefined, k.emits]),
    [
      ['color', true, 'restyle'],
      ['anchor', true, undefined],
      ['dashes', true, undefined],
    ],
  );
  assert.deepEqual(
    line?.keyed.map((k) => [k.struct, k.defaults, camelOf(k.method.name), k.getter, k.key, k.emits]),
    [['Label', false, 'setLabelProperty', 'getLabelProperty', 'u32', 'label']],
  );
  assert.deepEqual(line?.emitted, ['restyle', 'label']);
  assert.deepEqual(
    line?.methods.map((m) => m.name),
    ['draw', 'bounds'],
  );
  assert.deepEqual(draw && taken(drawn, draw), [{ record: 'Path', name: 'path', fields: ['xs', 'ys'] }]);
  assert.equal(bounds && returned(drawn, bounds), 'Bounds');
});

test("a class's facade run over a wasm module: copies kept and frozen, setters emitting, keys held, records taken and checked", async () => {
  const dir = mkdtempSync(join(tmpdir(), 'wasm-facade-'));
  const config = { wasm: './wasm.js', types: { Anchor: '{ x: number; y: number }' } } as unknown as Config;

  writeFileSync(join(dir, 'wasm.js'), FAKE_WASM);
  writeFileSync(join(dir, 'api.ts'), facade(drawn, config, 'api.ts'));

  const wasm = (await import(join(dir, 'wasm.js'))) as { made: { log: unknown[][]; returning: unknown }[] };
  const { Line, pathBuffers } = await import(join(dir, 'api.ts'));
  const anchor = { x: 1, y: 2 };
  const line = new Line({ anchor });
  const inner = wasm.made[0];

  // Kept: the defaults and the options given, copied; read from the copy, frozen; a typed array handed out a copy
  anchor.x = 9;
  assert.deepEqual(line.anchor, { x: 1, y: 2 });
  assert.ok(Object.isFrozen(line.anchor));
  assert.equal(line.color, '#000');
  line.dashes[0] = 99;
  assert.deepEqual([...line.dashes], [4, 2]);

  // A setter keeps the value, makes the call, then emits; a field without `emits` emits nothing
  const events: unknown[] = [];
  const stop = line.on('restyle', (e: unknown) => events.push(['restyle', e]));

  line.on('label', (e: unknown) => events.push(['label', e]));
  line.color = 'red';
  line.anchor = { x: 3, y: 4 };
  stop();
  line.color = 'blue';
  assert.equal(line.color, 'blue');
  assert.deepEqual(inner?.log.slice(1, 4), [
    ['color', 'red'],
    ['anchor', { x: 3, y: 4 }],
    ['color', 'blue'],
  ]);

  // By key: held per key (none: undefined, a record giving no defaults), the call made, the event emitted
  assert.equal(line.getLabelProperty(7, 'text'), undefined);
  assert.equal(line.setLabelProperty(7, 'text', 'A').setLabelProperty(7, 'size', 12), line);
  assert.equal(line.getLabelProperty(7, 'text'), 'A');
  assert.equal(line.getLabelProperty(8, 'text'), undefined);
  assert.deepEqual(events, [
    ['restyle', { color: 'red' }],
    ['label', { key: 7, name: 'text', value: 'A' }],
    ['label', { key: 7, name: 'size', value: 12 }],
  ]);

  // A record taken as one object, its fields passed in the parameters' places; its buffers listed once each
  const buffer = new Float32Array(4);
  const path = { xs: buffer.subarray(0, 2), ys: buffer.subarray(2) };

  line.draw(path, 3);
  assert.deepEqual(inner?.log.at(-1), ['draw', path.xs, 3, path.ys]);
  assert.deepEqual(pathBuffers(path), [buffer.buffer]);

  // A record returned, checked: as declared it is returned; else a TypeError naming the field
  if (inner) inner.returning = { width: 2 };
  assert.deepEqual(line.bounds(), { width: 2 });
  if (inner) inner.returning = { width: 2, height: 'tall' };
  assert.throws(() => line.bounds(), /Bounds\.height is string, number expected/);
});

test('takes, keyed and returns name what is declared, in the shape they need', () => {
  const broken = (keys: Record<string, string>, params: [string, string][] = [['id', 'u32']]) =>
    checkedApi({
      ...drawn,
      items: [
        ...drawn.items.slice(0, 4),
        { kind: 'class', name: 'Bad', doc: '', api: { class: true }, methods: [method('bad', params, keys)] },
      ],
    });

  assert.throws(() => classes(broken({ keyed: 'Label' })), /its parameters are \(key, name, value\)/);
  assert.throws(() => classes(broken({ keyed: 'Nothing' })), /no struct declared options or record/);
  assert.throws(() => taken(broken({}), method('bad', [['xs', '&[f32]']], { takes: 'Path' })), /no parameter ys/);
  assert.throws(() => returned(drawn, method('bad', [], { returns: 'LineStyle' })), /no struct declared record/);
});

test('accessors as methods: getColor and setColor over the copy kept, the same calls and events, every target named so', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'wasm-facade-'));
  const config = {
    wasm: './wasm.js',
    types: { Anchor: '{ x: number; y: number }' },
    accessors: 'methods',
    imports: {},
  } as unknown as Config;
  const text = facade(drawn, config, 'api.ts');

  assert.ok(text.includes('  getColor(): string {'));
  assert.ok(text.includes('  setColor(value: string): void {'));
  assert.ok(!text.includes('get color()'));
  writeFileSync(join(dir, 'wasm.js'), FAKE_WASM);
  writeFileSync(join(dir, 'api.ts'), text);

  const wasm = (await import(join(dir, 'wasm.js'))) as { made: { log: unknown[][] }[] };
  const { Line } = await import(join(dir, 'api.ts'));
  const line = new Line({ color: 'red' });
  const events: unknown[] = [];

  line.on('restyle', (e: unknown) => events.push(e));
  assert.equal(line.getColor(), 'red');
  line.setColor('blue');
  assert.equal(line.getColor(), 'blue');
  assert.ok(Object.isFrozen(line.getAnchor()));
  assert.deepEqual(wasm.made.at(-1)?.log.at(-1), ['color', 'blue']);
  assert.deepEqual(events, [{ color: 'blue' }]);
  assert.equal(line.color, undefined);

  // The other targets name them so: React Native among the methods, the reference by their pair, Python by its calls
  const out = (name: string) =>
    BUILT_IN[name]?.outputs({ api: drawn, config, options: { types: { Anchor: 'Any' } } })[0]?.text ?? '';

  assert.ok(
    out('react-native').includes(
      "LINE_METHODS = ['getColor', 'setColor', 'getAnchor', 'setAnchor', 'getDashes', 'setDashes', 'setLabelProperty'",
    ),
  );
  assert.ok(out('react-native').includes('LINE_PROPERTIES = [] as const'));
  assert.ok(out('reference').includes('- `getColor()`, `setColor(value)`: '));
  assert.ok(out('python').includes('    def color(self) -> str:'));
  assert.ok(out('python').includes('        return self._call("getColor")'));
  assert.ok(out('python').includes('        self._call("setColor", value)'));

  // A method already named as an accessor would be: refused, not written twice
  const clashing = checkedApi({
    ...drawn,
    items: drawn.items.map((item) =>
      item.name === 'Line' ? { ...item, methods: [...(item.methods ?? []), method('get_color', [])] } : item,
    ),
  });

  assert.throws(() => facade(clashing, config, 'api.ts'), /getColor both an accessor/);
  assert.doesNotThrow(() => facade(clashing, { ...config, accessors: 'properties' }, 'api.ts'));
});

/** A class taking its dependencies: `deps = "map: GeoMap, engine: Engine"`, the wasm constructor given `engine` */
const layered = checkedApi({
  ...drawn,
  items: [
    ...drawn.items,
    {
      kind: 'class',
      name: 'Layer',
      doc: '',
      api: { class: true, options: 'LineStyle', deps: 'map: GeoMap, engine: Engine' },
      deps: [
        { name: 'map', type: 'GeoMap' },
        { name: 'engine', type: 'Engine' },
      ],
      methods: [
        method(
          'new',
          [
            ['engine', '&Engine'],
            ['color', 'String'],
          ],
          {},
          ['constructor'],
        ),
        method('set_color', [['color', 'String']], {}, ['setter']),
      ],
    },
    {
      kind: 'class',
      name: 'Probe',
      doc: '',
      api: { class: true, deps: 'map: GeoMap' },
      deps: [{ name: 'map', type: 'GeoMap' }],
      methods: [],
    },
  ],
});
const LAYER_WASM = `${FAKE_WASM}
export class Layer extends Line {}
export class Probe { constructor(...args) { this.args = args; } free() {} }
`;

test('dependencies taken by the constructor: first, typed, required, kept protected for the subclasses', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'wasm-facade-'));
  const config = {
    wasm: './wasm.js',
    types: { Anchor: '{ x: number; y: number }' },
    imports: { GeoMap: 'src/map.ts', Engine: '@isard/engine', Unused: 'src/unused.ts' },
  } as unknown as Config;
  const text = facade(layered, config, 'src/api.ts');

  assert.ok(text.includes("import type { GeoMap } from './map.ts';"));
  assert.ok(text.includes("import type { Engine } from '@isard/engine';"));
  assert.ok(!text.includes('Unused'));
  assert.ok(text.includes('  protected readonly map: GeoMap;'));
  assert.ok(text.includes('  constructor(map: GeoMap, engine: Engine, options: LineStyleInit = {}) {'));
  assert.ok(text.includes('    this.#inner = new wasm.Layer(this.engine, this.#options.color);'));
  assert.ok(text.includes('  constructor(map: GeoMap) {'));

  // Run: the types given as the project's (here declared beside the facade), a subclass reading its dependency
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'src/wasm.js'), LAYER_WASM);
  writeFileSync(
    join(dir, 'src/api.ts'),
    `${facade(layered, { ...config, imports: {} } as Config, 'src/api.ts')}
export interface GeoMap { name: string }
export interface Engine { id: number }
export class Labels extends Layer {
  mapName(): string { return this.map.name; }
}
`,
  );

  const wasm = (await import(join(dir, 'src/wasm.js'))) as { made: { log: unknown[][] }[] };
  const { Labels, Probe } = await import(join(dir, 'src/api.ts'));
  const engine = { id: 1 };
  const labels = new Labels({ name: 'plan' }, engine, { color: 'red' });

  assert.equal(labels.mapName(), 'plan');
  assert.deepEqual(wasm.made.at(-1)?.log[0], ['new', engine, 'red']);
  assert.deepEqual(new Probe({ name: 'plan' }).map, { name: 'plan' });

  // React takes them first, and makes the instance again when one changes; the references list them
  const out = (name: string) =>
    BUILT_IN[name]?.outputs({ api: layered, config, options: { types: { Anchor: 'Any' } } })[0]?.text ?? '';

  assert.ok(out('react').includes("import type { GeoMap } from './map.ts';"));
  assert.ok(
    out('react').includes(
      'export const useLayer = (map: GeoMap, engine: Engine, options: LineStyleInit = {}): Layer => {',
    ),
  );
  assert.ok(
    out('react').includes('new Layer(map, engine, { color, anchor, dashes }), [map, engine, color, anchor, dashes]'),
  );
  assert.ok(out('react').includes('useMemo(() => new Probe(map), [map])'));
  assert.ok(out('reference').includes('`new Layer(map, engine, options)`, its dependencies first'));
  assert.ok(out('reference').includes('- `engine`: `Engine`'));
  assert.ok(out('python-reference').includes('`map` (`GeoMap`), `engine` (`Engine`)'));

  // A dependency named as a member is refused
  const clashing = checkedApi({
    ...layered,
    items: layered.items.map((item) =>
      item.name === 'Probe'
        ? { ...item, deps: [{ name: 'free_all', type: 'X' }], methods: [method('free_all', [])] }
        : item,
    ),
  });

  assert.throws(() => classes(clashing), /Probe's deps: freeAll already a member's name/);

  // A constructor's parameter neither an option nor a dependency is refused, named
  const unknown = checkedApi({
    ...layered,
    items: layered.items.map((item) =>
      item.name === 'Probe'
        ? {
            ...item,
            methods: [
              method(
                'new',
                [
                  ['map', 'GeoMap'],
                  ['tile_size', 'u32'],
                ],
                {},
                ['constructor'],
              ),
            ],
          }
        : item,
    ),
  });

  assert.throws(
    () => classes(unknown),
    /Probe's constructor takes tileSize: neither an option \(the class has no options = "…"\) nor a dependency/,
  );
  assert.throws(() => facade(unknown, config, 'src/api.ts'), /Probe's constructor takes tileSize/);
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
  assert.equal(config.accessors, 'properties');
  assert.deepEqual(config.imports, {});
  writeFileSync(join(dir, 'wasm-facade.toml'), 'accessors = "fields"\n');
  assert.throws(() => configOf(dir), /accessors is "properties" or "methods"/);
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
