"""filters in Python: the generated API (`_api.py`) over a transport of the project's own. Here the transport records
each call, as a test would; a real one carries it to the TypeScript facade (a widget) or to native code"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from ._api import BLUR_OPTIONS_DEFAULTS, BlurApi, BlurOptions, Edge, FunctionsApi, blur_options

__all__ = ["Blur", "BlurOptions", "Edge", "Filters", "blur_options"]


class Recorder:
    """A transport keeping each call it is given, answering `None`"""

    def __init__(self) -> None:
        self.calls: list[tuple[str, tuple[Any, ...]]] = []
        self.values: dict[str, Any] = {}

    def _call(self, name: str, *args: Any) -> Any:
        self.calls.append((name, args))

    def _get(self, name: str) -> Any:
        return self.values.get(name)

    def _set(self, name: str, value: Any) -> None:
        self.values[name] = value

    def _on(self, event: str, listener: Callable[[Any], None]) -> Callable[[], None]:
        self.calls.append(("on", (event,)))
        return lambda: None


class Blur(Recorder, BlurApi):
    """A blur, its options taken as the facade's constructor takes them"""

    def __init__(self, options: BlurOptions | None = None) -> None:
        super().__init__()
        self.options: BlurOptions = {**BLUR_OPTIONS_DEFAULTS, **(options or {})}
        self.values["radius"] = self.options.get("radius")


class Filters(Recorder, FunctionsApi):
    """The module's functions"""
