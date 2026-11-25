/**
 * Where a target's `plugin` is: a module of the repository (`plugin = "scripts/my-target.ts"`, from the root), else a
 * package its root depends on (`plugin = "wasm-facade-plugin-foo"`, or one of its exports: `"@org/plugins/python"`),
 * resolved from the root as Node resolves an import. A plugin is thus written in the repository using it, or published
 * and shared.
 */
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

export const pluginPath = (root: string, plugin: string): string => {
  const local = join(root, plugin);

  if (existsSync(local)) return local;
  try {
    return createRequire(join(root, 'package.json')).resolve(plugin);
  } catch {
    throw new Error(`wasm-facade: the plugin ${plugin}: no such file from the root, nor package installed`);
  }
};
