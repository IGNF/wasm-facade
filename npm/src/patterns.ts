/**
 * The generic patterns: what the built-in targets read of the API, pure functions any target may import.
 *
 * - union: an enum with `api(union)`, its variants as strings (lowercase, or as named with `rename_all = "none"`)
 * - options: a struct with `api(options)`, its fields with their `default` (a TypeScript literal); an `Option` field
 *   without default is optional
 * - function: an exported `pub fn` with `api(function)`
 * - class: an exported `impl` block with `api(class)` (and `options = "<struct>"`: its constructor's parameters taken
 *   from those options by name, the options kept by the facade, each a property read from that copy): its
 *   constructor, getters and setters (wasm-bindgen's flags), methods (async ones returning a promise), events (a
 *   method with `event = "<name>"` and `payload = "<TypeScript type>"`, taking the listener), callbacks (a
 *   `js_sys::Function` parameter typed by `callback = "<TypeScript type>"`), properties by key (a method
 *   `(key, name, value)` with `keyed = "<struct>"`: each key's properties held by the facade)
 * - emits: `emits = "<event>"` on an options struct or a field (or a keyed method, a settings struct or field), the
 *   event its setter emits once the value is kept and the call made: `{ <field>: value }` (`{ key, name, value }`)
 * - takes: `takes = "<record>, …"` on a function or a method, the parameters named as a record's fields taken as one
 *   object of that record (a record of typed arrays: its buffers listed, to transfer)
 * - returns: `returns = "<record>"` on a function or a method returning a `JsValue`: that record, checked
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
 * - record: a struct with `api(record)`, a structured value a method returns (or takes): its fields read only, an
 *   `Option` one optional, `ts`/`py` where a type is not Rust's; a tuple struct a tuple, labelled by `label`
 * - events: an enum with `api(events, host = "<class>")`, each variant an event of that host: its name (the variant's
 *   in lowercase, or `name = "…"`), its payload (the variant's one field, none else)
 * - converters: a function's or a method's `convert = "<param>=<converter>, …"` passes that parameter through the
 *   project's converter (its type the converter's parameter's), `result = "<converter>"` its result
 */
import {
  type Api,
  type Call,
  camel,
  type Declared,
  type Field,
  lowerFirst,
  type Signature,
  structOf,
  text,
  upperFirst,
} from './model.ts';

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

/** An option of a class kept by its facade: read from the copy kept, never from the wasm module */
export interface KeptProperty {
  /** Its name in TypeScript, its Rust type, its documentation */
  name: string;
  rust: string;
  doc: string;
  /** The wasm-bindgen setter changing it, if any (read only else) */
  setter: Signature | undefined;
  /** The event its setter emits, `{ <name>: value }` (`emits` on the field or its struct), if any */
  emits: string | undefined;
}

/** Properties by key held by the facade (`setPaintProperty(key, name, value)`, `getPaintProperty(key, name)`) */
export interface Keyed {
  /** The struct of the properties each key holds, and whether it gives defaults (`options`) */
  struct: string;
  defaults: boolean;
  /** The exported method taking `(key, name, value)`, its getter's name (`getPaintProperty`) */
  method: Signature;
  getter: string;
  /** The key's Rust type */
  key: string;
  /** The event its setter emits, `{ key, name, value }` (`emits` on the method or the struct), if any */
  emits: string | undefined;
}

export interface Class {
  name: string;
  doc: string;
  options: Options | undefined;
  ctor: Signature | undefined;
  /** Properties: a getter, and its setter where there is one */
  properties: { name: string; getter: Signature; setter: Signature | undefined }[];
  /** Its options kept by the facade, each a property read from the copy (those of `options`) */
  kept: KeptProperty[];
  /** Its properties by key (methods with `keyed = "<struct>"`) */
  keyed: Keyed[];
  methods: Signature[];
  events: Event[];
  /** The events its setters emit, by name: their payloads' types are the facade's to write */
  emitted: string[];
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

/** The struct a key names, of the kinds given */
const structNamed = (api: Api, name: string, kinds: string[], by: string): Declared => {
  const found = api.items.find((item) => item.kind === 'struct' && item.name === name);

  if (!found || !kinds.some((kind) => found.api[kind]))
    throw new Error(`wasm-facade: ${by} names ${name}: no struct declared ${kinds.join(' or ')}`);

  return found;
};

/** A method's properties by key: `(key, name, value)`, the struct `keyed` names holding each key's */
const keyedOf = (api: Api, c: Declared, m: Signature): Keyed => {
  const name = text(m.api.keyed) ?? '';
  const struct = structNamed(api, name, ['options', 'record'], `${c.name}.${m.name}'s keyed`);
  const [key, property, value] = m.params;

  if (!key || !property || !value || m.params.length !== 3)
    throw new Error(`wasm-facade: ${c.name}.${m.name} (keyed): its parameters are (key, name, value)`);

  return {
    struct: name,
    defaults: struct.api.options === true,
    method: m,
    getter: camel(m.export).replace(/^set(?=[A-Z])/, 'get'),
    key: key.type,
    emits: text(m.api.emits) ?? text(struct.api.emits),
  };
};

export const classes = (api: Api): Class[] =>
  by(api, 'class', 'class').map((c) => {
    const methods = c.methods ?? [];
    const has = (sig: Signature, flag: string) => sig.flags.includes(flag);
    const setters = methods.filter((m) => has(m, 'setter'));
    const optionsName = text(c.api.options);
    const own = optionsName ? options(api).find((o) => o.name === optionsName) : undefined;
    const struct = own ? structOf(api, own.name) : undefined;
    const kept: KeptProperty[] = (struct?.fields ?? []).map((f) => ({
      name: camel(f.name),
      rust: f.type,
      doc: f.doc,
      setter: setters.find((s) => propertyName(s) === camel(f.name)),
      emits: text(f.api.emits) ?? text(struct?.api.emits),
    }));
    const keyed = methods.filter((m) => text(m.api.keyed)).map((m) => keyedOf(api, c, m));
    const relayed = methods.map((m) => text(m.api.event)).filter((e) => e !== undefined);
    const emitted = [
      ...new Set(
        [...kept.filter((k) => k.setter).map((k) => k.emits), ...keyed.map((k) => k.emits)].filter(
          (e): e is string => e !== undefined,
        ),
      ),
    ];
    const both = emitted.filter((e) => relayed.includes(e));

    if (both.length) throw new Error(`wasm-facade: ${c.name}: ${both.join(', ')} both emitted and a wasm event`);

    return {
      name: c.name,
      doc: c.doc,
      options: own,
      ctor: methods.find((m) => has(m, 'constructor')),
      properties: methods
        .filter((m) => has(m, 'getter'))
        .map((getter) => ({
          name: propertyName(getter),
          getter,
          setter: setters.find((s) => propertyName(s) === propertyName(getter)),
        })),
      kept,
      keyed,
      methods: methods.filter(
        (m) => !has(m, 'constructor') && !has(m, 'getter') && !has(m, 'setter') && !m.api.event && !m.api.keyed,
      ),
      events: methods
        .filter((m) => text(m.api.event))
        .map((m) => ({ name: text(m.api.event) ?? '', method: m, payload: text(m.api.payload) ?? 'unknown' })),
      emitted,
    };
  });

/** The records a function or a method takes in place of its parameters (`takes = "<record>, …"`): each record's
 * fields the parameters of their names, given as one object */
export const taken = (api: Api, sig: { name: string; api: Declared['api']; params?: { name: string }[] }) =>
  (text(sig.api.takes) ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name !== '')
    .map((name) => {
      const struct = structNamed(api, name, ['record'], `${sig.name}'s takes`);
      const fields = (struct.fields ?? []).map((f) => f.name);
      const missing = fields.filter((f) => !(sig.params ?? []).some((p) => p.name === f));

      if (missing.length) throw new Error(`wasm-facade: ${sig.name} takes ${name}: no parameter ${missing.join(', ')}`);

      return { record: name, name: lowerFirst(name), fields };
    });

/** The record a function or a method returns, checked (`returns = "<record>"`: a `JsValue` built as one) */
export const returned = (api: Api, sig: { name: string; api: Declared['api'] }): string | undefined => {
  const name = text(sig.api.returns);

  if (name) structNamed(api, name, ['record'], `${sig.name}'s returns`);

  return name;
};

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
  /** The event its setter emits once the call is made, `{ <name>: value }` (`emits` on the field or its struct) */
  emits: string | undefined;
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
        emits: text(field.api.emits) ?? text(s.api.emits),
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

export interface RecordField {
  /** Its name in TypeScript (`minZoom`; a tuple's label, or its position) */
  name: string;
  rust: string;
  ts: string | undefined;
  py: string | undefined;
  doc: string;
  optional: boolean;
}

export interface ApiRecord {
  name: string;
  doc: string;
  /** A tuple struct: a tuple in TypeScript and Python */
  tuple: boolean;
  fields: RecordField[];
}

/** The records declared: the structured values methods return */
export const records = (api: Api): ApiRecord[] =>
  by(api, 'struct', 'record').map((s) => {
    const fields = s.fields ?? [];
    const tuple = fields.length > 0 && fields.every((f) => /^\d+$/.test(f.name));

    return {
      name: s.name,
      doc: s.doc,
      tuple,
      fields: fields.map((f) => ({
        name: tuple ? (text(f.api.label) ?? `_${f.name}`) : camel(f.name),
        rust: f.type,
        ts: text(f.api.ts),
        py: text(f.api.py),
        doc: f.doc,
        optional: /^Option<.*>$/.test(f.type),
      })),
    };
  });

export interface HostEvent {
  /** Its name (`moveend`), the variant declaring it */
  name: string;
  variant: string;
  doc: string;
  /** Its payload's Rust type (none: `undefined`), as written for TypeScript or Python (`ts`, `py` on the variant) */
  payload: string | undefined;
  ts: string | undefined;
  py: string | undefined;
}

export interface HostEvents {
  /** The host whose events they are (`Preview`), their map (`PreviewEvents`), the enum declaring them */
  host: string;
  name: string;
  enum: string;
  doc: string;
  events: HostEvent[];
}

/** The events declared, by host */
export const events = (api: Api): HostEvents[] =>
  by(api, 'enum', 'events').map((e) => {
    const host = text(e.api.host) ?? e.name.replace(/Events?$/, '');

    return {
      host,
      name: `${host}Events`,
      enum: e.name,
      doc: e.doc,
      events: (e.variants ?? []).map((v) => ({
        name: text(v.api?.name) ?? v.name.toLowerCase(),
        variant: v.name,
        doc: v.doc,
        payload: v.fields?.[0]?.type,
        ts: text(v.api?.ts),
        py: text(v.api?.py),
      })),
    };
  });

/** A host's events, if it has some */
export const eventsOf = (api: Api, host: string): HostEvents | undefined => events(api).find((e) => e.host === host);

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
