# AGENTS.md

## Repository

This repository contains a native WeChat Mini Program implemented primarily in TypeScript. Treat the WeChat Mini Program as the production runtime. Do not assume browser, DOM, Node.js runtime, React, Vue, Taro, uni-app, or other Web/framework semantics unless the repository explicitly introduces them.

Before relying on paths, base-library capabilities, renderer behavior, package layout, or build commands, inspect the repository configuration and Project Profile.

## Read before non-trivial work

For non-trivial work, first use the [Engineering routing index](docs/engineering/mini-program/README.md) to classify the affected boundaries. Consult only relevant facts/rows of the [Project Profile](docs/engineering/mini-program/project-profile.md), their executable authorities, the corresponding Engineering modules, and applicable Contracts when protocol behavior is involved. Do not mechanically load the full Profile and all modules for each task.

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

## Change routing and UI

Classify the change before expanding context: local Page/UI, shared Component or tokens, client state/platform, Contract/protocol, or cross-workspace workflow. Read only relevant modules, Profile facts, accepted product decisions and existing source/consumers. A local UI change does not imply a Contract change; if the Page needs new server-owned facts or semantics, report the gap to Contracts and resume against the accepted revision.

For new Pages or meaningful flow changes, reason about user task, entry, information priority, actions, transitions, feedback and recovery before implementing the relevant Contract data. Reuse established Page/Component patterns and verified native Mini Program capabilities. For local styling edits, do not require a new design document. For shared Component or theme changes, inspect consumers and public behavior; see [UI engineering](docs/engineering/mini-program/11-ui-interaction-accessibility.md) and [Architecture](docs/engineering/mini-program/02-architecture.md).

## Contracts and backend boundary

Contracts define cross-system protocol facts. Do not independently redefine request/response fields, enum values, nullability, authentication semantics, pagination models, or backend error meanings for client convenience.

For protected operations, client permission checks are presentation behavior; backend authorization remains authoritative. Client duplicate-submit guards do not replace backend idempotency or concurrency protection.

Modify generated Contract artifacts through their authoritative source/generator rather than editing generated output manually. Cross-workspace handoff identifies an accepted Contract revision/change reference, affected operations/schemas, compatibility and consumers—not copied schema text. Page/backend discoveries may request Contract changes; do not independently redefine protocol or assume parallel implementation permits simultaneous release. See [Contract handoff](docs/engineering/mini-program/05-network-contracts-errors.md#cross-workspace-contract-handoff).

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

Select the smallest sufficient validation set from module 07 for the changed behavior. Typecheck, lint, tests, compile, runtime, and device checks are complementary tools, not a mandatory full checklist for every edit. Define scope before running costly suites or starting dependent services. Never create/reset shared test databases, containers, or external services without appropriate environment ownership/authorization. Documentation-only changes use the docs-integrity command below.

Do not claim a higher-fidelity behavior was validated by a lower-fidelity environment. If required validation cannot be performed, report exactly what remains unverified.

## Change discipline

Make the smallest maintainable change that satisfies the task. Preserve existing repository patterns unless the task explicitly changes architecture.

Do not perform unrelated refactors, formatting sweeps, dependency migrations, framework changes, renderer migrations, or toolchain upgrades. Do not delete or weaken tests, lint rules, type checks, package budgets, or security controls merely to make a change pass.

When fixing a reproducible defect, add or update a regression test when the failure can be deterministically expressed at an appropriate testing layer.

## Documentation checks

Run `node docs/engineering/mini-program/scripts/check-docs.mjs` after governance edits. See [document maintenance](docs/engineering/mini-program/maintenance.md). An installed baseline can have a TEMPLATE Profile; UNKNOWN facts are not verified runtime facts or permission to guess commands. Resolve only facts needed for the current task from the applicable authority, within the user-authorized scope. If access is excluded, report the dependent validation gap.

## Documentation synchronization

Maintain only the authority whose lasting fact or decision changed: Contracts for protocol; code/config for current implementation and Component public API; Project Profile for verified repository-wide facts; accepted project design for durable product behavior; the owning Engineering module for reusable policy. Local styling, routine implementation and temporary design explorations do not automatically create or update permanent documents. For shared Component API, state semantics or global tokens, inspect and update impacted consumers/tests and any maintained usage contract. See [document maintenance](docs/engineering/mini-program/maintenance.md).

Do not update the Project Profile for ordinary feature work when its durable facts did not change. Git retains change history; do not create routine audit or task-summary documents.

## Git collaboration

Follow the shared [Git collaboration baseline](../Operations/git-collaboration.md). Implementation work may selectively stage and commit coherent, task-owned changes within the authorized scope. Preserve existing edits and staged changes. Check authorization separately for pushing, opening PRs, merging, and production actions. WeChat preview, upload, and release follow the platform rules below.

The user authorizes ongoing, judgment-based local Git management in this repository; routine safe local operations and task-owned commits do not require repeated confirmation. Apply these rules:

- Start by checking the branch/upstream, worktrees, staged changes and working-tree changes. Distinguish current task changes, reviewed backlog, unrelated work and uncertain files; branch names and file names alone do not establish ownership or completion.
- Reuse the relevant development branch. Create a branch when it gives an independent task or backlog integration a clear home; preserve existing branch references. Do not move mixed working changes between branches/worktrees without checking that they remain intact.
- Commit a coherent behavior or independently useful phase with its required consumers, assets and tests. Inspect new files as well as tracked diffs. Do not use blanket staging or a catch-all commit merely to obtain a clean working tree. Backlog cleanup requires explicit review of boundaries and dependencies.
- Stage explicit paths or reviewed hunks, then inspect the entire staged diff, including pre-existing staged content, for scope, omissions and sensitive data. Preserve unrelated staged changes; if they prevent a safe commit, leave them intact and ask the user to decide. Check status again after committing.
- Validate the content being committed. Tests run against a mixed working tree do not prove that a smaller staged commit works independently; verify its dependencies or validate an isolated candidate when necessary. Record actual checks and limitations. A WIP checkpoint needs a deliberate preservation purpose and a clear unfinished scope; it does not imply acceptance or release readiness.
- When ownership, intended behavior, removal, grouping or conflicting changes cannot be established from evidence, present the concrete files/options and ask the user. Continue independent safe work. Never infer that old, unused-looking, duplicate or failing files may be discarded.
- Deleting branches/worktrees, dropping stashes, discarding files, broad restore/reset/clean, rebasing/amending existing history, merging into main and remote/production actions require authorization for the specific action. Do not use stash, ignore rules or backup commits simply to hide unresolved work. Check concurrent changes before any mutation that could overwrite them.
- Finish with the branch, relevant commits, checks and remaining uncommitted scope or decisions. A clean working tree is an outcome only when all included work has been deliberately accounted for.

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
