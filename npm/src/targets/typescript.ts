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
  tsDoc,
  tsTypeOf,
} from '../model.ts';
import {
  type Class,
  classes,
  converters,
  eventsName,
  functions,
  type Host,
  type HostMethod,
  hosts,
  type Options,
  options,
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

/** A parameter's TypeScript type and the expression passing it on: through its converter, its union's values */
const param = (
  api: Api,
  config: Config,
  sig: { api: Declared['api'] },
  p: { name: string; type: string },
  callback?: string,
) => {
  const convert = converters(sig)[p.name];
  const name = camel(p.name);
  const union = unions(api).find((u) => u.name === p.type.replace(/^&/, ''));

  if (convert) return { name, type: `Parameters<typeof convert.${convert}>[0]`, passed: `convert.${convert}(${name})` };
  if (union) return { name, type: union.name, passed: `${unionValues(union)}[${name}]` };
  if (callback && /Function$/.test(p.type)) return { name, type: callback, passed: name };

  return { name, type: tsTypeOf(api, p.type, config.types), passed: name };
};

/** A signature's result type: its converter's, a promise of it when async */
const result = (api: Api, config: Config, sig: Signature): { type: string; wrap: (call: string) => string } => {
  const convert = typeof sig.api.result === 'string' ? sig.api.result : undefined;
  const plain = sig.returns === null ? 'void' : tsTypeOf(api, sig.returns, config.types);
  const type = convert ? `ReturnType<typeof convert.${convert}>` : plain;

  if (sig.async)
    return { type: `Promise<${type}>`, wrap: (call) => (convert ? `${call}.then(convert.${convert})` : call) };

  return { type, wrap: (call) => (convert ? `convert.${convert}(${call})` : call) };
};

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
  const params = sig.params.map((p) => param(api, config, f, p));
  const out = result(api, config, sig);

  return [
    tsDoc(f.doc),
    `export const ${camel(sig.export)} = (${params.map((p) => `${p.name}: ${p.type}`).join(', ')}): ${out.type} =>`,
    `  ${out.wrap(`wasm.${sig.export}(${params.map((p) => p.passed).join(', ')})`)};`,
    '',
  ];
};

const classCode = (api: Api, config: Config, c: Class): string[] => {
  const ctor = c.ctor;
  const ctorArgs = ctor
    ? ctor.params.map((p) => {
        const field = c.options?.fields.find((f) => f.name === camel(p.name));
        const value =
          field && c.options ? `options.${field.name} ?? ${defaultsName(c.options)}.${field.name}` : camel(p.name);
        const union = unions(api).find((u) => u.name === p.type);

        return union ? `${unionValues(union)}[${value}]` : value;
      })
    : [];
  const construct = c.options
    ? [
        `  constructor(options: ${initName(c.options)} = {}) {`,
        `    this.#inner = new wasm.${c.name}(${ctorArgs.join(', ')});`,
        '  }',
      ]
    : ['  constructor() {', `    this.#inner = new wasm.${c.name}();`, '  }'];
  const properties = c.properties.flatMap((p) => {
    const type = p.getter.returns ? tsTypeOf(api, p.getter.returns, config.types) : 'unknown';

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
    const params = m.params.map((p) =>
      param(api, config, m, p, typeof m.api.callback === 'string' ? m.api.callback : undefined),
    );
    const out = result(api, config, m);
    const call = `this.#inner.${m.export}(${params.map((p) => p.passed).join(', ')})`;

    return [
      '',
      tsDoc(m.doc, '  '),
      `  ${camel(m.export)}(${params.map((p) => `${p.name}: ${p.type}`).join(', ')}): ${out.type} {`,
      out.type === 'void' ? `    ${call};` : `    return ${out.wrap(call)};`,
      '  }',
    ];
  });
  const events = c.events.length
    ? [
        '',
        `  /** Calls \`listener\` at each event \`type\`; returns what stops it */`,
        `  on<K extends keyof ${eventsName(c)}>(type: K, listener: (payload: ${eventsName(c)}[K]) => void): () => void {`,
        '    let live = true;',
        `    const relay = (payload: ${eventsName(c)}[K]) => {`,
        '      if (live) listener(payload);',
        '    };',
        '',
        '    switch (type) {',
        ...c.events.flatMap((e) => [
          `      case '${e.name}':`,
          `        this.#inner.${e.method.export}(relay);`,
          '        break;',
        ]),
        '    }',
        '',
        '    return () => {',
        '      live = false;',
        '    };',
        '  }',
      ]
    : [];

  return [
    ...(c.events.length
      ? [
          `/** The events of ${c.name} and their payloads */`,
          `export interface ${eventsName(c)} {`,
          ...c.events.flatMap((e) => [tsDoc(e.method.doc, '  '), `  ${e.name}: ${e.payload};`]),
          '}',
          '',
        ]
      : []),
    tsDoc(c.doc),
    `export class ${c.name} {`,
    `  readonly #inner: wasm.${c.name};`,
    '',
    ...(ctor ? [tsDoc(ctor.doc, '  ')] : []),
    ...construct,
    ...properties,
    ...methods,
    ...events,
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

/** A host's base class: each method declared, the hand-written class (`class Preview extends PreviewApi`)
 * implementing them; tsc fails where it does not follow the declarations */
const hostCode = (api: Api, config: Config, h: Host): string[] => [
  tsDoc(h.doc || `The methods declared for ${h.name}: the hand-written class implements them`),
  `export abstract class ${h.name}Api {`,
  ...h.methods.flatMap((m) => [
    tsDoc(m.animation ? `${m.doc}\n\nResolved once the animation ends` : m.doc, '  '),
    `  abstract ${m.name}${hostSignature(api, config, m)};`,
  ]),
  '}',
  '',
];

/** The facade's text */
export const facade = (api: Api, config: Config, out: string): string => {
  const wasm = config.wasm ?? './pkg/index.js';
  const usesConverters = [...functions(api), ...classes(api).flatMap((c) => c.methods)].some(
    (s) => Object.keys(converters(s)).length > 0 || typeof s.api.result === 'string',
  );

  return joined([
    `// ${HEADER_OF('typescript')}`,
    '',
    ...(usesConverters && config.converters
      ? [`import * as convert from '${specifier(out, config.converters)}';`]
      : []),
    `import * as wasm from '${wasm}';`,
    '',
    ...unions(api).flatMap(unionCode),
    ...options(api).flatMap((o) => optionsCode(api, config, o)),
    ...functions(api).flatMap((f) => functionCode(api, config, f)),
    ...classes(api).flatMap((c) => classCode(api, config, c)),
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
