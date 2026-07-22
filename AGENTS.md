# SimCore Development Guide

## Purpose

SimCore is an open-source platform for building modular sim racing devices.

The goal is to build a long-term, maintainable platform rather than individual products.

Always optimize for architecture, modularity, readability and long-term maintenance.

---

## Source of Truth

Before implementing any feature, always consult:

1. docs/vision.md
2. docs/architecture.md
3. docs/adr/

If documentation and code disagree, documentation takes priority.

Never invent architecture.

If something is unclear, ask before implementing.

---

## General Principles

- Keep the platform modular.
- Prefer composition over inheritance.
- Avoid tight coupling.
- Keep public APIs stable.
- Keep interfaces small and focused.
- Separate hardware-specific code from platform logic.
- Avoid duplicated code.
- Every component should have a single responsibility.

---

## Architecture

The firmware consists of a modular core.

The core is responsible for:

- startup
- configuration loading
- module lifecycle
- scheduling
- communication
- shared platform services

The core must never contain hardware-specific implementations.

Modules provide functionality.

Drivers (adapters) provide hardware-specific implementations.

New hardware support should primarily require adding a new driver instead of modifying existing modules or the firmware core.

---

## Configuration

Platform behavior should be configuration-driven whenever possible.

Avoid hardcoded device layouts.

Modules should be initialized from configuration.

---

## Performance

Performance is a core requirement.

Always prefer:

- DMA
- zero-copy when practical
- efficient memory usage
- efficient rendering
- non-blocking code
- FreeRTOS friendly design

Avoid unnecessary allocations.

Avoid unnecessary copies.

---

## Code Quality

Prefer readable code over clever code.

Keep functions small.

Document public APIs.

Prefer constexpr where appropriate.

Avoid global mutable state.

Avoid hidden side effects.

---

## Before Writing Code

Always:

- understand the problem
- inspect existing architecture
- identify affected modules
- propose implementation if architecture changes
- reuse existing abstractions

Never introduce a new abstraction without a clear reason.

---

## During Implementation

Implement the smallest complete solution.

Avoid unrelated refactoring.

Keep commits focused.

If architectural changes are required, stop and ask first.

---

## After Implementation

Review your own code.

Check for:

- unnecessary complexity
- duplicated logic
- architecture violations
- API consistency
- naming consistency
- performance regressions

Explain important design decisions in the final response.

---

## Communication

When working on larger tasks:

1. Analyze.
2. Create a plan.
3. Wait for approval.
4. Implement.
5. Review.

Do not skip the planning step for complex work.

---

## Goal

Every change should make SimCore easier to extend, easier to understand, and easier to maintain.