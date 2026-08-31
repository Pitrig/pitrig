from __future__ import annotations

import json
import re
import sys
import time
import urllib.error
import urllib.request
from typing import Any

from . import METADATA_URL, SNAPSHOT_FORMAT, WEIGHTS
from .errors import fail
from .variants import normalize_variant, variant_order, weight_of


CSS_URL = "https://fonts.googleapis.com/css2"


LEGACY_USER_AGENT = "Mozilla/4.0"


FAMILIES_PER_REQUEST = 8


REQUEST_PAUSE_SECONDS = 0.2


REQUEST_TIMEOUT_SECONDS = 30


ASSET_HOST = "https://fonts.gstatic.com/"


FACE_PATTERN = re.compile(
    r"font-family:\s*'([^']+)';.*?font-style:\s*(\w+);.*?font-weight:\s*(\d+);"
    r".*?src:\s*url\((https://fonts\.gstatic\.com/[^)]+)\)",
    re.S,
)


def fetch(url: str, user_agent: str | None = None) -> bytes:
    request = urllib.request.Request(url)
    if user_agent:
        request.add_header("User-Agent", user_agent)
    with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
        return response.read()


def fetch_with_retry(url: str, attempts: int = 3) -> str | None:
    for attempt in range(attempts):
        try:
            return fetch(url, LEGACY_USER_AGENT).decode("utf-8")
        except urllib.error.HTTPError as error:
            if error.code < 500:
                return None
        except Exception:
            pass
        if attempt + 1 < attempts:
            time.sleep(2 ** attempt)
    return None


def variant_of(style: str, weight: str) -> str:
    return f"{weight}italic" if style == "italic" else weight


def resolve_faces(requests: list[tuple[str, list[str]]]) -> dict[str, dict[str, str]]:
    resolved: dict[str, dict[str, str]] = {}
    for start in range(0, len(requests), FAMILIES_PER_REQUEST):
        batch = requests[start : start + FAMILIES_PER_REQUEST]
        query = "&".join(family_query(family, variants) for family, variants in batch)
        css = fetch_with_retry(f"{CSS_URL}?{query}")
        if css is None:
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
