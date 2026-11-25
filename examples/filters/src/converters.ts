/** The project's converters, named by its declarations (`convert = "image=pixels"`): what the facade takes, as the
 * wasm module takes it */

/** An image's RGBA pixels, as they are (no copy) */
export const pixels = (image: ImageData): Uint8Array =>
  new Uint8Array(image.data.buffer, image.data.byteOffset, image.data.byteLength);
