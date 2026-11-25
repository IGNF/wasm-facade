/** The commands wasm-facade runs (the extractor, the formatters, the targets' commands), on Node as on Bun */
import { spawnSync } from 'node:child_process';

export interface Ran {
  status: number;
  stdout: string;
  stderr: string;
}

/** `command` run in `cwd`: `input` on its stdin, its output captured (or shown as it goes with `inherit`) */
export const exec = (command: string[], cwd: string, opts: { input?: string; inherit?: boolean } = {}): Ran => {
  const [program, ...args] = command;

  if (!program) throw new Error('wasm-facade: an empty command');

  const result = spawnSync(program, args, {
    cwd,
    encoding: 'utf8',
    input: opts.input,
    stdio: opts.inherit ? ['ignore', 'inherit', 'inherit'] : 'pipe',
    maxBuffer: 256 * 1024 * 1024,
  });

  if (result.error) throw new Error(`wasm-facade: ${command.join(' ')}: ${result.error.message}`);

  return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
};
