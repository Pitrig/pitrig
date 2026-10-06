#!/usr/bin/env python3
import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CHANGELOG = ROOT / "CHANGELOG.md"

INSTALLERS = [
    ("macOS, Apple silicon", re.compile(r"-arm64\.dmg$")),
    ("macOS, Intel", re.compile(r"(?<!-arm64)\.dmg$")),
    ("Windows", re.compile(r"\.exe$")),
    ("Linux, AppImage", re.compile(r"\.AppImage$")),
    ("Linux, Debian and Ubuntu", re.compile(r"\.deb$")),
]

BOARDS = [
    ("t-display-s3", "LilyGO T-Display-S3"),
    ("guition-4848s040", "Guition ESP32-4848S040"),
    ("jc1060p470c", "Guition JC1060P470C"),
    ("esp32s3-devkit", "Espressif ESP32-S3-DevKitC-1"),
]


def fail(message: str) -> None:
    print(f"release notes error: {message}", file=sys.stderr)
    raise SystemExit(1)


def link(repo: str, tag: str, name: str) -> str:
    return f"[{name}](https://github.com/{repo}/releases/download/{tag}/{name})"


def installer_rows(names: list[str], repo: str, tag: str) -> list[str]:
    rows = []
    for platform, pattern in INSTALLERS:
        found = [name for name in names if pattern.search(name)]
        if not found:
            fail(f"no {platform} installer among the release files")
        cells = "<br>".join(link(repo, tag, name) for name in found)
        rows.append(f"| {platform} | {cells} |")
    return rows


def board_rows(names: list[str], repo: str, tag: str) -> list[str]:
    rows = []
    for board, title in BOARDS:
        image = f"pitrig-{board}.bin"
        archive = f"firmware-{board}.tar.gz"
        for name in (image, archive):
            if name not in names:
                fail(f"{name} is missing from the release files")
        rows.append(f"| {title} | {link(repo, tag, image)} | {link(repo, tag, archive)} |")
    return rows


def changelog_entry(version: str) -> str:
    text = CHANGELOG.read_text(encoding="utf-8")
    match = re.search(
        rf"^## {re.escape(version)}\b[^\n]*\n(.*?)(?=^## |\Z)", text, re.MULTILINE | re.DOTALL
    )
    if not match:
        fail(f"CHANGELOG.md has no entry for {version}")
    return match.group(1).strip()


def render(args: argparse.Namespace) -> str:
    names = sorted(path.name for path in args.files.iterdir() if path.is_file())
    lines = [
        f"## Configurator {args.version}",
        "",
        "| Platform | Download |",
        "| --- | --- |",
        *installer_rows(names, args.repo, args.tag),
        "",
        "Nothing here is signed. On macOS run `xattr -dr com.apple.quarantine "
        "/Applications/Pitrig.app` once after installing. On Windows, SmartScreen warns about "
        "the installer: choose More info, then Run anyway.",
        "",
        f"## Firmware {args.firmware}",
        "",
        "The easiest route is the [web flasher](https://www.pitrig.com/flash). A board already "
        "running Pitrig updates itself over the USB cable from the configurator's Firmware "
        "panel, which takes the `.bin`.",
        "",
        "| Board | Update over serial | First flash by cable |",
        "| --- | --- | --- |",
        *board_rows(names, args.repo, args.tag),
        "",
        "Each archive also carries the bootloader, the partition table and the flasher "
        "arguments: a first flash by cable needs them, an update over serial does not. Flash "
        "the image that matches the board in front of you — each one carries a single board "
        "identity.",
        "",
        "## Changes",
        "",
        changelog_entry(args.version),
        "",
    ]
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("files", type=Path)
    parser.add_argument("--version", required=True)
    parser.add_argument("--firmware", required=True)
    parser.add_argument("--tag", required=True)
    parser.add_argument("--repo", required=True)
    sys.stdout.write(render(parser.parse_args()))


if __name__ == "__main__":
    main()
