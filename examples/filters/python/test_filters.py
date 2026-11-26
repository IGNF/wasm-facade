"""The generated Python API over the example's recording transport: names, defaults, options left out"""

from filters import Blur, Filters, Grade, Planes, Preview, blur_options


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

    preview = Preview()
    preview.show(b"", blur_options(radius=2))
    preview.fade_to(4)
    preview.on("shown", print)
    assert preview.calls == [("show", (b"", {"radius": 2})), ("fadeTo", (4, None)), ("on", ("shown",))]

    blur.edge = "wrap"
    assert blur.edge == "wrap"
    blur.on("change", print)

    grade = Grade()
    grade.set_levels_property("red", "gamma", 2)
    grade.get_levels_property("red", "gamma")
    assert grade.calls == [("setLevelsProperty", ("red", "gamma", 2)), ("getLevelsProperty", ("red", "gamma"))]

    filters = Filters()
    planes: Planes = {"red": b"\1", "green": b"\2", "blue": b"\3", "alpha": b"\4"}
    filters.histogram(b"")
    filters.interleave(planes)
    filters.stats(b"")
    assert filters.calls == [("histogram", (b"",)), ("interleave", (planes,)), ("stats", (b"",))]


test()
print("python: the generated API over its transport, as declared")
