# AGENTS.md

## Repository

This repository contains a native WeChat Mini Program implemented primarily in TypeScript. Treat the WeChat Mini Program as the production runtime. Do not assume browser, DOM, Node.js runtime, React, Vue, Taro, uni-app, or other Web/framework semantics unless the repository explicitly introduces them.

Before relying on paths, base-library capabilities, renderer behavior, package layout, or build commands, inspect the repository configuration and Project Profile.

## Read before non-trivial work

Read, in order:

1. [Project Profile](docs/engineering/mini-program/project-profile.md)
2. [Engineering routing index](docs/engineering/mini-program/README.md)
3. only the Mini Program Engineering documents relevant to the change
4. applicable Contracts before changing client/backend protocol behavior

For repository-specific state/component/capability work, follow the [project documentation index](docs/project/README.md) as relevant. Respect its evidence labels; design notes are not proof that implementation or runtime behavior was verified.

Do not read all Engineering documents mechanically for every task. Use the README as the routing index.

Repository configuration remains authoritative for executable facts such as `miniprogramRoot`, `libVersion`, package configuration, renderer, and compiler settings. If the Project Profile disagrees with executable repository configuration, verify repository state and update stale documentation when appropriate.

## Platform boundary

Preserve native Mini Program semantics. Do not introduce browser-only APIs or assumptions such as `window`, `document`, browser `localStorage`, browser History routing, browser-native `fetch`, or `EventSource` unless a verified project-specific runtime/tooling boundary provides them.

Type availability does not prove compatibility with the project's configured base-library version. Do not raise compatibility targets, change renderer/component framework, or introduce a cross-platform framework merely to simplify one implementation.

## Architecture

Follow existing ownership before creating abstractions. Prefer the smallest sufficient structure:

- route/screen behavior → Page
- reusable UI behavior → Component
- shared Component-instance capability → Behavior
- parent/child communication → properties + semantic custom events by default; documented public commands/native relations when justified (see Architecture)
- direct `navigateTo` Page relationship → EventChannel where appropriate
- simple backend operation → domain API
- multi-step reusable workflow → application/service operation when justified
- persistent local semantics → Storage boundary
- repeated platform policy → platform adapter
- pure reusable logic → TypeScript module/function

Do not introduce `Action`, `Service`, `Repository`, `Manager`, `Store`, `Adapter`, or similar layers when they only forward calls. Do not introduce a global EventBus or global Store for local state by default.

## Contracts and backend boundary

Contracts define cross-system protocol facts. Do not independently redefine request/response fields, enum values, nullability, authentication semantics, pagination models, or backend error meanings for client convenience.

For protected operations, client permission checks are presentation behavior; backend authorization remains authoritative. Client duplicate-submit guards do not replace backend idempotency or concurrency protection.

Modify generated Contract artifacts through their authoritative source/generator rather than editing generated output manually.

## Runtime and state

Respect App, Page, Component, and Behavior lifecycles. Do not treat `onHide` as destruction or `onUnload` as equivalent to temporary hiding.

Put values in `data` because the view needs them, not merely because runtime code needs access to them. Do not place request tasks, timers, observers, sockets, Workers, generation counters, or service instances into render state without a platform-specific reason.

Use `setData` for render-state synchronization. Protect replaceable asynchronous operations from stale results when older work can complete after newer work. Storage is persistence, not a Store, EventBus, or backend source of truth.

## Network

Use the repository's existing network boundary. Do not scatter raw `wx.request` policy, authentication headers, base URLs, or common error handling through Pages.

Preserve task capabilities when a feature requires cancellation, upload progress, streaming, WebSocket, or other task-specific behavior. Do not blindly retry mutations. Retry behavior must respect backend idempotency and logical-operation semantics.

Do not parse raw network chunks as complete application messages unless the protocol explicitly guarantees that framing.

## Security and privacy

Never place server-side secrets in Mini Program source, shipped configuration, logs, documentation examples, or Storage. This includes AppSecret, WeChat server access tokens, `session_key`, backend credentials, and Mini Program code-upload private keys.

Do not weaken production domain, certificate, privacy, authorization, or permission controls to make development easier. Sensitive platform capabilities must follow the project's privacy and permission flow. Do not add unrelated permissions or data collection while implementing another feature.

Do not log credentials, authorization headers, sensitive personal data, or complete private payloads.

## UI and platform capabilities

Reuse the project's established UI system, Components, tokens, theme strategy, and renderer. Do not introduce another UI framework, renderer, design-token system, custom navigation framework, WXS architecture, Worker subsystem, or global styling model for an isolated feature.

Preserve applicable loading/content/empty/error, submitting/disabled, long-text, safe-area, theme, and accessibility states.

Use WXS, Worker, Worklet, Skyline, independent subpackages, background modes, or similar specialized capabilities only when their platform-specific value is justified.

## Packages and performance

Respect the existing main-package and subpackage ownership model. Do not move optional feature code into the main package merely for convenient imports. Do not make a package independent or add preload rules solely to improve a metric.

Consider compiled package impact when adding runtime dependencies or large static resources. Avoid unnecessary high-frequency or oversized `setData` operations. Use repository-defined package budgets and compiled-output checks when available.

## Validation

Use the commands defined by the Project Profile and repository scripts. Choose validation according to the affected boundary.

Select the smallest sufficient validation set from module 07 for the changed behavior. Typecheck, lint, tests, compile, runtime, and device checks are complementary tools, not a mandatory full checklist for every edit. Documentation-only changes use the docs-integrity command below.

Do not claim a higher-fidelity behavior was validated by a lower-fidelity environment. If required validation cannot be performed, report exactly what remains unverified.

## Change discipline

Make the smallest maintainable change that satisfies the task. Preserve existing repository patterns unless the task explicitly changes architecture.

Do not perform unrelated refactors, formatting sweeps, dependency migrations, framework changes, renderer migrations, or toolchain upgrades. Do not delete or weaken tests, lint rules, type checks, package budgets, or security controls merely to make a change pass.

When fixing a reproducible defect, add or update a regression test when the failure can be deterministically expressed at an appropriate testing layer.

## Documentation checks

Run `node docs/engineering/mini-program/scripts/check-docs.mjs` after governance edits. See [document maintenance](docs/engineering/mini-program/maintenance.md). An installed baseline can have a TEMPLATE Profile; UNKNOWN facts are not verified runtime facts or permission to guess commands. Resolve only facts needed for the current task from the applicable authority, within the user-authorized scope. If access is excluded, report the dependent validation gap.

## Documentation synchronization

Update durable documentation when the change alters a durable repository fact, including source root, base-library baseline, renderer/component framework, package manager/toolchain, architecture boundary, Contract generation/location, shared-state mechanism, package topology, UI foundation/theme strategy, platform-capability inventory, validation commands, build/release workflow, or observability/correlation convention.

Do not update the Project Profile for ordinary feature work when none of those facts changed.

## Privileged actions

Ordinary engineering work may run local/repository validation such as typecheck, lint, tests, build, Mini Program compile validation, and package analysis.

Do not implicitly perform credential-bearing or remote Mini Program preview, code upload, production release, production credential changes, or production environment changes. These require explicit user intent or the repository's authorized release workflow.

Never expose code-upload private keys or other protected credentials to ordinary validation jobs.

## Completion

Before finishing:

1. verify the changed behavior with the appropriate validation level;
2. inspect the final change for unrelated edits;
3. confirm no secrets or sensitive diagnostic data were introduced;
4. update affected durable documentation when required;
5. report checks actually run and any remaining validation gaps.

Do not claim completion based only on code generation or compilation when the changed behavior requires stronger evidence.
