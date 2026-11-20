# ADR 0040: Pitrig Reports Anonymous Usage, On Until Turned Off

Status: Accepted. Sits beside [ADR 0037](0037-update-channel.md), the only other
request the configurator makes on its own.

## Context

The site counts visits, downloads and browser flashes, but nothing is known after
a download: whether the configurator was ever launched, whether it found a board,
which games people race, and whether they come back. With few users each of those
answers decides what to fix first.

## Decision

**A packaged configurator posts small events to `https://www.pitrig.com/api/app`**:
`launch`, `board` (board id and firmware version), `firmware` (a board seen with
a new firmware), `save` (a save to board finished), `bridge` (the SimHub plugin
delivered data, with its version) and `crash` (a renderer or child process gone,
by type and reason).

**The SimHub plugin posts to the same address**: `plugin` once a day while SimHub
runs it, with SimHub's version from its uninstall entry; `game` when a game runs,
by SimHub's game name; and `board` for a board it feeds while a game runs.

**Both share one install number and one switch** in `usage.json` under the
configurator's `userData` (`%APPDATA%\Pitrig` on Windows): a random UUID and
`enabled`. Whichever starts first creates the file, exclusively, and the other
reads it; an unreadable file sends nothing and is replaced only by the switch. The
switch is on by default and lives only on the configurator's Info page, which
states what is sent; the plugin's About tab points to it, and both read the file
before every request. Reports carry the version, `process.platform` and
`process.arch` — no names, paths, documents or serial numbers — and each is sent at
most once a day per value.

**Only official builds report.** The release workflow sets `PITRIG_OFFICIAL_BUILD`
for builds of the `release` branch of `Pitrig/pitrig`; the configurator compiles it
in as a constant and the plugin as `UsageReporter.Official.cs`. A development run,
a package or plugin built anywhere else and the debugger send nothing, so the
owner's own installs of a release count like anyone's. `PITRIG_USAGE_URL` points
any configurator build at a test endpoint.

**Every report says whether Pitrig was here before** as `existing`: true when the
`userData` folder or an entry in it was created at least ten minutes before
`usage.json`, which is an update from a version that sent nothing or a reinstall
over kept data. Both apps work it out from creation times instead of storing it,
so the file keeps its two keys, and a reporting configurator creates the file at
startup, so a short first run is not read as an update.

**The site keeps no address for an install.** A page view and a configurator
download keep a hash of the address, keyed by a secret the database creates for
itself; hashes older than 15 days are erased every day and whenever a new install
reports. A new install's first report is matched to a visitor seen from the same
address in the 14 days before: the first whose visit came from a named source,
else the latest who downloaded the configurator, else the latest, so a post read
on a phone is credited when the computer on the same network installs. That
visitor hash is stored on the report, with whether the network had a download or
only a visit. An install that reports `existing` is not matched and `/stats` counts
it as an upgrade, apart from new installs. The match is an estimate: another network or a shared address breaks or merges it. An
install counts as active on a day it opened the configurator or raced with a
board; the plugin's daily report and its game reports are not activity.

## Consequences

`/stats` shows the path from a visit to a connected board, which source brings
users, which games they race, and weekly return. Data begins with the first
release that carries this change. A failed request is dropped, not queued.
Installs that began on 0.3.2, which sends no `existing`, count as new until a
later version reports for them.
