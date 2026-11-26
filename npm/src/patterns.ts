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
 * - settings: a struct with `api(settings)`, each field a setting of a host class: a setter storing the value and
 *   making the exported call that applies it (`call = "<method>"`, the key named by `callKey`), a getter where the
 *   host keeps the value as given (`getter`), where it keeps it (`store`, its name by default), the settings the call
 *   takes together (`spread = "<group>"`: every setting of the group passed at once), the converter of the value
 *   (`convert`), its default (`default`, a TypeScript literal): the option re-applied when the host's options change
 * - host: a trait with `api(host = "<class>")`, usually never compiled (`#[cfg(<cfg>)]`, its attributes then bare
 *   `#[api(…)]`): the methods of a class written by hand, declared once for every binding. A method's name in
 *   TypeScript is its Rust name in camelCase (or `export = "…"`); `animation` makes it return a promise resolved once
 *   the animation ends; a parameter or a result typed in TypeScript or Python only takes `ts = "…"`, `py = "…"`;
 *   trailing `Option` parameters may be left out
 * - converters: a function's or a method's `convert = "<param>=<converter>, …"` passes that parameter through the
 *   project's converter (its type the converter's parameter's), `result = "<converter>"` its result
 */
import { type Api, type Call, camel, type Declared, type Field, type Signature, text, upperFirst } from './model.ts';

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

export interface Setting {
  /** The struct declaring it, and its field */
  struct: string;
  field: Field;
  /** Its name in TypeScript (`maxPitch`), its setter's and getter's (`setMaxPitch`, `getMaxPitch`) */
  name: string;
  setter: string;
  getter: string | undefined;
  /** Where the host keeps it (`maxPitch`, `zoomRange[0]`) */
  store: string;
  /** The exported call applying it, and its signature */
  call: string;
  signature: Call;
  /** The group of settings the call takes together, if any */
  spread: string | undefined;
  /** The converter of the value, its default */
  convert: string | undefined;
  default: string | undefined;
}

/** The settings declared (`api(settings)` structs), each field's call named by `callKey` (default `call`) */
export const settings = (api: Api, { callKey = 'call' }: { callKey?: string } = {}): Setting[] =>
  by(api, 'struct', 'settings').flatMap((s) =>
    (s.fields ?? []).map((field) => {
      const name = camel(field.name);
      const call = text(field.api[callKey]);
      const signature = call ? api.calls[call] : undefined;

      if (!call) throw new Error(`wasm-facade: the setting ${s.name}.${field.name} names no call (${callKey} = "…")`);
      if (!signature) throw new Error(`wasm-facade: the setting ${s.name}.${field.name}: no exported call ${call}`);

      return {
        struct: s.name,
        field,
        name,
        setter: `set${upperFirst(name)}`,
        getter: field.api.getter ? `get${upperFirst(name)}` : undefined,
        store: text(field.api.store) ?? name,
        call,
        signature,
        spread: text(field.api.spread),
        convert: text(field.api.convert),
        default: text(field.api.default),
      };
    }),
  );

/** The settings by their call: those of a `spread` group together, the others alone, in their order */
export const settingCalls = (all: Setting[]): { call: string; spread: string | undefined; settings: Setting[] }[] => {
  const groups: { call: string; spread: string | undefined; settings: Setting[] }[] = [];

  for (const setting of all) {
    const group = setting.spread && groups.find((g) => g.spread === setting.spread && g.call === setting.call);

    if (group) group.settings.push(setting);
    else groups.push({ call: setting.call, spread: setting.spread, settings: [setting] });
  }

  return groups;
};

export interface HostParam {
  name: string;
  rust: string;
  /** Its type as written for TypeScript or Python, where the Rust type is not theirs (`ts`, `py`) */
  ts: string | undefined;
  py: string | undefined;
  /** An `Option` among the last parameters: one the caller may leave out */
  optional: boolean;
}

export interface HostMethod {
  /** Its name in TypeScript (`flyTo`) and in Rust (`fly_to`) */
  name: string;
  rust: string;
  doc: string;
  params: HostParam[];
  /** Its result's Rust type, and as written for TypeScript or Python (`ts`, `py` on the method) */
  returns: string | null;
  ts: string | undefined;
  py: string | undefined;
  async: boolean;
  /** An animation: a promise resolved once it ends */
  animation: boolean;
}

export interface Host {
  /** The hand-written class (`GeoMap`), the trait declaring it (`GeoMapHost`) */
  name: string;
  trait: string;
  doc: string;
  methods: HostMethod[];
}

/** The hosts declared: each hand-written class and the methods declared for it */
export const hosts = (api: Api): Host[] =>
  by(api, 'host', 'host').map((h) => ({
    name: text(h.api.host) ?? h.name.replace(/Host$/, ''),
    trait: h.name,
    doc: h.doc,
    methods: (h.methods ?? []).map((m) => {
      const params = m.params;
      // The parameters the caller may leave out: the trailing `Option`s
      const firstOptional = params.reduceRight(
        (first, p, i) => (first === i + 1 && /^Option<.*>$/.test(p.type) ? i : first),
        params.length,
      );

      return {
        name: text(m.api.export) ?? camel(m.name),
        rust: m.name,
        doc: m.doc,
        params: params.map((p, i) => ({
          name: camel(p.name),
          rust: p.type,
          ts: text(p.api?.ts),
          py: text(p.api?.py),
          optional: i >= firstOptional,
        })),
        returns: m.returns,
        ts: text(m.api.ts),
        py: text(m.api.py),
        async: m.async,
        animation: m.api.animation === true,
      };
    }),
  }));

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
