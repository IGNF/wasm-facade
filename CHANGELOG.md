# Changelog

## [Unreleased]

## [0.1.0] - not released

First version, taken out of isard (its `crates/apigen` and `packages/apigen`, branch `api-gen-proto`, 2026-11-24).

### Added

- The extractor (`apigen extract [--check] [--config <json>]`): the structs, enums, functions and wasm-bindgen `impl`
  blocks carrying `#[cfg_attr(<cfg>, api(…))]` in every member of a Cargo workspace, read with `syn` into
  `api.json` (schema 1, `data/api.schema.json`); calls named by declarations resolved among the exported classes'
  methods, missing or duplicated ones reported with their files.
- The generator (`apigen generate`, `apigen check`): `apigen.toml` with defaults, the generic patterns (unions,
  options with defaults, functions, classes with constructor, properties, async methods, callbacks, events,
  converters), the target interface, and three targets: the TypeScript facade, React hooks, a Markdown reference.
- `examples/filters`: a repository of its own using every pattern.
