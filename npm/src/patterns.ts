/**
 * The generic patterns: what the built-in targets read of the API, pure functions any target may import.
 *
 * - union: an enum with `api(union)`, its variants as strings (lowercase, or as named with `rename_all = "none"`)
 * - options: a struct with `api(options)`, its fields with their `default` (a TypeScript literal); an `Option` field
 *   without default is optional
 * - function: an exported `pub fn` with `api(function)`
 * - class: an exported `impl` block with `api(class)` (and `options = "<struct>"`: its constructor's parameters taken
 *   from those options by name): its constructor, getters and setters (wasm-bindgen's flags), methods (async ones
 *   returning a promise), events (a method with `event = "<name>"` and `payload = "<TypeScript type>"`, taking the
 *   listener), callbacks (a `js_sys::Function` parameter typed by `callback = "<TypeScript type>"`)
 * - converters: a function's or a method's `convert = "<param>=<converter>, …"` passes that parameter through the
 *   project's converter (its type the converter's parameter's), `result = "<converter>"` its result
 */
import { type Api, camel, type Declared, type Signature, text, upperFirst } from './model.ts';

export interface Union {
  name: string;
  doc: string;
  /** Each value as TypeScript writes it and the Rust variant it is */
  values: { value: string; variant: string; doc: string }[];
}

export interface OptionField {
  name: string;
  rust: string;
  doc: string;
  default: string | undefined;
}

export interface Options {
  name: string;
  doc: string;
  fields: OptionField[];
}

export interface Event {
  name: string;
  method: Signature;
  payload: string;
}

export interface Class {
  name: string;
  doc: string;
  options: Options | undefined;
  ctor: Signature | undefined;
  /** Properties: a getter, and its setter where there is one */
  properties: { name: string; getter: Signature; setter: Signature | undefined }[];
  methods: Signature[];
  events: Event[];
}

const by = (api: Api, kind: Declared['kind'], key: string): Declared[] =>
  api.items.filter((item) => item.kind === kind && item.api[key]);

export const unions = (api: Api): Union[] =>
  by(api, 'enum', 'union').map((e) => {
    const value = (name: string) => (e.api.rename_all === 'none' ? name : name.toLowerCase());

    return {
      name: e.name,
      doc: e.doc,
      values: (e.variants ?? []).map((v) => ({ value: value(v.name), variant: v.name, doc: v.doc })),
    };
  });

export const options = (api: Api): Options[] =>
  by(api, 'struct', 'options').map((s) => ({
    name: s.name,
    doc: s.doc,
    fields: (s.fields ?? []).map((f) => ({
      name: camel(f.name),
      rust: f.type,
      doc: f.doc,
      default: text(f.api.default),
    })),
  }));

export const functions = (api: Api): Declared[] => by(api, 'function', 'function');

/** A property's name: its getter's, or its setter's without `set_` */
const propertyName = (sig: Signature): string => camel(sig.name.replace(/^set_/, ''));

export const classes = (api: Api): Class[] =>
  by(api, 'class', 'class').map((c) => {
    const methods = c.methods ?? [];
    const has = (sig: Signature, flag: string) => sig.flags.includes(flag);
    const setters = methods.filter((m) => has(m, 'setter'));
    const optionsName = text(c.api.options);

    return {
      name: c.name,
      doc: c.doc,
      options: optionsName ? options(api).find((o) => o.name === optionsName) : undefined,
      ctor: methods.find((m) => has(m, 'constructor')),
      properties: methods
        .filter((m) => has(m, 'getter'))
        .map((getter) => ({
          name: propertyName(getter),
          getter,
          setter: setters.find((s) => propertyName(s) === propertyName(getter)),
        })),
      methods: methods.filter((m) => !has(m, 'constructor') && !has(m, 'getter') && !has(m, 'setter') && !m.api.event),
      events: methods
        .filter((m) => text(m.api.event))
        .map((m) => ({ name: text(m.api.event) ?? '', method: m, payload: text(m.api.payload) ?? 'unknown' })),
    };
  });

/** A function's or a method's converters: parameter → converter (`convert = "pixels=imageData, …"`) */
export const converters = (sig: { api: Declared['api'] }): Record<string, string> =>
  Object.fromEntries(
    (text(sig.api.convert) ?? '')
      .split(',')
      .map((pair) => pair.split('=').map((s) => s.trim()))
      .filter((pair): pair is [string, string] => pair.length === 2 && pair[0] !== '' && pair[1] !== ''),
  );

/** The name of an events map of a class: `BlurEvents` */
export const eventsName = (c: Class): string => `${upperFirst(c.name)}Events`;
