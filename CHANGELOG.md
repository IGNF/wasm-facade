# Changelog

## [Unreleased]

### Changed

- The CLI runs on Node 20+ as on Bun (#4): `#!/usr/bin/env node`, TOML read by `smol-toml`, commands run by
  `node:child_process`. Plugins in TypeScript load on Bun and on Node 23.6+ as they are, on older Nodes with type
  stripping or a loader. A formatter that fails is now an error naming the file. The core's tests run on both (CI).
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
