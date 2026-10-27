# ADR 0037: The Update Channel Is the Published GitHub Release

Status: Accepted. Builds on [ADR 0022](0022-over-the-air-firmware-updates.md),
whose serial update the configurator now drives with a firmware it fetches, and
on [ADR 0035](0035-simhub-plugin-feeds-the-board.md), whose plugin the
configurator now keeps current in SimHub.

## Context

Four pieces age apart on a user's PC: the configurator, the firmware on each
board, the plugin copied into SimHub, and SimHub itself. Nothing told a user
that any of them was behind, and a board left on an older schema refuses every
save. The firmware repository is public, and CI already drafts one release per
version that carries every installer, image and the plugin; a draft becomes
visible only when it is published by hand.

## Decision

**The published GitHub release is the only update source.** The configurator
checks when it starts, once a day and on resume after a day asleep, and
`releases/latest` answers with published, non-prerelease releases only, so a
draft or a prerelease is never offered. Development builds check only with
`PITRIG_UPDATES=1`.

**The configurator updates itself on Windows alone.** `electron-updater`
downloads the next installer in the background from the release's `latest.yml`
and installs it on quit or from "Restart and update". macOS and Linux builds are
unsigned, so they compare versions and link to the release page.

**A board is offered the firmware of the configurator's own release**, not the
newest one: `firmware/version.txt` is built into the configurator, the image is
`pitrig-<board>.bin` from the `v<configurator version>` release, checked against
the size and SHA-256 the release lists, and installed by `Update board`. A
newer firmware would need a newer configurator to write its schema; a board on a
newer schema than the configurator is offered nothing.

**The plugin is compared by file version** with the copy inside the installed
configurator, found through SimHub's uninstall registry entry as the installer
does, and replaced on request, closing and restarting SimHub when it runs.
SimHub's own version comes from the same entry, because its executables report
`1.0.0.0`; one older than the oldest version the plugin has run on is reported,
not blocked.

## Consequences

- CI uploads `latest.yml` and the installer's blockmap to the release, and the
  build never publishes on its own (`--publish never`).
- An update offer exists only once a release is published, so publishing stays
  the one deliberate step.
- A board's firmware update needs the configurator updated first, which is the
  order that keeps schemas matching.
- The configurator asks GitHub once a day, anonymously and well within the rate
  limit; nothing about the user, the board or SimHub leaves the PC.
