# 07 — Testing & Validation

## Evidence model

```text
Static checks
→ pure unit tests
→ Component/Behavior simulation
→ Developer Tools/runtime automation
→ platform compile/preview validation
→ real-device validation where required
```

These are complementary evidence layers. A test proves only behavior its environment can observe.

## Static checks

Use TypeScript, ESLint, formatter, stable import restrictions, and configuration validation for cheap deterministic failures. Passing them does not prove lifecycle timing, platform APIs, networking, rendering, permission, or device behavior.

## Pure TypeScript tests

Good candidates include parsers, validators, formatters, reducers/state machines, pagination logic, error normalization, retry decisions, DTO transforms, permission calculations, stream framing/decoder, generation logic, Storage migration, Worker message handling.

Do not instantiate a Page merely to test pure logic; also do not extract meaningless layers solely to make trivial Page code unit-testable.

Test observable behavior, not private implementation variables.

## Determinism

Control wall clock, randomness, network, Storage, globals, and timers where they affect tests. Use fake clocks for debounce/retry/expiry instead of real multi-second sleeps.

## Component/Behavior tests

Test meaningful properties → rendered state, local transitions, custom events, observers, lifecycle, Behavior contribution/composition. Simple passive wrappers do not require exhaustive tests.

`miniprogram-simulate`-style simulation can validate custom Component behavior but is not the real dual-thread Mini Program runtime and does not provide real implementations of every `wx.*` capability. Mocking proves application reaction, not the actual platform API.

Built-in/native component behavior (camera/map/video/input/scroll quirks, etc.) may require Developer Tools/device validation.

## Page/lifecycle tests

Keep reusable logic unit-testable; use runtime automation for Page routing, lifecycle sequencing, Page stack, Mini Program module resolution, WXML/WXSS behavior, subpackage loading, and actual runtime integration.

Lifecycle-sensitive defects should be tested at the highest practical fidelity.

## Async-race tests

Deterministically test stale-result scenarios:

```text
A starts
B starts
B resolves
A resolves
→ B remains published; A is discarded
```

Important for search/filter/pagination reset/refresh/account changes/streaming.

## Cleanup tests

Where important, verify timers cleared, listeners removed, observers disconnected, streams/sockets aborted/closed, subscriptions released, and Workers terminated/replaced according to ownership.

## Network tests

Test base URL/auth/common headers/envelope/status/business error/timeout/cancel/retry/correlation behavior at the HTTP boundary. Test endpoint/method/DTO/query mapping at domain API boundaries when meaningful.

## Contract tests

If client artifacts are generated, CI should regenerate and verify no drift. Otherwise use representative integration/runtime validation for critical protocol boundaries. Do not duplicate the whole backend test suite in the client repository.

## Runtime validation

Where runtime schema/normalization exists, test valid and invalid response/storage/message cases. Test retry policy without real sleeps. Test cancellation separately from freshness.

Streaming parser minimum cases: one event in one chunk, event split across chunks, multiple events in one chunk, UTF-8 split across chunks, partial trailing frame, malformed event, completion, cancellation.

Pagination minimum cases: initial, load-more, no-more, refresh/reset, duplicate prevention, error/retry, query change, old response after reset.

Storage: read/write/remove/logout clearing/expiry/schema migration/malformed value/missing value.

## Developer Tools automation

Use runtime automation for important repeatable user journeys: launch, navigation, element interaction, Page state, core flows. Do not automate every visual detail by default. Prefer state/element conditions over fixed sleeps.

E2E should use controlled non-production data/environment. Mocks/stubs/test backend/real platform services are different evidence; choose explicitly.

## Real device

Physical-device validation is required when behavior materially depends on camera, microphone, Bluetooth, location, network switching, background/foreground behavior, device performance, system permissions, subscription-message authorization, media/files, keyboard/input, accessibility, or platform-specific rendering.

The concrete device matrix belongs in the Project Profile.

## Auth/privacy/platform flows

Test session/token logic at unit level, header attachment at network level, expired-session behavior at runtime level, and actual WeChat login/permission/privacy integration at Developer Tools/device level as appropriate.

Mocked privacy/permission branches prove application policy; actual integration needs platform validation.

## Upload/download

Separate tests for progress/state reducer, task adapter, test-backend integration, and device file/media behavior as needed.

## Rendering/visual

Use Component assertions, runtime inspection, controlled screenshot regression, manual review, or device inspection according to risk. Snapshot tests are selective, not the default assertion style.

## Compile validation

Every runtime-source/config change should eventually prove that the Mini Program compiler accepts WXML/WXSS/JSON/component registration/subpackage configuration. Passing `tsc` is not sufficient.

Use the actual repository project configuration, not an artificial source root/build variant.

## Validation matrix

Typical minimum evidence:

- pure TS utility → typecheck + lint + unit;
- API/DTO mapping → static + API tests;
- Component/Behavior → static + component test;
- Page UI/lifecycle → compile + relevant runtime validation;
- network/streaming → unit/integration + compile/runtime as needed;
- Storage → Storage tests + runtime where platform behavior matters;
- package config → compile + package validation;
- permission/privacy → Developer Tools + required device test;
- release pipeline → full release gate.

## Regression and coverage

Add regression tests when defects can be expressed deterministically. Coverage is an observation tool, not a correctness score. Prioritize authentication, network/error normalization, mutations, stream parsing, state transitions, Storage migration, and critical user journeys over arbitrary line percentages.

## Mocks

Mock architecture boundaries, not several private functions inside one module. Mocks should preserve relevant async/cancel/late-callback semantics. Restore global/platform state between tests.

## Flakiness

A flaky test is a defect in the validation system. Investigate timing assumptions, shared state, external dependencies, selectors, environment variation, and real-time waits. Do not normalize retries as the permanent answer.

## CI tiers

PR: static checks + unit/component + compile + deterministic gates.

Release: PR checks + package/performance + critical runtime automation + required preview/device/manual checks.

Stable repository commands form the interface used by developers, agents, CI, and Skills.

## Core invariant

A test may only be treated as evidence for behavior that its execution environment can actually observe. Lower-fidelity evidence must never be silently promoted into proof of higher-fidelity platform/device behavior.
