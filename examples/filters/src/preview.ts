/** The blur's preview, written by hand: its methods are declared in Rust (`PreviewHost`, filters/src/lib.rs) and
 * `PreviewApi` (the facade, generated) makes tsc check that they are the ones declared */
import { Blur, type BlurOptionsInit, PreviewApi } from './api.ts';

export class Preview extends PreviewApi {
  readonly #context: CanvasRenderingContext2D;
  #blur = new Blur();
  #image: ImageData | undefined;
  #shown: ImageData | undefined;
  /** The animation running, stopped by the next one */
  #frame = 0;

  constructor(context: CanvasRenderingContext2D) {
    super();
    this.#context = context;
  }

  async show(image: ImageData, options: BlurOptionsInit = {}): Promise<void> {
    this.#blur.free();
    this.#blur = new Blur(options);
    this.#image = image;
    await this.#draw();
  }

  fadeTo(radius: number, duration = 300): Promise<void> {
    cancelAnimationFrame(this.#frame);

    const from = this.#blur.radius;
    const start = performance.now();

    return new Promise((resolve) => {
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / duration);

        this.#blur.radius = from + (radius - from) * t;
        void this.#draw();
        if (t < 1) this.#frame = requestAnimationFrame(step);
        else resolve();
      };

      this.#frame = requestAnimationFrame(step);
    });
  }

  pixels(): Uint8Array {
    return new Uint8Array(this.#shown?.data ?? []);
  }

  /** The image blurred into the canvas */
  async #draw(): Promise<void> {
    if (!this.#image) return;

    const copy = new ImageData(new Uint8ClampedArray(this.#image.data), this.#image.width, this.#image.height);

    this.#blur.apply(copy, copy.width, copy.height);
    this.#shown = copy;
    this.#context.putImageData(copy, 0, 0);
  }
}
