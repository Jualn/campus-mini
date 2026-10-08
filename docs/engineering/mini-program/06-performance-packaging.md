# 06 — Performance & Packaging

## Purpose

Maintain predictable startup, interaction, rendering, package loading, and resource behavior as the Mini Program grows. Optimize measured or structurally predictable costs, not everything preemptively.

## Performance stages

```text
download/package cost
→ code initialization
→ Page initialization
→ data acquisition
→ setData/rendering
→ interaction/runtime work
```

A feature may be fast in one dimension and slow in another. Identify the expensive stage first.

## Packaging is architecture

Subpackages define what must exist at startup, what may load later, feature ownership, and dependency boundaries. Architecture defines ownership; performance defines loading cost. Both must agree.

## Main package

Keep startup-critical and genuinely broad shared code in the main package. Do not make the main package “everything reused by more than one feature.” Optional features should not impose startup cost solely for import convenience.

Use a project-defined main-package budget rather than targeting only the platform rejection limit.

## Ordinary subpackages

A subpackage should represent a coherent optional route/capability boundary with meaningful delayed-loading value. Do not create one tiny subpackage per Page mechanically.

Keep feature-local code/resources package-local where practical. When several packages need one dependency, weigh dependency size, usage frequency, startup criticality, duplication, platform availability rules, and maintenance cost.

## Independent subpackages

`independent: true` is an architectural promise: the package can establish the required runtime conditions without relying on the main package's initialization/global state/styles/modules.

Do not make a package independent merely to improve metrics. Review `getApp().globalData`, shared state, global styles, main-package modules, auth bootstrap, and other implicit dependencies.

## Preload

`preloadRule` moves cost earlier; it does not remove cost. Preload only when user flow makes the next package predictably likely. Do not preload every optional package from home.

## Lazy code loading

Treat lazy code loading as a package/runtime build decision. Evaluate supported base library, component dependency graph, startup path, and compiler configuration. Do not enable opportunistically for one benchmark.

## Package budgets

Maintain project budgets for at least:

- main package;
- important subpackages;
- full compiled package.

Platform hard limits and project budgets are different concepts. Project budgets should fail before a platform rejection boundary becomes the only guard.

Measure compiled output, not raw source-directory size. CI may also report deltas to make growth visible.

## Dependencies

For runtime npm dependencies evaluate necessity, compiled size, which packages import them, build/tree-shaking behavior, Mini Program compatibility, maintenance, and security. Tool-only dependencies should not enter runtime packaging.

Do not rewrite complex standards/security libraries merely to save trivial bytes; do not add huge general libraries for one tiny helper without evidence.

## `setData`

Treat each `setData` as logic-to-render synchronization. Cost depends on frequency, payload size, changed structure, and render work.

Do not send data the view does not need. Avoid replacing giant unrelated objects for one local change. Avoid high-frequency updates directly from scroll/progress/stream/timer callbacks; aggregate/throttle/batch into meaningful UI updates where appropriate.

Batch coherent state transitions. Keep runtime-only objects out of `data`.

## Derived data

Balance computation cost, update frequency, data size, and consistency risk. Do not store every trivial derived value; do not repeat genuinely expensive derivation in hot render paths.

## Long lists

Use pagination/incremental loading and bounded retained data where appropriate. Control data volume before rendering thousands of items. Introduce virtualization/recycling only when item count, node count, memory, or interaction performance justifies the complexity.

## Images/static resources

Images frequently dominate download/memory cost. Match delivered dimensions to display needs, compress appropriately, choose supported formats, define loading/failure behavior, and consider remote versus package ownership.

Do not package large optional media solely because local referencing is convenient. Local resources improve availability but increase package cost; remote resources reduce package size but introduce network/failure/cache behavior.

## Components and styles

Components improve ownership but are not free. Avoid pathological deep trees created purely for abstraction. Keep feature styles feature-local; avoid dumping all WXSS into `app.wxss`. Global style/token surfaces should be genuinely global.

## Hidden work

A hidden Page may still be alive. Pause/stop foreground-only polling, timers, media, observers, or expensive work according to lifecycle ownership. Avoid `onShow → reload everything` as a universal freshness strategy.

## Requests and critical path

Do not optimize request count alone. Evaluate latency, payload size, parallelism, dependency order, backend cost, and user-visible critical path.

Separate required startup data from optional/background work. Independent initialization tasks may run concurrently; dependent operations remain sequential.

## Worker

Worker is not automatically a performance win. It introduces startup/message-transfer/lifecycle/recovery cost. Use it when main-thread isolation of expensive computation clearly outweighs that complexity. Results still need stale-generation protection.

## WXS/Worklet

WXS/Worklet may reduce specific rendering-interaction costs but are not blanket recommendations. Use them only for platform-supported presentation problems with concrete value.

## Metrics

Useful project-level measurements may include main/sub/full package size, startup/first useful render, critical API latency, render data volume, hot-path `setData` frequency/payload, list behavior, and resource weight. Start with metrics that can regress silently and materially.

## Optimization order

```text
1. identify expensive stage
2. remove unnecessary work/data/dependencies
3. delay noncritical work
4. reduce synchronization/rendering volume
5. improve package/loading boundary
6. apply specialized optimization
```

Avoid JavaScript micro-optimization policy unless measured relevance exists. Platform-boundary costs generally matter more.

## Safety

Performance must not weaken correctness, authorization, state ownership, error handling, lifecycle cleanup, or Contract semantics.

## Core invariant

Startup pays only necessary startup cost; optional features pay cost when relevant; rendering receives only required state; background runtime performs only owned work; compiled packages remain within explicit project budgets.
