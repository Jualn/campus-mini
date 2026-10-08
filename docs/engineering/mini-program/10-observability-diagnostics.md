# 10 — Observability & Diagnostics

## Purpose

When a production problem occurs, engineers should be able to determine what happened, in which client/runtime environment, during which logical operation, and how it relates to backend processing—without recording secrets or unnecessary personal data.

## Signal types

Keep separate meanings for:

- errors → unexpected failures;
- logs → diagnostic events;
- network telemetry → external operation outcomes;
- performance → startup/render/resource cost;
- business events → important product/user behavior;
- environment context → runtime conditions.

Observability is not just logging.

## Global error boundaries

Use App-level runtime error and unhandled-Promise-rejection hooks as last diagnostic boundaries. Expected business failures and handled network problems should be handled locally; unexpected programming/runtime failures may reach global reporting.

Do not intentionally rely on global handlers instead of handling expected async failures.

Normalize thrown/rejected values from `unknown` before reporting. Diagnostic code must itself fail safely.

## Error context

For serious unexpected failures, capture selected safe fields such as error category/message/stack where available, route, app/build version, environment version, base-library version, operation/request/backend trace identifiers, and timestamp.

Do not serialize entire Page/application state.

## Duplicate reporting

Define reporting ownership so one logical failure is not emitted independently by HTTP client, application service, Page, and global handler. Expected handled errors should not inflate crash/error metrics.

## Structured logging

Use stable event names and structured fields. Prefer `request_failed` + metadata over concatenated dynamic strings. Do not log every function entry/loop/value in production.

`console` is primarily local/Developer Tools debugging, not the only production observability strategy. Remove arbitrary debug logs after diagnosis.

## Platform realtime logs

Platform realtime logging can be a useful bounded diagnostic channel but should not be treated as durable event delivery. Keep entries compact and selected; buffers/entry size are finite. Safe filter/search identifiers may be attached; do not use credentials or sensitive personal data as filter values.

A small logging boundary may route to console, platform realtime logs, and/or project telemetry without forcing feature code to know destinations.

## Sensitive-data protection

Never log Authorization/JWT/tokens/AppSecret/session keys/upload private keys/passwords/temporary login credentials or unrestricted precise location/private content.

Use central redaction for known fields. If a user identifier is required for support correlation, use the minimum safe identifier; do not duplicate the full profile in every event.

## Correlation model

Distinguish:

```text
operationId = one logical user/application intent
requestId = one transport attempt
idempotencyKey = one business-fact deduplication identity
backend traceId = server execution-chain diagnostic identity
```

A retry preserves logical operation/idempotency identity but can receive a new request attempt ID and server trace.

Client-provided correlation IDs are untrusted metadata, not authentication/authorization/idempotency proof unless the protocol explicitly defines stronger semantics.

## Network telemetry

Useful safe fields include operation name, request ID, method, endpoint category, duration, HTTP status, normalized error kind, retry count, backend trace ID. Prefer stable operation names over full raw URLs/query strings. Expected cancellation should be classified separately from error-rate metrics.

## Client → backend trace chain

Target model:

```text
user action
→ client operationId
→ client requestId
→ backend traceId
→ DB / Redis / Queue / external effect
→ response/diagnostic context
```

Backend remains owner of authoritative server tracing. If work becomes asynchronous through queue/outbox/worker, backend observability propagates relevant server correlation; the client need not know internal topology.

## Version/environment context

Production diagnostics should identify which Mini Program artifact/runtime produced the event. Useful context may include product/build version, environment (`develop/trial/release` or project equivalent), base-library version, route, and selected device/platform information.

Prefer scoped platform information APIs rather than collecting giant generic system objects. Gather only context required to investigate the class of problem.

## Entry context

For startup/routing problems, capture entry scene/options only when it materially helps diagnosis. Do not attach all entry data to every event.

## Performance observability

Use platform performance APIs where supported to observe startup, route, first render/paint/contentful metrics, script evaluation, package download, and resource timing. Respect the Project Profile's base-library compatibility baseline.

Measure user-visible operations such as “tap detail → useful content rendered” or “start stream → first result” rather than arbitrary helper-function timings unless a helper is the proven bottleneck.

Disconnect PerformanceObservers according to ownership when not application-global.

## Sampling

High-frequency diagnostics/performance signals may require sampling. Do not upload every scroll event, setData, network chunk, or render callback from every user. Instrumentation itself has performance/privacy cost.

## Memory warnings

Memory warnings are both runtime-management and diagnostic signals. Release rebuildable caches/buffers/resources according to ownership; do not delete authoritative business state blindly.

## Business events

Keep product analytics separate from operational logs. Stable business events may represent views, enrollment started/completed, comments created, etc. Use current platform/project event-reporting mechanisms according to purpose; operational tracing may still require project/backend telemetry.

## User support

Expose a safe opaque diagnostic/reference ID for serious failures when useful. It may correspond to operation/request/backend trace context but must not reveal user IDs, database keys, tokens, or server topology.

Feedback flows may attach safe app version/environment/route/base-library/error category/diagnostic ID, not complete Page contents/private input by default.

## Architecture

Centralization means infrastructure owns delivery/redaction/sampling/version context while feature code owns the semantic event (“what happened”). Avoid one giant telemetry service that owns all business meaning.

Observability delivery should fail safely and should not break the primary user operation. Prevent recursive telemetry-failure loops.

## Development vs production

Development may use richer console/debug assertions/timing. Production diagnostics should be structured, bounded, redacted, sampled, and actionable.

## Alerts

Alert on aggregated symptoms that require action (crash-rate spike, critical API failure spike, auth failure spike, startup regression, streaming failure spike), not every individual client event.

## Testing

Test important redaction, error normalization, sampling decisions, correlation propagation, and telemetry serialization. Verify that sensitive fields are removed. HTTP tests can verify correlation metadata is preserved without testing backend tracing internals.

## Core invariant

Retain enough safe evidence to answer what happened, where, which version/environment, how long it took, and how to correlate it—without recording secrets, unnecessary personal data, unbounded payloads, or entire application state.
