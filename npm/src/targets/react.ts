/**
 * React hooks over the facade (`[targets.react] out`, default `src/hooks.ts`; `facade`, the facade's file, default
 * the typescript target's `src/api.ts`): `use<Class>(options)` (its dependencies first, `useLayer(map, options)`), the
 * instance kept while they are the same and freed after; `use<Class>Event(instance, type, listener)`, listening while mounted
 */
import { dirname, relative } from 'node:path';
import { typeImports } from '../config.ts';
import { HEADER_OF, joined, tsDoc } from '../model.ts';
import { type Class, classes, eventsName } from '../patterns.ts';
import { type Context, type Output, option, type Target } from '../target.ts';

const hooks = (c: Class): string[] => {
  const fields = c.options?.fields.map((f) => f.name) ?? [];
  const init = c.options ? `${c.options.name}Init` : undefined;
  const instance = c.name.charAt(0).toLowerCase() + c.name.slice(1);
  // Its dependencies first, as its constructor takes them; the instance made again when one changes
  const deps = c.deps.map((d) => d.name);
  const given = c.deps.map((d) => `${d.name}: ${d.type}`);
  const make = init
    ? [
        `export const use${c.name} = (${[...given, `options: ${init} = {}`].join(', ')}): ${c.name} => {`,
        `  const { ${fields.join(', ')} } = options;`,
        `  const ${instance} = useMemo(() => new ${c.name}(${[...deps, `{ ${fields.join(', ')} }`].join(', ')}), [${[...deps, ...fields].join(', ')}]);`,
      ]
    : [
        `export const use${c.name} = (${given.join(', ')}): ${c.name} => {`,
        `  const ${instance} = useMemo(() => new ${c.name}(${deps.join(', ')}), [${deps.join(', ')}]);`,
      ];

  return [
    tsDoc(`A ${c.name} kept while its ${deps.length ? 'dependencies and ' : ''}options are the same, freed after`),
    ...make,
    '',
    `  useEffect(() => () => ${instance}.free(), [${instance}]);`,
    '',
    `  return ${instance};`,
    '};',
    '',
    ...(c.events.length
      ? [
          `/** Listens to \`${instance}\`'s event \`type\` while mounted */`,
          `export const use${c.name}Event = <K extends keyof ${eventsName(c)}>(`,
          `  ${instance}: ${c.name},`,
          '  type: K,',
          `  listener: (payload: ${eventsName(c)}[K]) => void,`,
          '): void => {',
          `  useEffect(() => ${instance}.on(type, listener), [${instance}, type, listener]);`,
          '};',
          '',
        ]
      : []),
  ];
};

export const react: Target = {
  name: 'react',
  outputs: ({ api, config, options }: Context): Output[] => {
    const out = option(options, 'out', 'src/hooks.ts');
    const facade = option(options, 'facade', 'src/api.ts');
    const rel = relative(dirname(out), facade);
    const list = classes(api);
    const names = list.flatMap((c) => [
      c.name,
      ...(c.options ? [`type ${c.options.name}Init`] : []),
      ...(c.events.length ? [`type ${eventsName(c)}`] : []),
    ]);

    const body = joined(list.flatMap(hooks));

    return [
      {
        path: out,
        text: joined([
          `// ${HEADER_OF('react')}`,
          '',
          "import { useEffect, useMemo } from 'react';",
          ...typeImports(config, out, body),
          `import { ${names.join(', ')} } from '${rel.startsWith('.') ? rel : `./${rel}`}';`,
          '',
          body,
        ]),
      },
    ];
  },
};

export default react;
