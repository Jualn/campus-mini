# 04 — Runtime, Lifecycle & State

## Runtime model

```text
Mini Program App
├─ Page instance
│  ├─ lifecycle
│  ├─ render state
│  └─ Components
│     ├─ component lifecycle
│     ├─ properties/data
│     ├─ Behaviors
│     └─ events
├─ shared application state
├─ persistent local Storage
└─ platform resources
   ├─ request/socket/stream tasks
   ├─ timers/listeners/observers
   └─ other wx.* capabilities
```

Lifecycle defines ownership, not just callback timing.

## App lifecycle

Use App lifecycle for application-wide startup/foreground/background/global platform concerns. `onLaunch` should contain genuine one-time application initialization, not eager loading of every feature. `onShow/onHide` may repeat; hide is not termination.

## Page lifecycle

Think approximately:

```text
onLoad → onShow → onReady → visible
                     ↓
                  onHide
                     ↓
             maybe onShow again
                     ↓
                  onUnload
```

- `onLoad`: Page-instance initialization, route parsing, initial load, Page-owned resources.
- `onShow`: repeated foreground/visibility work, invalidation/freshness checks; do not blindly reload everything.
- `onReady`: rendered-view-dependent work, not ordinary backend loading.
- `onHide`: temporarily invisible; pause visual/polling/media work when appropriate, but do not destroy instance state.
- `onUnload`: destruction; clean Page-owned timers/listeners/observers/subscriptions/tasks.

Normalize/validate raw route parameters near the Page boundary.

## Component lifecycle

Use created/attached/ready/detached according to the actual ownership need. `created` is very early; `attached` is normal initialization; `ready` is for view-dependent work; `detached` cleans Component-owned resources.

Use `pageLifetimes` only when a Component's own responsibility genuinely depends on the containing Page's visibility.

Behavior lifecycle follows the Component-instance ownership it extends.

## Render state versus runtime state

Render state is data the WXML needs: content, loading state, selected tab, dialog/form state, display error, etc.

Runtime state is not rendered: RequestTask, timer handle, observer, request generation, socket, Worker, service instance, internal cache, unsubscribe handle.

`data` is view synchronization state, not arbitrary object storage.

## `setData`

`setData` is the logic-to-view synchronization boundary. Direct mutation of `this.data` is not a substitute for view synchronization.

Update meaningful minimal state, batch coherent transitions where practical, and avoid pushing runtime-only values into render data.

Avoid intentionally using `undefined` as a render-state value when the UI meaning can be represented explicitly with `null`, empty collections, or discriminated state.

## Derived state

Avoid multiple independently mutable sources for the same fact. Derive presentation values such as `canDelete` or display status from source state where practical rather than mutating duplicate truth.

## Properties and local copies

Component properties are parent-owned. A child normally renders/reacts and emits intent. Only copy a property into local state when the Component intentionally owns an editable/local version and has explicit synchronization semantics.

## Async lifetime and stale results

An async result can be correct but stale relative to the current UI. Use generation/version/latest-token/parameter-identity checks, cancellation, or state-machine rules as appropriate.

Example:

```text
A starts
B starts
B completes → publish
A completes → discard as stale
```

Async work may outlive the Page/Component that started it. `onHide/onUnload` do not magically cancel Promises/tasks.

Do not model multiple independent operations with one ambiguous `loading` boolean.

## Cross-page freshness

When Page B changes data shown by Page A, choose among:

- backend truth + invalidation/reload;
- explicit shared client state;
- EventChannel/navigation result for the direct relationship.

Do not default to a global event bus.

## Shared state

Shared state is justified for true cross-page client meaning such as session summary, unread badge, environment, or stable preferences. Define owner, update operations, lifetime, source of truth, and persistence.

`App.globalData` is not automatically a state architecture or dependency container. A Store is justified only when several consumers need the same mutable client state and consistent subscription/update semantics.

Store state and Page render state are different responsibilities.

## Storage

Storage is persistent local data, not reactive runtime state and not backend truth. Centralize meaningful keys/serialization/migration/expiry/logout semantics. Stored backend snapshots may be stale.

Persist critical local state at meaningful transitions; do not rely only on hide/unload callbacks.

## Page exit state

`onSaveExitState`-style platform state should be used only for bounded Page restoration semantics, not as a general database. Save minimal JSON-compatible recoverable state, not service instances, tasks, sockets, observers, secrets, or giant caches. Reconcile restored state with current backend truth when necessary.

## Background behavior

Background execution is an explicit platform capability, not something guaranteed by starting a timer. If a feature requires background behavior, platform configuration, permission/privacy policy, lifecycle ownership, and recovery semantics must agree. Do not enable background modes speculatively.

## Resources

Timers, listeners, observers, polling, streams, sockets, and Workers have owners and lifetimes. Hidden Pages should not continue foreground-only work merely because they are not unloaded.

## Form/draft state

Form state is normally local. Persist drafts only when product requirements justify recovery. A recoverable network failure should not arbitrarily erase user work.

## Optimistic UI

Optimistic UI is a prediction. Define confirmation, rollback/reconciliation, and authoritative backend state. It must not become the source of business truth.

## State-analysis questions

For any nontrivial state/resource ask:

1. Who owns it?
2. Who can change it?
3. What is the source of truth?
4. What is its lifetime?
5. Does the view need it?
6. Does it need persistence?
7. Can it become stale?

Prefer the narrowest sufficient scope:

```text
local function → Component → Page → shared application → persistent local → backend truth
```

## Core invariant

Every meaningful state/resource has one understandable owner, an appropriate lifetime, and a defined synchronization/recovery path.
