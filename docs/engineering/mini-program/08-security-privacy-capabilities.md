# 08 — Security, Privacy & Platform Capabilities

## Trust model

```text
User/device
→ Mini Program (untrusted client execution)
→ authenticated backend security boundary
→ authoritative identity/authorization/business rules/secrets/persistence
```

Client controls improve UX and reduce accidental misuse; they are not authoritative security decisions.

## Authorization

The client may show/hide/disable actions or explain missing permission. The backend must decide whether the authenticated subject may perform the action on the current resource under current policy/context.

Hidden UI, TypeScript types, local role/owner fields, route parameters, and client capability flags are not security enforcement.

## Validation

Client validation is for feedback and avoiding obviously invalid requests. Backend validation remains authoritative for correctness/security. All user input, route/share parameters, clipboard content, uploads, backend user-generated content, and restored Storage are untrusted runtime data.

## Privacy model

Treat privacy agreement, Mini Program scope authorization, and host/OS permission as separate layers. Centralize privacy-authorization coordination rather than letting Pages repeatedly register competing global listeners.

Privacy-sensitive API calls may become pending until the user resolves the platform consent flow. Always complete registered flows; handle multiple pending operations coherently; do not auto-agree or fabricate user consent.

Provide a clear way to inspect the relevant privacy contract/policy according to current platform mechanisms.

## Capability access

Request sensitive capabilities on demand when the user reaches the feature, not eagerly at startup. Apply least-capability/data-minimization principles.

Permission denial is a normal user state. Distinguish granted/denied/not-determined/unavailable and degrade gracefully where possible. Do not repeatedly pressure users after denial.

Use settings recovery only when the relevant platform permission actually exists there.

## WeChat login and credentials

Normal model:

```text
wx.login
→ temporary code
→ backend
→ server-side WeChat exchange
→ application session/JWT
```

The Mini Program should not perform server credential exchange itself.

Never embed or return server-only secrets such as AppSecret, WeChat server access tokens, `session_key`, backend credentials, or upload private keys. AppID is an identifier, not a secret.

Client access/session tokens are sensitive client-held credentials: store only what is necessary, do not log or put them in URLs, clear on logout/invalidation, respect expiry, and send only over approved secure channels. The backend validates every protected request.

Storage is persistence, not a vault. Anything the client must possess should be assumed recoverable from a compromised/debugged client.

## Logout/account switch

Clear client authentication state, relevant sensitive shared state, and private caches. Revoke/invalidate server-side session state when the auth model supports it.

## CI/release credentials

Mini Program code-upload keys are privileged preview/upload credentials. Never commit them, place them in shipped configuration, or print them in logs. Inject through protected CI/secret mechanisms. Use least-privilege network/runner controls where practical.

## UGC/content security

Client-side text/image/file checks improve UX; backend owns authoritative content validation, moderation, authorization, storage, and publishing decisions. Never trust a client flag such as `contentChecked=true`.

Server-side WeChat content-security capabilities requiring server access tokens stay on the backend.

## Rich content and URLs

Treat rich text, links, image sources, and structured rendering input as untrusted even when returned by your backend because backend data may be user-generated.

Prefer structured content models. If arbitrary rich markup is allowed, define a supported allowlist and perform security-sensitive sanitization at a trusted boundary.

External navigation should validate allowed scheme/domain/app/path/source. Do not create generic `openUrl(userInput)` behavior without policy.

Route/share parameters identify requested resources; they never prove ownership/visibility/permission.

## Files/media

A selected file remains untrusted. Client checks may inspect declared size/type/count for UX; backend revalidates limits, content type, authorization, moderation, and storage policy. Never trust filenames as backend paths/identities.

Temporary local paths are not permanent business identifiers. Scope pre-signed/temporary upload capabilities narrowly where used.

## Sensitive capability ownership

Calls for location, camera, microphone, clipboard, media, calendar, contacts, etc. should belong to a feature that can explain why they are required. Prefer user-triggered use. Do not collect data merely because an API exists.

## Data minimization

Collect and persist only what the feature needs. Avoid long-lived duplication of sensitive backend records without product reason. Clear privacy-sensitive caches when ownership/session changes.

## Logging/redaction

Logs are exposure surfaces. Never log access tokens, AppSecret, session keys, upload keys, auth headers, passwords, temporary login credentials, precise location, private message content, or full sensitive payloads without a specifically approved diagnostic policy.

Centralize redaction for known sensitive fields. Production diagnostics should be structured and bounded.

## Environment/config

API base URL, AppID, feature/environment mode are configuration; server credentials/private keys/access tokens are secrets. Anything compiled into the Mini Program should be assumed observable. Minification/obfuscation is not secret management.

Keep development security bypasses local; production must satisfy actual platform domain/certificate/privacy requirements. Environment selection should be explicit and reproducible, not manual source editing.

## Third-party SDKs

A third-party SDK expands the trust/privacy/supply-chain surface. Review data collection, network destinations, permissions, Storage, privacy declarations, initialization timing, maintenance, and package impact before adoption.

## Compatibility

Security/privacy APIs still obey the Project Profile's base-library compatibility baseline. Fallback behavior must not weaken policy merely because an older version lacks a convenience API.

## Permission/error outcomes

Distinguish privacy required, Mini Program permission denied, OS/host permission denied, capability unavailable, and backend authorization denied. Different states have different recovery paths.

Do not expose internal authorization details in user-facing errors.

## Client capability projections

Backend-provided `canEdit/canDelete/canEnroll` flags are useful UI projections. The backend re-evaluates authorization when the operation executes because resource/policy state may have changed.

## Business actions

Client duplicate guards, client clocks, and client counters are not authoritative. Server policy decides time windows, capacity/quota, idempotency, concurrency, and authorization.

## Sharing

A shared route becomes an external entry point. Shared Pages must reconstruct required state from safe route identity + authenticated backend state, not EventChannel/previous Page memory. Never put credentials in share paths.

## Subscription messages

Client side owns user interaction and consent request/result handling. User refusal is normal state. Do not request silently during arbitrary startup/background work.

Backend owns durable business subscription/reminder state and server-authorized message delivery. A cached client Boolean is not permanent subscription truth.

## Core invariant

The client may request, validate for UX, coordinate platform consent, and present permission hints. The backend authenticates, authorizes, validates business invariants, owns server secrets/moderation, and persists authoritative state. The platform mediates sensitive device/user capabilities.
