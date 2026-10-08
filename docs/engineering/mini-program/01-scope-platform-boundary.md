# 01 — Scope & Platform Boundary

## Purpose

This specification defines the engineering boundary for a native WeChat Mini Program. TypeScript is the implementation language; WeChat Mini Program is the runtime.

## Governance model

Mini Program Engineering is a peer of Backend Engineering. Contracts sit at the cross-system boundary and define protocol facts. Mini Program Engineering consumes those facts; it does not inherit backend implementation structure.

## In scope

This domain includes `project.config.json`, source root, App/Page/Component, WXML/WXSS, lifecycle, `setData`, navigation, Storage, `wx.*` capabilities, privacy/permission behavior, network integration, packages/subpackages, renderer, performance, testing, Developer Tools, device validation, preview/upload/release, and client-side secret boundaries.

## Out of scope by default

Do not assume DOM/window/document, browser History routing, browser storage/cookies, browser-native fetch/EventSource, HTML/CSS semantics beyond WXML/WXSS, React/Vue lifecycle, SPA/SSR/hydration/service-worker assumptions, or browser bundling behavior.

Frameworks such as Taro, uni-app, Remax, or other cross-platform layers require an additional framework-specific specification. Native runtime constraints still apply to the produced Mini Program.

## Platform authority

Use the [authority map](README.md#authority) by fact type. Official documentation establishes platform support; executable configuration establishes this project's selected baseline. Typings and examples aid investigation but do not prove runtime compatibility. Resolve discrepancies explicitly before changing compatibility targets.

## `project.config.json`

Treat `project.config.json` as executable project truth, not incidental IDE metadata. Before structural/build assumptions, inspect `miniprogramRoot`, `libVersion`, compiler settings, npm/package settings, renderer-related options, and other project configuration.

`project.private.config.json` may override local Developer Tools behavior. Shared correctness must not depend exclusively on one developer's private override.

## Type availability is not runtime compatibility

An API appearing in current typings does not prove the configured base-library can execute it. New platform API use requires both:

```text
type availability
+
base-library/runtime compatibility
```

Do not silently raise compatibility targets merely to make one feature easier.

## Runtime typing

Production Mini Program TypeScript should represent the actual Mini Program runtime. Do not add browser or Node globals to production source merely to silence errors. Separate production/test/tooling type environments if necessary.

## Native-platform-first rule

Do not introduce Web abstractions solely because they are familiar. Use native Page/Component/navigation/lifecycle/platform primitives unless an abstraction solves a real repository problem.

## Rule categories

When documenting a rule, distinguish:

- Platform Constraint — imposed by WeChat/runtime;
- Language/Tooling Constraint — imposed by TypeScript/lint/build tools;
- Engineering Recommendation — reusable design guidance;
- Project Convention — current repository choice.

This prevents project preference from being presented as a platform fact.

## Project Profile responsibility

Concrete values belong in `project-profile.md`: source root, base-library version, package manager, renderer, URLs, auth mechanism, Contract location, commands, package topology, UI system, budgets, active platform capabilities, and release workflow.

## Agent rule

An agent must identify the real Mini Program root/configuration, preserve the configured compatibility boundary, inspect applicable Contracts, and avoid browser/runtime assumptions before implementation.

## Core invariant

Code intended to run as a native WeChat Mini Program must be designed, typed, validated, tested, and reviewed according to the actual configured Mini Program runtime—not according to a generic browser or Node execution model.
