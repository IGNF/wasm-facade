# Publishing: what is left

Nothing of this repository has been built or tested since it left isard (2026-11-24: the machine had to stay
quiet). Its sources passed every suite inside isard (branch `api-gen-proto`, commit `8a43240b`); the first thing to
do is to run them here.

## 1. Verify here (needs a build)

- [ ] `cargo test` (the extractor's unit tests, `tests/example.rs` against `examples/filters`: its path changed)
- [ ] `cargo clippy --all-targets -- -D warnings`, `cargo fmt --check` (lints now in `Cargo.toml`, no workspace)
- [ ] `bun install` (writes `bun.lock`; commit it: CI uses `--frozen-lockfile`)
- [ ] `bun run lint` (biome settings copied from isard: the example's output was formatted with the same)
- [ ] `bun run typecheck` (`npm/tsconfig.json` no longer extends isard's base, and resolves `react` from
      `node_modules`)
- [ ] `bun run test` (the core's tests; the example's paths changed)
- [ ] `bun run example:check` (the extractor now `cargo run --manifest-path ../../Cargo.toml`: the root package)
- [ ] `npm run build --workspace npm` once the Bun-only APIs are gone (below), then `node npm/dist/cli.js check` in
      `examples/filters`

## 2. Name

`wasm-facade`, chosen on 2026-11-25 (free on crates.io and npm that day; check again just before publishing:
`cargo search wasm-facade`, `npm view wasm-facade`). The working name `apigen` is taken on both.

## 3. Bun-only APIs → Node (done: #4)

| Where | Bun API | Node replacement |
| --- | --- | --- |
| `npm/src/config.ts` (`configOf`) | `Bun.TOML.parse` | `smol-toml` (`parse`), a small dependency |
| `npm/src/output.ts` (`formatted`) | `` $`${run} < ${text}` `` | `node:child_process` `spawnSync(cmd, args, { input: text, cwd })`, its stdout |
| `npm/src/run.ts` (`extract`) | `` $`…`.cwd(root) `` | `execFileSync(extractor[0], [...rest, 'extract', …], { cwd, stdio: 'inherit' })` |
| `npm/src/run.ts` (commands) | `` $`…`.nothrow().quiet() `` | `spawnSync(…, { cwd })`, its status and stderr |
| `npm/src/run.ts` (`targetsOf`) | `await import(<plugin>.ts)` | Node ≥ 23.6 strips types itself; Node 20–22: `tsx` or a compiled plugin (`.js`) |
| `npm/src/cli.ts` | `#!/usr/bin/env bun` | `#!/usr/bin/env node` (the built `dist/cli.js`) |
| `npm/test/*.ts` | `bun:test`, `$`, `import.meta.dir` | stay on Bun (tests are not published) |

The core's own imports end in `.ts`: the build (`tsconfig.build.json`) rewrites them (`rewriteRelativeImportExtensions`).

## 4. Package metadata

- [x] `repository` and `homepage` in `Cargo.toml` and `npm/package.json` (github.com/IGNF/wasm-facade)
- [ ] `LICENSE` copied into `npm/` at build (npm's `files` lists it)
- [x] the extractor's binary for users without Rust (#3): prebuilt per platform by `.github/workflows/release.yml`
      on a tag (npm packages `wasm-facade-<os>-<cpu>`, the main package's optional dependencies, written by
      `npm/scripts/platforms.ts`), `cargo install` into a cache otherwise. From 0.2: `cargo publish` first, then push
      the tag `v<version>`; the workflow publishes the npm packages (secret `NPM_TOKEN`)
- [ ] a version policy: the npm package and the crate share their version; `schema` moves only on a breaking change
      of `api.json`
- [ ] docs: the README is the documentation for 0.1; a site later

## 5. Publish

- [ ] `cargo publish --dry-run`, then `cargo publish`
- [ ] `npm publish --dry-run` in `npm/` (after `npm run build`), then `npm publish`
- [ ] tag `v0.1.0`
