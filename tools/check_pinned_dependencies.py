#!/usr/bin/env python3
"""Fail when something the build fetches is not pinned to one exact version.

Packages, pnpm overrides, firmware components, GitHub Actions, container images
and tool versions are each written as one exact version, so nothing new arrives
without a reviewed change (ADR 0042).
"""

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MINIMUM_RELEASE_AGE = 10080

NPM_EXACT = re.compile(r"^\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?$")
COMPONENT_EXACT = re.compile(r"^(?:==)?\d+\.\d+\.\d+(?:~\d+)?$")
TOOL_EXACT = re.compile(r"^\d+(?:\.\d+){2,3}$")
EXCEPTION = re.compile(r"^@?[^@\s]+@\d+\.\d+\.\d+(?:\s*\|\|\s*\d+\.\d+\.\d+)*$")
ACTION = re.compile(r"^[\w.-]+/[\w./-]+@[0-9a-f]{40}$")
IMAGE = re.compile(r"^[^\s@]+@sha256:[0-9a-f]{64}$")
ENV_REFERENCE = re.compile(r"^\$\{\{\s*env\.\w+\s*\}\}$")
GLOBAL_INSTALL = re.compile(r"npm (?:install|i) (?:--global|-g) ((?:\$\{\{[^}]*\}\}|[^\s$])+)")

NPM_SECTIONS = ("dependencies", "devDependencies", "optionalDependencies")
PNPM_SETTINGS = {"saveExact": "true", "trustPolicy": "no-downgrade"}
PNPM_EXCEPTIONS = ("trustPolicyExclude", "minimumReleaseAgeExclude")
WORKFLOW_VERSION_KEYS = ("node-version", "dotnet-version", "python-version")
MANIFESTS = (
    "*package.json",
    "*pnpm-workspace.yaml",
    "*idf_component.yml",
    "firmware/dependencies.lock*",
    ".github/workflows/*",
)


def unquote(value: str) -> str:
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "'\"":
        return value[1:-1]
    return value


def relative(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def manifests() -> list[Path]:
    listing = subprocess.run(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard", "--", *MANIFESTS],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return [ROOT / name for name in sorted(set(listing.stdout.splitlines())) if name]


def top_level(path: Path) -> dict[str, tuple[str, list[str]]]:
    blocks: dict[str, tuple[str, list[str]]] = {}
    key = None
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        match = re.match(r"^([\w-]+):\s*(.*)$", line)
        if match:
            key = match.group(1)
            blocks[key] = (unquote(match.group(2)), [])
        elif key is not None and line.startswith(" "):
            blocks[key][1].append(line)
    return blocks


def named_versions(lines: list[str], inline: bool) -> dict[str, str]:
    versions: dict[str, str] = {}
    name = None
    for line in lines:
        entry = re.match(r"^  ([\w./-]+):\s*(.*)$", line)
        if entry:
            name = entry.group(1)
            if inline and entry.group(2):
                versions[name] = unquote(entry.group(2))
            continue
        version = re.match(r"^    version:\s*(.+)$", line)
        if version and name:
            versions[name] = unquote(version.group(1))
    return versions


def check_package(path: Path, errors: list[str]) -> int:
    manifest = json.loads(path.read_text(encoding="utf-8"))
    if not (path.parent / "pnpm-workspace.yaml").is_file():
        errors.append(f"{relative(path)}: no pnpm-workspace.yaml beside it")
    count = 0
    for section in NPM_SECTIONS:
        for name, spec in manifest.get(section, {}).items():
            count += 1
            if not NPM_EXACT.match(spec):
                errors.append(f"{relative(path)}: {name} is {spec}, not one exact version")
    return count


def check_workspace(path: Path, errors: list[str]) -> None:
    blocks = top_level(path)
    where = relative(path)
    for name, expected in PNPM_SETTINGS.items():
        if blocks.get(name, ("", []))[0] != expected:
            errors.append(f"{where}: {name} must be {expected}")
    age = blocks.get("minimumReleaseAge", ("", []))[0]
    if not age.isdigit() or int(age) < MINIMUM_RELEASE_AGE:
        errors.append(f"{where}: minimumReleaseAge must be at least {MINIMUM_RELEASE_AGE}")
    for line in blocks.get("overrides", ("", []))[1]:
        match = re.match(r"^\s+('?)(.+?)\1:\s+(.+)$", line)
        target = unquote(match.group(3)) if match else line.strip()
        if not NPM_EXACT.match(target):
            errors.append(f"{where}: override {line.strip()} does not name one exact version")
    for key in PNPM_EXCEPTIONS:
        inline, lines = blocks.get(key, ("", []))
        if inline:
            errors.append(f"{where}: write {key} one entry per line")
        for line in lines:
            entry = unquote(line.strip().removeprefix("-"))
            if not EXCEPTION.match(entry):
                errors.append(f"{where}: {key} entry {entry} must name exact versions")


def check_components(paths: list[Path], locks: list[Path], errors: list[str]) -> int:
    pinned: dict[str, str] = {}
    ranged: set[str] = set()
    for path in paths:
        for name, spec in named_versions(top_level(path).get("dependencies", ("", []))[1], True).items():
            if name == "idf":
                continue
            if not COMPONENT_EXACT.match(spec):
                errors.append(f"{relative(path)}: {name} is {spec}, not one exact version")
                ranged.add(name)
                continue
            version = spec.removeprefix("==")
            if pinned.setdefault(name, version) != version:
                errors.append(f"{relative(path)}: {name} {version} differs from {pinned[name]} elsewhere")
    for lock in locks:
        for name, version in named_versions(top_level(lock).get("dependencies", ("", []))[1], False).items():
            if name == "idf" or name in ranged:
                continue
            if name not in pinned:
                errors.append(f"{relative(lock)}: {name} {version} is pinned in no idf_component.yml")
            elif pinned[name] != version:
                errors.append(f"{relative(lock)}: {name} is locked at {version}, pinned at {pinned[name]}")
    return len(pinned)


def check_workflow(path: Path, errors: list[str]) -> tuple[int, int]:
    actions = tools = 0
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        where = f"{relative(path)}:{number}"
        stripped = line.strip().removeprefix("- ")
        key, _, rest = stripped.partition(":")
        value = unquote(rest)
        if key == "uses":
            actions += 1
            image = value.removeprefix("docker://")
            if not (value.startswith("./") or ACTION.match(value) or IMAGE.match(image)):
                errors.append(f"{where}: {value} is not pinned to a full commit SHA")
        elif key in ("container", "image") and value:
            actions += 1
            if not IMAGE.match(value):
                errors.append(f"{where}: {value} is not pinned to a digest")
        elif re.fullmatch(r"[A-Z0-9_]+_VERSION", key):
            tools += 1
            if not TOOL_EXACT.match(value):
                errors.append(f"{where}: {key} is {value}, not one exact version")
        elif key in WORKFLOW_VERSION_KEYS:
            if not (TOOL_EXACT.match(value) or ENV_REFERENCE.match(value)):
                errors.append(f"{where}: {key} is {value}, not one exact version")
        for package in GLOBAL_INSTALL.findall(stripped):
            version = package.rpartition("@")[2] if "@" in package.lstrip("@") else ""
            if not (TOOL_EXACT.match(version) or ENV_REFERENCE.match(version)):
                errors.append(f"{where}: {package} is installed without one exact version")
    return actions, tools


def main() -> None:
    errors: list[str] = []
    paths = manifests()
    packages = sum(check_package(path, errors) for path in paths if path.name == "package.json")
    for path in paths:
        if path.name == "pnpm-workspace.yaml":
            check_workspace(path, errors)
    components = check_components(
        [path for path in paths if path.name == "idf_component.yml"],
        [path for path in paths if path.name.startswith("dependencies.lock")],
        errors,
    )
    actions = tools = 0
    for path in paths:
        if relative(path).startswith(".github/workflows/"):
            found = check_workflow(path, errors)
            actions += found[0]
            tools += found[1]
    if errors:
        for error in errors:
            print(f"  {error}", file=sys.stderr)
        print("pinned dependencies error: pin one exact version (ADR 0042)", file=sys.stderr)
        raise SystemExit(1)
    print(
        f"pinned dependencies: {packages} npm packages, {components} firmware components, "
        f"{actions} actions and images, {tools} tool versions"
    )


if __name__ == "__main__":
    main()
