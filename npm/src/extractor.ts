/**
 * The extractor of wasm-facade's own version, so that a repository installs nothing but the npm package:
 *
 * 1. `extractor` of wasm-facade.toml, if given (`cargo run …` from wasm-facade's sources);
 * 2. the prebuilt binary of this platform, an optional dependency of the package (`wasm-facade-<os>-<cpu>`);
 * 3. else the crate of the same version installed once by Cargo in a cache shared by the repositories
 *    (`WASM_FACADE_CACHE`, default `~/.cache/wasm-facade`), and reused afterwards.
 */
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { Config } from './config.ts';
import { exec } from './process.ts';
import { VERSION } from './version.ts';

const EXE = process.platform === 'win32' ? '.exe' : '';

/** The npm package of this platform's prebuilt extractor */
export const platformPackage = (platform: string = process.platform, arch: string = process.arch): string =>
  `wasm-facade-${platform}-${arch}`;

/** This platform's prebuilt extractor, if its optional dependency is installed */
export const prebuilt = (): string | undefined => {
  try {
    const manifest = createRequire(import.meta.url).resolve(`${platformPackage()}/package.json`);
    const binary = join(dirname(manifest), 'bin', `wasm-facade${EXE}`);

    return existsSync(binary) ? binary : undefined;
  } catch {
    return undefined;
  }
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
