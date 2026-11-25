/**
 * The npm packages of the prebuilt extractor, one per platform (`wasm-facade-<os>-<cpu>`, `os` and `cpu` set so that
 * a package manager installs only the user's), and the main package's `optionalDependencies` naming them, all of
 * its version. Run by the release (.github/workflows/release.yml) once the binaries are built:
 *
 *   bun npm/scripts/platforms.ts <binaries folder> <output folder>
 *
 * The binaries folder holds `<rust target>/wasm-facade[.exe]`; each package is written in `<output>/<name>`.
 */
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** The platforms built, as Node names them, and their Rust target */
export const PLATFORMS = [
  { os: 'darwin', cpu: 'arm64', rust: 'aarch64-apple-darwin' },
  { os: 'darwin', cpu: 'x64', rust: 'x86_64-apple-darwin' },
  { os: 'linux', cpu: 'arm64', rust: 'aarch64-unknown-linux-musl' },
  { os: 'linux', cpu: 'x64', rust: 'x86_64-unknown-linux-musl' },
  { os: 'win32', cpu: 'x64', rust: 'x86_64-pc-windows-msvc' },
];

const [binaries, out] = process.argv.slice(2);

if (!binaries || !out) {
  console.error('usage: platforms.ts <binaries folder> <output folder>');
  process.exit(2);
}

const npm = join(import.meta.dirname, '..');
const main = JSON.parse(readFileSync(join(npm, 'package.json'), 'utf8')) as Record<string, unknown> & {
  version: string;
};
const optional: Record<string, string> = {};

for (const { os, cpu, rust } of PLATFORMS) {
  const name = `wasm-facade-${os}-${cpu}`;
  const exe = os === 'win32' ? 'wasm-facade.exe' : 'wasm-facade';
  const binary = join(binaries, rust, exe);
  const dir = join(out, name);

  if (!existsSync(binary)) throw new Error(`no binary for ${rust}: ${binary}`);
  mkdirSync(join(dir, 'bin'), { recursive: true });
  copyFileSync(binary, join(dir, 'bin', exe));
  chmodSync(join(dir, 'bin', exe), 0o755);
  copyFileSync(join(npm, 'LICENSE'), join(dir, 'LICENSE'));
  writeFileSync(
    join(dir, 'package.json'),
    `${JSON.stringify(
      {
        name,
        version: main.version,
        description: `wasm-facade's extractor, prebuilt for ${os}-${cpu}`,
        license: main.license,
        repository: main.repository,
        os: [os],
        cpu: [cpu],
        files: ['bin', 'LICENSE'],
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    join(dir, 'README.md'),
    `# ${name}\n\nThe extractor of [wasm-facade](https://ignf.github.io/wasm-facade/) for ${os}-${cpu}, installed by the \`wasm-facade\` package; not to be installed by itself.\n`,
  );
  optional[name] = main.version;
}

writeFileSync(join(npm, 'package.json'), `${JSON.stringify({ ...main, optionalDependencies: optional }, null, 2)}\n`);
console.log(
  `${Object.keys(optional).length} platform packages in ${out}; optionalDependencies set in npm/package.json`,
);
