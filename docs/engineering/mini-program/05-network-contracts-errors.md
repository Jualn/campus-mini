# 05 — Network, Contracts & Error Handling

## Network model

```text
Page / Component
    ↓
Application operation (when needed)
    ↓
Domain API
    ↓
HTTP/task adapter
    ↓
wx.request / upload / download / socket
    ↓
Backend Contract
```

Transport understands URL/method/headers/timeout/auth/status/task behavior. Domain API understands endpoints. Application logic understands workflows. Page understands presentation.

## HTTP boundary

Ordinary requests should use a controlled HTTP client. Do not scatter `wx.request` with duplicated headers/base URLs/error mapping through Pages.

A centralized HTTP client is not a mega domain API; feature/domain APIs remain feature-oriented.

## Contracts

Contracts are protocol authority. Do not redefine required/optional/null semantics, enums, auth, pagination, error codes, or field meaning for UI convenience.

DTO type does not equal runtime validation. The runtime path is:

```text
bytes → decode → optional validation/normalization → typed application value
```

Validation depth follows risk.

## Cross-workspace Contract handoff

Task entry is not always Contract-first. A task may implement an already accepted Contract, change only local Page/Component behavior, or discover a missing server-owned capability while designing or implementing a Page/backend flow. Only changes to cross-system protocol facts require the Contracts owner; send the requirement, real use case, affected operation/fields/statuses and constraints back as a **proposal**, then consume the accepted Contract after it is decided. Do not edit or reinterpret a sibling workspace's authority in this repository.

After an accepted protocol change, send a **short handoff** with the pinned revision or verifiable change reference, affected operations/schemas, compatibility/breaking status, affected consumers and validation/rollout obligations. Consumers locate exact definitions themselves; the handoff does not duplicate schema, constitute a second Contract source or require a permanent coordination file. Align each consumer to a known accepted version before integration. Requirement-to-Contracts proposals may need more context than Contracts-to-consumer handoffs.

Parallel backend/client implementation does not imply simultaneous deployment. Older Mini Program clients and newer backend versions may coexist; coordinate rollout according to backward/forward compatibility (see [09](09-build-ci-release.md#clientbackend-release-skew)). A DTO defines transport facts, not Page information hierarchy, interaction or component composition (see [11](11-ui-interaction-accessibility.md#page-design-is-not-an-api-schema-projection)). Do not create a new server field to display a value already safely derivable from authoritative existing facts; do not compute server-only authorization/eligibility in the client.

## Success layers

Distinguish:

- transport success/failure;
- HTTP/protocol status;
- backend business result;
- application success;
- UI presentation.

HTTP 2xx is not automatically business success.

## Error taxonomy

Preserve useful distinctions such as:

- transport/platform/connectivity;
- timeout;
- HTTP error;
- authentication/authorization;
- backend business rejection;
- protocol/malformed response;
- intentional cancellation.

Normalize errors into stable application-facing structure while preserving useful status/code/trace/operation/retryability context. UI should not depend on raw `wx` error strings.

Backend error messages are not always final user copy.

## Authentication

Attach authentication centrally. Pages should not manually construct `Authorization` headers.

Authentication failure should have one policy: lower layers identify it; session/application logic decides recovery/clear/re-auth; Page/App flow presents or navigates. If refresh exists, coordinate concurrent refresh attempts (single-flight). Do not invent refresh when the backend does not support it.

## Timeout and unknown outcome

A client timeout means the client stopped waiting. It does not prove the server did nothing. This is critical for mutations.

Retry follows logical-operation semantics, not the HTTP verb alone. Reads are often safe; mutating retries require backend idempotency/operation identity and correct unknown-outcome handling.

Use bounded retries. Backoff/jitter may be appropriate for repeated infrastructure retries. Permanent business failures are not retried blindly.

The same logical operation should preserve its idempotency key across transport retries; each physical attempt may have its own request ID.

## Task capabilities and cancellation

Promise wrappers must not erase capabilities such as `abort`, progress listeners, chunk listeners, or header events when a feature needs them. Controlled calls may expose `{ promise, abort }` or another explicit task handle.

Cancellation is not generic failure. An old search/request aborted because newer work replaced it is normal control flow. Client abort also does not mean server rollback for mutations.

## Duplicate actions

Disabling a button while submitting is useful UX/load control. It does not replace backend idempotency, replay protection, authorization, or concurrency control.

## Freshness and in-flight work

A successful response can still be stale. Do not globally deduplicate requests merely because URLs match; only share in-flight work when logical data/freshness semantics truly match.

Generic caching should not be hidden in the HTTP client by default. Caching requires explicit key, freshness, invalidation, auth scope, error policy, and source-of-truth semantics.

## Pagination

Respect the Contract's actual model: page+size, offset, cursor, `lastId`, etc. Do not infer another model.

Page state should distinguish initial load, load-more, refresh, has-more/next-position, and generation/query identity. A filter/query reset invalidates old load-more results.

## Upload/download

Upload/download have task/lifecycle/progress/cancel semantics and should not be forced through a JSON-request abstraction. Task handles belong to runtime state; progress belongs to render state. Temporary file paths are not permanent business identifiers.

## Chunked streaming / SSE-like protocols

Do not assume browser `EventSource`. Native Mini Program streaming may use chunked request/task APIs when supported by the project's base-library/runtime.

Model:

```text
wx.request(enableChunked)
→ RequestTask.onChunkReceived
→ ArrayBuffer chunks
→ incremental decoder
→ protocol frame buffer/parser
→ application events
→ batched meaningful render updates
```

A network chunk is not one JSON/SSE message and not guaranteed to align with UTF-8 code points. Buffer incomplete bytes/text/frames. Define owner, cancellation, listener cleanup, replacement, completion, and stale-event handling.

For any incremental extraction or similar application stream, parser tests must cover split frames, multiple frames per chunk, split UTF-8 characters, partial final frame, invalid event, completion, and cancellation.

## WebSocket

WebSocket is a persistent bidirectional transport with lifetime:

```text
owner → connecting → open ↔ messages → closing/closed/recovering
```

Use the narrowest owner. Do not create a global socket unless the application truly requires application-wide realtime communication.

Reconnect must be bounded and policy-driven. Consider foreground/background state, network availability, auth state, retry budget/backoff, and intentional cleanup. Intentional close must not trigger reconnect.

Incoming socket messages are untrusted runtime data and need the same Contract/runtime-validation reasoning as HTTP responses.

## Specialized transports

UDP, mDNS, Bluetooth/device protocols, etc. should have capability-specific adapters with explicit ownership, lifecycle, message shape, security review, and appropriate testing. Do not enlarge the generic HTTP client to contain unrelated transport semantics.

## Headers and environment

Common headers and base URL/environment selection are centrally controlled. Pages must not arbitrarily override security-sensitive headers. Do not scatter hard-coded URLs or secrets.

Mini Program request-domain/certificate/platform configuration is a real runtime boundary. Do not weaken production security to make local development pass.

## Network diagnostics

Log safe operation name, method/endpoint category, duration/status, normalized error kind, request/operation ID, retry count, and backend trace when useful. Do not log secrets, auth headers, or private payloads.

## Testing boundary

Test transport policy (URL/auth/envelope/error/timeout/cancel/retry/stream framing), domain API mapping, and application flows at meaningful boundaries. Mock the dependency boundary rather than internal implementation details.

## Core distinctions

```text
transport attempt ≠ logical business operation
HTTP success ≠ business success
timeout/cancel ≠ server did nothing
TypeScript DTO ≠ runtime validation
network chunk ≠ application message
```
