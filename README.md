# wasm-facade

A public API declared **once, in Rust**, written as everything a JavaScript user needs: an idiomatic TypeScript facade
over the crate's wasm-bindgen exports, React hooks, a Markdown reference, and any other binding a plugin adds (isard,
its first user, adds a Python widget, React Native and a web component). Change the Rust, run `wasm-facade generate`, and
every binding follows; `wasm-facade check` in CI fails on any drift.


Site, with a live demo: <https://ignf.github.io/wasm-facade/>

## Why: orval, for Rust and wasm

[orval](https://orval.dev) reads an OpenAPI document and writes a typed client and TanStack Query hooks: the server's
contract is written once and the client never drifts. wasm-facade does the same for a library compiled to WebAssembly:

| | orval | wasm-facade |
| --- | --- | --- |
| Source of truth | `openapi.json` | the Rust crate, annotated |
| Intermediate | the OpenAPI document | `api.json` (`data/api.schema.json`, versioned) |
| Generated | typed client, React Query hooks, mocks | TypeScript facade over wasm-bindgen, React hooks, reference, plugins |
| Transport | HTTP | wasm-bindgen's exports, typed arrays passed as they are |

wasm-bindgen already writes `.d.ts` for what it exports. That surface is the engine's, not the user's: numeric enums,
positional arguments, `Function`, `free()` to remember. wasm-facade writes the layer on top that a user calls (unions of
strings, options objects with defaults, `on(event, listener)`, promises, converters from the user's types) without
anyone maintaining it by hand.

## Install

```sh
npm install -D wasm-facade@0.1.0   # `npx wasm-facade generate` (or bun, pnpm, yarn)
```

The generator runs on Node 20+ and on Bun. The package brings the extractor of its own version: prebuilt for macOS,
Linux (x64, arm64) and Windows (x64) as an optional dependency (`wasm-facade-<os>-<cpu>`), else installed once by
`cargo install wasm-facade --version <its version>` in `~/.cache/wasm-facade` (`WASM_FACADE_CACHE`) and reused. Nothing
else to install, here or in CI.

## What a repository does

1. **Declare** the public API in Rust with an inert attribute, `#[cfg_attr(wasm_facade, api(…))]`. `wasm_facade` is a cfg
   never set: nothing is compiled, no proc-macro, no dependency, no build time. Tell rustc the cfg is known:

   ```toml
   [lints.rust]
   unexpected_cfgs = { level = "warn", check-cfg = ["cfg(wasm_facade)"] }
   ```

2. **Add `wasm-facade.toml`** at the repository's root. An empty file works; a conventional one:

   ```toml
   wasm = "../pkg/my_crate.js"       # the wasm-bindgen module, as the facade imports it
   converters = "src/converters.ts"  # the project's converters, if any

   [targets.typescript]              # out = "src/api.ts"
   [targets.react]                   # out = "src/hooks.ts", facade = "src/api.ts"
   [targets.reference]               # out = "docs/api.md", title = "API"
   ```

3. **Register converters** (optional): a module whose named exports take what the facade's user gives and return
   what the wasm module takes (`pixels(image: ImageData): Uint8Array`). A declaration names one by its name.

4. **Run** `wasm-facade generate` in the build (below), or after changing the declarations and `wasm-facade check` in
   the lint and CI when the outputs are committed.

## Generated on build

`api.json` is the contract: committed, its diff shows an API change in review. What is generated from it need not be:

```gitignore
src/*.api.ts
```

```json
{
  "scripts": {
    "postinstall": "wasm-facade generate --no-extract",
    "build": "wasm-facade generate && tsc",
    "dev": "wasm-facade generate --watch"
  }
}
```

- `generate` is incremental: when the API, `wasm-facade.toml`, the plugins (and the local modules they import), its
  `inputs` and wasm-facade's version are those of its last run, and the files it wrote are still as written, it writes
  nothing and runs no formatter. Its stamp is kept in `cache` (`node_modules/.cache/wasm-facade`).
- `--no-extract` reads the committed `api.json` as it is, without the extractor: after an install, the editor sees
  the types without Rust being built.
- `--watch` generates again whenever a Rust file, the configuration or a plugin changes.
- `--force` runs every target though nothing changed.

`check` is then needed only by a repository that commits its outputs, and in CI after the build, where it fails if
the committed `api.json` is not what the Rust declares.

The declarations may live in any member of the Cargo workspace: every member is read (or `[extract] members`), so
moving code between crates or folders changes nothing generated.

## The attribute

`#[cfg_attr(wasm_facade, api(key = "text", key = 3, flag))]` on a struct, an enum, an exported `pub fn` or an exported
`impl` block (and on their fields and methods). Keys are free: the generic patterns read those below, a project's
own patterns read theirs.

| Rust | Keys | TypeScript |
| --- | --- | --- |
| `#[wasm_bindgen] enum Edge { Clamp, Wrap }` | `union` (`rename_all = "none"` keeps the names) | `type Edge = 'clamp' \| 'wrap'`, mapped to the wasm enum |
| `struct BlurOptions { radius: f64 }` | `options`; on a field `default = "2"` (a TypeScript literal) | `interface BlurOptions`, `BlurOptionsInit`, `defaultBlurOptions` |
| `#[wasm_bindgen] pub fn histogram(…)` | `function` | `histogram(…)` |
| `#[wasm_bindgen] impl Blur { … }` | `class`, `options = "BlurOptions"` | `class Blur`: `new Blur({ radius })` (the constructor's parameters taken from the options by name), its methods, `free()` |
| `#[wasm_bindgen(getter)]` / `(setter)` | (wasm-bindgen's) | `get radius()` / `set radius(v)` |
| `pub async fn` | | returns `Promise<…>` |
| a `js_sys::Function` parameter | `callback = "(row: number) => boolean"` | that parameter typed so |
| a method taking a listener | `event = "progress"`, `payload = "number"` | `on('progress', listener)`, returning what stops it |
| a parameter given through a converter | `convert = "image=pixels, …"` | the parameter typed as the converter's parameter |
| a result through a converter | `result = "toImage"` | typed as the converter's result |

Names: `snake_case` becomes `camelCase`; exported names are wasm-bindgen's `js_name`. A class's documentation is its
`impl` block's doc comment; every doc comment becomes TSDoc and reference text. Types: numbers, `bool`, `String`,
slices and `Vec`s of numbers (typed arrays), `Option`, `Result<_, JsValue>`, the declared enums, and the project's
own types in `[types]`.

## wasm-facade.toml

| Key | Default | |
| --- | --- | --- |
| `extractor` | the package's own | the command running the extractor, to override it (`["cargo", "run", "-q", "-p", "wasm-facade", "--"]` from sources) |
| `api` | `wasm-facade/api.json` | where the API is written (`[extract] out` wins) |
| `wasm` | `./pkg/index.js` | the wasm-bindgen module, as the facade imports it |
| `converters` | none | the converters' module, from the root |
| `[extract]` `cfg`, `attribute` | `wasm_facade`, `api` | the attribute's names |
| `[extract]` `exported`, `call_keys` | none, `["call"]` | the classes whose exported methods declarations may name as calls, and the keys naming them (resolved and checked: a call missing or exported twice is an error) |
| `[extract]` `export_attribute`, `export_name` | `wasm_bindgen`, `js_name` | how an export is recognized and named |
| `[extract]` `members` | `"all"` | the members read, their folders |
| `[types]` | | the project's Rust types in TypeScript (`Rgba = "[number, number, number, number]"`) |
| `inputs` | none | files the plugins read besides their modules, in `generate`'s stamp |
| `cache` | `node_modules/.cache/wasm-facade` | where `generate` keeps its stamp |
| `[format]` | none | a formatter per extension, the text on its stdin (`".ts" = ["biome", "format", "--stdin-file-path={name}"]`) |
| `[targets.<name>]` | | a target to run: built in (`typescript`, `react`, `reference`) or `plugin = "path.ts"`; `enabled = false` turns one off; the other keys are its options |

## Plugins

A target is a module whose default export is a `Target`:

```ts
import { classes, type Target } from 'wasm-facade';

const target: Target = {
  name: 'my-binding',
  outputs: ({ api, config, options }) => [
    { path: 'src/names.api.ts', text: classes(api).map((c) => `export const ${c.name}Name = '${c.name}';`).join('\n') },
  ],
  command: (context, check) => ({ run: ['my-script', ...(check ? ['--check'] : [])] }), // optional, after the writes
};

export default target;
```

A plugin may be written in TypeScript: Bun and Node 23.6+ load it as it is; on Node 20 to 23.5, run the CLI with
`node --experimental-strip-types` (22.6+) or through a loader (`npx tsx node_modules/wasm-facade/dist/cli.js generate`),
or write the plugin in JavaScript.

`outputs` returns whole files. A target reads the API through the patterns (`classes`, `functions`, `options`,
`unions`, `converters` from `wasm-facade`) or its own; no target imports another. The file it reads, `api.json`, is
described by `data/api.schema.json`.

### Generated beside hand-written code: whole files

A generated file is never edited, so a repository can leave it out of git (`*.api.ts` in `.gitignore`) and a reader
knows which lines are whose. Where generated code meets hand-written code, the hand-written side extends it:

- **Class members**: the generated methods go in a base class the hand-written class extends. In TypeScript an
  abstract class, declaring the protected members its methods need; in Python a mixin.

  ```ts
  // map.api.ts, generated
  export abstract class MapApi {
    protected abstract readonly engine: Engine;
    protected abstract requestRender(): void;
    /** The map's lowest zoom */
    setMinZoom(zoom: number): this { this.engine.set_min_zoom(zoom); this.requestRender(); return this; }
  }

  // map.ts, by hand
  export class Map extends MapApi { protected readonly engine = new Engine(); protected requestRender() { … } }
  ```

- **Option fields**: the generated fields go in an interface the hand-written one extends
  (`interface MapOptions extends MapSettings { container: HTMLElement }`).
- **Table entries**: the generated entries are exported constants the hand-written table spreads
  (`{ ...LIVE_SETTINGS, container: … }`, `[...SETTING_ATTRIBUTES, 'src']`).

A region of a hand-written file is still supported, for a file that cannot be split: an output with `region: 'name'`
replaces the lines between `// <api:name>` and `// </api:name>` (`#` in Python). Such a file mixes both and stays in
git.

## The example

`examples/filters` is a repository of its own using wasm-facade: an image-filters crate (`filters/src/lib.rs`, every
pattern above), its `wasm-facade.toml`, its converters, and what wasm-facade writes from them: `src/api.ts` (the facade),
`src/hooks.ts` (`useBlur`, `useBlurEvent`), `docs/api.md`. `pkg/filters.d.ts` stands in for wasm-bindgen's output
so that the facade is type-checked without building the wasm module.

## Name

`wasm-facade`: what it writes is the facade over a wasm-bindgen module. Free on crates.io and npm on 2026-11-25
(`apigen`, the working name, is taken on both).

## Licence

MIT, see `LICENSE`.
