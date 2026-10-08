# Mini Program Engineering — Enforcement Matrix

## Purpose

Map Engineering rules to the mechanism that should actually enforce them.

```text
objective + stable + machine-judgable
→ compiler / lint / formatter / tests / Mini Program tooling / CI

behavioral invariant
→ deterministic test where possible

platform invariant
→ Mini Program compiler/runtime/device validation

architectural/product trade-off
→ engineering review

repeatable complex workflow
→ Skill

high-impact external action
→ explicit authorized workflow
```

Automation is not the goal; reliable enforcement is.

## Enforcement layers

| Layer | Primary responsibility |
|---|---|
| TypeScript | language/type correctness |
| ESLint | semantic correctness and stable dependency restrictions |
| Formatter | mechanical formatting |
| Tests | deterministic behavior |
| Mini Program compiler/runtime | platform correctness |
| CI | repository-wide gates, generation, budgets, secret/release controls |
| Engineering Review | architecture/trade-off judgment |
| Skills | repeatable multi-step workflows |

## TypeScript

Target production baseline:

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

Evaluate against the current repo before migration. Treat `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` as deliberate strengthening migrations.

Production runtime types should not include browser/Node globals merely to silence errors. Separate test/tooling environments where needed.

Types do not decide architecture, global-state ownership, package independence, or security authorization.

## ESLint

For current TypeScript projects, prefer Flat Config + current recommended correctness rules + `typescript-eslint` type-aware rules when project information is available. `recommended-type-checked` is a reasonable general starting point; do not enable every strict/stylistic rule automatically.

Machine-enforce important async misuse such as floating/misused Promises. Prefer no unexplained explicit `any` in application code while allowing scoped migration/integration exceptions.

Use `no-restricted-imports` or equivalent only for stable architecture boundaries, for example infrastructure must not import Pages or API modules must not import presentation. Do not freeze an experimental folder layout into lint.

Production source may restrict clearly unsupported Node/browser imports/globals by scope. Node tooling/test code receives its own environment.

Do not globally ban every raw `wx.request` AST form unless repository experience shows that a scoped custom rule is worth the false-positive/exception cost; architecture review can remain primary initially.

## Formatter

Mechanical formatting belongs to the formatter. CI uses a check mode; AGENTS should only say to run it, not restate quote/semicolon/indent rules.

Verify WXML/WXSS formatter support before enabling automated rewriting.

## Tests

Unit-test deterministic logic: parsers, transforms, error normalization, retry policy, pagination state, stream framing, generation, Storage migration, permission calculation, Worker messages.

Component/Behavior tests cover properties, local state, events, lifecycle, Behavior composition. Network tests cover auth/envelope/error/timeout/cancel/retry/correlation. Security tests cover client-side redaction/logout/local URL/privacy-coordinator behavior—not backend authorization.

Add regression tests for reproducible deterministic defects.

## Mini Program compiler/runtime

Platform compilation is a standard gate for runtime/config changes because it catches WXML/WXSS/JSON/component/package/compiler failures TypeScript cannot.

`project.config.json`, `app.json`, and Page/Component JSON are executable enforcement. Do not duplicate their facts into unrelated configuration unless another tool genuinely needs them.

Base-library compatibility requires Profile/config inspection plus platform/runtime validation; typings alone are not proof.

## CI

Target PR gate:

```text
locked install
→ docs integrity
→ typecheck / lint / format / tests
→ component/integration tests
→ Mini Program compile
→ generated Contract drift check
→ package/performance budgets
→ deterministic security/secret checks
```

CI should fail objective violations: type/lint/format/test/compile/generation/package-budget/known-secret problems. It should not fail on subjective architecture preferences that cannot be evaluated reliably.

If Contracts generate client artifacts, regenerate and verify no diff. If package budgets exist, enforce against compiled output, not source size. Delta reporting can be informative without blocking every small growth.

Separate PR validation from upload/release authority. Untrusted code must not execute in a secret-bearing release context.

## Review-only decisions

Keep these primarily review-driven:

- Page vs Component;
- whether Behavior/Application Service/Store/adapter is justified;
- whether EventChannel or reload/shared state is appropriate;
- whether Worker/WXS/Worklet/Skyline complexity is justified;
- whether state is genuinely global;
- retry/idempotency semantic safety;
- package/preload/cache trade-offs;
- whether client UI permission logic is being mistaken for backend authorization;
- UX/accessibility/theme quality.

## Skills

Good Skill candidates when actually needed:

- `validate-mini-program-change` — choose validation by affected boundary;
- `debug-mini-program-runtime` — gather config/runtime/log evidence systematically;
- `analyze-package-regression` — inspect compiled size/dependency ownership;
- `release-mini-program-candidate` — run release gate and prepare preview/upload;
- `upgrade-mini-program-baseline` — base-library/toolchain compatibility migration;
- `add-platform-capability` — privacy/config/base-library/testing checklist;
- `migrate-renderer` — coordinate Skyline/renderer migration;
- `diagnose-streaming` — chunk/framing/lifecycle/network diagnosis.

Do not create Skills for ordinary “create Page”, “call API”, or “run lint” tasks when AGENTS + commands already suffice.

## Module matrix

| Engineering module | Primary machine enforcement | Secondary evidence | Review judgment |
|---|---|---|---|
| 01 Platform Boundary | TS env, restricted imports/globals, project config | compile/runtime | framework/runtime boundary |
| 02 Architecture | stable import restrictions | tests | ownership/layer justification |
| 03 TS & Code Quality | TypeScript + ESLint + formatter | CI | suppressions/config migrations |
| 04 Runtime/Lifecycle/State | unit/component tests | runtime/E2E | ownership/lifetime design |
| 05 Network/Contracts/Errors | typed lint + network/API tests + Contract drift | integration/runtime | retry/idempotency/error policy |
| 06 Performance/Packaging | package budgets + compiled metrics | perf/runtime | package/preload/cache/Worker decisions |
| 07 Testing/Validation | CI test gates | runtime/device matrix | sufficient evidence selection |
| 08 Security/Privacy | secret scan + redaction/client-policy tests | runtime/device permission tests | trust/privacy/auth boundary |
| 09 Build/CI/Release | CI workflows + protected credentials | release gate | production authorization |
| 10 Observability | redaction/correlation/telemetry tests | production metrics | signal selection/sampling |
| 11 UI/A11y | Component tests + compile | runtime/device/a11y | UX/theme/accessibility quality |

## Migration order

For an existing project, introduce enforcement incrementally:

1. strict TypeScript baseline + lint + formatter + existing tests;
2. typed lint + stable import restrictions + Mini Program compile validation;
3. Contract drift + package budgets + secret checks;
4. runtime/E2E + performance regression + release automation;
5. specialized Skills.

Each stage should leave the repository green. Do not enable dozens of rules and then globally disable them because the repository cannot comply.

## Project Profile integration

Record current commands and their evidence as VERIFIED, unresolved facts as UNKNOWN, and approved future decisions as TARGET in the [Project Profile](project-profile.md). Proposed gates in this matrix are recommendations, not evidence that CI already runs them.

The standalone docs check is implemented: `node docs/engineering/mini-program/scripts/check-docs.mjs`. It checks document presence, routing coverage, local Markdown links/anchors, Profile schema/status and VERIFIED evidence paths. ACTIVE additionally requires resolved critical facts. It does not execute project commands, inspect source, test remote links, prove evidence content, or claim CI wiring. See [maintenance](maintenance.md).

## Core invariant

Make the repository itself prevent as many invalid states as practical. Keep genuine architectural judgment visible for review instead of converting it into brittle automation.
