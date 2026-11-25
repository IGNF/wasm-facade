/** The test image the demo and the overview blur: stripes and discs near the edges, where clamp and wrap differ */
export const drawTestImage = (context: CanvasRenderingContext2D): ImageData => {
  const { width, height } = context.canvas;
  const gradient = context.createLinearGradient(0, 0, width, height);

  gradient.addColorStop(0, '#1f2a6b');
  gradient.addColorStop(1, '#d97706');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  Array.from({ length: Math.ceil(width / 40) }, (_, i) => i).forEach((i) => {
    context.fillStyle = i % 2 ? '#f5f3ff' : '#1e1b4b';
    context.fillRect(i * 40, 0, 20, height / 6);
  });
  [
    [0.07, 0.83, '#fbbf24'],
    [0.93, 0.83, '#a5b4fc'],
    [0.5, 0.53, '#f5f3ff'],
  ].forEach(([x, y, color]) => {
    context.fillStyle = color as string;
    context.beginPath();
    context.arc((x as number) * width, (y as number) * height, height / 6.4, 0, Math.PI * 2);
    context.fill();
  });
  context.fillStyle = '#0b0a1a';
  context.font = `700 ${Math.round(height / 8)}px "JetBrains Mono", ui-monospace, monospace`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('wasm-facade', width / 2, height * 0.56);

  return context.getImageData(0, 0, width, height);
};

/** A copy of an image, to blur while keeping the original */
export const copyImage = (image: ImageData): ImageData =>
  new ImageData(new Uint8ClampedArray(image.data), image.width, image.height);
