/**
 * The Python API (`[targets.python] out`, default `python/_api.py`; `types`, the project's Rust types as Python hints):
 * the same declarations as the TypeScript facade, in Python's terms, over a transport the project's hand-written code
 * gives. A whole file:
 *
 * - each union a `Literal` alias;
 * - each options struct a `TypedDict` (`BlurOptions`), its defaults (`BLUR_OPTIONS_DEFAULTS`) and a function taking
 *   them as typed keywords (`blur_options(radius=…)`): an option left out when not given, `None` given passed on;
 * - the functions, each class and each settings struct a mixin (`FunctionsApi`, `BlurApi`, `ViewSettingsApi`): its
 *   methods in snake_case with typed arguments and docstrings, each one handing its call to the class inheriting it
 *   (`_call(name, *args)`, `_get(name)`, `_set(name, value)`, `_on(event, listener)`, described by `Transport`), by
 *   the facade's names (`applyLater`, `setMinZoom`).
 *
 * What carries the call is the project's: a widget calling the TypeScript facade in a browser, a React Native bridge,
 * or native code. The generated API does not change with it.
 */
import {
  type Api,
  camel,
  HEADER_OF,
  pyDoc,
  pyLiteral,
  pyTypeOf,
  type Signature,
  snake,
  upperFirst,
  wrap,
} from '../model.ts';
import {
  type Class,
  classes,
  converters,
  functions,
  type Host,
  type HostMethod,
  hosts,
  type Options,
  options,
  type Setting,
  settings,
  unions,
} from '../patterns.ts';
import { type Context, type Output, option, type Target } from '../target.ts';

type Types = Record<string, string>;

const typesOf = (own: Context['options']): Types => {
  const value = own.types;

  return typeof value === 'object' && value !== null ? (value as Types) : {};
};

/** A docstring at `indent`: its summary wrapped, then a line per argument */
const docstring = (indent: string, summary: string, args: { name: string; doc: string }[] = []): string[] => {
  const text = pyDoc(summary) || 'Made from the Rust declarations';
  const lines = wrap(`"""${text}`, 116 - indent.length, indent).map((line, i) => (i === 0 ? `${indent}${line}` : line));
  const documented = args.filter((a) => a.doc);

  if (documented.length === 0) return [`${lines.join('\n')}"""`];

  return [
    ...lines,
    '',
    ...documented.flatMap((a) =>
      wrap(`${a.name}: ${pyDoc(a.doc)}`, 112 - indent.length, `${indent}    `).map((l, i) =>
        i === 0 ? `${indent}${l}` : l,
      ),
    ),
    `${indent}"""`,
  ];
};

/** A parameter's hint: its converter's input is the project's (`Any`), a callback a `Callable` */
const paramType = (api: Api, types: Types, sig: { api: Signature['api'] }, p: Signature['params'][number]): string =>
  converters(sig)[p.name] ? 'Any' : pyTypeOf(api, p.type, types);

const returnType = (api: Api, types: Types, sig: Signature): string =>
  sig.returns ? pyTypeOf(api, sig.returns, types) : 'None';

/** A method handing its call on by the facade's name */
const method = (api: Api, types: Types, sig: Signature, name = snake(camel(sig.export))): string[] => {
  const params = sig.params.map((p) => `${p.name}: ${paramType(api, types, sig, p)}`);
  const args = sig.params.map((p) => p.name);
  const returns = returnType(api, types, sig);

  return [
    `    def ${name}(${['self', ...params].join(', ')}) -> ${sig.async ? `Awaitable[${returns}]` : returns}:`,
    ...docstring('        ', sig.doc),
    `        return self._call(${[`"${camel(sig.export)}"`, ...args].join(', ')})`,
  ];
};

const unionsPart = (api: Api): string[] =>
  unions(api).flatMap((u) => [
    `${u.name} = Literal[${u.values.map((v) => JSON.stringify(v.value)).join(', ')}]`,
    ...(u.doc ? docstring('', `${u.doc}: ${u.values.map((v) => `"${v.value}" (${v.doc})`).join(', ')}`) : []),
    '',
    '',
  ]);

const defaultsName = (o: Options): string => `${snake(o.name).replace(/^_/, '').toUpperCase()}_DEFAULTS`;

const optionsPart = (api: Api, types: Types, o: Options): string[] => {
  const fields = o.fields.map((f) => ({ ...f, py: snake(f.name), hint: pyTypeOf(api, f.rust, types) }));
  const defaults = fields.flatMap((f) => {
    const value = f.default === undefined ? undefined : pyLiteral(f.default);

    return value === undefined ? [] : [`    "${f.name}": ${value},`];
  });

  return [
    `class ${o.name}(TypedDict, total=False):`,
    ...docstring(
      '    ',
      o.doc,
      fields.map((f) => ({ name: f.name, doc: f.doc })),
    ),
    '',
    ...fields.map((f) => `    ${f.name}: ${f.hint}`),
    '',
    '',
    `${defaultsName(o)}: ${o.name} = {`,
    ...defaults,
    '}',
    `"""\`${o.name}\`'s defaults, those the Rust declares"""`,
    '',
    '',
    `def ${snake(o.name).replace(/^_/, '')}(`,
    '    *,',
    ...fields.map((f) => `    ${f.py}: ${f.hint} | None = UNSET,`),
    `) -> ${o.name}:`,
    ...docstring(
      '    ',
      `${o.doc}: the options given (an option not given is left out, None given is passed on)`,
      fields.map((f) => ({ name: f.py, doc: f.doc })),
    ),
    `    given = {${fields.map((f) => `"${f.name}": ${f.py}`).join(', ')}}`,
    `    return cast(${o.name}, {key: value for key, value in given.items() if value is not UNSET})`,
    '',
    '',
  ];
};

const classPart = (api: Api, types: Types, c: Class): string[] => {
  const members = [
    ...c.properties.flatMap((p) => [
      '    @property',
      `    def ${snake(p.name)}(self) -> ${returnType(api, types, p.getter)}:`,
      ...docstring('        ', p.getter.doc),
      `        return self._get("${p.name}")`,
      ...(p.setter
        ? [
            '',
            `    @${snake(p.name)}.setter`,
            `    def ${snake(p.name)}(self, value: ${paramType(api, types, p.setter, p.setter.params[0] ?? { name: 'value', type: 'JsValue' })}) -> None:`,
            `        self._set("${p.name}", value)`,
          ]
        : []),
      '',
    ]),
    ...c.methods.flatMap((m) => [...method(api, types, m), '']),
    ...(c.events.length
      ? [
          `    def on(self, event: Literal[${c.events.map((e) => `"${e.name}"`).join(', ')}], listener: Callable[[Any], None]) -> Callable[[], None]:`,
          ...docstring(
            '        ',
            `Listens to an event (${c.events.map((e) => `"${e.name}": ${e.method.doc}`).join('; ')}), returns what stops it`,
          ),
          '        return self._on(event, listener)',
          '',
        ]
      : []),
  ];

  return [
    `class ${c.name}Api(Transport):`,
    ...docstring('    ', `${c.doc}: the methods of \`${c.name}\`, over what the class inheriting them gives`),
    '',
    ...(members.length ? members : ['    pass', '']),
    '',
  ];
};

const settingsPart = (api: Api, types: Types, struct: string, all: Setting[]): string[] => [
  `class ${struct}Api(Transport):`,
  ...docstring('    ', `The settings of \`${struct}\`: a setter each, a getter where they are kept`),
  '',
  ...all.flatMap((s) => [
    `    def ${snake(s.setter)}(self, ${snake(s.name)}: ${pyTypeOf(api, s.field.type, types)}) -> None:`,
    ...docstring('        ', s.field.doc),
    `        self._call("${s.setter}", ${snake(s.name)})`,
    '',
    ...(s.getter
      ? [
          `    def ${snake(s.getter)}(self) -> ${pyTypeOf(api, s.field.type, types)}:`,
          ...docstring('        ', s.field.doc),
          `        return self._call("${s.getter}")`,
          '',
        ]
      : []),
  ]),
  '',
];

/** A host method's hint and its result's: an optional parameter `= None` */
const hostMethod = (api: Api, types: Types, m: HostMethod): string[] => {
  const params = m.params.map((p) => {
    const inner = p.optional ? p.rust.replace(/^Option<(.*)>$/, '$1') : p.rust;
    const hint = p.py ?? pyTypeOf(api, inner, types);

    return p.optional ? `${snake(p.name)}: ${hint} | None = None` : `${snake(p.name)}: ${hint}`;
  });
  const result = m.py ?? (m.returns ? pyTypeOf(api, m.returns, types) : 'None');

  return [
    `    def ${snake(m.name)}(${['self', ...params].join(', ')}) -> ${m.async || m.animation ? `Awaitable[${result}]` : result}:`,
    ...docstring('        ', m.animation ? `${m.doc} (awaited: once the animation ends)` : m.doc),
    `        return self._call(${[`"${m.name}"`, ...m.params.map((p) => snake(p.name))].join(', ')})`,
  ];
};

/** A host's mixin: the methods of the hand-written class, carried by name to it */
const hostPart = (api: Api, types: Types, h: Host): string[] => [
  `class ${h.name}Api(Transport):`,
  ...docstring('    ', `${h.doc || `The methods of \`${h.name}\``}: over what the class inheriting them gives`),
  '',
  ...(h.methods.length ? h.methods.flatMap((m) => [...hostMethod(api, types, m), '']) : ['    pass', '']),
  '',
];

const functionsPart = (api: Api, types: Types, name: string): string[] => {
  const fns = functions(api);

  if (fns.length === 0) return [];

  return [
    `class ${name}(Transport):`,
    ...docstring('    ', 'The functions, over what the class inheriting them gives'),
    '',
    ...fns.flatMap((f) => [
      ...method(api, types, {
        name: f.name,
        export: f.export ?? f.name,
        doc: f.doc,
        params: f.params ?? [],
        returns: f.returns ?? null,
        async: f.async ?? false,
        flags: [],
        api: f.api,
      }),
      '',
    ]),
    '',
  ];
};

export const file = (api: Api, own: Context['options']): string => {
  const types = typesOf(own);
  const declared = settings(api, { callKey: option(own, 'call_key', 'call') });
  const structs = [...new Set(declared.map((s) => s.struct))];
  const body = [
    ...unionsPart(api),
    ...options(api).flatMap((o) => optionsPart(api, types, o)),
    ...functionsPart(api, types, option(own, 'functions', 'FunctionsApi')),
    ...classes(api).flatMap((c) => classPart(api, types, c)),
    ...hosts(api).flatMap((h) => hostPart(api, types, h)),
    ...structs.flatMap((s) =>
      settingsPart(
        api,
        types,
        s,
        declared.filter((d) => d.struct === s),
      ),
    ),
  ];
  const head = [
    `# ${HEADER_OF('python')}`,
    `"""${upperFirst(option(own, 'title', 'the API'))} in Python, made from the Rust declarations: its methods hand each call to`,
    'the class inheriting them (`Transport`)"""',
    '',
    'from __future__ import annotations',
    '',
    'IMPORTS',
    '',
    '',
    'class _Unset:',
    '    """An option not given: left out of the options (`None` given is passed on)"""',
    '',
    '    def __repr__(self) -> str:',
    '        return "UNSET"',
    '',
    '',
    'UNSET: Any = _Unset()',
    '',
    '',
    'class Transport:',
    '    """The mixins\' base: what carries each call to the facade (by its names) and its result back, given by the class',
    '    inheriting them (a widget, a bridge, native code)"""',
    '',
    '    def _call(self, name: str, *args: Any) -> Any:',
    '        raise NotImplementedError(f"{type(self).__name__} gives no transport (_call)")',
    '',
    '    def _get(self, name: str) -> Any:',
    '        raise NotImplementedError(f"{type(self).__name__} gives no transport (_get)")',
    '',
    '    def _set(self, name: str, value: Any) -> None:',
    '        raise NotImplementedError(f"{type(self).__name__} gives no transport (_set)")',
    '',
    '    def _on(self, event: str, listener: Callable[[Any], None]) -> Callable[[], None]:',
    '        raise NotImplementedError(f"{type(self).__name__} gives no transport (_on)")',
    '',
    '',
    ...body,
  ].join('\n');
  const used = (name: string, how: string) => head.includes(how.replace('_', name));
  const abc = ['Awaitable', 'Callable', 'Sequence'].filter((t) => used(t, '_['));
  const HOW: Record<string, string> = { cast: '_(', Literal: '_[' };
  const typing = ['Any', 'Literal', 'TypedDict', 'cast'].filter((t) => used(t, HOW[t] ?? '_'));
  const imports = [
    ...(abc.length ? [`from collections.abc import ${abc.join(', ')}`] : []),
    `from typing import ${typing.join(', ')}`,
  ];

  return `${head.replace('IMPORTS', imports.join('\n')).trimEnd()}\n`;
};

export const python: Target = {
  name: 'python',
  outputs: ({ api, options: own }: Context): Output[] => [
    { path: option(own, 'out', 'python/_api.py'), text: file(api, own) },
  ],
};

export default python;
