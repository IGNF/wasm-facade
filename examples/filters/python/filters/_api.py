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


Channel = Literal["red", "green", "blue", "alpha"]
"""A channel of an RGBA image: "red" (Red), "green" (Green), "blue" (Blue), "alpha" (Opacity)"""


Edge = Literal["clamp", "wrap"]
"""How a filter reads past the image's edges: "clamp" (The nearest pixel inside), "wrap" (The pixel on the other
side)"""


class BlurOptions(TypedDict, total=False):
    """A blur's options: kept by the facade, each a property of the blur, its setter emitting `change`

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
    """A blur's options: kept by the facade, each a property of the blur, its setter emitting `change`: the options
    given (an option not given is left out, None given is passed on)

    radius: Its radius, pixels
    edge: How it reads past the edges
    """
    given = {"radius": radius, "edge": edge}
    return cast(BlurOptions, {key: value for key, value in given.items() if value is not UNSET})


class Levels(TypedDict, total=False):
    """A channel's levels: its input range stretched to the whole, then its gamma; the facade keeps them by channel
    and its setter emits `change`

    black: The input's black point, 0 to 255
    white: The input's white point, 0 to 255
    gamma: The gamma applied once stretched (1 leaves the midtones)
    """

    black: float
    white: float
    gamma: float


LEVELS_DEFAULTS: Levels = {
    "black": 0,
    "white": 255,
    "gamma": 1,
}
"""`Levels`'s defaults, those the Rust declares"""


def levels(
    *,
    black: float | None = UNSET,
    white: float | None = UNSET,
    gamma: float | None = UNSET,
) -> Levels:
    """A channel's levels: its input range stretched to the whole, then its gamma; the facade keeps them by channel
    and its setter emits `change`: the options given (an option not given is left out, None given is passed on)

    black: The input's black point, 0 to 255
    white: The input's white point, 0 to 255
    gamma: The gamma applied once stretched (1 leaves the midtones)
    """
    given = {"black": black, "white": white, "gamma": gamma}
    return cast(Levels, {key: value for key, value in given.items() if value is not UNSET})


class Planes(TypedDict):
    """An image's planes, one byte per pixel each: what `interleave` takes as one object

    red: The red bytes
    green: The green bytes
    blue: The blue bytes
    alpha: The opacity's bytes
    """

    red: bytes | Sequence[int]
    green: bytes | Sequence[int]
    blue: bytes | Sequence[int]
    alpha: bytes | Sequence[int]


Size = tuple[int, int]
"""A width and a height, pixels: width, height"""


class Snapshot(TypedDict):
    """What the preview shows

    size: The image's size, pixels
    radius: The blur's radius, pixels
    shownAt: When it was shown (`performance.now()`), if it was
    """

    size: Size
    radius: float
    shownAt: float | None


class Stats(TypedDict):
    """An image's luminance at a glance

    pixels: Its pixels
    mean: Its mean, 0 to 255
    range: Its darkest and its lightest, if it has pixels
    """

    pixels: int
    mean: float
    range: Size | None


class FunctionsApi(Transport):
    """The functions, over what the class inheriting them gives"""

    def histogram(self, image: Any) -> Sequence[int]:
        """The histogram of an image's luminance: 256 counts"""
        return self._call("histogram", image)

    def interleave(self, planes: Planes) -> bytes | Sequence[int]:
        """Planes interleaved as RGBA pixels, as long as the shortest"""
        return self._call("interleave", planes)

    def stats(self, image: Any) -> Stats:
        """An image's luminance at a glance: a JS object the facade checks as a `Stats`"""
        return self._call("stats", image)


class BlurApi(Transport):
    """A box blur, applied to RGBA pixels in place: the methods of `Blur`, over what the class inheriting them gives"""

    @property
    def radius(self) -> float:
        """Its radius, pixels"""
        return self._get("radius")

    @radius.setter
    def radius(self, value: float) -> None:
        self._set("radius", value)

    @property
    def edge(self) -> Edge:
        """How it reads past the edges"""
        return self._get("edge")

    @edge.setter
    def edge(self, value: Edge) -> None:
        self._set("edge", value)

    def apply(self, image: Any, width: int, height: int) -> None:
        """Blurs an image in place"""
        return self._call("apply", image, width, height)

    def apply_later(self, image: bytes | Sequence[int], width: int, height: int) -> Awaitable[bytes | Sequence[int]]:
        """Blurs an image's copy once the browser is idle"""
        return self._call("applyLater", image, width, height)

    def apply_where(self, image: bytes | Sequence[int], width: int, keep: Callable[..., Any]) -> None:
        """Blurs the rows a predicate keeps"""
        return self._call("applyWhere", image, width, keep)

    def on(self, event: Literal["progress", "change"], listener: Callable[[Any], None]) -> Callable[[], None]:
        """Listens to an event ("progress": The share of the image blurred, 0 to 1; "change": a property changed by
        its setter), returns what stops it"""
        return self._on(event, listener)


class GradeApi(Transport):
    """A grade: levels per channel, applied to RGBA pixels in place: the methods of `Grade`, over what the class
    inheriting them gives"""

    def set_levels_property(self, channel: Channel, name: Literal["black", "white", "gamma"], value: Any) -> None:
        """Sets one of a channel's levels"""
        self._call("setLevelsProperty", channel, name, value)

    def get_levels_property(self, channel: Channel, name: Literal["black", "white", "gamma"]) -> Any:
        """The property `name` of `channel`, as last set (its default else)"""
        return self._call("getLevelsProperty", channel, name)

    def apply(self, image: Any) -> None:
        """Grades an image in place"""
        return self._call("apply", image)

    def on(self, event: Literal["change"], listener: Callable[[Any], None]) -> Callable[[], None]:
        """Listens to an event ("change": a property changed by its setter), returns what stops it"""
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

    def snapshot(self) -> Snapshot:
        """What it shows"""
        return self._call("snapshot")

    def clear(self) -> None:
        """Shows nothing"""
        return self._call("clear")

    def on(self, event: Literal["shown", "radiuschange", "cleared"], listener: Callable[[Any], None]) -> Callable[[], None]:
        """Listens to an event ("shown": An image shown; "radiuschange": The radius at each step of an animation;
        "cleared": The preview cleared), returns what stops it"""
        return self._on(event, listener)
