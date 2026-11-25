# wasm-facade

A Rust library's public API declared once, with inert attributes, and written as every binding its users need: an
idiomatic TypeScript facade over its wasm-bindgen exports, React hooks, a web component's attributes, React Native's
names, a Python API, their references, and any binding a plugin adds.

```sh
npm install -D wasm-facade
```

```toml
# wasm-facade.toml, at the repository's root
wasm = "../pkg/my_crate.js"

[targets.typescript]
[targets.react]
[targets.python]
```

```sh
npx wasm-facade generate          # the API extracted from the Rust, every target written
npx wasm-facade generate --watch  # again on each change
npx wasm-facade check             # in CI: fails on any drift
```

Runs on Node 20+ and Bun. The Rust extractor of the package's version comes with it, prebuilt for macOS, Linux and
Windows: nothing to compile (it reads the workspace with `cargo metadata`); `generate --no-extract` needs no Rust at
all, reading the committed `api.json`.

Documentation, the attribute's keys, the configuration and the plugin API: <https://github.com/IGNF/wasm-facade#readme>.
Site, with a live demo: <https://ignf.github.io/wasm-facade/>.
