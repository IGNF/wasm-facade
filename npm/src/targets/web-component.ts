/**
 * A custom element's attributes (`[targets.web-component] out`, default `src/element.api.ts`; `from`, the structs whose
 * fields are attributes, default every settings struct): each attribute (`max-pitch`) and the option it gives
 * (`maxPitch`), read as a number, a flag or text from its Rust type, and the function reading one. The hand-written
 * element observes `ATTRIBUTES`' keys and gives the facade `attributeValue(name, text)`
 */
import { type Api, camel, HEADER_OF, joined, kebab, structOf } from '../model.ts';
import { settings } from '../patterns.ts';
import { type Context, type Output, option, type Target } from '../target.ts';

const NUMBERS = /^(Option<)?(f32|f64|u8|i8|u16|i16|u32|i32|usize|isize)>?$/;

const kindOf = (rust: string): 'number' | 'flag' | 'text' => {
  if (NUMBERS.test(rust)) return 'number';
  if (/^(Option<)?bool>?$/.test(rust)) return 'flag';

  return 'text';
};

const structsOf = (api: Api, own: Context['options']): string[] => {
  const from = own.from;

  if (Array.isArray(from)) return from.filter((s): s is string => typeof s === 'string');

  return [...new Set(settings(api, { callKey: option(own, 'call_key', 'call') }).map((s) => s.struct))];
};

export const webComponent: Target = {
  name: 'web-component',
  outputs: ({ api, options: own }: Context): Output[] => {
    const fields = structsOf(api, own).flatMap((s) => structOf(api, s).fields ?? []);
    const text = joined([
      `// ${HEADER_OF('web-component')}`,
      '',
      '/** Each attribute: the option it gives, and how its text is read */',
      'export const ATTRIBUTES = {',
      ...fields.map((f) => `  '${kebab(f.name)}': { option: '${camel(f.name)}', kind: '${kindOf(f.type)}' },`),
      '} as const;',
      '',
      'export type Attribute = keyof typeof ATTRIBUTES;',
      '',
      "/** An attribute's value as its option takes it: a number, a flag (present and not `false`), else its text;",
      ' * `undefined` when it is removed */',
      'export const attributeValue = (name: Attribute, text: string | null): number | boolean | string | undefined => {',
      '  const kind: string = ATTRIBUTES[name].kind;',
      '',
      "  if (kind === 'flag') return text !== null && text !== 'false';",
      '  if (text === null) return undefined;',
      "  if (kind === 'number') return Number(text);",
      '',
      '  return text;',
      '};',
    ]);

    return [{ path: option(own, 'out', 'src/element.api.ts'), text: `${text}\n` }];
  },
};

export default webComponent;
