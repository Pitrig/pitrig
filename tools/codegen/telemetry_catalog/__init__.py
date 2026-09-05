from __future__ import annotations

from ..common import ROOT

SOURCE = ROOT / "telemetry" / "telemetry_catalog.json"
SIMHUB_MAPPINGS_SOURCE = ROOT / "telemetry" / "simhub_generic_mappings.json"
OUTPUTS = {
    ROOT
    / "firmware/services/telemetry/include/telemetry_catalog_generated.hpp": "cpp",
    ROOT
    / "firmware/services/telemetry/protocols/simhub/include/simhub_catalog_generated.hpp": "simhub",
    ROOT / "configurator/src/shared/telemetry-catalog.ts": "typescript",
    ROOT / "configurator/src/shared/simhub-profile-data.ts": "simhub_typescript",
    ROOT / "docs/telemetry-catalog.md": "markdown",
    ROOT / "simhub/Pitrig-telemetry.shsds": "shsds",
}
