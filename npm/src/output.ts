/** The targets' outputs put in their files: the regions spliced, each file formatted, then written or compared */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import type { Config } from './config.ts';
import { exec } from './process.ts';
import type { Output } from './target.ts';

/** `text` between the marker lines of region `name` (kept), the rest of `file` as it is */
export const region = (file: string, name: string, text: string, comment: '//' | '#'): string => {
  const open = `${comment} <api:${name}>`;
  const close = `${comment} </api:${name}>`;
  const start = file.indexOf(open);
  const end = file.indexOf(close);

  if (start < 0 || end < start) throw new Error(`wasm-facade: no region ${open} … ${close}`);

  const head = file.slice(0, file.indexOf('\n', start) + 1);
  const tail = file.slice(file.lastIndexOf('\n', end));

  return `${head}${text}${tail}`;
};

/** A file's text through the configuration's formatter for its extension (`{name}`: the file's name), as it is else */
const formatted = (config: Config, path: string, text: string): string => {
  const command = config.format[extname(path)];

  if (!command || command.length === 0) return text;

  const run = command.map((part) => part.replaceAll('{name}', basename(path)));
  const out = exec(run, config.root, { input: text });

  if (out.status !== 0)
    throw new Error(`wasm-facade: the formatter of ${path} failed (${run.join(' ')}):\n${out.stderr}`);

  return out.stdout;
};

/** Each file the outputs make, formatted: the paths whose file differs (written unless `check`) */
export const apply = async (config: Config, outputs: Output[], check: boolean): Promise<string[]> => {
  const paths = [...new Set(outputs.map((o) => o.path))];
  const stale: string[] = [];

  for (const path of paths) {
    const own = outputs.filter((o) => o.path === path);
    const full = join(config.root, path);
    const current = existsSync(full) ? readFileSync(full, 'utf8') : '';
    const comment = path.endsWith('.py') ? '#' : '//';
    const whole = own.find((o) => o.region === undefined);
    const text = whole ? whole.text : own.reduce((file, o) => region(file, o.region ?? '', o.text, comment), current);
    const result = formatted(config, path, text);

    if (result === current) continue;
    stale.push(path);
    if (check) continue;
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, result);
  }

  return stale;
};
