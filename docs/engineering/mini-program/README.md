# Mini Program Engineering

## Purpose

Mini Program Engineering is the reusable engineering baseline for native WeChat Mini Program development. It defines the runtime boundary, architecture, TypeScript quality, lifecycle/state, network and Contracts, performance and packaging, validation, security/privacy, build/release, observability, and UI/accessibility model.

It intentionally does not become a generic Web handbook or a copy of the WeChat API reference.

## Governance position

```text
Engineering Governance
├─ Contracts
├─ Backend Engineering
├─ Mini Program Engineering
└─ other platform engineering
```

Contracts define facts that cross system boundaries. Mini Program Engineering defines how the native client consumes those facts. `project-profile.md` records this repository's concrete choices. `AGENTS.md` is the concise execution/routing layer. Tool configuration machine-enforces objective rules.

## Authority

Classify the disputed fact first; these sources are not a universal ranking. Explicit task instructions determine intended changes; do not silently rewrite unrelated contracts or configuration to reconcile a conflict.

| Fact type | Authority |
|---|---|
| Platform capability and limits | Official WeChat runtime documentation, with evidence for the supported client/base-library matrix |
| Executable project facts | Relevant project/app/compiler/package/lockfile/CI configuration |
| Cross-system protocol | The designated Contract and its authoritative generator/source |
| Repository decisions and verified snapshot | Project Profile, with evidence; resolve stale entries against their owning source |
| Reusable engineering policy | The relevant module in this directory |
| Local implementation convention | Existing implementation as evidence, not automatically intended design |
| Experiential reference | Community examples, evaluated against the above boundaries |

When current configuration cannot support intended behavior, surface the compatibility decision rather than treating either the newest API or the old implementation as automatic permission to migrate.

## Core specifications

| File | Primary question |
|---|---|
| [01-scope-platform-boundary.md](01-scope-platform-boundary.md) | What platform/runtime is actually executing this code? |
| [02-architecture.md](02-architecture.md) | Who should own this responsibility? |
| [03-typescript-code-quality.md](03-typescript-code-quality.md) | Which invalid implementations can tooling prevent? |
| [04-runtime-lifecycle-state.md](04-runtime-lifecycle-state.md) | Who owns this state/resource and how long is it valid? |
| [05-network-contracts-errors.md](05-network-contracts-errors.md) | How does external communication preserve transport/business/UI boundaries? |
| [06-performance-packaging.md](06-performance-packaging.md) | Who pays this loading/render/runtime cost, and when? |
| [07-testing-validation.md](07-testing-validation.md) | What evidence is sufficient to prove this behavior? |
| [08-security-privacy-capabilities.md](08-security-privacy-capabilities.md) | Which side is trusted to decide, and what consent applies? |
| [09-build-ci-release.md](09-build-ci-release.md) | How does reviewed source become a traceable releasable artifact? |
| [10-observability-diagnostics.md](10-observability-diagnostics.md) | If this fails in production, what safe evidence explains it? |
| [11-ui-interaction-accessibility.md](11-ui-interaction-accessibility.md) | Does presentation remain correct across state/device/theme/accessibility? |
| [enforcement-matrix.md](enforcement-matrix.md) | Which rules belong in compiler/lint/tests/CI/review/Skills? |
| [project-profile.md](project-profile.md) | Which repository facts are verified, unknown, or targets? |
| [maintenance.md](maintenance.md) | How is this baseline installed, checked, and maintained? |

## Common routing

- Component change → Architecture + Runtime + UI + Testing.
- Behavior change → Architecture + Runtime + Testing.
- HTTP/API/DTO change → Network + Contracts + Security + Testing.
- Page lifecycle/state change → Runtime + Testing, plus UI if user-visible.
- Subpackage/preload change → Architecture + Performance + Build.
- Login/privacy/device capability → Security + Runtime + Testing + UI as applicable.
- Streaming/WebSocket → Network + Runtime + Testing + Observability.
- Worker → Architecture + Runtime + Performance + Testing + Observability.
- Renderer/Skyline migration → UI + Architecture + Build + Testing + Performance.
- Release/CI change → Build + Security + Testing.

## Platform capability placement

A platform API does not automatically create a new Engineering domain. Place it in the existing problem domains:

- Component/Behavior/EventChannel → Architecture/Runtime/Testing.
- WXS/Worklet → UI/Platform Boundary/Performance.
- Worker → Architecture/Runtime/Performance/Testing/Observability.
- Storage → Runtime/Security/Testing.
- WebSocket/upload/download/chunked streaming → Network/Runtime/Testing.
- ordinary/independent subpackages and preload → Performance/Architecture.
- sharing → UI/Security/Runtime.
- subscription consent → Security/UI; backend delivery → Backend/Contracts.
- privacy/device permissions → Security/Testing.
- renderer → UI/Architecture/Build/Testing.

## Project design notes

Use the [project documentation index](../../project/README.md) for current-user synchronization, component integration and local capability design when relevant. These notes carry their own evidence status and do not replace Contracts or VERIFIED Profile facts.

## Project-specific facts

Reusable Engineering intentionally does not hard-code the actual source root, base-library version, AppID, package manager, renderer, UI library, package map, URLs, commands, budgets, or release workflow. Those belong in `project-profile.md` and executable repository configuration.

## Contracts

Do not duplicate protocol schemas here. The relationship is:

```text
Contracts
→ what crosses the boundary

Mini Program Engineering
→ how the client safely consumes it
```

Generated Contract artifacts should be edited through their authoritative Contract/generator, not manually.

## Machine enforcement

Move stable objective rules into tools when practical:

- type safety → TypeScript;
- semantic correctness and stable dependency restrictions → ESLint;
- mechanical formatting → formatter;
- deterministic behavior → tests;
- WXML/WXSS/project/package validity → Mini Program compiler/tooling;
- generated Contract drift/package budgets/secrets/release gates → CI;
- architecture trade-offs → engineering review;
- repeatable multi-step workflows → Skills.

Do not convert subjective architectural judgment into brittle lint rules merely so every sentence is automated.

## Working sequence

For non-trivial Mini Program work:

```text
AGENTS.md
→ project-profile.md
→ this README routing map
→ relevant Engineering module(s)
→ relevant Contracts
→ implementation
→ change-driven validation
```

Do not load every Engineering document mechanically for every edit.

## Core invariant

Mini Program Engineering should remain platform-aware, architecture-lightweight, type-safe, lifecycle-correct, contract-driven, security-bounded, performance-conscious, testable, releasable, observable, and accessible—without becoming an enterprise-layer template or a generic Web architecture transplanted onto the WeChat runtime.
