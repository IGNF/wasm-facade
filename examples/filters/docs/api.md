# filters

<!-- Made by wasm-facade (reference) from the Rust declarations: not to edit -->

## Functions

- `histogram(image)` → `Uint32Array`: The histogram of an image's luminance: 256 counts
- `interleave(planes)` → `Uint8Array`: Planes interleaved as RGBA pixels, as long as the shortest
- `stats(image)` → `Stats`: An image's luminance at a glance: a JS object the facade checks as a `Stats`

## Classes

### `Blur`

A box blur, applied to RGBA pixels in place

`new Blur(options)`, its options `BlurOptions`:

| Option | Type | Default | |
| --- | --- | --- | --- |
| `radius` | `number` | `2` | Its radius, pixels |
| `edge` | `Edge` | `'clamp'` | How it reads past the edges |

Properties:

- `radius`: Its radius, pixels (the option as kept; its setter emits `change`)
- `edge`: How it reads past the edges (the option as kept; its setter emits `change`)

Methods:

- `apply(image, width, height)` → `void`: Blurs an image in place
- `applyLater(image, width, height)` → `Promise<Uint8Array>`: Blurs an image's copy once the browser is idle
- `applyWhere(image, width, keep)` → `void`: Blurs the rows a predicate keeps

Events (`on(type, listener)`, returning what stops it):

- `progress` (`number`): The share of the image blurred, 0 to 1
- `change`: a property changed by its setter, once kept and applied

### `Grade`

A grade: levels per channel, applied to RGBA pixels in place

Properties by key:

- `setLevelsProperty(channel, name, value)`, `getLevelsProperty(channel, name)`: Sets one of a channel's levels (`Levels`'s, kept by key; emits `change`)

Methods:

- `apply(image)` → `void`: Grades an image in place

Events (`on(type, listener)`, returning what stops it):

- `change`: a property changed by its setter, once kept and applied

## `Preview`

A blur's preview: an image on a canvas, blurred as it is shown

- `show(image, options?)` → `Promise<void>`: Shows an image, blurred by the options given (the blur's defaults else)
- `fadeTo(radius, duration?)` → `Promise<void>`: Moves the blur's radius to `radius` over `duration` milliseconds (300 by default) (resolved once the animation ends)
- `pixels()` → `Uint8Array`: The pixels shown, RGBA
- `snapshot()` → `Snapshot`: What it shows
- `clear()` → `void`: Shows nothing

Events (`on(type, listener)`, returning what stops it):

- `shown` (`Snapshot`): An image shown
- `radiuschange` (`number`): The radius at each step of an animation
- `cleared` (`undefined`): The preview cleared

## Records

### `Planes`

An image's planes, one byte per pixel each: what `interleave` takes as one object

- `red` (`Uint8Array`): The red bytes
- `green` (`Uint8Array`): The green bytes
- `blue` (`Uint8Array`): The blue bytes
- `alpha` (`Uint8Array`): The opacity's bytes

### `Size`

A width and a height, pixels

- `width` (`number`)
- `height` (`number`)

### `Snapshot`

What the preview shows

- `size` (`Size`): The image's size, pixels
- `radius` (`number`): The blur's radius, pixels
- `shownAt?` (`number`): When it was shown (`performance.now()`), if it was

### `Stats`

An image's luminance at a glance

- `pixels` (`number`): Its pixels
- `mean` (`number`): Its mean, 0 to 255
- `range?` (`Size`): Its darkest and its lightest, if it has pixels

## Options

### `BlurOptions`

A blur's options: kept by the facade, each a property of the blur, its setter emitting `change`

| Option | Type | Default | |
| --- | --- | --- | --- |
| `radius` | `number` | `2` | Its radius, pixels |
| `edge` | `Edge` | `'clamp'` | How it reads past the edges |

### `Levels`

A channel's levels: its input range stretched to the whole, then its gamma; the facade keeps them by channel and its setter emits `change`

| Option | Type | Default | |
| --- | --- | --- | --- |
| `black` | `number` | `0` | The input's black point, 0 to 255 |
| `white` | `number` | `255` | The input's white point, 0 to 255 |
| `gamma` | `number` | `1` | The gamma applied once stretched (1 leaves the midtones) |

## Unions

- `Channel`: `'red'` (Red), `'green'` (Green), `'blue'` (Blue), `'alpha'` (Opacity)
- `Edge`: `'clamp'` (The nearest pixel inside), `'wrap'` (The pixel on the other side)
