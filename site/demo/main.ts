/** The demo: the example crate called only through the facade wasm-facade generated (`examples/filters/src/api.ts`) */

import init from '../../examples/filters/pkg/filters.js';
import { Blur, type Edge, histogram } from '../../examples/filters/src/api.ts';
import { copyImage, drawTestImage } from '../image.ts';

const element = <T extends HTMLElement>(id: string): T => {
  const found = document.getElementById(id);

  if (!found) throw new Error(`demo: no #${id}`);

  return found as T;
};

const canvas = element<HTMLCanvasElement>('image');
const context = canvas.getContext('2d', { willReadFrequently: true });
const bars = element<HTMLCanvasElement>('histogram').getContext('2d');
const radius = element<HTMLInputElement>('radius');
const edges = element('edge');
let edge: Edge = 'clamp';
const progress = element<HTMLProgressElement>('progress');

if (!context || !bars) throw new Error('demo: no 2D canvas');

const drawHistogram = (counts: Uint32Array) => {
  const { width, height } = bars.canvas;
  const top = Math.max(...counts);

  bars.clearRect(0, 0, width, height);
  bars.fillStyle = getComputedStyle(document.body).getPropertyValue('--gen');
  counts.forEach((count, i) => {
    const h = (count / top) * height;
    bars.fillRect(i, height - h, 1, h);
  });
};

const files = JSON.parse(element('files').textContent ?? '{}') as Record<string, string>;
const show = (file: string) => {
  document.querySelectorAll<HTMLButtonElement>('.tabs button').forEach((tab) => {
    tab.setAttribute('aria-selected', String(tab.dataset.file === file));
  });
  element('source').textContent = files[file] ?? '';
};

document.querySelectorAll<HTMLButtonElement>('.tabs button').forEach((tab) => {
  tab.addEventListener('click', () => show(tab.dataset.file ?? 'rust'));
});
show('rust');

await init({ module_or_path: new URL('filters_bg.wasm', import.meta.url) });

const original = drawTestImage(context);

const run = () => {
  const options = { radius: Number(radius.value), edge };
  const blur = new Blur(options);
  const image = copyImage(original);
  const stop = blur.on('progress', (share) => {
    progress.value = share;
  });
  const start = performance.now();

  blur.apply(image, image.width, image.height);

  const ms = performance.now() - start;

  stop();
  blur.free();
  context.putImageData(image, 0, 0);
  drawHistogram(histogram(image));
  element('radius-value').textContent = `${radius.value} px`;
  element('timing').textContent = `${image.width} × ${image.height} px blurred in ${ms.toFixed(1)} ms`;
  element('call').textContent = [
    `const blur = new Blur({ radius: ${options.radius}, edge: '${options.edge}' });`,
    `blur.on('progress', (share) => (progress.value = share));`,
    'blur.apply(imageData, imageData.width, imageData.height);',
    'const counts = histogram(imageData);',
    'blur.free();',
  ].join('\n');
};

radius.addEventListener('input', run);
edges.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
  button.addEventListener('click', () => {
    edge = button.dataset.edge as Edge;
    edges.querySelectorAll('button').forEach((other) => {
      other.setAttribute('aria-pressed', String(other === button));
    });
    run();
  });
});
run();
