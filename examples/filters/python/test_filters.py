"""The generated Python API over the example's recording transport: names, defaults, options left out"""

from filters import Blur, Filters, blur_options


def test() -> None:
    blur = Blur(blur_options(radius=3))
    assert blur.options == {"radius": 3, "edge": "clamp"}
    assert blur.radius == 3
    blur.radius = 5
    assert blur.radius == 5
    blur.apply_later(b"\0\0\0\0", 1, 1)
    blur.on("progress", print)
    assert blur.calls == [("applyLater", (b"\0\0\0\0", 1, 1)), ("on", ("progress",))]
    assert blur_options(edge=None) == {"edge": None}

    filters = Filters()
    filters.histogram(b"")
    assert filters.calls == [("histogram", (b"",))]


test()
print("python: the generated API over its transport, as declared")
