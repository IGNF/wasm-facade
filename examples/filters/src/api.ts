// Made by wasm-facade (typescript) from the Rust declarations: not to edit

import * as wasm from '../pkg/filters.js';
import * as convert from './converters.ts';

/** How a filter reads past the image's edges */
export type Edge = 'clamp' | 'wrap';

const edgeValues = {
  clamp: wasm.Edge.Clamp,
  wrap: wasm.Edge.Wrap,
} as const satisfies Record<Edge, wasm.Edge>;

/** A blur's options */
export interface BlurOptions {
  /** Its radius, pixels */
  radius: number;
  /** How it reads past the edges */
  edge: Edge;
}

/** BlurOptions as a constructor takes them: each one optional, its default else */
export type BlurOptionsInit = { [K in keyof BlurOptions]?: BlurOptions[K] | undefined };

/** BlurOptions' defaults */
export const defaultBlurOptions: BlurOptions = {
  radius: 2,
  edge: 'clamp',
};

/** The histogram of an image's luminance: 256 counts */
export const histogram = (image: Parameters<typeof convert.pixels>[0]): Uint32Array =>
  wasm.histogram(convert.pixels(image));

/** The events of Blur and their payloads */
export interface BlurEvents {
  /** The share of the image blurred, 0 to 1 */
  progress: number;
}

/** A box blur, applied to RGBA pixels in place */
export class Blur {
  readonly #inner: wasm.Blur;

  /** A blur of this radius and edges */
  constructor(options: BlurOptionsInit = {}) {
    this.#inner = new wasm.Blur(
      options.radius ?? defaultBlurOptions.radius,
      edgeValues[options.edge ?? defaultBlurOptions.edge],
    );
  }

  /** Its radius, pixels */
  get radius(): number {
    return this.#inner.radius;
  }

  /** Changes its radius */
  set radius(value: number) {
    this.#inner.radius = value;
  }

  /** Blurs an image in place */
  apply(image: Parameters<typeof convert.pixels>[0], width: number, height: number): void {
    this.#inner.apply(convert.pixels(image), width, height);
  }

  /** Blurs an image's copy once the browser is idle */
  applyLater(image: Uint8Array, width: number, height: number): Promise<Uint8Array> {
    return this.#inner.applyLater(image, width, height);
  }

  /** Blurs the rows a predicate keeps */
  applyWhere(image: Uint8Array, width: number, keep: (row: number) => boolean): void {
    this.#inner.applyWhere(image, width, keep);
  }

  /** Calls `listener` at each event `type`; returns what stops it */
  on<K extends keyof BlurEvents>(type: K, listener: (payload: BlurEvents[K]) => void): () => void {
    let live = true;
    const relay = (payload: BlurEvents[K]) => {
      if (live) listener(payload);
    };

    switch (type) {
      case 'progress':
        this.#inner.onProgress(relay);
        break;
    }

    return () => {
      live = false;
    };
  }

  /** Frees its memory in the wasm module: it is not to be used after */
  free(): void {
    this.#inner.free();
  }
}

/** A width and a height, pixels */
export type Size = [width: number, height: number];

/** What the preview shows */
export interface Snapshot {
  /** The image's size, pixels */
  readonly size: Size;
  /** The blur's radius, pixels */
  readonly radius: number;
  /** When it was shown (`performance.now()`), if it was */
  readonly shownAt?: number;
}

/** What the preview tells its listeners */
export interface PreviewEvents {
  /** An image shown */
  shown: Snapshot;
  /** The radius at each step of an animation */
  radiuschange: number;
  /** The preview cleared */
  cleared: undefined;
}

/** A blur's preview: an image on a canvas, blurred as it is shown */
export abstract class PreviewApi {
  readonly #listeners = new Map<keyof PreviewEvents, Set<(event: never) => void>>();

  /** Listens to an event; returns the function that stops listening */
  on<K extends keyof PreviewEvents>(type: K, listener: (event: PreviewEvents[K]) => void): () => void {
    const listeners = this.#listeners.get(type) ?? new Set();
    const added = listener as (event: never) => void;

    this.#listeners.set(type, listeners.add(added));

    return () => {
      listeners.delete(added);
    };
  }

  /** Calls the listeners of an event; one that throws is reported, and does not stop the others */
  protected emit<K extends keyof PreviewEvents>(type: K, event: PreviewEvents[K]): void {
    for (const listener of [...(this.#listeners.get(type) ?? [])]) {
      try {
        (listener as (event: PreviewEvents[K]) => void)(event);
      } catch (error) {
        queueMicrotask(() => {
          throw error;
        });
      }
    }
  }

  /** Shows an image, blurred by the options given (the blur's defaults else) */
  abstract show(image: ImageData, options?: BlurOptionsInit): Promise<void>;
  /** Moves the blur's radius to `radius` over `duration` milliseconds (300 by default)
   *
   * Resolved once the animation ends */
  abstract fadeTo(radius: number, duration?: number): Promise<void>;
  /** The pixels shown, RGBA */
  abstract pixels(): Uint8Array;
  /** What it shows */
  abstract snapshot(): Snapshot;
  /** Shows nothing */
  abstract clear(): void;
}
