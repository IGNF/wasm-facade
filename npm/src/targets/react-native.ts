/**
 * The names a React Native bridge exposes (`[targets.react-native] out`, default `src/native.api.ts`): for each class,
 * the facade's methods, properties and events; the functions; each settings struct's setters and getters. A bridge
 * (a WebView, a native module) forwards those names, and only those, to the facade
 */
import { camel, HEADER_OF, joined, snake } from '../model.ts';
import { classes, functions, settings } from '../patterns.ts';
import { type Context, type Output, option, type Target } from '../target.ts';

const constant = (name: string): string => snake(name).replace(/^_/, '').toUpperCase();

const list = (doc: string, name: string, names: string[]): string[] => [
  `/** ${doc} */`,
  `export const ${name} = [${names.map((n) => `'${n}'`).join(', ')}] as const;`,
  '',
];

export const reactNative: Target = {
  name: 'react-native',
  outputs: ({ api, options: own }: Context): Output[] => {
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
      ...classes(api).flatMap((c) => [
        ...list(
          `\`${c.name}\`'s methods`,
          `${constant(c.name)}_METHODS`,
          c.methods.map((m) => camel(m.export)),
        ),
        ...list(
          `\`${c.name}\`'s properties`,
          `${constant(c.name)}_PROPERTIES`,
          c.properties.map((p) => p.name),
        ),
        ...list(
          `\`${c.name}\`'s events`,
          `${constant(c.name)}_EVENTS`,
          c.events.map((e) => e.name),
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
