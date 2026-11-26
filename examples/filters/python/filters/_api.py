# Made by wasm-facade (python) from the Rust declarations: not to edit
"""Filters in Python, made from the Rust declarations: its methods hand each call to
the class inheriting them (`Transport`)"""

from __future__ import annotations

from collections.abc import Awaitable, Callable, Sequence
from typing import Any, Literal, TypedDict, cast


class _Unset:
    """An option not given: left out of the options (`None` given is passed on)"""

    def __repr__(self) -> str:
        return "UNSET"


UNSET: Any = _Unset()


class Transport:
    """The mixins' base: what carries each call to the facade (by its names) and its result back, given by the class
    inheriting them (a widget, a bridge, native code)"""

    def _call(self, name: str, *args: Any) -> Any:
        raise NotImplementedError(f"{type(self).__name__} gives no transport (_call)")

    def _get(self, name: str) -> Any:
        raise NotImplementedError(f"{type(self).__name__} gives no transport (_get)")

    def _set(self, name: str, value: Any) -> None:
        raise NotImplementedError(f"{type(self).__name__} gives no transport (_set)")

    def _on(self, event: str, listener: Callable[[Any], None]) -> Callable[[], None]:
        raise NotImplementedError(f"{type(self).__name__} gives no transport (_on)")


Edge = Literal["clamp", "wrap"]
"""How a filter reads past the image's edges: "clamp" (The nearest pixel inside), "wrap" (The pixel on the other
side)"""


class BlurOptions(TypedDict, total=False):
    """A blur's options

    radius: Its radius, pixels
    edge: How it reads past the edges
    """

    radius: float
    edge: Edge


BLUR_OPTIONS_DEFAULTS: BlurOptions = {
    "radius": 2,
    "edge": "clamp",
}
"""`BlurOptions`'s defaults, those the Rust declares"""


def blur_options(
    *,
    radius: float | None = UNSET,
    edge: Edge | None = UNSET,
) -> BlurOptions:
    """A blur's options: the options given (an option not given is left out, None given is passed on)

    radius: Its radius, pixels
    edge: How it reads past the edges
    """
    given = {"radius": radius, "edge": edge}
    return cast(BlurOptions, {key: value for key, value in given.items() if value is not UNSET})


class FunctionsApi(Transport):
    """The functions, over what the class inheriting them gives"""

    def histogram(self, image: Any) -> Sequence[int]:
        """The histogram of an image's luminance: 256 counts"""
        return self._call("histogram", image)


class BlurApi(Transport):
    """A box blur, applied to RGBA pixels in place: the methods of `Blur`, over what the class inheriting them gives"""

    @property
    def radius(self) -> float:
        """Its radius, pixels"""
        return self._get("radius")

    @radius.setter
    def radius(self, value: float) -> None:
        self._set("radius", value)

    def apply(self, image: Any, width: int, height: int) -> None:
        """Blurs an image in place"""
        return self._call("apply", image, width, height)

    def apply_later(self, image: bytes | Sequence[int], width: int, height: int) -> Awaitable[bytes | Sequence[int]]:
        """Blurs an image's copy once the browser is idle"""
        return self._call("applyLater", image, width, height)

    def apply_where(self, image: bytes | Sequence[int], width: int, keep: Callable[..., Any]) -> None:
        """Blurs the rows a predicate keeps"""
        return self._call("applyWhere", image, width, keep)

    def on(self, event: Literal["progress"], listener: Callable[[Any], None]) -> Callable[[], None]:
        """Listens to an event ("progress": The share of the image blurred, 0 to 1), returns what stops it"""
        return self._on(event, listener)


class PreviewApi(Transport):
    """A blur's preview: an image on a canvas, blurred as it is shown: over what the class inheriting them gives"""

    def show(self, image: Any, options: BlurOptions | None = None) -> Awaitable[None]:
        """Shows an image, blurred by the options given (the blur's defaults else)"""
        return self._call("show", image, options)

    def fade_to(self, radius: float, duration: float | None = None) -> Awaitable[None]:
        """Moves the blur's radius to `radius` over `duration` milliseconds (300 by default) (awaited: once the
        animation ends)"""
        return self._call("fadeTo", radius, duration)

    def pixels(self) -> bytes | Sequence[int]:
        """The pixels shown, RGBA"""
        return self._call("pixels")
