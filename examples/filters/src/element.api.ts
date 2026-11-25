// Made by wasm-facade (web-component) from the Rust declarations: not to edit

/** Each attribute: the option it gives, and how its text is read */
export const ATTRIBUTES = {
  radius: { option: 'radius', kind: 'number' },
  edge: { option: 'edge', kind: 'text' },
} as const;

export type Attribute = keyof typeof ATTRIBUTES;

/** An attribute's value as its option takes it: a number, a flag (present and not `false`), else its text;
 * `undefined` when it is removed */
export const attributeValue = (name: Attribute, text: string | null): number | boolean | string | undefined => {
  const kind: string = ATTRIBUTES[name].kind;

  if (kind === 'flag') return text !== null && text !== 'false';
  if (text === null) return undefined;
  if (kind === 'number') return Number(text);

  return text;
};
