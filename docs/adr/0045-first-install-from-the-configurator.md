# ADR 0045: First Install from the Configurator

Status: Accepted.

## Context

A board that still runs its factory firmware does not answer `@PR:INFO`, so the
configurator could not see it, and a Pitrig board whose firmware cannot update
itself got only a link to the web flasher. The web flasher needs the site and a
Chromium browser on a desktop, while everything else a board needs happens in
the configurator.

## Decision

**The configurator flashes the board over its USB cable through the chip's ROM
loader.** A small client in `configurator/src/main/first-install/rom/` speaks
the loader's serial protocol over `serialport`: no stub flasher, no new
dependency and no esptool code. It writes deflated 1 KiB blocks and checks every
part with the loader's MD5. It enters the loader with the UART-bridge or the
USB-Serial-JTAG line sequence; when neither answers, the user holds BOOT and
presses RST, and the install goes on without a reset.

**It writes the release of the configurator's own version.** The
`firmware-<board>.tar.gz` archive (bootloader, partition table, otadata and
`pitrig-<board>.bin`) is downloaded and checked like the update image, and its
`flasher_args.json` gives the offsets. A file the arguments name but the archive
lacks stops the install before anything is written, so the archive layout is a
contract between CI and the configurator, as it already was for the web flasher.

**An install erases the whole chip**: every region the parts do not cover, as
the partition table requires.

**It refuses what it must not touch or cannot help:** a board running Pitrig
that updates itself (it takes **Update board**), a chip the archive was not
built for, a chip revision outside the image's range, less flash than the
partition table needs, and secure boot or flash encryption. A Pitrig board that
cannot update itself first gets a copy of its configuration in the
configurations library, as **Update board** keeps one.
Where the board's link runs on another connector than the install port, a
running Pitrig cannot answer there, so the configurator asks before it erases;
the JC1060P470C's USB-Serial-JTAG port is probed first, because a
`jtag-fallback` build answers on it.

**The board is connected afterwards** where its link runs: the same bridge port
at the board's UART speed, or the new Pitrig USB port, found by the MAC the
loader read. Where the link is on another connector (the JC1060P470C, or a
DevKitC-1 installed through its UART bridge), the user moves the cable first.

## Consequences

- A first install needs only the configurator, on Windows and macOS. The web
  flasher stays for people without it.
- The ROM loader writes slower than a stub: an install takes about a minute,
  most of it the erase of the 16 MB part.
- A board whose firmware owns the USB port, Pitrig's TinyUSB link among them,
  enters the loader only by hand.
- A new board needs a `BOARD_INSTALL` row in `shared/first-install.ts` (chip,
  release name, link connector); its type makes a missing row a compile error.
- The install fetches the release in development builds too, where the update
  channel is off, so an unpublished version has nothing to install.
