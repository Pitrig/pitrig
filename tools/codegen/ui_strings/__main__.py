from __future__ import annotations

import argparse

from ..common import write_or_check
from . import BASE_LOCALE, LABEL, TARGET
from .catalog import load_catalog
from .emit import catalog_ts, keys
from .errors import fail


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    catalog = load_catalog()
    base = catalog[BASE_LOCALE]

    outputs = {TARGET / "ui-string-keys.ts": keys(base)}
    for locale, messages in catalog.items():
        outputs[TARGET / f"ui-strings-{locale}.ts"] = catalog_ts(locale, messages)
    write_or_check(outputs, args.check, LABEL, fail)

    parameterised = sum(1 for message in base.values() if message.parameters)
    plural = sum(1 for message in base.values() if message.plural)
    locales = ", ".join(sorted(catalog))
    print(
        f"ui strings: {len(base)} keys, {parameterised} parameterised, "
        f"{plural} plural, locales {locales}"
    )


if __name__ == "__main__":
    main()
