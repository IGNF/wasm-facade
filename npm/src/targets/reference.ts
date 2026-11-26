/**
 * The API's reference in Markdown (`[targets.reference] out`, default `docs/api.md`; `title`): its functions,
 * classes (constructor options, properties, methods, events), options and unions, with their documentation
 */
import type { Config } from '../config.ts';
import { type Api, camel, type Signature, tsTypeOf } from '../model.ts';
import {
  type Class,
  classes,
  eventsOf,
  functions,
  hosts,
  type Options,
  options,
  records,
  unions,
} from '../patterns.ts';
import { type Context, type Output, option, type Target } from '../target.ts';

const line = (doc: string): string => doc.split('\n').join(' ');
const cell = (doc: string): string => line(doc).replaceAll('|', '\\|');

const signature = (
  api: Api,
  config: Config,
  sig: { export?: string; name: string; params?: Signature['params']; returns?: string | null; async?: boolean },
): string => {
  const params = (sig.params ?? []).map((p) => camel(p.name)).join(', ');
  const returns = sig.returns ? tsTypeOf(api, sig.returns, config.types) : 'void';

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

const classSection = (api: Api, config: Config, c: Class): string[] => [
  `### \`${c.name}\``,
  '',
  ...(c.doc ? [line(c.doc), ''] : []),
  ...(c.options
    ? [`\`new ${c.name}(options)\`, its options \`${c.options.name}\`:`, '', ...optionsTable(api, config, c.options)]
    : []),
  ...(c.properties.length
    ? [
        'Properties:',
        '',
        ...c.properties.map((p) => `- \`${p.name}\`${p.setter ? '' : ' (read only)'}: ${line(p.getter.doc)}`),
        '',
      ]
    : []),
  ...(c.methods.length
    ? ['Methods:', '', ...c.methods.map((m) => `- ${signature(api, config, m)}: ${line(m.doc)}`), '']
    : []),
  ...(c.events.length
    ? [
        'Events (`on(type, listener)`, returning what stops it):',
        '',
        ...c.events.map((e) => `- \`${e.name}\` (\`${e.payload}\`): ${line(e.method.doc)}`),
        '',
      ]
    : []),
];

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
