/**
 * The TypeScript facade over the wasm-bindgen module (`[targets.typescript] out`, default `src/api.ts`; the module
 * `wasm` of wasm-facade.toml): unions of strings for the enums, options with their defaults, functions and classes taking
 * them, their parameters through the project's converters, events as `on(type, listener)` returning what stops it
 */
import { dirname, relative } from 'node:path';
import type { Config } from '../config.ts';
import {
  type Api,
  camel,
  type Declared,
  HEADER_OF,
  joined,
  lowerFirst,
  type Signature,
  structOf,
  tsDoc,
  tsTypeOf,
} from '../model.ts';
import {
  type ApiRecord,
  type Class,
  classes,
  converters,
  eventsName,
  eventsOf,
  functions,
  type Host,
  type HostEvents,
  type HostMethod,
  hosts,
  type Keyed,
  type Options,
  options,
  records,
  returned,
  taken,
  type Union,
  unions,
} from '../patterns.ts';
import { type Context, type Output, option, type Target } from '../target.ts';

/** An import's specifier of `path` (from the root) in the file `from` (from the root) */
const specifier = (from: string, path: string): string => {
  const rel = relative(dirname(from), path);

  return rel.startsWith('.') ? rel : `./${rel}`;
};

const unionValues = (u: Union): string => `${lowerFirst(u.name)}Values`;
const defaultsName = (o: Options): string => `default${o.name}`;
const initName = (o: Options): string => `${o.name}Init`;

/** A parameter's TypeScript type and the expression passing it on (its value `value`, its name else): through its
 * converter, its union's values */
const param = (
  api: Api,
  config: Config,
  sig: { api: Declared['api'] },
  p: { name: string; type: string },
  callback?: string,
  value?: string,
) => {
  const convert = converters(sig)[p.name];
  const name = camel(p.name);
  const given = value ?? name;
  const union = unions(api).find((u) => u.name === p.type.replace(/^&/, ''));

  if (convert)
    return { name, type: `Parameters<typeof convert.${convert}>[0]`, passed: `convert.${convert}(${given})` };
  if (union) return { name, type: union.name, passed: `${unionValues(union)}[${given}]` };
  if (callback && /Function$/.test(p.type)) return { name, type: callback, passed: given };

  return { name, type: tsTypeOf(api, p.type, config.types), passed: given };
};

/** A signature's parameters as declared and as passed on: those a record `takes` given as one object of it, in the
 * place of its first */
const paramsOf = (
  api: Api,
  config: Config,
  sig: { name: string; api: Declared['api']; params: Signature['params'] },
  callback?: string,
): { declared: string[]; passed: string[] } => {
  const groups = taken(api, sig);
  const declared: string[] = [];
  const passed: string[] = [];
  const placed = new Set<string>();

  for (const p of sig.params) {
    const group = groups.find((g) => g.fields.includes(p.name));
    const one = param(api, config, sig, p, callback, group && `${group.name}.${camel(p.name)}`);

    if (!group) declared.push(`${one.name}: ${one.type}`);
    else if (!placed.has(group.name)) {
      placed.add(group.name);
      declared.push(`${group.name}: ${group.record}`);
    }
    passed.push(one.passed);
  }

  return { declared, passed };
};

/** A signature's result type: its converter's, the record it returns checked, a promise of it when async */
const result = (api: Api, config: Config, sig: Signature): { type: string; wrap: (call: string) => string } => {
  const convert = typeof sig.api.result === 'string' ? sig.api.result : undefined;
  const record = returned(api, sig);

  if (convert && record) throw new Error(`wasm-facade: ${sig.name} has both result and returns`);

  const plain = sig.returns === null ? 'void' : tsTypeOf(api, sig.returns, config.types);
  const type = convert ? `ReturnType<typeof convert.${convert}>` : (record ?? plain);
  const through = convert ? `convert.${convert}` : record && checkedName(record);

  if (sig.async) return { type: `Promise<${type}>`, wrap: (call) => (through ? `${call}.then(${through})` : call) };

  return { type, wrap: (call) => (through ? `${through}(${call})` : call) };
};

/** The checker of a record returned by the wasm module */
const checkedName = (record: string): string => `checked${record}`;

const unionCode = (u: Union): string[] => [
  tsDoc(u.doc),
  `export type ${u.name} = ${u.values.map((v) => `'${v.value}'`).join(' | ')};`,
  '',
  `const ${unionValues(u)} = {`,
  ...u.values.map((v) => `  ${v.value}: wasm.${u.name}.${v.variant},`),
  `} as const satisfies Record<${u.name}, wasm.${u.name}>;`,
  '',
];

const optionsCode = (api: Api, config: Config, o: Options): string[] => [
  tsDoc(o.doc),
  `export interface ${o.name} {`,
  ...o.fields.flatMap((f) => [tsDoc(f.doc, '  '), `  ${f.name}: ${tsTypeOf(api, f.rust, config.types)};`]),
  '}',
  '',
  `/** ${o.name} as a constructor takes them: each one optional, its default else */`,
  `export type ${initName(o)} = { [K in keyof ${o.name}]?: ${o.name}[K] | undefined };`,
  '',
  `/** ${o.name}' defaults */`,
  `export const ${defaultsName(o)}: ${o.name} = {`,
  ...o.fields.map((f) => `  ${f.name}: ${f.default ?? 'undefined'},`),
  '};',
  '',
];

const functionCode = (api: Api, config: Config, f: Declared): string[] => {
  const sig: Signature = {
    name: f.name,
    export: f.export ?? f.name,
    doc: f.doc,
    params: f.params ?? [],
    returns: f.returns ?? null,
    async: f.async ?? false,
    flags: f.flags ?? [],
    api: f.api,
  };
  const params = paramsOf(api, config, sig);
  const out = result(api, config, sig);

  return [
    tsDoc(f.doc),
    `export const ${camel(sig.export)} = (${params.declared.join(', ')}): ${out.type} =>`,
    `  ${out.wrap(`wasm.${sig.export}(${params.passed.join(', ')})`)};`,
    '',
  ];
};

/** A TypeScript type whose values the facade keeps as they are (no copy): a primitive, a union's strings */
const primitive = (api: Api, type: string): boolean =>
  type
    .split(' | ')
    .every(
      (t) =>
        ['number', 'string', 'boolean', 'bigint', 'undefined'].includes(t) ||
        /^'[^']*'$/.test(t) ||
        unions(api).some((u) => u.name === t),
    );

/** A value kept or handed out by the facade, as it writes it: through `kept` unless a primitive */
const keptValue = (api: Api, type: string, value: string): string => (primitive(api, type) ? value : `kept(${value})`);

/** The payload of an event a class's setters emit: `{ <field>: value }` each, `{ key, name, value }` by key */
const emittedPayload = (api: Api, config: Config, c: Class, event: string): string =>
  [
    ...c.kept
      .filter((k) => k.setter && k.emits === event)
      .map((k) => `{ ${k.name}: ${tsTypeOf(api, k.rust, config.types)} }`),
    ...c.keyed
      .filter((k) => k.emits === event)
      .map(
        (k) =>
          `{ [N in keyof ${k.struct}]: { key: ${tsTypeOf(api, k.key, config.types)}; name: N; value: ${k.struct}[N] } }[keyof ${k.struct}]`,
      ),
  ].join(' | ');

/** A class's properties by key: each key's held by the facade, set (kept, the call made, emitted) and read back */
const keyedCode = (api: Api, config: Config, k: Keyed, events: string): string[] => {
  const store = `#${lowerFirst(k.struct)}`;
  const key = tsTypeOf(api, k.key, config.types);
  const held = k.defaults ? k.struct : `Partial<${k.struct}>`;
  const base = k.defaults ? `default${k.struct}` : '{}';
  const [keyName, nameName, valueName] = k.method.params.map((p) => camel(p.name));
  const keyUnion = unions(api).find((u) => u.name === k.key.replace(/^&/, ''));
  const keyPassed = keyUnion ? `${unionValues(keyUnion)}[${keyName}]` : keyName;

  return [
    '',
    tsDoc(k.method.doc, '  '),
    `  ${camel(k.method.export)}<N extends keyof ${k.struct}>(${keyName}: ${key}, ${nameName}: N, ${valueName}: ${k.struct}[N]): this {`,
    `    this.${store}.set(${keyName}, Object.freeze({ ...(this.${store}.get(${keyName}) ?? ${base}), [${nameName}]: kept(${valueName}) }) as ${held});`,
    `    this.#inner.${k.method.export}(${keyPassed}, ${nameName}, ${valueName});`,
    ...(k.emits
      ? [
          `    this.#emit('${k.emits}', { ${[
            ['key', keyName],
            ['name', nameName],
            ['value', valueName],
          ]
            .map(([field, given]) => (field === given ? field : `${field}: ${given}`))
            .join(', ')} } as ${events}['${k.emits}']);`,
        ]
      : []),
    '',
    '    return this;',
    '  }',
    '',
    `  /** The property \`${nameName}\` of \`${keyName}\`, as last set${k.defaults ? ' (its default else)' : ''} */`,
    `  ${k.getter}<N extends keyof ${k.struct}>(${keyName}: ${key}, ${nameName}: N): ${k.struct}[N]${k.defaults ? '' : ' | undefined'} {`,
    `    return kept((this.${store}.get(${keyName}) ?? ${base})[${nameName}]);`,
    '  }',
  ];
};

const classCode = (api: Api, config: Config, c: Class): string[] => {
  const ctor = c.ctor;
  const own = c.options;
  const events = eventsName(c);
  const typeOf = (rust: string) => tsTypeOf(api, rust, config.types);
  const ctorArgs = ctor
    ? ctor.params.map((p) => {
        const field = own?.fields.find((f) => f.name === camel(p.name));
        const value = field ? `this.#options.${field.name}` : camel(p.name);
        const union = unions(api).find((u) => u.name === p.type);

        return union ? `${unionValues(union)}[${value}]` : value;
      })
    : [];
  const construct = own
    ? [
        `  constructor(options: ${initName(own)} = {}) {`,
        '    this.#options = Object.freeze({',
        ...own.fields.map(
          (f) =>
            `      ${f.name}: ${keptValue(api, typeOf(f.rust), `options.${f.name} ?? ${defaultsName(own)}.${f.name}`)},`,
        ),
        '    });',
        `    this.#inner = new wasm.${c.name}(${ctorArgs.join(', ')});`,
        '  }',
      ]
    : ['  constructor() {', `    this.#inner = new wasm.${c.name}();`, '  }'];
  // The options kept: each read from the copy; its setter keeps the value, makes the call, emits
  const kept = c.kept.flatMap((k) => {
    const type = typeOf(k.rust);
    const union = unions(api).find((u) => u.name === k.rust);
    const passed = union ? `${unionValues(union)}[value]` : 'value';

    return [
      '',
      tsDoc(k.doc, '  '),
      `  get ${k.name}(): ${type} {`,
      `    return ${keptValue(api, type, `this.#options.${k.name}`)};`,
      '  }',
      ...(k.setter
        ? [
            '',
            tsDoc(k.setter.doc || k.doc, '  '),
            `  set ${k.name}(value: ${type}) {`,
            `    this.#options = Object.freeze({ ...this.#options, ${k.name}: ${keptValue(api, type, 'value')} });`,
            `    this.#inner.${k.name} = ${passed};`,
            ...(k.emits ? [`    this.#emit('${k.emits}', { ${k.name}: value });`] : []),
            '  }',
          ]
        : []),
    ];
  });
  const properties = c.properties
    .filter((p) => !c.kept.some((k) => k.name === p.name))
    .flatMap((p) => {
      const type = p.getter.returns ? typeOf(p.getter.returns) : 'unknown';

      return [
        '',
        tsDoc(p.getter.doc, '  '),
        `  get ${p.name}(): ${type} {`,
        `    return this.#inner.${p.name};`,
        '  }',
        ...(p.setter
          ? [
              '',
              tsDoc(p.setter.doc || p.getter.doc, '  '),
              `  set ${p.name}(value: ${type}) {`,
              `    this.#inner.${p.name} = value;`,
              '  }',
            ]
          : []),
      ];
    });
  const methods = c.methods.flatMap((m) => {
    const params = paramsOf(api, config, m, typeof m.api.callback === 'string' ? m.api.callback : undefined);
    const out = result(api, config, m);
    const call = `this.#inner.${m.export}(${params.passed.join(', ')})`;

    return [
      '',
      tsDoc(m.doc, '  '),
      `  ${camel(m.export)}(${params.declared.join(', ')}): ${out.type} {`,
      out.type === 'void' ? `    ${call};` : `    return ${out.wrap(call)};`,
      '  }',
    ];
  });
  const emitting = c.emitted.length > 0;
  const relayed = [
    '    switch (type) {',
    ...c.events.flatMap((e) => [
      `      case '${e.name}':`,
      `        this.#inner.${e.method.export}(relay);`,
      '        break;',
    ]),
    ...(emitting
      ? [
          '      default:',
          `        this.#listeners.set(type, (this.#listeners.get(type) ?? new Set()).add(relay as (payload: never) => void));`,
        ]
      : []),
    '    }',
  ];
  const listening = [
    '',
    `  /** Calls \`listener\` at each event \`type\`; returns what stops it */`,
    `  on<K extends keyof ${events}>(type: K, listener: (payload: ${events}[K]) => void): () => void {`,
    '    let live = true;',
    `    const relay = (payload: ${events}[K]) => {`,
    '      if (live) listener(payload);',
    '    };',
    '',
    ...(c.events.length
      ? relayed
      : [
          `    this.#listeners.set(type, (this.#listeners.get(type) ?? new Set()).add(relay as (payload: never) => void));`,
        ]),
    '',
    '    return () => {',
    '      live = false;',
    ...(emitting ? ['      this.#listeners.get(type)?.delete(relay as (payload: never) => void);'] : []),
    '    };',
    '  }',
    ...(emitting
      ? [
          '',
          '  /** Calls the listeners of an event its setters emit; one that throws is reported, the others still called */',
          `  #emit<K extends keyof ${events}>(type: K, payload: ${events}[K]): void {`,
          '    for (const listener of [...(this.#listeners.get(type) ?? [])]) {',
          '      try {',
          `        (listener as (payload: ${events}[K]) => void)(payload);`,
          '      } catch (error) {',
          '        queueMicrotask(() => {',
          '          throw error;',
          '        });',
          '      }',
          '    }',
          '  }',
        ]
      : []),
  ];
  const hasEvents = c.events.length > 0 || emitting;

  return [
    ...(hasEvents
      ? [
          `/** The events of ${c.name} and their payloads */`,
          `export interface ${events} {`,
          ...c.events.flatMap((e) => [tsDoc(e.method.doc, '  '), `  ${e.name}: ${e.payload};`]),
          ...c.emitted.flatMap((name) => [
            `  /** A property changed by its setter, once kept and applied */`,
            `  ${name}: ${emittedPayload(api, config, c, name)};`,
          ]),
          '}',
          '',
        ]
      : []),
    tsDoc(c.doc),
    `export class ${c.name} {`,
    `  readonly #inner: wasm.${c.name};`,
    ...(own ? [`  #options: Readonly<${own.name}>;`] : []),
    ...c.keyed.map(
      (k) =>
        `  readonly #${lowerFirst(k.struct)} = new Map<${typeOf(k.key)}, ${k.defaults ? k.struct : `Partial<${k.struct}>`}>();`,
    ),
    ...(emitting ? [`  readonly #listeners = new Map<keyof ${events}, Set<(payload: never) => void>>();`] : []),
    '',
    ...(ctor ? [tsDoc(ctor.doc, '  ')] : []),
    ...construct,
    ...kept,
    ...properties,
    ...c.keyed.flatMap((k) => keyedCode(api, config, k, events)),
    ...methods,
    ...(hasEvents ? listening : []),
    '',
    '  /** Frees its memory in the wasm module: it is not to be used after */',
    '  free(): void {',
    '    this.#inner.free();',
    '  }',
    '}',
    '',
  ];
};

/** A host method's parameters and result in TypeScript: an optional parameter without its `undefined` */
const hostSignature = (api: Api, config: Config, m: HostMethod): string => {
  const params = m.params.map((p) => {
    const inner = p.optional ? p.rust.replace(/^Option<(.*)>$/, '$1') : p.rust;

    return `${p.name}${p.optional ? '?' : ''}: ${p.ts ?? tsTypeOf(api, inner, config.types)}`;
  });
  const result = m.ts ?? (m.returns ? tsTypeOf(api, m.returns, config.types) : 'void');

  return `(${params.join(', ')}): ${m.async || m.animation ? `Promise<${result}>` : result}`;
};

/** A record: an interface of read-only fields (an `Option` one optional), a tuple struct a labelled tuple */
const recordCode = (api: Api, config: Config, r: ApiRecord): string[] => {
  const type = (f: ApiRecord['fields'][number]) =>
    f.ts ?? tsTypeOf(api, f.optional ? f.rust.replace(/^Option<(.*)>$/, '$1') : f.rust, config.types);

  if (r.tuple)
    return [
      tsDoc(r.doc),
      `export type ${r.name} = [${r.fields.map((f) => `${f.name}${f.optional ? '?' : ''}: ${type(f)}`).join(', ')}];`,
      '',
    ];

  return [
    tsDoc(r.doc),
    `export interface ${r.name} {`,
    ...r.fields.flatMap((f) => [tsDoc(f.doc, '  '), `  readonly ${f.name}${f.optional ? '?' : ''}: ${type(f)};`]),
    '}',
    '',
  ];
};

/** What the facade keeps and hands out: arrays and plain objects copied and frozen, typed arrays copied */
const keptCode = [
  '/** A value as the facade keeps it and hands it out: arrays and plain objects copied and frozen, typed arrays copied',
  ' * (they cannot be frozen): what a caller holds never changes what the facade keeps */',
  'const kept = <T>(value: T): T => {',
  '  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) return (value as unknown as { slice(): T }).slice();',
  '  if (Array.isArray(value)) return Object.freeze(value.map(kept)) as T;',
  "  if (value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype)",
  '    return Object.freeze(Object.fromEntries(Object.entries(value).map(([k, v]) => [k, kept(v)]))) as T;',
  '',
  '  return value;',
  '};',
  '',
];

/** What a record returned by the wasm module is checked against: a TypeError naming the field */
const mismatchCode = [
  '/** A value the wasm module returned that is not as declared: a TypeError naming where */',
  'const mismatch = (at: string, expected: string, value: unknown): never => {',
  "  const found = Array.isArray(value) ? 'an array' : typeof value;",
  '',
  // biome-ignore lint/suspicious/noTemplateCurlyInString: the generated code's template
  "  throw new TypeError(`wasm-facade: ${at} is ${value === null ? 'null' : found}, ${expected} expected`);",
  '};',
  '',
];

/** The records a record names in its fields, it included, those of its fields' fields too */
const recordsIn = (api: Api, name: string, seen = new Set<string>()): Set<string> => {
  if (seen.has(name) || !records(api).some((r) => r.name === name)) return seen;
  seen.add(name);
  for (const f of structOf(api, name).fields ?? [])
    recordsIn(api, f.type.replace(/^Option<(.*)>$/, '$1').replace(/^Box<(.*)>$/, '$1'), seen);

  return seen;
};

/** The statement checking a value `value` of a Rust type (an `Option` one when given), `at` its place's expression;
 * none for a type not checked (`ts`, the project's own, `JsValue`) */
const checkOf = (api: Api, config: Config, rust: string, value: string, at: string): string | undefined => {
  const option = /^Option<(.*)>$/.exec(rust)?.[1];
  const ty = option ?? rust;

  if (config.types[ty]) return undefined;

  const guard = (test: string, expected: string) =>
    `if (${option ? `${value} !== undefined && ` : ''}${test}) mismatch(${at}, ${JSON.stringify(expected)}, ${value});`;
  const typed = tsTypeOf(api, ty);

  if (records(api).some((r) => r.name === ty))
    return `${option ? `if (${value} !== undefined) ` : ''}${checkedName(ty)}(${value}, ${at});`;
  if (/Array$/.test(typed)) return guard(`!(${value} instanceof ${typed})`, typed);
  if (typed === 'string[]')
    return guard(`!(Array.isArray(${value}) && ${value}.every((s) => typeof s === 'string'))`, 'string[]');
  if (['number', 'bigint', 'boolean', 'string'].includes(typed)) return guard(`typeof ${value} !== '${typed}'`, typed);

  const union = unions(api).find((u) => u.name === ty);

  if (union)
    return guard(
      `!(${union.values.map((v) => `${value} === '${v.value}'`).join(' || ')})`,
      union.values.map((v) => `'${v.value}'`).join(' | '),
    );

  return undefined;
};

/** A record's checker: what the wasm module returned, checked field by field, typed as the record */
const checkerCode = (api: Api, config: Config, r: ApiRecord): string[] => {
  const struct = structOf(api, r.name).fields ?? [];
  const access = (i: number) => (r.tuple ? `v[${i}]` : `v.${r.fields[i]?.name}`);
  const place = (i: number) => `\`\${at}${r.tuple ? `[${i}]` : `.${r.fields[i]?.name}`}\``;
  const checks = r.fields
    .map((f, i) => (f.ts ? undefined : checkOf(api, config, struct[i]?.type ?? f.rust, access(i), place(i))))
    .filter((c): c is string => c !== undefined);
  const shape = r.tuple
    ? `  const v = Array.isArray(value) && value.length === ${r.fields.length} ? (value as unknown[]) : mismatch(at, 'a tuple of ${r.fields.length}', value);`
    : "  const v = value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : mismatch(at, 'an object', value);";

  return [
    `/** A ${r.name} as the wasm module returns it, checked: a TypeError naming the field that is not */`,
    `export const ${checkedName(r.name)} = (value: unknown, at = '${r.name}'): ${r.name} => {`,
    shape,
    '',
    ...checks.map((c) => `  ${c}`),
    '',
    `  return value as ${r.name};`,
    '};',
    '',
  ];
};

/** The buffers of a record of typed arrays, to transfer it (`postMessage(value, buffers)`) */
const buffersCode = (r: ApiRecord): string[] => {
  const name = lowerFirst(r.name);

  return [
    `/** The buffers of a ${r.name}, to transfer it: \`postMessage(${name}, ${name}Buffers(${name}))\` */`,
    `export const ${name}Buffers = (${name}: ${r.name}): ArrayBuffer[] => [`,
    `  ...new Set([${r.fields.map((f) => `${name}.${f.name}${f.optional ? '?' : ''}.buffer`).join(', ')}]),`,
    '].filter((buffer): buffer is ArrayBuffer => buffer instanceof ArrayBuffer);',
    '',
  ];
};

/** A host's events and their payloads (`undefined`: none) */
const eventsCode = (api: Api, config: Config, e: HostEvents): string[] => [
  tsDoc(e.doc || `The events of ${e.host} and their payloads`),
  `export interface ${e.name} {`,
  ...e.events.flatMap((ev) => [
    tsDoc(ev.doc, '  '),
    `  ${/^[a-z_$][\w$]*$/i.test(ev.name) ? ev.name : `'${ev.name}'`}: ${ev.ts ?? (ev.payload ? tsTypeOf(api, ev.payload, config.types) : 'undefined')};`,
  ]),
  '}',
  '',
];

/** A host's `on` and `emit` over its events: a listener that throws is reported, the others still called */
const listenersCode = (e: HostEvents): string[] => [
  `  readonly #listeners = new Map<keyof ${e.name}, Set<(event: never) => void>>();`,
  '',
  '  /** Listens to an event; returns the function that stops listening */',
  `  on<K extends keyof ${e.name}>(type: K, listener: (event: ${e.name}[K]) => void): () => void {`,
  '    const listeners = this.#listeners.get(type) ?? new Set();',
  '    const added = listener as (event: never) => void;',
  '',
  '    this.#listeners.set(type, listeners.add(added));',
  '',
  '    return () => {',
  '      listeners.delete(added);',
  '    };',
  '  }',
  '',
  '  /** Calls the listeners of an event; one that throws is reported, and does not stop the others */',
  `  protected emit<K extends keyof ${e.name}>(type: K, event: ${e.name}[K]): void {`,
  '    for (const listener of [...(this.#listeners.get(type) ?? [])]) {',
  '      try {',
  `        (listener as (event: ${e.name}[K]) => void)(event);`,
  '      } catch (error) {',
  '        queueMicrotask(() => {',
  '          throw error;',
  '        });',
  '      }',
  '    }',
  '  }',
  '',
];

/** A host's base class: each method declared, the hand-written class (`class Preview extends PreviewApi`)
 * implementing them; tsc fails where it does not follow the declarations. Its events' `on` and `emit` are written */
const hostCode = (api: Api, config: Config, h: Host): string[] => {
  const own = eventsOf(api, h.name);

  return [
    ...(own ? eventsCode(api, config, own) : []),
    tsDoc(h.doc || `The methods declared for ${h.name}: the hand-written class implements them`),
    `export abstract class ${h.name}Api {`,
    ...(own ? listenersCode(own) : []),
    ...h.methods.flatMap((m) => [
      tsDoc(m.animation ? `${m.doc}\n\nResolved once the animation ends` : m.doc, '  '),
      `  abstract ${m.name}${hostSignature(api, config, m)};`,
    ]),
    '}',
    '',
  ];
};

/** The facade's text */
export const facade = (api: Api, config: Config, out: string): string => {
  const wasm = config.wasm ?? './pkg/index.js';
  const signatures = [...functions(api), ...classes(api).flatMap((c) => c.methods)];
  const usesConverters = signatures.some(
    (s) => Object.keys(converters(s)).length > 0 || typeof s.api.result === 'string',
  );
  const keeps = classes(api).some(
    (c) => c.keyed.length > 0 || c.kept.some((k) => !primitive(api, tsTypeOf(api, k.rust, config.types))),
  );
  const checked = new Set(signatures.flatMap((s) => [...recordsIn(api, returned(api, s) ?? '')]));
  // The records of typed arrays taken as parameters: their buffers listed, to transfer them
  const transferred = new Set(
    signatures.flatMap((s) => taken(api, { ...s, params: s.params ?? [] }).map((t) => t.record)),
  );
  const buffered = records(api)
    .filter(
      (r) =>
        transferred.has(r.name) &&
        r.fields.every((f) =>
          /Array$/.test(f.ts ?? tsTypeOf(api, f.rust.replace(/^Option<(.*)>$/, '$1'), config.types)),
        ),
    )
    .map((r) => r.name);

  return joined([
    `// ${HEADER_OF('typescript')}`,
    '',
    ...(usesConverters && config.converters
      ? [`import * as convert from '${specifier(out, config.converters)}';`]
      : []),
    `import * as wasm from '${wasm}';`,
    '',
    ...(keeps ? keptCode : []),
    ...(checked.size ? mismatchCode : []),
    ...unions(api).flatMap(unionCode),
    ...options(api).flatMap((o) => optionsCode(api, config, o)),
    ...functions(api).flatMap((f) => functionCode(api, config, f)),
    ...classes(api).flatMap((c) => classCode(api, config, c)),
    ...records(api).flatMap((r) => [
      ...recordCode(api, config, r),
      ...(checked.has(r.name) ? checkerCode(api, config, r) : []),
      ...(buffered.includes(r.name) ? buffersCode(r) : []),
    ]),
    ...hosts(api).flatMap((h) => hostCode(api, config, h)),
  ]);
};

export const typescript: Target = {
  name: 'typescript',
  outputs: ({ api, config, options: own }: Context): Output[] => {
    const out = option(own, 'out', 'src/api.ts');

    return [{ path: out, text: facade(api, config, out) }];
  },
};

export default typescript;
