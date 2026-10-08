# Mini Program Project Profile

Profile status: TEMPLATE

## Scope and evidence

The engineering baseline is installed independently of this Profile's verification status. This installation used only the supplied engineering package and review conversation; application source and executable configuration were not inspected to populate facts. Earlier unverified versions, business domains and endpoint examples are not current facts.

- VERIFIED: checked against an identified source; evidence includes a repository-relative Markdown link (relative to this file) or a durable external reference, plus verification date. This records an observation, not a guarantee against future drift.
- UNKNOWN: not established; value is an em dash and evidence explains what must be checked.
- TARGET: an explicitly accepted future decision, with decision evidence; never substitute it for current behavior.

TEMPLATE allows unresolved facts while the rules are usable. ACTIVE requires the critical runtime, source-root, base-library, contracts, validation and release rows to be VERIFIED. A verified absence/unconfigured state must be explicit and evidenced; it does not authorize guessing a workflow or releasing. For each task, resolve additional relevant UNKNOWN rows before dependent work. Do not scan the entire project just to fill the table.

## Installed governance

| ID | Status | Value | Evidence |
|---|---|---|---|
| governance | VERIFIED | Native WeChat engineering baseline | [Routing index](README.md); installed 2026-09-13 |
| docs-check | VERIFIED | node docs/engineering/mini-program/scripts/check-docs.mjs | [Checker](scripts/check-docs.mjs); installed 2026-09-13 |

## Runtime and configuration

| ID | Status | Value | Evidence |
|---|---|---|---|
| runtime | UNKNOWN | — | Native runtime/framework: not inspected within this installation's scope. |
| source-root | UNKNOWN | — | Mini Program source root: not inspected within this installation's scope. |
| base-library | UNKNOWN | — | Base library: not inspected within this installation's scope. |
| renderer | UNKNOWN | — | Renderer and overrides: not inspected within this installation's scope. |
| component-framework | UNKNOWN | — | Component framework: not inspected within this installation's scope. |
| project-config | UNKNOWN | — | Shared/private config policy: not inspected within this installation's scope. |
| appid | UNKNOWN | — | AppID identity (no secrets): not inspected within this installation's scope. |

## Toolchain

| ID | Status | Value | Evidence |
|---|---|---|---|
| package-manager | VERIFIED | pnpm 11.x | [`package.json`](../../../package.json) declares pnpm `^11.1.2`; verified 2026-09-14. |
| node | UNKNOWN | — | Node baseline: not inspected within this installation's scope. |
| typescript | VERIFIED | TypeScript 6, strict, ES6/CommonJS | [`package.json`](../../../package.json) and [`tsconfig.json`](../../../tsconfig.json); verified 2026-09-14. |
| typings | UNKNOWN | — | API typings package and resolved version: not inspected within this installation's scope. |
| devtools | UNKNOWN | — | Developer Tools version/channel: not inspected within this installation's scope. |
| miniprogram-ci | UNKNOWN | — | miniprogram-ci version or verified absence: not inspected within this installation's scope. |
| lint | UNKNOWN | — | ESLint/config: not inspected within this installation's scope. |
| formatter | UNKNOWN | — | Formatter and WXML/WXSS support: not inspected within this installation's scope. |

## Architecture and contracts

| ID | Status | Value | Evidence |
|---|---|---|---|
| domains | UNKNOWN | — | Domains and ownership map: not inspected within this installation's scope. |
| contracts | VERIFIED | Cross-system HTTP authority is the sibling Contracts OpenAPI | [`openapi.yaml`](../../../../contracts/api/openapi.yaml) and [activity/public-event coordination](../../../../contracts/docs/coordination/activities-public-events.md); verified 2026-09-14. |
| generated-contracts | UNKNOWN | — | Generated artifacts/generator or verified absence: not inspected within this installation's scope. |
| network | VERIFIED | Domain APIs use the shared request boundary; base URL comes from config; event API and timeline runtime modules have audited local copies in Activity/PublicEvent packages, and notification preference modules belong to Settings | [`request.ts`](../../../utils/request.ts), [Activity event API](../../../subpkg_activity/services/event-api.ts), [PublicEvent event API](../../../subpkg_public_event/services/event-api.ts), [package audit](../../../scripts/audit-packages.mjs), [preference ownership](../../project/integration-boundaries.md), and [`config`](../../../config/index.ts); source paths and package ownership verified 2026-10-07; runtime/compiler verification remains separate. |
| auth | UNKNOWN | — | Session/auth owner and protocol: not inspected within this installation's scope. |
| shared-state | UNKNOWN | — | Shared state owner/update/invalidation/subscriptions: not inspected within this installation's scope. |
| notification-consumer | VERIFIED | Structured list and summary; login-session memory owns Badge, foreground cursor and suppression; batch-read/read-through return Badge counts | [`notification-center.ts`](../../../actions/notification-center.ts), [`App`](../../../app.ts), [`environment config`](../../../config/index.ts) and [implementation evidence/gaps](../../project/notification-center.md); verified 2026-09-30. |
| storage | UNKNOWN | — | Storage keys/expiry/migration/logout owner: not inspected within this installation's scope. |
| streaming | UNKNOWN | — | Streaming use/protocol or verified absence: not inspected within this installation's scope. |

## Packages, UI and capabilities

| ID | Status | Value | Evidence |
|---|---|---|---|
| packages | VERIFIED | Main package plus six ordinary subpackages; PublicEvent belongs to `subpkg_public_event`; release config excludes docs, development files and unreachable legacy Exam/Message modules; audit reports runtime bytes and all non-excluded source bytes, and rejects imports/resources excluded from release | [`app.json`](../../../app.json), [release exclusions](../../../project.config.json), [`audit-packages.mjs`](../../../scripts/audit-packages.mjs), and [packaging notes](../../project/package-delivery.md); source/config verified 2026-10-07; compiled package size remains unverified. |
| loading | UNKNOWN | — | Preload and lazy loading: not inspected within this installation's scope. |
| budgets | UNKNOWN | — | Compiled package budgets: not inspected within this installation's scope. |
| ui | VERIFIED | Project-owned native UiIcon v1 for generic UI icons; Tabler 3.48.0 visual language with static colors and media inverse states; other UI foundations not fully inventoried | [`UiIcon`](../../../components/ui-icon/index.ts), [`static Registry`](../../../components/ui-icon/registry.ts) and [v1 scope and limitations](../../project/icon-system-v1.md) and [visual language](../../project/icon-visual-language.md); source verified 2026-09-30; runtime/device acceptance remains pending. |
| theme | UNKNOWN | — | Theme/dark mode/navigation/safe area/accessibility: not inspected within this installation's scope. |
| capabilities | UNKNOWN | — | Capability inventory or verified absence; owner/baseline/config/consent/fallback/device evidence: not inspected within this installation's scope. |
| workers | UNKNOWN | — | Worker/WXS/Worklet usage or verified absence: not inspected within this installation's scope. |

## Validation and delivery

| ID | Status | Value | Evidence |
|---|---|---|---|
| validation | VERIFIED | `pnpm typecheck`, targeted ESLint/scripts, `pnpm audit:packages`; runtime/device checks remain separate | [`package.json`](../../../package.json) and [`scripts`](../../../scripts); verified 2026-09-14. |
| install | UNKNOWN | — | Dependency installation command: not inspected within this installation's scope. |
| compile | UNKNOWN | — | npm build and Mini Program compile procedure: not inspected within this installation's scope. |
| device | UNKNOWN | — | Runtime/device matrix and procedure: not inspected within this installation's scope. |
| release | UNKNOWN | — | Preview/upload/release procedure or explicit documented unconfigured status: not inspected within this installation's scope. |
| environment | UNKNOWN | — | Environment selection and version convention: not inspected within this installation's scope. |
| credentials | UNKNOWN | — | Credential injection mechanism or verified absence; never values: not inspected within this installation's scope. |
| observability | UNKNOWN | — | Logger/destinations/redaction/correlation conventions: not inspected within this installation's scope. |

## Maintenance

Keep only repository facts and accepted decisions here. Reusable rules live in the [modules](README.md); validation policy lives in [07](07-testing-validation.md). Update affected rows when durable facts change. See [maintenance](maintenance.md) for schema, activation and verification.
