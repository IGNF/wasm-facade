/* The declarations wasm-bindgen writes for the crate (`wasm-bindgen --target web`), kept here so that the generated
 * facade is type-checked without building the wasm module */

export enum Edge {
  Clamp = 0,
  Wrap = 1,
}

export enum Channel {
  Red = 0,
  Green = 1,
  Blue = 2,
  Alpha = 3,
}

export class Blur {
  free(): void;
  constructor(radius: number, edge: Edge);
  radius: number;
  edge: Edge;
  apply(image: Uint8Array, width: number, height: number): void;
  // biome-ignore lint/suspicious/noExplicitAny: as wasm-bindgen writes an async function's result
  applyLater(image: Uint8Array, width: number, height: number): Promise<any>;
  // biome-ignore lint/complexity/noBannedTypes: as wasm-bindgen writes a js_sys::Function
  applyWhere(image: Uint8Array, width: number, keep: Function): void;
  // biome-ignore lint/complexity/noBannedTypes: as wasm-bindgen writes a js_sys::Function
  onProgress(listener: Function): void;
}

export class Grade {
  free(): void;
  constructor();
  setLevelsProperty(channel: Channel, name: string, value: number): void;
  apply(image: Uint8Array): void;
}

export function histogram(image: Uint8Array): Uint32Array;
export function interleave(red: Uint8Array, green: Uint8Array, blue: Uint8Array, alpha: Uint8Array): Uint8Array;
// biome-ignore lint/suspicious/noExplicitAny: as wasm-bindgen writes a JsValue
export function stats(image: Uint8Array): any;
