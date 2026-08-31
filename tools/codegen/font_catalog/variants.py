from __future__ import annotations


def weight_of(variant: str) -> str:
    return variant[: -len("italic")] if variant.endswith("italic") else variant


def variant_order(variant: str) -> tuple[bool, int]:
    return variant.endswith("italic"), int(weight_of(variant))


def normalize_variant(key: str) -> str:
    lowered = key.strip().lower()
    if lowered in ("regular", ""):
        return "400"
    if lowered == "italic":
        return "400italic"
    if lowered.endswith("i") and lowered[:-1].isdigit():
        return f"{lowered[:-1]}italic"
    return lowered
