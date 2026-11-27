/**
 * The names a React Native bridge exposes (`[targets.react-native] out`, default `src/native.api.ts`): for each class,
 * the facade's methods, properties (with `accessors = "methods"`, their getters and setters among the methods) and
 * events; each host's methods; the functions; each settings struct's setters and
 * getters. A bridge
 * (a WebView, a native module) forwards those names, and only those, to the facade
 */
import { camel, HEADER_OF, joined, snake } from '../model.ts';
import { accessorNames, classes, eventsOf, functions, hosts, settings } from '../patterns.ts';
import { type Context, type Output, option, type Target } from '../target.ts';

const constant = (name: string): string => snake(name).replace(/^_/, '').toUpperCase();

const list = (doc: string, name: string, names: string[]): string[] => [
  `/** ${doc} */`,
  `export const ${name} = [${names.map((n) => `'${n}'`).join(', ')}] as const;`,
  '',
];

export const reactNative: Target = {
  name: 'react-native',
  outputs: ({ api, config, options: own }: Context): Output[] => {
    const declared = settings(api, { callKey: option(own, 'call_key', 'call') });
    const structs = [...new Set(declared.map((s) => s.struct))];
    const fns = functions(api);
    const text = joined([
      `// ${HEADER_OF('react-native')}`,
      '',
      ...(fns.length
        ? list(
            'The functions',
            'FUNCTIONS',
            fns.map((f) => camel(f.export ?? f.name)),
          )
        : []),
      ...classes(api).flatMap((c) => {
        // Its properties: by their names (accessors), or as their getters and setters (`accessors = "methods"`)
        const properties = [
          ...c.kept.map((k) => ({ name: k.name, setter: k.setter !== undefined })),
          ...c.properties
            .filter((p) => !c.kept.some((k) => k.name === p.name))
            .map((p) => ({ name: p.name, setter: p.setter !== undefined })),
        ];
        const accessors = properties.flatMap((p) => {
          const names = accessorNames(p.name, 'methods');

          return [names.getter, ...(p.setter ? [names.setter] : [])];
        });
        const asMethods = config.accessors === 'methods';

        return [
          ...list(`\`${c.name}\`'s methods`, `${constant(c.name)}_METHODS`, [
            ...(asMethods ? accessors : []),
            ...c.keyed.flatMap((k) => [camel(k.method.export), k.getter]),
            ...c.methods.map((m) => camel(m.export)),
          ]),
          ...list(
            `\`${c.name}\`'s properties`,
            `${constant(c.name)}_PROPERTIES`,
            asMethods ? [] : properties.map((p) => p.name),
          ),
          ...list(`\`${c.name}\`'s events`, `${constant(c.name)}_EVENTS`, [
            ...c.events.map((e) => e.name),
            ...c.emitted,
          ]),
        ];
      }),
      ...hosts(api).flatMap((h) => [
        ...list(
          `\`${h.name}\`'s methods, written by hand`,
          `${constant(h.name)}_METHODS`,
          h.methods.map((m) => m.name),
        ),
        ...list(
          `\`${h.name}\`'s events`,
          `${constant(h.name)}_EVENTS`,
          eventsOf(api, h.name)?.events.map((e) => e.name) ?? [],
        ),
      ]),
      ...structs.flatMap((s) =>
        list(
          `\`${s}\`'s setters and getters`,
          `${constant(s)}_METHODS`,
          declared.filter((d) => d.struct === s).flatMap((d) => [d.setter, ...(d.getter ? [d.getter] : [])]),
        ),
      ),
    ]);

    return [{ path: option(own, 'out', 'src/native.api.ts'), text: `${text.trimEnd()}\n` }];
  },
};

export default reactNative;
