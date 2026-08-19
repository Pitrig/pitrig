#!/usr/bin/env python3
"""Generate the configurator's Google Fonts catalog from a checked-in snapshot.

The snapshot is fetched from Google and committed, so generating the catalog is
offline and deterministic and `--check` means something in CI. Refreshing it
needs no API key: the family list comes from the public metadata endpoint and
each face's file URL from the CSS endpoint, asked with a user agent old enough
that Google answers with TrueType rather than WOFF2 — the device rasterizes an
sfnt face and nothing here converts one.

The generator derives no family identifiers. `fontFamilyId` in
configurator/src/shared/font-library.ts is the single implementation of that
rule, and this only checks that every identifier it would derive is valid and
unique.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT = ROOT / "fonts" / "google_fonts_snapshot.json"
SELECTION = ROOT / "fonts" / "google_fonts_selection.json"
OUTPUT = ROOT / "configurator/src/main/font-library/google-fonts-catalog.json"

METADATA_URL = "https://fonts.google.com/metadata/fonts"
CSS_URL = "https://fonts.googleapis.com/css2"
# Old enough that the CSS endpoint answers with `format('truetype')`.
LEGACY_USER_AGENT = "Mozilla/4.0"
FAMILIES_PER_REQUEST = 8
REQUEST_PAUSE_SECONDS = 0.2
REQUEST_TIMEOUT_SECONDS = 30

SNAPSHOT_FORMAT = "simcore-google-fonts-snapshot"
CATALOG_FORMAT = "simcore-google-fonts-catalog"
CATALOG_FORMAT_VERSION = 1

WEIGHTS = ("100", "200", "300", "400", "500", "600", "700", "800", "900")
FACE_PATTERN = re.compile(
    r"font-family:\s*'([^']+)';.*?font-style:\s*(\w+);.*?font-weight:\s*(\d+);"
    r".*?src:\s*url\((https://fonts\.gstatic\.com/[^)]+)\)",
    re.S,
)
# Only this host is ever written into the catalog, and the main process refuses
# to download from anywhere else.
ASSET_HOST = "https://fonts.gstatic.com/"


def fetch(url: str, user_agent: str | None = None) -> bytes:
    request = urllib.request.Request(url)
    if user_agent:
        request.add_header("User-Agent", user_agent)
    with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
        return response.read()


def fetch_with_retry(url: str, attempts: int = 3) -> str | None:
    """A timeout or a 5xx is worth asking again; a 4xx is an answer."""
    for attempt in range(attempts):
        try:
            return fetch(url, LEGACY_USER_AGENT).decode("utf-8")
        except urllib.error.HTTPError as error:
            if error.code < 500:
                return None
        except Exception:  # noqa: BLE001 - a socket has many ways to fail
            pass
        if attempt + 1 < attempts:
            time.sleep(2 ** attempt)
    return None


def variant_of(style: str, weight: str) -> str:
    return f"{weight}italic" if style == "italic" else weight


def resolve_faces(requests: list[tuple[str, list[str]]]) -> dict[str, dict[str, str]]:
    """Ask the CSS endpoint for the TTF URL of every family and variant."""
    resolved: dict[str, dict[str, str]] = {}
    for start in range(0, len(requests), FAMILIES_PER_REQUEST):
        batch = requests[start : start + FAMILIES_PER_REQUEST]
        query = "&".join(family_query(family, variants) for family, variants in batch)
        css = fetch_with_retry(f"{CSS_URL}?{query}")
        if css is None:
            # One batch that will not come back is a gap in the catalog, not a
            # failed refresh: a family Google does not serve to us is a family
            # nobody could install anyway. Losing the whole run to one timed-out
            # socket would be the worse failure.
            print(f"  skipped a batch: {[f for f, _ in batch]}", file=sys.stderr)
            continue
        for family, style, weight, url in FACE_PATTERN.findall(css):
            if not url.startswith(ASSET_HOST):
                continue
            resolved.setdefault(family, {})[variant_of(style, weight)] = url
        done = min(start + FAMILIES_PER_REQUEST, len(requests))
        print(f"  resolved {done}/{len(requests)} families", file=sys.stderr)
        time.sleep(REQUEST_PAUSE_SECONDS)
    return resolved


def family_query(family: str, variants: list[str]) -> str:
    name = family.replace(" ", "+")
    upright = sorted({v for v in variants if not v.endswith("italic")}, key=int)
    italic = sorted({v[: -len("italic")] for v in variants if v.endswith("italic")}, key=int)
    if italic:
        axes = ";".join([f"0,{w}" for w in upright] + [f"1,{w}" for w in italic])
        return f"family={name}:ital,wght@{axes}"
    return f"family={name}:wght@{';'.join(upright)}"


def refresh_snapshot() -> dict[str, Any]:
    print("fetching the Google Fonts family list", file=sys.stderr)
    metadata = json.loads(fetch(METADATA_URL))
    families = metadata.get("familyMetadataList")
    if not isinstance(families, list) or not families:
        fail("the metadata endpoint returned no families")

    wanted: list[tuple[str, list[str]]] = []
    described: dict[str, dict[str, Any]] = {}
    for entry in families:
        name = entry.get("family")
        fonts = entry.get("fonts")
        if not isinstance(name, str) or not isinstance(fonts, dict):
            continue
        # Filter before sorting: a variable font can list an axis key that is
        # not a weight at all, and sorting on one would fail here rather than
        # simply not being offered.
        variants = sorted(
            {
                variant
                for variant in (normalize_variant(key) for key in fonts)
                if weight_of(variant) in WEIGHTS
            },
            key=variant_order,
        )
        if not variants:
            continue
        described[name] = {
            "family": name,
            "category": entry.get("category") or "Other",
            "popularity": entry.get("popularity"),
        }
        wanted.append((name, variants))

    print(f"resolving face URLs for {len(wanted)} families", file=sys.stderr)
    resolved = resolve_faces(wanted)

    snapshot_families = []
    for name, description in described.items():
        faces = resolved.get(name)
        if not faces:
            continue
        snapshot_families.append(
            {
                **description,
                "variants": [
                    {"variant": variant, "url": faces[variant]}
                    for variant in sorted(faces, key=variant_order)
                ],
            }
        )
    snapshot_families.sort(key=lambda family: family["family"])
    return {
        "format": SNAPSHOT_FORMAT,
        "source": METADATA_URL,
        "families": snapshot_families,
    }


def weight_of(variant: str) -> str:
    return variant[: -len("italic")] if variant.endswith("italic") else variant


def variant_order(variant: str) -> tuple[bool, int]:
    return variant.endswith("italic"), int(weight_of(variant))


def normalize_variant(key: str) -> str:
    """`400`, `400i` and `regular` as the one shape shared with the app."""
    lowered = key.strip().lower()
    if lowered in ("regular", ""):
        return "400"
    if lowered == "italic":
        return "400italic"
    if lowered.endswith("i") and lowered[:-1].isdigit():
        return f"{lowered[:-1]}italic"
    return lowered


def load_json(path: Path, label: str) -> Any:
    if not path.exists():
        fail(f"{label} is missing: {path.relative_to(ROOT)}")
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        fail(f"{label} is not valid JSON: {error}")


def build_catalog(snapshot: dict[str, Any], selection: dict[str, Any]) -> dict[str, Any]:
    include_italic = bool(selection.get("include_italic", False))
    allowed_weights = set(selection.get("weights") or WEIGHTS)
    excluded = set(selection.get("exclude") or [])
    excluded_categories = set(selection.get("exclude_categories") or [])
    maximum = selection.get("maximum_families")

    families = []
    for entry in snapshot.get("families", []):
        name = entry["family"]
        if name in excluded or entry.get("category") in excluded_categories:
            continue
        variants = [
            variant
            for variant in entry.get("variants", [])
            if weight_of(variant["variant"]) in allowed_weights
            and (include_italic or not variant["variant"].endswith("italic"))
        ]
        if not variants:
            continue
        families.append(
            {
                "name": name,
                "category": entry.get("category", "Other"),
                "variants": [
                    {"variant": v["variant"], "url": v["url"]} for v in variants
                ],
            }
        )

    # Most popular first, because a picker's first screen is the answer most of
    # the time; the file keeps that order so the app does no sorting of its own.
    ranking = {
        entry["family"]: entry.get("popularity") or 10_000
        for entry in snapshot.get("families", [])
    }
    families.sort(key=lambda family: (ranking.get(family["name"], 10_000), family["name"]))
    if isinstance(maximum, int) and maximum > 0:
        families = families[:maximum]

    check_identifiers(families)
    return {
        "format": CATALOG_FORMAT,
        "format_version": CATALOG_FORMAT_VERSION,
        "generated_from": snapshot.get("source", METADATA_URL),
        "families": families,
    }


IDENTIFIER_PATTERN = re.compile(r"^[a-z0-9_-]{1,31}$")
# `_` and not `-`: a family slug can never contain an underscore, so a family
# name can never be read as a variant. Mirrors WEIGHT_SUFFIXES in
# configurator/src/shared/font-library.ts, which is the real implementation.
WEIGHT_SUFFIXES = {
    "100": "_thin",
    "200": "_extralight",
    "300": "_light",
    "400": "",
    "500": "_medium",
    "600": "_semibold",
    "700": "_bold",
    "800": "_extrabold",
    "900": "_black",
}


def font_family_id(family: str, variant: str) -> str:
    """A port of fontFamilyId, used only to check the result — never to emit it."""
    italic = variant.endswith("italic")
    weight = variant[: -len("italic")] if italic else variant
    suffix = WEIGHT_SUFFIXES.get(weight, f"_w{weight}")
    if italic:
        suffix = f"{suffix}_italic"
    base = re.sub(r"^-+|-+$", "", re.sub(r"[^a-z0-9]+", "-", family.lower()))
    budget = 31 - len(suffix)
    if len(base) <= budget:
        return base + suffix
    trimmed = re.sub(r"^-+|-+$", "", base[: budget - 7])
    return f"{trimmed}_{hash6(f'{family}|{variant}')}{suffix}"


def hash6(value: str) -> str:
    digest = 0x811C9DC5
    for character in value:
        digest ^= ord(character)
        digest = (digest * 0x01000193) & 0xFFFFFFFF
    return base36(digest).rjust(6, "0")[-6:]


def base36(value: int) -> str:
    alphabet = "0123456789abcdefghijklmnopqrstuvwxyz"
    if value == 0:
        return "0"
    digits = []
    while value:
        value, remainder = divmod(value, 36)
        digits.append(alphabet[remainder])
    return "".join(reversed(digits))


def check_identifiers(families: list[dict[str, Any]]) -> None:
    seen: dict[str, tuple[str, str]] = {}
    for family in families:
        for variant in family["variants"]:
            identifier = font_family_id(family["name"], variant["variant"])
            if not IDENTIFIER_PATTERN.match(identifier):
                fail(f"{family['name']} {variant['variant']} derives an invalid id: {identifier}")
            collision = seen.get(identifier)
            if collision:
                fail(
                    f"{family['name']} {variant['variant']} and {collision[0]} "
                    f"{collision[1]} both derive {identifier}"
                )
            seen[identifier] = (family["name"], variant["variant"])


def write_or_check(path: Path, content: str, check: bool) -> None:
    if check:
        if not path.exists() or path.read_text(encoding="utf-8") != content:
            fail(f"generated font catalog is stale: {path.relative_to(ROOT)}")
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def fail(message: str) -> None:
    print(f"font catalog error: {message}", file=sys.stderr)
    raise SystemExit(1)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    parser.add_argument(
        "--refresh",
        action="store_true",
        help="re-fetch the snapshot from Google before generating",
    )
    args = parser.parse_args()

    if args.refresh:
        if args.check:
            fail("--refresh rewrites the snapshot, so it cannot be combined with --check")
        snapshot = refresh_snapshot()
        SNAPSHOT.parent.mkdir(parents=True, exist_ok=True)
        SNAPSHOT.write_text(
            json.dumps(snapshot, indent=1, sort_keys=False) + "\n", encoding="utf-8"
        )

    snapshot = load_json(SNAPSHOT, "the Google Fonts snapshot")
    selection = load_json(SELECTION, "the Google Fonts selection")
    catalog = build_catalog(snapshot, selection)
    write_or_check(OUTPUT, json.dumps(catalog, indent=1) + "\n", args.check)
    variants = sum(len(family["variants"]) for family in catalog["families"])
    print(f"font catalog: {len(catalog['families'])} families, {variants} faces")


if __name__ == "__main__":
    main()
