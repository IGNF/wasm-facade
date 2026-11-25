# filters

<!-- Made by wasm-facade (reference) from the Rust declarations: not to edit -->

## Functions

- `histogram(image)` → `Uint32Array`: The histogram of an image's luminance: 256 counts

## Classes

### `Blur`

A box blur, applied to RGBA pixels in place

`new Blur(options)`, its options `BlurOptions`:

| Option | Type | Default | |
| --- | --- | --- | --- |
| `radius` | `number` | `2` | Its radius, pixels |
| `edge` | `Edge` | `'clamp'` | How it reads past the edges |

Properties:

- `radius`: Its radius, pixels

Methods:

- `apply(image, width, height)` → `void`: Blurs an image in place
- `applyLater(image, width, height)` → `Promise<Uint8Array>`: Blurs an image's copy once the browser is idle
- `applyWhere(image, width, keep)` → `void`: Blurs the rows a predicate keeps

Events (`on(type, listener)`, returning what stops it):

- `progress` (`number`): The share of the image blurred, 0 to 1

## Options

### `BlurOptions`

A blur's options

| Option | Type | Default | |
| --- | --- | --- | --- |
| `radius` | `number` | `2` | Its radius, pixels |
| `edge` | `Edge` | `'clamp'` | How it reads past the edges |

## Unions

- `Edge`: `'clamp'` (The nearest pixel inside), `'wrap'` (The pixel on the other side)
