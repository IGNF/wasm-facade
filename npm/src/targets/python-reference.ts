/**
 * The Python API's reference in Markdown (`[targets.python-reference] out`, default `docs/python.md`; `title`; `types`
 * as the python target's): what the `python` target writes, in Python's names and hints: the options' functions and
 * defaults, the methods of each class and settings, the unions
 */
import { type Api, camel, pyDoc, pyLiteral, pyTypeOf, type Signature, snake } from '../model.ts';
import {
  classes,
  converters,
  eventsOf,
  functions,
  hosts,
  options,
  records,
  returned,
  settings,
  taken,
  unions,
} from '../patterns.ts';
import { type Context, type Output, option, type Target } from '../target.ts';

type Types = Record<string, string>;

const cell = (doc: string): string => pyDoc(doc).replaceAll('|', '\\|');

const signature = (api: Api, types: Types, sig: Signature): string => {
  // The parameters a record `takes` named once, as that record
  const groups = taken(api, sig);
  const params = [
    ...new Set(
      sig.params.map((p) => {
        const group = groups.find((g) => g.fields.includes(p.name));

        return group
          ? `${snake(group.name)}: ${group.record}`
          : `${p.name}: ${converters(sig)[p.name] ? 'Any' : pyTypeOf(api, p.type, types)}`;
      }),
    ),
  ];
  const returns = returned(api, sig) ?? (sig.returns ? pyTypeOf(api, sig.returns, types) : 'None');

  return `\`${snake(camel(sig.export))}(${params.join(', ')})\` → \`${sig.async ? `Awaitable[${returns}]` : returns}\``;
};

const asSignature = (f: ReturnType<typeof functions>[number]): Signature => ({
  name: f.name,
  export: f.export ?? f.name,
  doc: f.doc,
  params: f.params ?? [],
  returns: f.returns ?? null,
  async: f.async ?? false,
  flags: [],
  api: f.api,
});

export const pythonReference: Target = {
  name: 'python-reference',
  outputs: ({ api, options: own }: Context): Output[] => {
    const types = typeof own.types === 'object' && own.types !== null ? (own.types as Types) : {};
    const declared = settings(api, { callKey: option(own, 'call_key', 'call') });
    const structs = [...new Set(declared.map((s) => s.struct))];
    const fns = functions(api);
    const text = [
      `# ${option(own, 'title', 'API')} in Python`,
      '',
      '<!-- Made by wasm-facade (python-reference) from the Rust declarations: not to edit -->',
      '',
      ...(fns.length
        ? [
            '## Functions (`FunctionsApi`)',
            '',
            ...fns.map((f) => `- ${signature(api, types, asSignature(f))}: ${pyDoc(f.doc)}`),
            '',
          ]
        : []),
      ...(classes(api).length ? ['## Classes', ''] : []),
      ...classes(api).flatMap((c) => [
        `### \`${c.name}\` (\`${c.name}Api\`)`,
        '',
        ...(c.doc ? [pyDoc(c.doc), ''] : []),
        ...(c.options
          ? [`Its options: \`${c.options.name}\`, \`${snake(c.options.name).replace(/^_/, '')}(…)\`.`, '']
          : []),
        ...c.kept.map(
          (k) =>
            `- \`${snake(k.name)}\` (\`${pyTypeOf(api, k.rust, types)}\`${k.setter ? '' : ', read only'}): ${pyDoc(k.doc)}`,
        ),
        ...c.properties
          .filter((p) => !c.kept.some((k) => k.name === p.name))
          .map(
            (p) =>
              `- \`${snake(p.name)}\` (\`${p.getter.returns ? pyTypeOf(api, p.getter.returns, types) : 'None'}\`${p.setter ? '' : ', read only'}): ${pyDoc(p.getter.doc)}`,
          ),
        ...c.keyed.map((k) => {
          const [key, name, value] = k.method.params.map((p) => p.name);

          return `- \`${snake(camel(k.method.export))}(${key}, ${name}, ${value})\`, \`${snake(k.getter)}(${key}, ${name})\`: ${pyDoc(k.method.doc)}`;
        }),
        ...c.methods.map((m) => `- ${signature(api, types, m)}: ${pyDoc(m.doc)}`),
        ...c.events.map((e) => `- \`on("${e.name}", listener)\`: ${pyDoc(e.method.doc)}`),
        ...c.emitted.map((e) => `- \`on("${e}", listener)\`: a property changed by its setter`),
        '',
      ]),
      ...hosts(api).flatMap((h) => [
        `## \`${h.name}\` (\`${h.name}Api\`)`,
        '',
        ...(h.doc ? [pyDoc(h.doc), ''] : []),
        ...h.methods.map((m) => {
          const params = m.params.map((p) => {
            const inner = p.optional ? p.rust.replace(/^Option<(.*)>$/, '$1') : p.rust;

            return `${snake(p.name)}: ${p.py ?? pyTypeOf(api, inner, types)}${p.optional ? ' | None = None' : ''}`;
          });
          const result = m.py ?? (m.returns ? pyTypeOf(api, m.returns, types) : 'None');

          return `- \`${snake(m.name)}(${params.join(', ')})\` → \`${m.async || m.animation ? `Awaitable[${result}]` : result}\`: ${pyDoc(m.doc)}`;
        }),
        ...(eventsOf(api, h.name)?.events ?? []).map(
          (e) => `- \`on("${e.name}", listener)\`${e.doc ? `: ${pyDoc(e.doc)}` : ''}`,
        ),
        '',
      ]),
      ...(records(api).length ? ['## Records', ''] : []),
      ...records(api).map(
        (r) =>
          `- \`${r.name}\`${r.tuple ? ' (a tuple)' : ''}: ${r.fields.map((f) => `\`${f.name.replace(/^_/, '')}\` (\`${f.py ?? pyTypeOf(api, f.rust, types)}\`)`).join(', ')}${r.doc ? `. ${pyDoc(r.doc)}` : ''}`,
      ),
      ...(records(api).length ? [''] : []),
      ...structs.flatMap((s) => [
        `## Settings: \`${s}\` (\`${s}Api\`)`,
        '',
        ...declared
          .filter((d) => d.struct === s)
          .map(
            (d) =>
              `- \`${snake(d.setter)}(${snake(d.name)}: ${pyTypeOf(api, d.field.type, types)})\`${d.getter ? `, \`${snake(d.getter)}()\`` : ''}: ${pyDoc(d.field.doc)}`,
          ),
        '',
      ]),
      ...(options(api).length ? ['## Options', ''] : []),
      ...options(api).flatMap((o) => [
        `### \`${o.name}\``,
        '',
        `${pyDoc(o.doc)}: \`${snake(o.name).replace(/^_/, '')}(*, …)\` takes them as keywords.`,
        '',
        '| Option | Type | Default | |',
        '| --- | --- | --- | --- |',
        ...o.fields.map((f) => {
          const value = f.default === undefined ? undefined : pyLiteral(f.default);

          return `| \`${snake(f.name)}\` | \`${pyTypeOf(api, f.rust, types).replaceAll('|', '\\|')}\` | ${value === undefined ? '' : `\`${value}\``} | ${cell(f.doc)} |`;
        }),
        '',
      ]),
      ...(unions(api).length
        ? [
            '## Unions',
            '',
            ...unions(api).map(
              (u) => `- \`${u.name}\`: ${u.values.map((v) => `\`"${v.value}"\` (${pyDoc(v.doc)})`).join(', ')}`,
            ),
            '',
          ]
        : []),
    ].join('\n');

    return [{ path: option(own, 'out', 'docs/python.md'), text }];
  },
};

export default pythonReference;
