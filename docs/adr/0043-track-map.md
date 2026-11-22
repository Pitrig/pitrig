# ADR 0043: Track Map

Status: Accepted. A compatible extension of the configuration contract — the
`track_map` widget type, no schema version change — and five catalog fields with
explicit wire ids, written by the plugin of
[ADR 0035](0035-simhub-plugin-feeds-the-board.md) in the line format of
[ADR 0006](0006-simhub-custom-serial-line-protocol.md).

## Context

No game hands over the outline of its track. SimHub publishes the player's world
position (`CarCoordinates`, X and Z on the ground) and every car's place on the
lap (`Opponent.TrackPositionPercent`), and it records outlines of its own as
gzip JSON under `PluginsData\<game>\MapRecords` (laps driven on this PC) and
`MapRecordsCloud` (downloaded). What each game gives was checked on SimHub
9.13.5: ACC gives every car's position and place; AC the player's position and
the other cars only through Crew Chief's shared memory; AC EVO no position and
no other cars to SimHub; iRacing places on the lap and no position at all; LMU
both for every car. On a recorded ACC lap of the Red Bull Ring, a car placed on
the player's outline by its lap fraction landed within 1.0 m of where it really
was in half the samples and within 3.4 m in 95 %.

The link carries one value of at most 63 characters a line and the catalog
held 324 of its 350 fields, so neither a field per car nor X and Y per car
fits: sixty cars would take more fields than remain, and iRacing has no X and
Y to send. LVGL redraws the whole screen once more than 32 areas are
invalidated in a frame, so a dot per object, each invalidating its own area,
would cost a full-screen frame whenever the field is spread round the lap.

## Decision

**The outline is SimHub's map record.** For the track being driven the plugin
reads SimHub's record of a lap driven on this PC, else SimHub's downloaded
record, and while it has neither it looks again every 20 s, so a track SimHub
records during the session appears once SimHub has saved it. The record also
gives the finish line, where its first point lies, and the sectors, where its
points change sector. The plugin records no outline of its own, and nothing is
shipped with Pitrig. SimHub records no pit lane, so the plugin learns it from
the cars that drive it: their positions binned by lap fraction, each bin settled
by the median of what it holds, kept per game and track under
`%APPDATA%\Pitrig\pit-lanes`. Sector boundaries a record lacks are learnt the
same way from the cars' sector changes. A car in its garage is not sent.

**The outline travels as a repeating stream in one text field.**
`track.map.outline` (`MO`) carries one piece of the current outline at a time
and the plugin cycles through the pieces at the field's rate, so a board that
starts or reconnects has the whole outline within a cycle. A piece is
`<index><count><id><payload>` in base64 digits (`A`–`Z`, `a`–`z`, `0`–`9`,
`+`, `/`): the index and the count one digit each, a two-digit id that changes
whenever the outline does, and up to 59 digits of the body. The body is, in
digits:

| Part | Digits | Meaning |
| --- | --- | --- |
| version | 1 | `B` |
| points | 2 | N track points at lap fractions i/N; 0 clears the outline |
| pit points | 2 | M pit lane points, 0 when none is known |
| pit from, pit to | 2 + 2 | lap fractions, in 4096ths, of the first and last pit point |
| finish | 2 | lap fraction of the start and finish line |
| sectors | 1 | S, then S lap fractions where sectors 2 to S + 1 start, 2 digits each |
| first point | 2 + 2 | x and y on a 4096 grid, y down the screen |
| track | 2 a point | N − 1 steps, x and y one signed 6-bit digit each |
| pit lane | 4 + 2 a point | as the track, when M > 0, spread evenly from pit from to pit to |
| check | 2 | sum of the body's digit values before it, modulo 4096 |

A digit is its index in the alphabet; two digits are high then low six bits.
The plugin scales both lines onto one grid, spaces track points about 10 m apart
(at most 512) and maps each game's axes so the track is not mirrored. A 4.3 km
track is 15 pieces, under a second at 20 Hz.

**Every car is three digits.** `track.map.cars_1` to `cars_4` (`MA`–`MD`) hold
21 cars each, 84 in all. The first two digits are the lap fraction in 2048ths
shifted left by one, with the pit lane flag in the low bit; the third is the
role times eight plus the class. Roles: 1 the player, 2 a car on the player's
lap, 3 one place ahead and 4 one place behind in the player's class, 5 a lap or
more ahead in distance run, 6 a lap or more behind. Classes: 0 when one class
is on track, else 1 to 4 by best lap, the fourth and slower sharing 4. The
plugin decides roles; the board only paints them.

**The board keeps the outline in a service.** `services/track_map` subscribes
to the outline field's updates, assembles the pieces into external RAM and
publishes a decoded outline with a generation, so every chunk is caught
whatever screen is showing. The `track_map` widget draws the outline into a
canvas of its own size once per generation — or a ring while there is none —
with an anti-aliased rasterizer of its own, because LVGL's line segments left
steps along the edges and seams where they met. It draws the cars over it from
one object as anti-aliased sprites, at most once per `refresh_ms`, 25 ms unless
the author sets it. A redraw invalidates only the dots that moved: sorted along
the lap and cut at the widest gaps into at most eight groups, each the box round
where its dots were and are now, and fewer groups once the frame already holds
half of LVGL's 32 areas. One box round every dot covered three quarters of a
560 px map with the ACC field spread; the groups cover about a tenth. A dot is
placed to a quarter of a pixel, each sprite drawn in sixteen copies shifted by
quarters, because dots rounded to whole pixels wandered up to 0.7 px across the
anti-aliased line as they moved.

**The cars glide between updates.** The service times every car field as it
arrives and moves each car from where it is shown to its newest place along the
lap, in fractions of a lap unit, over twice the time the plugin takes between
two updates, the period measured as `dashboard.smoothing` measures it, so a
redraw between two updates finds the car part of the way and an update that
comes late does not stop it. A car is placed at once when its place jumps more
than a thirty-second of a lap, when it moves between the track and the pit lane,
when its field gains or loses a car, or after a pause longer than 250 ms. This
holds whatever `dashboard.smoothing` says: it costs nothing a redraw would not
cost already, and two updates behind, about a tenth of a second, is nothing on a
map. Gliding over one period left a car still in one 25 ms redraw of ten on a
recorded ACC race, and whole lap units stepped it unevenly; over two periods
with fractional units, one in seventy.

## Consequences

- A track SimHub holds a record of shows at once; any other shows the cars on a
  ring — every AC EVO track, since SimHub reads no AC EVO positions to record.
- Five catalog fields, 329 of 350 with the others of this release. They are sent
  only to a board whose dashboard has a track map.
- A map redraw costs its pixels once per `refresh_ms` rather than every frame,
  and nothing while its screen is hidden; the canvas is the box's size in
  external RAM, and internal RAM is untouched. On the JC1060P470C, a 560 px map
  fed from an ACC replay of the Red Bull Ring with the field spread drew its cars
  32 to 35 times a second at the 25 ms default in about 6.5 ms a frame, at 20 to
  25 % of one core and 7 to 9 % of the other, no two frames more than 22 ms
  apart, and 18 to 19 times a second at 50 ms in about 3 ms, at 4 to 7 %; one box
  round every dot had cost 10 to 16 ms a frame and up to 61 % of a core at 25 ms. A dense screen pays that on top of
  its own frames, so a big map sits best on a screen or a slot page of its own,
  or at a longer `refresh_ms`.
- SimHub's map records are an undocumented format. A record that does not parse
  is skipped, and the track shows a ring.
- AC needs Crew Chief running for other cars, and iRacing has no positions for
  SimHub to record an outline from; an outline computed from speed and heading
  is deferred.
