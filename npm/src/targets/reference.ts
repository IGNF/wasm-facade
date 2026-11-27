/**
 * The API's reference in Markdown (`[targets.reference] out`, default `docs/api.md`; `title`): its functions,
 * classes (constructor options, properties, methods, events), options and unions, with their documentation
 */
import type { Config } from '../config.ts';
import { type Api, camel, type Signature, tsTypeOf } from '../model.ts';
import {
  accessorNames,
  type Class,
  classes,
  eventsOf,
  functions,
  hosts,
  type Options,
  options,
  records,
  returned,
  taken,
  unions,
} from '../patterns.ts';
import { type Context, type Output, option, type Target } from '../target.ts';

const line = (doc: string): string => doc.split('\n').join(' ');
const cell = (doc: string): string => line(doc).replaceAll('|', '\\|');

const signature = (
  api: Api,
  config: Config,
  sig: {
    export?: string;
    name: string;
    api: Signature['api'];
    params?: Signature['params'];
    returns?: string | null;
    async?: boolean;
  },
): string => {
  // The parameters a record `takes` named once, as that record
  const groups = taken(api, sig);
  const params = [
    ...new Set((sig.params ?? []).map((p) => groups.find((g) => g.fields.includes(p.name))?.name ?? camel(p.name))),
  ].join(', ');
  const returns = returned(api, sig) ?? (sig.returns ? tsTypeOf(api, sig.returns, config.types) : 'void');

  return `\`${camel(sig.export ?? sig.name)}(${params})\` → \`${sig.async ? `Promise<${returns}>` : returns}\``;
};

const optionsTable = (api: Api, config: Config, o: Options): string[] => [
  '| Option | Type | Default | |',
  '| --- | --- | --- | --- |',
  ...o.fields.map(
    (f) =>
      `| \`${f.name}\` | \`${tsTypeOf(api, f.rust, config.types).replaceAll('|', '\\|')}\` | ${f.default === undefined ? '' : `\`${f.default}\``} | ${cell(f.doc)} |`,
  ),
  '',
];

/** A property as the facade writes it: its name (accessors), or its getter and setter (`accessors = "methods"`) */
const propertyNamed = (config: Config, name: string, setter: boolean): string => {
  if (config.accessors !== 'methods') return `\`${name}\`${setter ? '' : ' (read only)'}`;

  const names = accessorNames(name, 'methods');

  return setter ? `\`${names.getter}()\`, \`${names.setter}(value)\`` : `\`${names.getter}()\` (read only)`;
};

const classSection = (api: Api, config: Config, c: Class): string[] => {
  const given = [...c.deps.map((d) => d.name), ...(c.options ? ['options'] : [])].join(', ');

  return [
    `### \`${c.name}\``,
    '',
    ...(c.doc ? [line(c.doc), ''] : []),
    ...(c.deps.length
      ? [
          `\`new ${c.name}(${given})\`, its dependencies first (required, kept by the instance):`,
          '',
          ...c.deps.map((d) => `- \`${d.name}\`: \`${d.type}\``),
          '',
        ]
      : []),
    ...(c.options
      ? [
          `${c.deps.length ? 'Its' : `\`new ${c.name}(options)\`, its`} options \`${c.options.name}\`:`,
          '',
          ...optionsTable(api, config, c.options),
        ]
      : []),
    ...(c.kept.length || c.properties.length
      ? [
          'Properties:',
          '',
          ...c.kept.map(
            (k) =>
              `- ${propertyNamed(config, k.name, k.setter !== undefined)}: ${line(k.doc)} (the option as kept${k.emits ? `; its setter emits \`${k.emits}\`` : ''})`,
          ),
          ...c.properties
            .filter((p) => !c.kept.some((k) => k.name === p.name))
            .map((p) => `- ${propertyNamed(config, p.name, p.setter !== undefined)}: ${line(p.getter.doc)}`),
          '',
        ]
      : []),
    ...(c.keyed.length
      ? [
          'Properties by key:',
          '',
          ...c.keyed.map((k) => {
            const [key, name, value] = k.method.params.map((p) => camel(p.name));

            return `- \`${camel(k.method.export)}(${key}, ${name}, ${value})\`, \`${k.getter}(${key}, ${name})\`: ${line(k.method.doc)} (\`${k.struct}\`'s, kept by key${k.emits ? `; emits \`${k.emits}\`` : ''})`;
          }),
          '',
        ]
      : []),
    ...(c.methods.length
      ? ['Methods:', '', ...c.methods.map((m) => `- ${signature(api, config, m)}: ${line(m.doc)}`), '']
      : []),
    ...(c.events.length || c.emitted.length
      ? [
          'Events (`on(type, listener)`, returning what stops it):',
          '',
          ...c.events.map((e) => `- \`${e.name}\` (\`${e.payload}\`): ${line(e.method.doc)}`),
          ...c.emitted.map((e) => `- \`${e}\`: a property changed by its setter, once kept and applied`),
          '',
        ]
      : []),
  ];
};

export const reference: Target = {
  name: 'reference',
  outputs: ({ api, config, options: own }: Context): Output[] => {
    const fns = functions(api);
    const list = classes(api);
    const all = unions(api);
    const text = [
      `# ${option(own, 'title', 'API')}`,
      '',
      '<!-- Made by wasm-facade (reference) from the Rust declarations: not to edit -->',
      '',
      ...(fns.length
        ? ['## Functions', '', ...fns.map((f) => `- ${signature(api, config, f)}: ${line(f.doc)}`), '']
        : []),
      ...(list.length ? ['## Classes', '', ...list.flatMap((c) => classSection(api, config, c))] : []),
      ...hosts(api).flatMap((h) => [
        `## \`${h.name}\``,
        '',
        ...(h.doc ? [line(h.doc), ''] : []),
        ...h.methods.map((m) => {
          const params = m.params.map((p) => `${p.name}${p.optional ? '?' : ''}`).join(', ');
          const result = m.ts ?? (m.returns ? tsTypeOf(api, m.returns, config.types) : 'void');

          return `- \`${m.name}(${params})\` → \`${m.async || m.animation ? `Promise<${result}>` : result}\`: ${line(m.doc)}${m.animation ? ' (resolved once the animation ends)' : ''}`;
        }),
        '',
        ...(eventsOf(api, h.name)
          ? [
              'Events (`on(type, listener)`, returning what stops it):',
              '',
              ...(eventsOf(api, h.name)?.events ?? []).map(
                (e) =>
                  `- \`${e.name}\` (\`${e.ts ?? (e.payload ? tsTypeOf(api, e.payload, config.types) : 'undefined')}\`)${e.doc ? `: ${line(e.doc)}` : ''}`,
              ),
              '',
            ]
          : []),
      ]),
      ...(records(api).length ? ['## Records', ''] : []),
      ...records(api).flatMap((r) => [
        `### \`${r.name}\``,
        '',
        ...(r.doc ? [line(r.doc), ''] : []),
        ...r.fields.map(
          (f) =>
            `- \`${f.name}${f.optional ? '?' : ''}\` (\`${f.ts ?? tsTypeOf(api, f.rust.replace(/^Option<(.*)>$/, '$1'), config.types)}\`)${f.doc ? `: ${line(f.doc)}` : ''}`,
        ),
        '',
      ]),
      ...(options(api).length
        ? [
            '## Options',
            '',
            ...options(api).flatMap((o) => [`### \`${o.name}\``, '', line(o.doc), '', ...optionsTable(api, config, o)]),
          ]
        : []),
      ...(all.length
        ? [
            '## Unions',
            '',
            ...all.map(
              (u) => `- \`${u.name}\`: ${u.values.map((v) => `\`'${v.value}'\` (${line(v.doc)})`).join(', ')}`,
            ),
            '',
          ]
        : []),
    ].join('\n');

    return [{ path: option(own, 'out', 'docs/api.md'), text }];
  },
};

export default reference;
