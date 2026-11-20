# ADR 0042: Pinned Dependencies and Reviewed Updates

Status: Accepted. Build and tooling only — no firmware, schema or application change.

## Context

In 2025 attackers published new versions of popular npm packages from stolen
maintainer accounts, and one of them, the Shai-Hulud worm, spread by running its
install script on every machine that installed it. An action tag can be moved to
other code the same way, as `tj-actions/changed-files` was in March 2025. A
version range, a tag or an update bot lets such a version in without anyone
choosing it.

The lock files already fixed every installed version with a checksum, and CI
installs from them only, so a range mattered when a lock file was written again.
That moment is real: re-solving the firmware lock after one manifest edit took
`espressif/tinyusb` from 0.21.0~1 to 0.21.0~6, a revision published seven days
earlier. CI fetched the newest pnpm 11, Node 24 and .NET 8 SDK on every run, used
actions by major tag and the ESP-IDF image by tag, and gave every job a token
that could write to the repository.

## Decision

**Everything the build fetches is pinned to one exact version.** That is every
package in `package.json` and every pnpm `overrides` target; every ESP-IDF
registry component, the ones another component pulls in included, in the
`idf_component.yml` of the component that needs it; every GitHub Action by full
commit SHA; the container image by digest; and pnpm, Node, .NET and SimHub in the
workflow's `env`. `tools/check_pinned_dependencies.py` runs first in CI and fails
on a range, a tag, a missing digest, or a component the lock files hold that no
manifest pins.

**A new version waits and is checked before it is used.** `pnpm-workspace.yaml`
sets `minimumReleaseAge: 10080`, seven days, written out because pnpm's built-in
24-hour default quietly excludes a younger version instead of stopping, and
`trustPolicy: no-downgrade`, which refuses a version published with less
evidence of where it came from than an earlier one. `saveExact` makes `pnpm add`
write an exact version. A version is updated only after its release notes,
publisher, install scripts and new dependencies have been read and the build
passes. An exception names exact versions in `minimumReleaseAgeExclude` or
`trustPolicyExclude`, and the commit that adds it records the review; the first
are `semver` 5.7.2 and 6.3.1, back-ports the npm team published by hand in July
2023.

**No bot opens update pull requests.** Dependabot's version and security updates
stay off. Its alerts stay on: they change no code, and they are one reason to
start a review.

**The workflow token only reads.** `permissions: contents: read` is the default,
the release job alone may write, and no checkout leaves the token on disk for a
package's code to find.

## Consequences

- Nothing changes version by itself. Every update is a reviewed commit, and an
  urgent security fix younger than seven days needs an explicit exception.
- The trust check also stops some honest releases; each one needs a reviewed
  exception.
- A lock file changes only with a manifest, and its diff is part of the review.
- Workflow files carry no comments, so an action's release is not written beside
  its SHA; the commit that moves a pin names it.
- The pnpm on a developer's machine is not pinned by the repository; it should
  match `PNPM_VERSION` in the workflow.
