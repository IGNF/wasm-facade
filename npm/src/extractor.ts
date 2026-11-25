/**
 * The extractor of wasm-facade's own version, so that a repository installs nothing but the npm package:
 *
 * 1. `extractor` of wasm-facade.toml, if given (`cargo run …` from wasm-facade's sources);
 * 2. the prebuilt binary of this platform, in the package (`bin/<os>-<cpu>/wasm-facade`, put there by the release);
 * 3. else the crate of the same version installed once by Cargo in a cache shared by the repositories
 *    (`WASM_FACADE_CACHE`, default `~/.cache/wasm-facade`), and reused afterwards.
 */
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Config } from './config.ts';
import { exec } from './process.ts';
import { VERSION } from './version.ts';

const EXE = process.platform === 'win32' ? '.exe' : '';

/** The package's folder of a platform's prebuilt extractor, as Node names it (`darwin-arm64`) */
export const platformDir = (platform: string = process.platform, arch: string = process.arch): string =>
  `${platform}-${arch}`;

// `src/` from the sources, `dist/` once built: the package's root is one folder up from both
const PACKAGE = join(dirname(fileURLToPath(import.meta.url)), '..');

/** This platform's prebuilt extractor, if the package holds one (a published package; not its sources) */
export const prebuilt = (root: string = PACKAGE): string | undefined => {
  const binary = join(root, 'bin', platformDir(), `wasm-facade${EXE}`);

  return existsSync(binary) ? binary : undefined;
};

/** Where Cargo installs the extractor of `version` */
export const cached = (version: string = VERSION): string =>
  join(process.env.WASM_FACADE_CACHE ?? join(homedir(), '.cache', 'wasm-facade'), version);

/** The extractor of this version installed by Cargo in the cache, once */
const installed = (cwd: string): string => {
  const root = cached();
  const binary = join(root, 'bin', `wasm-facade${EXE}`);

  if (existsSync(binary)) return binary;
  console.log(
    `wasm-facade: no prebuilt extractor for ${process.platform}-${process.arch}; cargo install wasm-facade@${VERSION}`,
  );

  const args = ['install', 'wasm-facade', '--version', `=${VERSION}`, '--locked', '--quiet', '--root', root];
  const ran = exec(['cargo', ...args], cwd, { inherit: true });

  if (ran.status !== 0 || !existsSync(binary))
    throw new Error(`wasm-facade: cargo install wasm-facade@${VERSION} failed: install Rust, or set extractor`);

  return binary;
};

/** The command running the extractor */
export const extractorOf = (config: Config): string[] => {
  if (config.extractor) return config.extractor;

  const binary = prebuilt();

  return [binary ?? installed(config.root)];
};
