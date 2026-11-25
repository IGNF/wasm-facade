# apigen

*Working name: `apigen` is taken on crates.io and npm; see "Name" below.*

A public API declared **once, in Rust**, written as everything a JavaScript user needs: an idiomatic TypeScript facade
over the crate's wasm-bindgen exports, React hooks, a Markdown reference, and any other binding a plugin adds (isard,
its first user, adds a Python widget, React Native and a web component). Change the Rust, run `apigen generate`, and
every binding follows; `apigen check` in CI fails on any drift.

## Why: orval, for Rust and wasm

[orval](https://orval.dev) reads an OpenAPI document and writes a typed client and TanStack Query hooks: the server's
contract is written once and the client never drifts. apigen does the same for a library compiled to WebAssembly:

| | orval | apigen |
| --- | --- | --- |
| Source of truth | `openapi.json` | the Rust crate, annotated |
| Intermediate | the OpenAPI document | `api.json` (`data/api.schema.json`, versioned) |
| Generated | typed client, React Query hooks, mocks | TypeScript facade over wasm-bindgen, React hooks, reference, plugins |
| Transport | HTTP | wasm-bindgen's exports, typed arrays passed as they are |

wasm-bindgen already writes `.d.ts` for what it exports. That surface is the engine's, not the user's: numeric enums,
positional arguments, `Function`, `free()` to remember. apigen writes the layer on top that a user calls (unions of
strings, options objects with defaults, `on(event, listener)`, promises, converters from the user's types) without
anyone maintaining it by hand.

## Install

Not published yet. From this repository:

```sh
cargo install --path .        # the extractor: `apigen extract`
cd npm && bun install         # the generator: `bun src/cli.ts generate`
```

Once published: `cargo install <name>` and `npm install -D <name>` (then `npx <name> generate`).

## What a repository does

1. **Declare** the public API in Rust with an inert attribute, `#[cfg_attr(apigen, api(…))]`. `apigen` is a cfg
   never set: nothing is compiled, no proc-macro, no dependency, no build time. Tell rustc the cfg is known:

   ```toml
   [lints.rust]
   unexpected_cfgs = { level = "warn", check-cfg = ["cfg(apigen)"] }
   ```

2. **Add `apigen.toml`** at the repository's root. An empty file works; a conventional one:

   ```toml
   wasm = "../pkg/my_crate.js"       # the wasm-bindgen module, as the facade imports it
   converters = "src/converters.ts"  # the project's converters, if any

   [targets.typescript]              # out = "src/api.ts"
   [targets.react]                   # out = "src/hooks.ts", facade = "src/api.ts"
   [targets.reference]               # out = "docs/api.md", title = "API"
   ```

3. **Register converters** (optional): a module whose named exports take what the facade's user gives and return
   what the wasm module takes (`pixels(image: ImageData): Uint8Array`). A declaration names one by its name.

4. **Run** `apigen generate` after changing the declarations; `apigen check` in the lint and CI.

The declarations may live in any member of the Cargo workspace: every member is read (or `[extract] members`), so
moving code between crates or folders changes nothing generated.

## The attribute

`#[cfg_attr(apigen, api(key = "text", key = 3, flag))]` on a struct, an enum, an exported `pub fn` or an exported
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

## apigen.toml

| Key | Default | |
| --- | --- | --- |
| `extractor` | `["apigen"]` | the command running the extractor (`["cargo", "run", "-q", "-p", "apigen", "--"]` from sources) |
| `api` | `apigen/api.json` | where the API is written (`[extract] out` wins) |
| `wasm` | `./pkg/index.js` | the wasm-bindgen module, as the facade imports it |
| `converters` | none | the converters' module, from the root |
| `[extract]` `cfg`, `attribute` | `apigen`, `api` | the attribute's names |
| `[extract]` `exported`, `call_keys` | none, `["call"]` | the classes whose exported methods declarations may name as calls, and the keys naming them (resolved and checked: a call missing or exported twice is an error) |
| `[extract]` `export_attribute`, `export_name` | `wasm_bindgen`, `js_name` | how an export is recognized and named |
| `[extract]` `members` | `"all"` | the members read, their folders |
| `[types]` | | the project's Rust types in TypeScript (`Rgba = "[number, number, number, number]"`) |
| `[format]` | none | a formatter per extension, the text on its stdin (`".ts" = ["biome", "format", "--stdin-file-path={name}"]`) |
| `[targets.<name>]` | | a target to run: built in (`typescript`, `react`, `reference`) or `plugin = "path.ts"`; `enabled = false` turns one off; the other keys are its options |

## Plugins

A target is a module whose default export is a `Target`:

```ts
import { classes, type Target } from 'apigen';

const target: Target = {
  name: 'my-binding',
  outputs: ({ api, config, options }) => [
    { path: 'src/generated.ts', text: classes(api).map((c) => `export const ${c.name}Name = '${c.name}';`).join('\n') },
    { path: 'src/hand-written.ts', region: 'names', text: '…' }, // between `// <api:names>` and `// </api:names>`
  ],
  command: (context, check) => ({ run: ['my-script', ...(check ? ['--check'] : [])] }), // optional, after the writes
};

export default target;
```

`outputs` returns whole files or regions of hand-written files (the lines between `// <api:name>` and
`// </api:name>`, `#` in Python). A target reads the API through the patterns (`classes`, `functions`, `options`,
`unions`, `converters` from `apigen`) or its own; no target imports another. The file it reads, `api.json`, is
described by `data/api.schema.json`.

## The example

`examples/filters` is a repository of its own using apigen: an image-filters crate (`filters/src/lib.rs`, every
pattern above), its `apigen.toml`, its converters, and what apigen writes from them: `src/api.ts` (the facade),
`src/hooks.ts` (`useBlur`, `useBlurEvent`), `docs/api.md`. `pkg/filters.d.ts` stands in for wasm-bindgen's output
so that the facade is type-checked without building the wasm module.

## Name

`apigen` is taken on both registries (crates.io: a REST API generator, 0.3.1, 2024; npm: a promise wrapper,
0.6.5, 2017). Free on both on 2026-11-24: `wasm-facade`, `wasmfacade`, `rustfacade`, `rsfacade`, `tsfacade`,
`facadegen`, `wasm-api-gen`, `wasm-surface`, `bindfront`.

## Licence

MIT, see `LICENSE`.
