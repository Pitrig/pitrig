# Contributing to Pitrig

Thank you for wanting to help. This document covers what to read first, how to check your work, and
the one piece of paperwork the project needs.

## Before you write code

Read [docs/vision.md](docs/vision.md), [docs/architecture.md](docs/architecture.md) and the decision
records in [docs/adr/](docs/adr). If documentation and code disagree, the documentation wins and the
code is the bug.

**Open an issue before starting anything architectural.** A new module, a new service, a change to
the configuration contract or the control protocol, a new dependency — those are cheap to discuss and
expensive to rewrite. Bug fixes, drivers for new boards and dashboard improvements need no
permission; just send them.

The working agreement for style and structure is [AGENTS.md](AGENTS.md). The short version:

- Source files carry **no comments**. Name things so the code reads without them; if a line still
  needs explaining, change its shape or add a line to the right document under `docs/`.
- Roughly 300 lines a file. When a change pushes a file past that, split it along a natural seam as
  part of the same change.
- Never hand-edit a generated file. Five generators own their outputs; run them instead.
- No automated test files. Changes are validated through firmware builds, the static checks below
  and hardware verification.
- C++20, `.clang-format` Google style, 100 columns, two-space indent, LF, final newline.

## Checking your work

Generated contracts and debug isolation, from the repository root:

```bash
python3 -m tools.codegen.configuration_schema --check
python3 -m tools.codegen.telemetry_catalog --check
python3 -m tools.codegen.font_catalog --check
python3 -m tools.codegen.led_font --check
python3 -m tools.codegen.ui_strings --check
python3 tools/check_debug_isolation.py --check
```

Drop `--check` to regenerate after you change a generator's source. The configurator:

```bash
cd configurator && pnpm install && pnpm run typecheck && pnpm run lint
```

Firmware, for every board your change can reach — the commands for all four are in
[CLAUDE.md](CLAUDE.md):

```bash
source tools/idf-env.sh firmware/build-t-display
cd firmware && idf.py -B build-t-display -DIDF_TARGET=esp32s3 \
  -DSDKCONFIG=sdkconfig.generated.t-display \
  -DSDKCONFIG_DEFAULTS="sdkconfig.defaults;sdkconfig.defaults.t-display-s3" build
```

Say in the pull request which boards you built and what you verified on real hardware. A change that
only compiles is a change nobody can review honestly.

## Licensing and sign-off

Contributions are accepted under the licence of the path they touch: **GPL-3.0-or-later** for the
firmware, the configurator and the tooling, **Apache-2.0** for the interface definitions in
`configuration/`, `telemetry/`, `simhub/` and `docs/`. See the licence section of the
[README](README.md#licence).

Every commit needs a sign-off certifying that you agree to the
[Contributor Licence Agreement](CLA.md):

```bash
git commit -s -m "feat: add a driver for the thing"
```

That adds `Signed-off-by: Your Name <your.email@example.com>`. Read [CLA.md](CLA.md) before you send
your first pull request — it grants the maintainer the right to relicense contributions, which is
what keeps a commercial exception possible for manufacturers who cannot ship copyleft. Pull requests
without a sign-off cannot be merged.

The Pitrig name and logo are not covered by any of this: see [TRADEMARK.md](TRADEMARK.md).

## Sending the change

Keep commits focused and avoid unrelated refactoring. Describe what the change does and why, name
the boards you tested, and mention any ADR you added or updated. Anything a user would notice gets a
line at the top of [CHANGELOG.md](CHANGELOG.md), under an `Unreleased` heading you add if the entry
above is already dated; say so explicitly if the change raises the configuration schema version or
moves the partition table, because both cost the boards already in use. Questions before that:
[contact.pitrig@gmail.com](mailto:contact.pitrig@gmail.com).
