# filters in Python

<!-- Made by wasm-facade (python-reference) from the Rust declarations: not to edit -->

## Functions (`FunctionsApi`)

- `histogram(image: Any)` → `Sequence[int]`: The histogram of an image's luminance: 256 counts
- `interleave(planes: Planes)` → `bytes | Sequence[int]`: Planes interleaved as RGBA pixels, as long as the shortest
- `stats(image: Any)` → `Stats`: An image's luminance at a glance: a JS object the facade checks as a `Stats`

## Classes

### `Blur` (`BlurApi`)

A box blur, applied to RGBA pixels in place

Its options: `BlurOptions`, `blur_options(…)`.

- `radius` (`float`): Its radius, pixels
- `edge` (`Edge`): How it reads past the edges
- `apply(image: Any, width: int, height: int)` → `None`: Blurs an image in place
- `apply_later(image: bytes | Sequence[int], width: int, height: int)` → `Awaitable[bytes | Sequence[int]]`: Blurs an image's copy once the browser is idle
- `apply_where(image: bytes | Sequence[int], width: int, keep: Callable[..., Any])` → `None`: Blurs the rows a predicate keeps
- `on("progress", listener)`: The share of the image blurred, 0 to 1
- `on("change", listener)`: a property changed by its setter

### `Grade` (`GradeApi`)

A grade: levels per channel, applied to RGBA pixels in place

- `set_levels_property(channel, name, value)`, `get_levels_property(channel, name)`: Sets one of a channel's levels
- `apply(image: Any)` → `None`: Grades an image in place
- `on("change", listener)`: a property changed by its setter

## `Preview` (`PreviewApi`)

A blur's preview: an image on a canvas, blurred as it is shown

- `show(image: Any, options: BlurOptions | None = None)` → `Awaitable[None]`: Shows an image, blurred by the options given (the blur's defaults else)
- `fade_to(radius: float, duration: float | None = None)` → `Awaitable[None]`: Moves the blur's radius to `radius` over `duration` milliseconds (300 by default)
- `pixels()` → `bytes | Sequence[int]`: The pixels shown, RGBA
- `snapshot()` → `Snapshot`: What it shows
- `clear()` → `None`: Shows nothing
- `on("shown", listener)`: An image shown
- `on("radiuschange", listener)`: The radius at each step of an animation
- `on("cleared", listener)`: The preview cleared

## Records

- `Planes`: `red` (`bytes | Sequence[int]`), `green` (`bytes | Sequence[int]`), `blue` (`bytes | Sequence[int]`), `alpha` (`bytes | Sequence[int]`). An image's planes, one byte per pixel each: what `interleave` takes as one object
- `Size` (a tuple): `width` (`int`), `height` (`int`). A width and a height, pixels
- `Snapshot`: `size` (`Size`), `radius` (`float`), `shownAt` (`float | None`). What the preview shows
- `Stats`: `pixels` (`int`), `mean` (`float`), `range` (`Size | None`). An image's luminance at a glance

## Options

### `BlurOptions`

A blur's options: kept by the facade, each a property of the blur, its setter emitting `change`: `blur_options(*, …)` takes them as keywords.

| Option | Type | Default | |
| --- | --- | --- | --- |
| `radius` | `float` | `2` | Its radius, pixels |
| `edge` | `Edge` | `"clamp"` | How it reads past the edges |

### `Levels`

A channel's levels: its input range stretched to the whole, then its gamma; the facade keeps them by channel and its setter emits `change`: `levels(*, …)` takes them as keywords.

| Option | Type | Default | |
| --- | --- | --- | --- |
| `black` | `float` | `0` | The input's black point, 0 to 255 |
| `white` | `float` | `255` | The input's white point, 0 to 255 |
| `gamma` | `float` | `1` | The gamma applied once stretched (1 leaves the midtones) |

## Unions

- `Channel`: `"red"` (Red), `"green"` (Green), `"blue"` (Blue), `"alpha"` (Opacity)
- `Edge`: `"clamp"` (The nearest pixel inside), `"wrap"` (The pixel on the other side)
