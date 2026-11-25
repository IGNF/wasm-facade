/** The overview: the Rust declarations lit up with what each one generates, and the real blur, before and after */

import init from '../examples/filters/pkg/filters.js';
import { Blur } from '../examples/filters/src/api.ts';
import { copyImage, drawTestImage } from './image.ts';

// Each declaration (`data-k`) lights up the lines it generates, on hover, focus or tap
const map = document.querySelector<HTMLElement>('.fanout');
const light = (key: string | null) => {
  if (!map) return;
  map.dataset.lit = key ?? '';
  map.querySelectorAll<HTMLElement>('[data-k]').forEach((part) => {
    part.classList.toggle('lit', key !== null && part.dataset.k === key);
  });
};

map?.querySelectorAll<HTMLElement>('.rust [data-k]').forEach((part) => {
  part.tabIndex = 0;
  part.addEventListener('mouseenter', () => light(part.dataset.k ?? null));
  part.addEventListener('focus', () => light(part.dataset.k ?? null));
  part.addEventListener('click', () => light(part.dataset.k ?? null));
});
map?.addEventListener('mouseleave', () => light(null));

// The wires from the Rust to the middle of each generated file, redrawn when the layout changes
const wires = map?.querySelector<SVGSVGElement>('.wires');
const wire = () => {
  if (!map || !wires) return;

  const box = wires.getBoundingClientRect();
  const from = box.height / 2;

  wires.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
  wires.replaceChildren(
    ...[...map.querySelectorAll<HTMLElement>('.outputs > .pane')].map((pane) => {
      const rect = pane.getBoundingClientRect();
      const to = rect.top + rect.height / 2 - box.top;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const middle = box.width / 2;

      path.setAttribute('d', `M0 ${from} C ${middle} ${from}, ${middle} ${to}, ${box.width} ${to}`);

      return path;
    }),
  );
};

if (map) new ResizeObserver(wire).observe(map);

// The real blur, through the generated facade: the original left of the handle, blurred right of it
const canvas = document.querySelector<HTMLCanvasElement>('#split');
const radius = document.querySelector<HTMLInputElement>('#split-radius');
const handle = document.querySelector<HTMLInputElement>('#split-at');
const context = canvas?.getContext('2d', { willReadFrequently: true });

if (canvas && radius && handle && context) {
  await init({ module_or_path: new URL('demo/filters_bg.wasm', document.baseURI) });

  const original = drawTestImage(context);
  let blurred = original;

  const draw = () => {
    const at = Math.round((Number(handle.value) / 100) * canvas.width);

    context.putImageData(blurred, 0, 0);
    context.putImageData(original, 0, 0, 0, 0, at, canvas.height);
    context.fillStyle = '#fff';
    context.fillRect(at - 1, 0, 2, canvas.height);
  };

  const blur = () => {
    const image = copyImage(original);
    const filter = new Blur({ radius: Number(radius.value), edge: 'clamp' });

    filter.apply(image, image.width, image.height);
    filter.free();
    blurred = image;
    document.querySelector('#split-value')?.replaceChildren(radius.value);
    draw();
  };

  radius.addEventListener('input', blur);
  handle.addEventListener('input', draw);
  blur();
}
