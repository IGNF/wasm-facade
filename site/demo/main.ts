/** The demo: the example crate called only through the facade wasm-facade generated (`examples/filters/src/api.ts`) */

import init from '../../examples/filters/pkg/filters.js';
import { Blur, type Edge, histogram } from '../../examples/filters/src/api.ts';

const element = <T extends HTMLElement>(id: string): T => {
  const found = document.getElementById(id);

  if (!found) throw new Error(`demo: no #${id}`);

  return found as T;
};

const canvas = element<HTMLCanvasElement>('image');
const context = canvas.getContext('2d', { willReadFrequently: true });
const bars = element<HTMLCanvasElement>('histogram').getContext('2d');
const radius = element<HTMLInputElement>('radius');
const edge = element<HTMLSelectElement>('edge');
const progress = element<HTMLProgressElement>('progress');

if (!context || !bars) throw new Error('demo: no 2D canvas');

/** The test image: stripes and discs near the edges, where clamp and wrap differ */
const source = (): ImageData => {
  const { width, height } = canvas;
  const gradient = context.createLinearGradient(0, 0, width, height);

  gradient.addColorStop(0, '#1d3557');
  gradient.addColorStop(1, '#e76f51');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  Array.from({ length: 14 }, (_, i) => i).forEach((i) => {
    context.fillStyle = i % 2 ? '#f1faee' : '#264653';
    context.fillRect(i * 40, 0, 20, 60);
  });
  [
    [40, 300, '#ffb703'],
    [520, 300, '#8ecae6'],
    [280, 190, '#f1faee'],
  ].forEach(([x, y, color]) => {
    context.fillStyle = color as string;
    context.beginPath();
    context.arc(x as number, y as number, 56, 0, Math.PI * 2);
    context.fill();
  });
  context.fillStyle = '#111';
  context.font = '600 44px ui-monospace, Menlo, monospace';
  context.fillText('wasm-facade', 140, 205);

  return context.getImageData(0, 0, width, height);
};

const drawHistogram = (counts: Uint32Array) => {
  const { width, height } = bars.canvas;
  const top = Math.max(...counts);

  bars.clearRect(0, 0, width, height);
  bars.fillStyle = getComputedStyle(document.body).getPropertyValue('--accent');
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

const original = source();

const run = () => {
  const options = { radius: Number(radius.value), edge: edge.value as Edge };
  const blur = new Blur(options);
  const image = new ImageData(new Uint8ClampedArray(original.data), original.width, original.height);
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
  element('radius-value').textContent = radius.value;
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
edge.addEventListener('change', run);
run();
