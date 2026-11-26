// Made by wasm-facade (typescript) from the Rust declarations: not to edit

import * as wasm from '../pkg/filters.js';
import * as convert from './converters.ts';

/** A value as the facade keeps it and hands it out: arrays and plain objects copied and frozen, typed arrays copied
 * (they cannot be frozen): what a caller holds never changes what the facade keeps */
const kept = <T>(value: T): T => {
  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) return (value as unknown as { slice(): T }).slice();
  if (Array.isArray(value)) return Object.freeze(value.map(kept)) as T;
  if (value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype)
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([k, v]) => [k, kept(v)]))) as T;

  return value;
};

/** A value the wasm module returned that is not as declared: a TypeError naming where */
const mismatch = (at: string, expected: string, value: unknown): never => {
  const found = Array.isArray(value) ? 'an array' : typeof value;

  throw new TypeError(`wasm-facade: ${at} is ${value === null ? 'null' : found}, ${expected} expected`);
};

/** A channel of an RGBA image */
export type Channel = 'red' | 'green' | 'blue' | 'alpha';

const channelValues = {
  red: wasm.Channel.Red,
  green: wasm.Channel.Green,
  blue: wasm.Channel.Blue,
  alpha: wasm.Channel.Alpha,
} as const satisfies Record<Channel, wasm.Channel>;

/** How a filter reads past the image's edges */
export type Edge = 'clamp' | 'wrap';

const edgeValues = {
  clamp: wasm.Edge.Clamp,
  wrap: wasm.Edge.Wrap,
} as const satisfies Record<Edge, wasm.Edge>;

/** A blur's options: kept by the facade, each a property of the blur, its setter emitting `change` */
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

/** A channel's levels: its input range stretched to the whole, then its gamma; the facade keeps them by channel and
 * its setter emits `change` */
export interface Levels {
  /** The input's black point, 0 to 255 */
  black: number;
  /** The input's white point, 0 to 255 */
  white: number;
  /** The gamma applied once stretched (1 leaves the midtones) */
  gamma: number;
}

/** Levels as a constructor takes them: each one optional, its default else */
export type LevelsInit = { [K in keyof Levels]?: Levels[K] | undefined };

/** Levels' defaults */
export const defaultLevels: Levels = {
  black: 0,
  white: 255,
  gamma: 1,
};

/** The histogram of an image's luminance: 256 counts */
export const histogram = (image: Parameters<typeof convert.pixels>[0]): Uint32Array =>
  wasm.histogram(convert.pixels(image));

/** Planes interleaved as RGBA pixels, as long as the shortest */
export const interleave = (planes: Planes): Uint8Array =>
  wasm.interleave(planes.red, planes.green, planes.blue, planes.alpha);

/** An image's luminance at a glance: a JS object the facade checks as a `Stats` */
export const stats = (image: Parameters<typeof convert.pixels>[0]): Stats =>
  checkedStats(wasm.stats(convert.pixels(image)));

/** The events of Blur and their payloads */
export interface BlurEvents {
  /** The share of the image blurred, 0 to 1 */
  progress: number;
  /** A property changed by its setter, once kept and applied */
  change: { radius: number } | { edge: Edge };
}

/** A box blur, applied to RGBA pixels in place */
export class Blur {
  readonly #inner: wasm.Blur;
  #options: Readonly<BlurOptions>;
  readonly #listeners = new Map<keyof BlurEvents, Set<(payload: never) => void>>();

  /** A blur of this radius and edges */
  constructor(options: BlurOptionsInit = {}) {
    this.#options = Object.freeze({
      radius: options.radius ?? defaultBlurOptions.radius,
      edge: options.edge ?? defaultBlurOptions.edge,
    });
    this.#inner = new wasm.Blur(this.#options.radius, edgeValues[this.#options.edge]);
  }

  /** Its radius, pixels */
  get radius(): number {
    return this.#options.radius;
  }

  /** Changes its radius */
  set radius(value: number) {
    this.#options = Object.freeze({ ...this.#options, radius: value });
    this.#inner.radius = value;
    this.#emit('change', { radius: value });
  }

  /** How it reads past the edges */
  get edge(): Edge {
    return this.#options.edge;
  }

  /** Changes how it reads past the edges */
  set edge(value: Edge) {
    this.#options = Object.freeze({ ...this.#options, edge: value });
    this.#inner.edge = edgeValues[value];
    this.#emit('change', { edge: value });
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
      default:
        this.#listeners.set(type, (this.#listeners.get(type) ?? new Set()).add(relay as (payload: never) => void));
    }

    return () => {
      live = false;
      this.#listeners.get(type)?.delete(relay as (payload: never) => void);
    };
  }

  /** Calls the listeners of an event its setters emit; one that throws is reported, the others still called */
  #emit<K extends keyof BlurEvents>(type: K, payload: BlurEvents[K]): void {
    for (const listener of [...(this.#listeners.get(type) ?? [])]) {
      try {
        (listener as (payload: BlurEvents[K]) => void)(payload);
      } catch (error) {
        queueMicrotask(() => {
          throw error;
        });
      }
    }
  }

  /** Frees its memory in the wasm module: it is not to be used after */
  free(): void {
    this.#inner.free();
  }
}

/** The events of Grade and their payloads */
export interface GradeEvents {
  /** A property changed by its setter, once kept and applied */
  change: { [N in keyof Levels]: { key: Channel; name: N; value: Levels[N] } }[keyof Levels];
}

/** A grade: levels per channel, applied to RGBA pixels in place */
export class Grade {
  readonly #inner: wasm.Grade;
  readonly #levels = new Map<Channel, Levels>();
  readonly #listeners = new Map<keyof GradeEvents, Set<(payload: never) => void>>();

  /** A grade leaving every channel as it is */
  constructor() {
    this.#inner = new wasm.Grade();
  }

  /** Sets one of a channel's levels */
  setLevelsProperty<N extends keyof Levels>(channel: Channel, name: N, value: Levels[N]): this {
    this.#levels.set(
      channel,
      Object.freeze({ ...(this.#levels.get(channel) ?? defaultLevels), [name]: kept(value) }) as Levels,
    );
    this.#inner.setLevelsProperty(channelValues[channel], name, value);
    this.#emit('change', { key: channel, name, value } as GradeEvents['change']);

    return this;
  }

  /** The property `name` of `channel`, as last set (its default else) */
  getLevelsProperty<N extends keyof Levels>(channel: Channel, name: N): Levels[N] {
    return kept((this.#levels.get(channel) ?? defaultLevels)[name]);
  }

  /** Grades an image in place */
  apply(image: Parameters<typeof convert.pixels>[0]): void {
    this.#inner.apply(convert.pixels(image));
  }

  /** Calls `listener` at each event `type`; returns what stops it */
  on<K extends keyof GradeEvents>(type: K, listener: (payload: GradeEvents[K]) => void): () => void {
    let live = true;
    const relay = (payload: GradeEvents[K]) => {
      if (live) listener(payload);
    };

    this.#listeners.set(type, (this.#listeners.get(type) ?? new Set()).add(relay as (payload: never) => void));

    return () => {
      live = false;
      this.#listeners.get(type)?.delete(relay as (payload: never) => void);
    };
  }

  /** Calls the listeners of an event its setters emit; one that throws is reported, the others still called */
  #emit<K extends keyof GradeEvents>(type: K, payload: GradeEvents[K]): void {
    for (const listener of [...(this.#listeners.get(type) ?? [])]) {
      try {
        (listener as (payload: GradeEvents[K]) => void)(payload);
      } catch (error) {
        queueMicrotask(() => {
          throw error;
        });
      }
    }
  }

  /** Frees its memory in the wasm module: it is not to be used after */
  free(): void {
    this.#inner.free();
  }
}

/** An image's planes, one byte per pixel each: what `interleave` takes as one object */
export interface Planes {
  /** The red bytes */
  readonly red: Uint8Array;
  /** The green bytes */
  readonly green: Uint8Array;
  /** The blue bytes */
  readonly blue: Uint8Array;
  /** The opacity's bytes */
  readonly alpha: Uint8Array;
}

/** The buffers of a Planes, to transfer it: `postMessage(planes, planesBuffers(planes))` */
export const planesBuffers = (planes: Planes): ArrayBuffer[] =>
  [...new Set([planes.red.buffer, planes.green.buffer, planes.blue.buffer, planes.alpha.buffer])].filter(
    (buffer): buffer is ArrayBuffer => buffer instanceof ArrayBuffer,
  );

/** A width and a height, pixels */
export type Size = [width: number, height: number];

/** A Size as the wasm module returns it, checked: a TypeError naming the field that is not */
export const checkedSize = (value: unknown, at = 'Size'): Size => {
  const v = Array.isArray(value) && value.length === 2 ? (value as unknown[]) : mismatch(at, 'a tuple of 2', value);

  if (typeof v[0] !== 'number') mismatch(`${at}[0]`, 'number', v[0]);
  if (typeof v[1] !== 'number') mismatch(`${at}[1]`, 'number', v[1]);

  return value as Size;
};

/** What the preview shows */
export interface Snapshot {
  /** The image's size, pixels */
  readonly size: Size;
  /** The blur's radius, pixels */
  readonly radius: number;
  /** When it was shown (`performance.now()`), if it was */
  readonly shownAt?: number;
}

/** An image's luminance at a glance */
export interface Stats {
  /** Its pixels */
  readonly pixels: number;
  /** Its mean, 0 to 255 */
  readonly mean: number;
  /** Its darkest and its lightest, if it has pixels */
  readonly range?: Size;
}

/** A Stats as the wasm module returns it, checked: a TypeError naming the field that is not */
export const checkedStats = (value: unknown, at = 'Stats'): Stats => {
  const v =
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : mismatch(at, 'an object', value);

  if (typeof v.pixels !== 'number') mismatch(`${at}.pixels`, 'number', v.pixels);
  if (typeof v.mean !== 'number') mismatch(`${at}.mean`, 'number', v.mean);
  if (v.range !== undefined) checkedSize(v.range, `${at}.range`);

  return value as Stats;
};

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
