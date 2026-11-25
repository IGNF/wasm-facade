# Changelog

## [Unreleased]

## [0.2.0] - 2026-11-25

### Added

- Generated on build (#2): `generate` is incremental (a stamp of its inputs and of the files it wrote, in `cache`:
  nothing written nor formatted when nothing changed), `--no-extract` reads the committed `api.json` without the
  extractor (an install's `postinstall`), `--watch` generates again on a change of the Rust, the configuration or a
  plugin, `--force` runs every target. `inputs` in `wasm-facade.toml` names the files the plugins read. The README
  explains the setup: `api.json` committed, the outputs in `.gitignore`, `generate` in the build.

- The npm package brings the extractor of its own version (#3): a prebuilt binary per platform as an optional
  dependency (`wasm-facade-<os>-<cpu>`, published by the release workflow on a tag), else `cargo install` of the same
  version once in `~/.cache/wasm-facade` (`WASM_FACADE_CACHE`). `extractor` in `wasm-facade.toml` only overrides it.

- A plugin may be a package the repository depends on (`plugin = "wasm-facade-plugin-foo"`), resolved from its root,
  as well as a module of the repository.

- The `settings` pattern (#6): a struct with `api(settings)`, each field a setting of a host class (its setter,
  its getter where kept, where the host keeps it, the exported call applying it, the settings that call takes
  together, its converter and default); `settingCalls` groups them by call. The key naming the call is `call`, or
  the target's own (`settings(api, { callKey: 'engine' })`). Domain patterns (isard's feature layers) stay in their
  project's plugins.

- Four built-in targets (#5): `python` (the Python API: `Literal` unions, `TypedDict` options with their defaults and
  keyword functions, a mixin per class, settings struct and the functions, handing each call by the facade's name to
  the transport of the class inheriting it), `python-reference`, `react-native` (the names a bridge exposes) and
  `web-component` (a custom element's attributes, read as numbers, flags or text). The example writes all of them.
- `generate`'s stamp counts wasm-facade's own modules, not only its version.

### Changed

- The CLI runs on Node 20+ as on Bun (#4): `#!/usr/bin/env node`, TOML read by `smol-toml`, commands run by
  `node:child_process`. Plugins in TypeScript load on Bun and on Node 23.6+ as they are, on older Nodes with type
  stripping or a loader. A formatter that fails is now an error naming the file. The core's tests run on both (CI).
- Whole files are the documented default (#1): the README shows how hand-written code extends what is generated (a
  base class or a mixin, an extended interface, spread constants), regions kept for a file that cannot be split.
- A whole file is written in a folder made for it if missing, and `check` no longer creates the files it compares.

## [0.1.0] - 2026-11-25

First version, taken out of isard (its `crates/apigen` and `packages/apigen`, branch `api-gen-proto`, 2026-11-24).

### Added

- The extractor (`wasm-facade extract [--check] [--config <json>]`): the structs, enums, functions and wasm-bindgen `impl`
  blocks carrying `#[cfg_attr(<cfg>, api(…))]` in every member of a Cargo workspace, read with `syn` into
  `api.json` (schema 1, `data/api.schema.json`); calls named by declarations resolved among the exported classes'
  methods, missing or duplicated ones reported with their files.
- The generator (`wasm-facade generate`, `wasm-facade check`): `wasm-facade.toml` with defaults, the generic patterns (unions,
  options with defaults, functions, classes with constructor, properties, async methods, callbacks, events,
  converters), the target interface, and three targets: the TypeScript facade, React hooks, a Markdown reference.
- `examples/filters`: a repository of its own using every pattern.
