# filters in Python

<!-- Made by wasm-facade (python-reference) from the Rust declarations: not to edit -->

## Functions (`FunctionsApi`)

- `histogram(image: Any)` → `Sequence[int]`: The histogram of an image's luminance: 256 counts

## Classes

### `Blur` (`BlurApi`)

A box blur, applied to RGBA pixels in place

Its options: `BlurOptions`, `blur_options(…)`.

- `radius` (`float`): Its radius, pixels
- `apply(image: Any, width: int, height: int)` → `None`: Blurs an image in place
- `apply_later(image: bytes | Sequence[int], width: int, height: int)` → `Awaitable[bytes | Sequence[int]]`: Blurs an image's copy once the browser is idle
- `apply_where(image: bytes | Sequence[int], width: int, keep: Callable[..., Any])` → `None`: Blurs the rows a predicate keeps
- `on("progress", listener)`: The share of the image blurred, 0 to 1

## Options

### `BlurOptions`

A blur's options: `blur_options(*, …)` takes them as keywords.

| Option | Type | Default | |
| --- | --- | --- | --- |
| `radius` | `float` | `2` | Its radius, pixels |
| `edge` | `Edge` | `"clamp"` | How it reads past the edges |

## Unions

- `Edge`: `"clamp"` (The nearest pixel inside), `"wrap"` (The pixel on the other side)
