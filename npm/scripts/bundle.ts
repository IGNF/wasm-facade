/**
 * The prebuilt extractors put in the package before it is published: each platform's binary at
 * `npm/bin/<os>-<cpu>/wasm-facade[.exe]`, where the CLI looks for its own (src/extractor.ts). Run by the release
 * (.github/workflows/release.yml) once the binaries are built:
 *
 *   bun npm/scripts/bundle.ts <binaries folder>
 *
 * The binaries folder holds `<rust target>/wasm-facade[.exe]`.
 */
import { chmodSync, copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

/** The platforms built, as Node names them, and their Rust target */
export const PLATFORMS = [
  { os: 'darwin', cpu: 'arm64', rust: 'aarch64-apple-darwin' },
  { os: 'darwin', cpu: 'x64', rust: 'x86_64-apple-darwin' },
  { os: 'linux', cpu: 'arm64', rust: 'aarch64-unknown-linux-musl' },
  { os: 'linux', cpu: 'x64', rust: 'x86_64-unknown-linux-musl' },
  { os: 'win32', cpu: 'x64', rust: 'x86_64-pc-windows-msvc' },
];

const [binaries] = process.argv.slice(2);

if (!binaries) {
  console.error('usage: bundle.ts <binaries folder>');
  process.exit(2);
}

const bin = join(import.meta.dirname, '..', 'bin');

rmSync(bin, { recursive: true, force: true });
for (const { os, cpu, rust } of PLATFORMS) {
  const exe = os === 'win32' ? 'wasm-facade.exe' : 'wasm-facade';
  const binary = join(binaries, rust, exe);
  const dir = join(bin, `${os}-${cpu}`);

  if (!existsSync(binary)) throw new Error(`no binary for ${rust}: ${binary}`);
  mkdirSync(dir, { recursive: true });
  copyFileSync(binary, join(dir, exe));
  chmodSync(join(dir, exe), 0o755);
}
console.log(`${PLATFORMS.length} prebuilt extractors in npm/bin`);
