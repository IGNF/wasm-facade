/**
 * The API as the extractor writes it (`api.json`, its format `data/api.schema.json` of the repository, version 1), and
 * what every target shares: names in each language's case, documentation, and Rust's types in TypeScript
 */

/** An attribute's keys: a string, a number or a flag */
export interface Attributes {
  [key: string]: string | number | boolean | undefined;
}

export interface Field {
  name: string;
  type: string;
  doc: string;
  api: Attributes;
}

export interface Param {
  name: string;
  type: string;
}

/** A function's or a method's signature as exported */
export interface Signature {
  name: string;
  /** Its name in JavaScript (`js_name`, else its Rust name) */
  export: string;
  doc: string;
  params: Param[];
  returns: string | null;
  async: boolean;
  /** Its export's flags: `constructor`, `getter`, `setter` */
  flags: string[];
  api: Attributes;
}

export interface Declared {
  kind: 'struct' | 'enum' | 'function' | 'class';
  name: string;
  doc: string;
  api: Attributes;
  fields?: Field[];
  variants?: { name: string; doc: string }[];
  methods?: Signature[];
  /** A function's */
  export?: string;
  params?: Param[];
  returns?: string | null;
  async?: boolean;
  flags?: string[];
}

/** A call the declarations name, as exported */
export interface Call {
  doc: string;
  params: Param[];
}

export interface Api {
  schema: number;
  items: Declared[];
  calls: Record<string, Call>;
}

/** The format's version this package reads */
export const SCHEMA = 1;

export const checkedApi = (json: unknown): Api => {
  const api = json as Api;

  if (api?.schema !== SCHEMA)
    throw new Error(`wasm-facade: api.json's schema ${String(api?.schema)}, ${SCHEMA} expected`);

  return api;
};

/** What a file a built-in target writes says it is */
export const HEADER_OF = (target: string): string =>
  `Made by wasm-facade (${target}) from the Rust declarations: not to edit`;

// ── Names

/** `stroke_color` as TypeScript names it: `strokeColor` */
export const camel = (name: string): string => name.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

/** `strokeColor` as Python names it: `stroke_color` */
export const snake = (name: string): string => name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/** `minZoom` as an element's attribute names it: `min-zoom` */
export const kebab = (name: string): string => snake(camel(name)).replaceAll('_', '-');

export const lowerFirst = (name: string): string => name.charAt(0).toLowerCase() + name.slice(1);
export const upperFirst = (name: string): string => name.charAt(0).toUpperCase() + name.slice(1);

/** An attribute's value when it is a string */
export const text = (value: Attributes[string]): string | undefined => (typeof value === 'string' ? value : undefined);

// ── Declarations

export const structOf = (api: Api, name: string): Declared => {
  const found = api.items.find((item) => item.name === name && item.kind === 'struct');

  if (!found?.fields) throw new Error(`wasm-facade: no declared struct ${name}`);

  return found;
};

export const enumOf = (api: Api, name: string): Declared | undefined =>
  api.items.find((item) => item.name === name && item.kind === 'enum');

/** An enum's variants as the strings the API takes (`rename_all = "lowercase"`, else their names) */
export const variantNames = (declared: Declared): string[] =>
  (declared.variants ?? []).map((v) => (declared.api.rename_all === 'lowercase' ? v.name.toLowerCase() : v.name));

// ── Documentation

/** No line: an item without documentation (left out when the lines are joined) */
export const NONE = '\u0000';

/** A doc comment at `indent` spaces, its lines kept; `NONE` without documentation */
export const tsDoc = (doc: string, indent = ''): string => {
  if (!doc) return NONE;

  const lines = doc.split('\n');

  return lines.length === 1 ? `${indent}/** ${lines[0]} */` : `${indent}/** ${lines.join(`\n${indent} * `)} */`;
};

/** Lines joined, the `NONE` ones left out */
export const joined = (lines: string[]): string => lines.filter((line) => line !== NONE).join('\n');

/** Words wrapped at `width` columns, the lines after the first indented by `indent` */
export const wrap = (words: string, width: number, indent: string): string[] =>
  words.split(' ').reduce<string[]>((lines, word) => {
    const last = lines.at(-1);

    if (last !== undefined && last.length + word.length + 1 <= width) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(lines.length === 0 ? word : `${indent}${word}`);

    return lines;
  }, []);

// ── Rust's types in TypeScript (the generic targets'; a project adds its own in `[types]`)

const TYPED_ARRAYS: Record<string, string> = {
  u8: 'Uint8Array',
  i8: 'Int8Array',
  u16: 'Uint16Array',
  i16: 'Int16Array',
  u32: 'Uint32Array',
  i32: 'Int32Array',
  f32: 'Float32Array',
  f64: 'Float64Array',
  u64: 'BigUint64Array',
  i64: 'BigInt64Array',
};
const NUMBERS = new Set(['u8', 'i8', 'u16', 'i16', 'u32', 'i32', 'f32', 'f64', 'usize', 'isize']);

/** A Rust type as TypeScript says it: numbers, strings, slices and vectors as typed arrays, `Option` and `Result`,
 * `js_sys`'s; `types` the project's own (`[types]`); a declared enum its union */
export const tsTypeOf = (api: Api, rust: string, types: Record<string, string> = {}): string => {
  const own = types[rust];

  if (own) return own;

  const ty = rust.replace(/^&(mut)?/, '');
  const option = /^Option<(.*)>$/.exec(ty);

  if (option?.[1]) return `${tsTypeOf(api, option[1], types)} | undefined`;

  const result = /^Result<(.*?), ?\w+>$/.exec(ty);

  if (result?.[1]) return tsTypeOf(api, result[1], types);

  const array = /^(?:\[(\w+)\]|Vec<(\w+)>|Box<\[(\w+)\]>)$/.exec(ty);
  const element = array?.[1] ?? array?.[2] ?? array?.[3];

  if (element && TYPED_ARRAYS[element]) return TYPED_ARRAYS[element];
  if (element === 'String') return 'string[]';
  if (NUMBERS.has(ty)) return 'number';
  if (ty === 'u64' || ty === 'i64') return 'bigint';
  if (ty === 'bool') return 'boolean';
  if (ty === 'String' || ty === 'str') return 'string';
  if (ty === 'JsValue') return 'unknown';
  if (ty === 'js_sys::Function' || ty === 'Function') return '(...args: never[]) => unknown';
  if (ty === 'js_sys::Promise') return 'Promise<unknown>';

  const declared = enumOf(api, ty);

  if (declared) return declared.name;
  throw new Error(`wasm-facade: no TypeScript for the Rust type ${rust}: give it in wasm-facade.toml's [types]`);
};

// ── Rust's types in Python (the `python` target's; a project adds its own in `[targets.python.types]`)

const INTEGERS = new Set(['u8', 'i8', 'u16', 'i16', 'u32', 'i32', 'u64', 'i64', 'usize', 'isize']);

/** A Rust type as a Python hint: `float`, `int`, `bool`, `str`, sequences, `X | None`, a declared enum's alias */
export const pyTypeOf = (api: Api, rust: string, types: Record<string, string> = {}): string => {
  const own = types[rust];

  if (own) return own;

  const ty = rust.replace(/^&(mut)?\s*/, '');
  const option = /^Option<(.*)>$/.exec(ty);

  if (option?.[1]) return `${pyTypeOf(api, option[1], types)} | None`;

  const result = /^Result<(.*?), ?\w+>$/.exec(ty);

  if (result?.[1]) return pyTypeOf(api, result[1], types);

  const array = /^(?:\[(\w+)\]|Vec<(\w+)>|Box<\[(\w+)\]>)$/.exec(ty);
  const element = array?.[1] ?? array?.[2] ?? array?.[3];

  if (element === 'u8') return 'bytes | Sequence[int]';
  if (element && INTEGERS.has(element)) return 'Sequence[int]';
  if (element === 'f32' || element === 'f64') return 'Sequence[float]';
  if (element === 'String') return 'Sequence[str]';
  if (INTEGERS.has(ty)) return 'int';
  if (ty === 'f32' || ty === 'f64') return 'float';
  if (ty === 'bool') return 'bool';
  if (ty === 'String' || ty === 'str') return 'str';
  if (ty === 'JsValue') return 'Any';
  if (ty === 'js_sys::Function' || ty === 'Function') return 'Callable[..., Any]';

  const declared = enumOf(api, ty);

  if (declared) return declared.name;
  throw new Error(`wasm-facade: no Python for the Rust type ${rust}: give it in [targets.python.types]`);
};

/** A TypeScript literal (an option's `default`) in Python: numbers, strings, booleans, `undefined`/`null`; else none */
export const pyLiteral = (ts: string): string | undefined => {
  const value = ts.trim();

  if (/^-?\d+(\.\d+)?(e-?\d+)?$/i.test(value)) return value;
  if (value === 'true' || value === 'false') return value === 'true' ? 'True' : 'False';
  if (value === 'undefined' || value === 'null') return 'None';

  const string = /^'([^'\\]*)'$|^"([^"\\]*)"$/.exec(value);

  return string ? JSON.stringify(string[1] ?? string[2]) : undefined;
};

/** Documentation as Python reads it: the API's names in code (`minZoom`, `setValues`) in snake_case, on one line */
export const pyDoc = (doc: string): string =>
  doc
    .split('\n')
    .join(' ')
    .replace(/`([a-z]+[A-Z][A-Za-z0-9]*)`/g, (_, name: string) => `\`${snake(name)}\``)
    .replaceAll('"""', "'''")
    .replaceAll('\\', '\\\\');
