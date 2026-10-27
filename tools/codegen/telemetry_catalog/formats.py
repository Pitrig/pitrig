from __future__ import annotations

from typing import Any

from .errors import fail

BOUNDS = ("below", "up_to")

CSHARP_FORMAT_STEP = """    internal sealed class FormatStep
    {
        public FormatStep(double limit, bool inclusive, string format)
        {
            Limit = limit;
            Inclusive = inclusive;
            Format = format;
        }

        public double Limit { get; }

        public bool Inclusive { get; }

        public string Format { get; }
    }

"""


def validate_format(name: str, value: Any) -> None:
    if isinstance(value, str):
        return
    if not isinstance(value, list) or len(value) < 2:
        fail(f"SimHub format must be a string or at least two steps: {name}")
    limit = None
    for index, step in enumerate(value):
        bounds = [key for key in BOUNDS if key in step] if isinstance(step, dict) else []
        last = index == len(value) - 1
        if not isinstance(step, dict) or not isinstance(step.get("format"), str):
            fail(f"SimHub format step needs a format string: {name}")
        if set(step) - {"format", *BOUNDS} or len(bounds) != (0 if last else 1):
            fail(f"SimHub format steps take one of {', '.join(BOUNDS)}, except the last: {name}")
        if last:
            continue
        bound = step[bounds[0]]
        if isinstance(bound, bool) or not isinstance(bound, (int, float)) or bound < 0:
            fail(f"SimHub format step bound must be a non-negative number: {name}")
        if limit is not None and bound < limit:
            fail(f"SimHub format step bounds must not decrease: {name}")
        limit = bound


def default_format(value: str | list[dict[str, Any]]) -> str:
    return value if isinstance(value, str) else value[-1]["format"]


def steps(value: str | list[dict[str, Any]]) -> list[tuple[float, bool, str]]:
    if isinstance(value, str):
        return []
    return [
        (float(step.get("below", step.get("up_to"))), "up_to" in step, step["format"])
        for step in value[:-1]
    ]


def csharp_steps(value: str | list[dict[str, Any]]) -> str:
    entries = [
        f'new FormatStep({limit!r}, {"true" if inclusive else "false"}, "{text}")'
        for limit, inclusive, text in steps(value)
    ]
    return "null" if not entries else "new[] { " + ", ".join(entries) + " }"
