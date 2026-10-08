# 02 — Architecture

## Purpose

The architecture is intentionally lightweight. Layers exist only when they represent independent responsibility.

```text
WXML / WXSS
    ↑
Page / Component
    ↓
Application operation (when justified)
    ↓
Domain API / Storage / Platform Adapter
    ↓
wx.* / Backend / persistent platform capability
```

## Page

A Page owns route parameters, Page lifecycle, Page render state, user-interaction orchestration, `setData`, Page-specific feedback, and navigation.

A Page should not repeatedly own common auth headers, base URL, raw transport normalization, Storage serialization policy, duplicated cross-page workflows, or protocol schema definitions.

## Component

A Component owns reusable visual/interaction behavior, properties, local render state, component lifecycle, methods, slots, and semantic events.

A normal UI Component should not silently mutate unrelated global state, navigate unrelated Pages, manage authentication, persist unrelated Storage, or perform unrelated backend work.

A capability Component may own platform/network behavior when that behavior is intrinsic to the capability—for example upload, media selection, location, or authentication UI—and should expose documented inputs/results.

## Behavior

Behavior is a native reusable **Component-instance capability**, not a Component replacement and not a generic service mixin.

Use Behavior when shared logic genuinely depends on Component instance semantics such as properties, data, methods, and lifetimes. Prefer a normal TypeScript function/module when Component-instance semantics are unnecessary.

Avoid generic `authBehavior`, `requestBehavior`, or domain-service Behaviors. Keep Behavior composition small because dependencies and merge/override semantics are less explicit than ordinary imports.

## Events

By default, parent-to-child data flows through properties. Child-to-parent intent/results flow through semantic custom events (`triggerEvent`). Properties represent state/input; events represent what happened or what the user intends.

A reusable `CommentItem`, for example, should normally emit a `like` event and let its parent own application/API orchestration rather than silently becoming a comment service.

Custom events are not a global EventBus.

For genuinely imperative commands such as focus, reset, or play, a documented Component public method may be clearer than a synthetic property toggle/counter. Define inputs, outcomes, readiness and detached-instance behavior; do not expose private state or turn selectComponent into a hidden service/store lookup.

Native relations may model a justified stable structural relationship among Components. Keep relationship ownership and link/unlink behavior explicit. They are not a default channel for unrelated business data. Properties/events remain the normal data and intent boundary.

## EventChannel

`EventChannel` is appropriate for communication tied to a direct navigation relationship created by `navigateTo`—for example returning a selection or notifying the opener that an edit succeeded.

It is not an application-global messaging mechanism. Its lifetime is bounded to the participating Page instances. Code must tolerate a Page being entered without an opener channel through sharing, direct entry, reLaunch, scene entry, or another route.

Stable route identity belongs in route parameters; temporary navigation-specific communication may use EventChannel.

## Application operations / services

Introduce an application operation when a workflow coordinates multiple meaningful steps, is reused, represents a business/application action, or benefits from independent testing.

Do not mandate an `actions/` or `services/` layer for every API call. This is valid:

```text
Page → postApi.getPost(id)
```

Do not create Page → Action → Service → Repository → Gateway → API chains that only forward arguments.

## Domain API

Prefer:

```text
Page / application operation
→ postApi / commentApi / activityApi
→ shared HTTP client
→ wx.request
→ backend
```

Domain API modules express endpoint intent and Contract mapping. They do not show UI, navigate Pages, or own Page loading state.

## DTO, application model, view state

Transport DTO, application model, and view state may be separate when their responsibilities differ. Do not create mapping layers merely for purity. Generated Contract DTOs remain protocol artifacts; UI-only state should not contaminate them.

## State ownership

Distinguish:

- UI-local state;
- shared application state;
- persistent local state;
- backend/source-of-truth state.

Global state must be earned. Backend entities do not automatically belong in a global Store.

## Storage boundary

Introduce a Storage abstraction when keys, serialization, schema/version, expiry, logout clearing, migration, or error semantics become meaningful. Storage is not a Store or EventBus.

## Platform adapters

Wrap `wx.*` when an adapter adds policy, error normalization, compatibility handling, testability, repeated configuration, permission semantics, or resource ownership. Do not wrap every trivial platform call.

Direct Page calls such as `wx.navigateTo` or `wx.showToast` can remain presentation behavior when no shared policy is needed.

## Navigation

Business/application logic should return outcomes; the Page normally decides navigation. Do not invent a browser router unless the project has an actual need such as typed params, guards, deep-link policy, or centralized navigation analytics.

`App.globalData` is a platform mechanism, not a dependency container.

## Feature organization

Organize business code around recognizable feature concepts; centralize infrastructure where it is genuinely shared. Avoid circular feature dependencies. A `shared` or `utils` directory should only contain things that are actually shared or technical/pure.

## Packages as architecture

Subpackages are both loading and ownership boundaries. Keep feature-local dependencies with the feature where practical. Independent subpackages are a stronger boundary and must tolerate startup without hidden main-package initialization assumptions.

## WXS / Worklet

WXS and Worklet are specialized presentation execution environments, not application/business layers. Use them only where their rendering/interactivity execution model provides concrete value. Prefer TypeScript for ordinary application logic.

## Worker

A Worker introduces a cross-thread execution boundary:

```text
Main runtime
↔ typed message protocol
Worker
```

Use Worker for meaningful CPU isolation/expensive computation, not ordinary CRUD, API wrappers, or simple formatting. Define ownership, start/termination, message protocol, error handling, recreation policy, and stale-result protection. Worker code owns no UI/navigation/render state.

## Dependency direction

Healthy default direction:

```text
Page / Component
→ application operation
→ API / Storage / Platform
→ runtime/backend
```

Infrastructure must not depend on Pages. Domain API must not produce UI effects.

## Architecture smells

Watch for Pages directly owning raw `wx.request` policy, token handling repeated everywhere, `utils` becoming a business dump, `globalData` becoming a universal Store/service locator, Components mutating global state, API layers showing UI, UI flags polluting transport DTOs, wrappers around every `wx.*`, forwarding-layer inflation, circular imports, business logic depending on Page instances, and duplicate Storage key usage.

## Core invariant

Page/Component remain native presentation boundaries. Reusable business, transport, persistence, package, and platform policy is extracted only when it has independent responsibility.
