from __future__ import annotations

from ..common import ROOT

SNAPSHOT = ROOT / "fonts" / "google_fonts_snapshot.json"
SELECTION = ROOT / "fonts" / "google_fonts_selection.json"
OUTPUT = ROOT / "configurator/src/main/font-library/google-fonts-catalog.json"

METADATA_URL = "https://fonts.google.com/metadata/fonts"

SNAPSHOT_FORMAT = "simcore-google-fonts-snapshot"
CATALOG_FORMAT = "simcore-google-fonts-catalog"
CATALOG_FORMAT_VERSION = 1

WEIGHTS = ("100", "200", "300", "400", "500", "600", "700", "800", "900")
