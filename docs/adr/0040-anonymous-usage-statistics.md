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
by SimHub's game name; and `board` for a board it feeds while a game runs. Its
development build sends nothing.

**Both share one install number and one switch** in `usage.json` under the
configurator's `userData` (`%APPDATA%\Pitrig` on Windows): a random UUID and
`enabled`. Whichever starts first creates the file, exclusively, and the other
reads it; an unreadable file sends nothing and is replaced only by the switch. The
switch is on by default and lives only on the configurator's Info page, which
states what is sent; the plugin's About tab points to it, and both read the file
before every request. Reports carry the version, `process.platform` and
`process.arch` — no names, paths, documents or serial numbers — and each is sent at
most once a day per value. Development builds of the configurator send nothing
unless `PITRIG_USAGE_URL` names an endpoint; the debugger does not register it.

**The site keeps no address for an install.** A configurator download keeps a hash
of the address, keyed by a secret the database creates for itself, for 14 days.
When an install's first report arrives it is matched to the latest such download
from the same address, the download's visitor hash is stored on that report, and
older hashes are erased. The match is an estimate: another network or a shared
address breaks or merges it. An install counts as active on a day it opened the
configurator or raced with a board; the plugin's daily report and its game reports
are not activity.

## Consequences

`/stats` shows the path from a visit to a connected board, which source brings
users, which games they race, and weekly return. Data begins with the first
release that carries this change. A failed request is dropped, not queued.
