# 03 — TypeScript & Code Quality

## Quality stack

Different tools prove different things:

- TypeScript compiler → language/type correctness;
- ESLint → semantic bug patterns and stable dependency restrictions;
- formatter → mechanical formatting;
- tests → behavior;
- Mini Program compiler/Developer Tools → platform validity;
- device validation → physical/runtime behavior.

None replaces the others.

## TypeScript baseline

Where the repository uses TypeScript, prefer `strict: true`. Evaluate `noImplicitReturns`, `noFallthroughCasesInSwitch`, and `forceConsistentCasingInFileNames` as normal baseline checks.

`exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` are useful strengthening options but should be introduced deliberately as migrations, not opportunistically during feature work.

Do not globally weaken strictness to solve one local integration problem.

## Runtime types

Production TypeScript should represent the Mini Program runtime. Do not add browser/Node globals to silence errors. Separate production/test/tooling tsconfig environments when needed.

Type-check explicitly even when Developer Tools compiles TypeScript; platform compilation and strict type checking are different evidence.

Record the Mini Program API typings package/resolved version, Developer Tools version/channel, and miniprogram-ci version in the Profile when verified. Distinguish dependency ranges from resolved lockfile versions. Tool versions provide validation context; they do not imply runtime support or mandate an upgrade.

## `any`, `unknown`, assertions

Avoid `any` in application code. Prefer `unknown` at untrusted/external boundaries and narrow it deliberately. Localized `any` may be acceptable for genuinely incomplete third-party typings.

Type assertions are programmer claims, not runtime validation. Avoid `as unknown as T`; keep non-null assertions exceptional and local.

## Null/absence semantics

Preserve Contract distinctions among missing fields, `undefined`, `null`, and real values. Do not hide malformed required data using arbitrary `?? default` fallbacks.

## External runtime data

Network responses, Storage contents, route parameters, shared-link input, platform results, and Worker/WebSocket messages are runtime data. TypeScript interfaces do not validate them. Runtime validation/normalization depth should follow risk.

## Contracts

Contract types have one authority. Consume generated types/schemas rather than duplicating them. Generated output is not manually edited.

## Inference and explicit boundaries

Use inference for obvious locals. Prefer explicit types at exported/shared boundaries, DTOs, generic infrastructure, public state contracts, and message protocols.

Model finite state with literal unions/discriminated unions or `as const` where suitable; TypeScript `enum` is not mandatory.

## Async correctness

Promise handling must be explicit. Avoid floating Promises. Intentional fire-and-forget work should be visually explicit and still have an error policy where needed.

Treat caught values as `unknown` and normalize them.

## ESLint

For a current TypeScript project, prefer Flat Config. Use current ESLint recommended correctness rules plus `typescript-eslint` typed rules when project information is available. `recommended-type-checked` is a reasonable general typed baseline; more opinionated configurations should be added intentionally.

Useful typed rules include protection against floating/misused Promises and unsafe `any` flows.

Do not use JavaScript-centric rules such as core `no-undef` to model Mini Program globals when TypeScript already owns that environment.

## Imports and architecture

Use type-only imports consistently where useful. Architecture import restrictions may be encoded in ESLint after directory ownership is stable. Do not add path aliases unless TypeScript, Mini Program compiler/Developer Tools, tests, lint, and build tooling all resolve them consistently.

Avoid circular dependencies. Do not create barrel files for every folder; use them only for deliberate public module surfaces.

## Formatting

Formatting belongs to a formatter, not AGENTS prose. Avoid overlapping style ESLint rules. Verify WXML/WXSS formatter support explicitly before enabling automated formatting for those syntaxes.

## Suppressions

Suppressions should be local and justified. Prefer `@ts-expect-error` over unexplained `@ts-ignore` when an expected compiler error is intentional. Do not globally disable a rule to solve one file.

## Naming and comments

Use stable domain language consistent with Contracts. Avoid introducing synonyms for existing business concepts without reason.

Comments should explain non-obvious constraints and why, not restate code. TODOs should be actionable. Remove dead/commented-out code; version control is history.

## Configuration changes

Changes to `tsconfig`, ESLint, formatter, compiler config, or package manager are repository-wide changes. Do not modify them merely to make one source file pass.

## Core invariant

TypeScript and code-quality tooling should describe the actual Mini Program application/runtime precisely and prevent mechanical/semantic errors without weakening platform boundaries or creating architecture for architecture's sake.
