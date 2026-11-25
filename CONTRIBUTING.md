# Contributing

- **Layout.** The extractor is the Rust crate at the root (`src/`, its tests in `tests/`, the schema in `data/`); the
  generator is the npm package in `npm/`; `examples/filters` is a repository of its own using both.
- **Before a pull request**: `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test`,
  `bun install`, `bun run lint`, `bun run typecheck`, `bun run test`, `bun run test:node`, `bun run example:check`, and in `examples/filters/python` `python3 test_filters.py`
  and `pyright`. CI runs the same.
- **Changing what is generated**: run `bun run example:check` (it fails), then
  `cd examples/filters && bun ../../npm/src/cli.ts generate`, and read the diff of `examples/filters/src` and
  `docs`: it is the change's review.
- **Changing `api.json`**: a change a reader of the current schema cannot read raises `schema` (Rust `SCHEMA`,
  `npm/src/model.ts`, `data/api.schema.json`) and goes in the changelog.
- **A new pattern or target**: a function of the API in `npm/src/patterns.ts`, or a file in `npm/src/targets/`
  importing patterns only (no target imports another), shown in the example and tested in `npm/test`.
- Unit tests at the end of each Rust module; integration tests in `tests/`.
