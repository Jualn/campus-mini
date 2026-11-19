# 11 — UI, Interaction & Accessibility

## Purpose

Define engineering rules for WXML/WXSS structure, reusable UI components, visual state, interaction feedback, layout adaptation, theme support, accessibility, forms, native controls, renderer-specific presentation, and UI-library usage. This is not a brand/visual-design manual.

## Page design is not an API schema projection

Contracts describe what may be exchanged with the backend. They do not decide the Page's information architecture, visual hierarchy, navigation, interaction model, or which response fields should be shown. A structurally valid CRUD UI generated from DTO fields can still fail the user's task.

Use explicit product requirements and accepted designs first, then existing product conventions and the available Contract capabilities. For new Pages or materially changed flows, form a bounded interaction plan before implementation:

- **User task and entry:** who enters, from tab/list/search/share/notification, and the single primary outcome;
- **Information hierarchy:** what the user must see or decide first, what is supporting/optional, and what should not be displayed merely because an API returns it;
- **Actions and transitions:** primary/secondary/destructive actions, confirmation, feedback, return/back behavior, and recovery after interruption;
- **State map:** initial/loading/content/empty/error, pending/success/rejected/disabled, auth/permission and business-specific statuses when applicable;
- **Component map:** existing Page patterns, Components, tokens and native controls to reuse, with explicit ownership of state/events;
- **Platform fit and evidence:** Page/tabBar/route and subpackage entry, renderer/native-component behavior, safe-area/keyboard/scroll, base-library support, and acceptance checks.

This may be a short implementation plan or task note; do not require a permanent wireframe, design file or checklist document for every minor edit. When a supplied wireframe/design exists, follow it within verified platform and Contract constraints. When consequential product choices are unspecified, state the assumption/decision gap rather than inventing a workflow. If required interaction data is absent from Contracts, surface the protocol gap; do not fabricate client authority or display fake facts.

## Design decisions and component reuse

Before adding a new Page/component, inspect relevant existing Pages, actual Component source and usage sites, the UI foundation/tokens (if they exist), loading/error patterns and supported project conventions. Do not assume a complete catalog, tokens or accepted wireframes are present. Decide in this order:

1. **Reuse directly** when existing semantics and interactions match.
2. **Configure or extend** an existing Component when a documented API can cover a genuinely shared variant without breaking other consumers.
3. **Compose** existing controls at Page/feature level when the combination is feature-specific.
4. **Create** a new Component for repeated, independently meaningful UI/interaction behavior, with defined properties/events, state owner, style isolation and accessibility.

Do not copy-paste behaviorally identical controls into each Page. Equally, do not force unrelated feature semantics into one gigantic configurable component, build wrappers with no policy value, or redesign existing components during unrelated work. Promote a pattern to shared UI only when reuse and lifecycle ownership justify it. API/DTO shapes must not become generic component APIs by default.

## UI change scope and design artifacts

Distinguish changes before deciding validation and documentation impact:

- **Local Page styles/copy/layout:** modify the Page implementation; inspect the affected view/interaction, not all consumers or permanent designs by default.
- **Shared Component internals:** preserve the Component's public behavior; validate representative consumer contexts where styles, dimensions or event behavior could regress.
- **Shared Component public contract:** a change to properties, events, slots, public commands, supported styling/isolation, defaults or state meaning requires impact analysis of actual consumers, compatibility assessment and appropriate Component/consumer tests. Update usage documentation only when a maintained public rule changes.
- **Global UI foundations/tokens/theme:** review visual effects across affected Components/Pages, compatibility and source-of-truth configuration; update durable design policy or Profile only when those facts change.
- **Product flow/state semantics:** update the accepted product design only when a durable user-facing decision changes; Contracts separately own any cross-system protocol effect.

Design sketches, experiments and screenshots may support the current task but do not become permanent merely because an Agent produced them. Accepted product goals, important state transitions and exceptional interaction decisions may be documented concisely; avoid maintaining a pixel-for-pixel duplicate of live WXML/WXSS. If code and an accepted design differ, determine whether the implementation is wrong or the decision was superseded; do not automatically rewrite the design to describe accidental behavior. See [maintenance](maintenance.md#durable-documents-and-temporary-artifacts).

## Native Mini Program experience boundary

A Mini Program Page is not a browser route or arbitrary DOM tree. Determine the *configured* renderer/component framework and supported base-library/client versions before assuming an API, CSS/WXSS behavior, event, animation or layout property is available. Check actual project configuration and supported official platform documentation for compatibility-sensitive behavior.

- **Navigation:** distinguish tabBar switching, normal Page stack navigation, replacement and reLaunch; design return/deep-entry/share paths rather than assuming Web History or a prior Page instance.
- **Layout:** consider navigation/capsule/system chrome, safe areas, screen sizes, text scaling, keyboard lift and bottom actions; do not transplant viewport-height/CSS recipes from H5 without validation.
- **Native controls:** input, scroll-view, picker, map, video and other native/platform Components can differ in events, layers, styling and device behavior. Prefer verified native semantics over DOM assumptions.
- **Renderer:** WebView and Skyline do not have identical rendering/compatibility trade-offs. Use only the renderer/features enabled in this repository; no isolated feature may silently switch renderer or component framework.
- **Interaction cost:** logic/view synchronization (`setData`), long lists, nested scroll regions, images and rapid gesture/progress updates have platform-dependent cost. Design for bounded render updates.
- **Platform gates:** sensitive capabilities, privacy/permissions, share entry, network domains and subpackage load/ownership must be considered as part of the user flow, not only after UI markup exists.

Do not turn these into universal fixed numeric limits: the applicable navigation, packaging, API and renderer constraints depend on verified project/platform configuration and require matching compiler/runtime/device evidence.

## Presentation model

```text
application/Page state
→ render state
→ setData
→ WXML
→ WXSS/components
→ user-visible interface
→ semantic event
→ Page/Component handler
```

## WXML/WXSS responsibility

WXML describes structure, binding, conditional/list rendering, event binding, and supported semantic/accessibility information. Keep complicated business rules out of repeated template expressions; prepare meaningful render state such as `canDelete` or `displayEnrollmentStatus` before rendering.

WXSS owns layout/spacing/typography/color/visual state/animation. Prefer semantic component state over style names encoding business meaning.

## UI states

Async screens should explicitly model applicable states: initial, loading, content, empty, error, refreshing, submitting, disabled.

Loading is not empty. Error is not empty. Refreshing existing content is not necessarily initial full-screen loading. Mutations should expose meaningful pending state and prevent accidental duplicate activation where appropriate; this remains UX protection, not backend idempotency.

## Feedback hierarchy

Use inline state for persistent/local information, toast for short transient feedback, dialog/modal for decisions/interruptions, and page-level state for whole-page loading/error/empty. Error feedback should provide a useful recovery action when known.

## UI foundation

Choose one primary UI foundation: native components, WeUI, TDesign Mini Program, project-owned components, or an explicit combination. Avoid casually mixing several overlapping libraries.

Native controls are the baseline when they already provide the required capability/semantics. WeUI is a strong option for WeChat-native conventions; a richer system such as TDesign can be appropriate for broad business UI. Project-owned components should model product-specific reusable semantics, not duplicate generic libraries without value.

Do not wrap every library component unless the wrapper adds stable project policy/defaults/analytics/accessibility/loading/product semantics.

## Tokens/theme

Introduce shared tokens when repeated visual decisions justify them. Prefer semantic tokens (`text-primary`, `surface-card`, `status-danger`) over arbitrary raw-value proliferation at application level.

Dark Mode should be intentionally supported or explicitly not supported. Theme support should cover native chrome (navigation/tab bar where applicable), semantic tokens, UI library theme, and project Components. Avoid scattered `if (dark)` hard-coded palettes.

## Layout/device adaptation

Do not design for one simulator/phone. Account for varying width/aspect ratio/safe areas/system UI/font settings/platforms.

`rpx` is a proportional-layout tool, not a universal unit. Preserve platform geometry deliberately. Do not hard-code status bar/navigation/bottom inset constants as universal truths.

Custom navigation accepts responsibility for top inset/capsule alignment/title/back interaction/theme/accessibility/device differences. Use it only when product requirements justify that maintenance cost.

Avoid unnecessary nested scroll containers and brittle full-screen height arithmetic when natural layout can flow.

## Text/typography

Text is dynamic. Avoid fixed-height containers that clip long content or user font changes. Ellipsis is information loss; do not truncate critical validation/instructions/permission explanations without a route to full information.

Use a coherent typography hierarchy instead of arbitrary font-size variations.

## Interaction

Interactive elements should visibly communicate interactive/selected/disabled/destructive state. Prefer semantic native controls or accessible project components over arbitrary `view bindtap` when semantics match.

Separate visual icon size from hit area. Do not rely on color as the only signal for important state. Use event propagation intentionally rather than `catch` everywhere to suppress inconvenient nesting.

## Forms

Fields should clearly communicate label/purpose/required/format and local validation errors. Placeholder-only labeling is weak when the information disappears during editing.

Choose validation timing according to the validation type (during input, blur, submit, backend rejection). Preserve user-entered data on recoverable failures unless product requirements say otherwise.

Client form validation does not redefine backend Contracts.

## Accessibility

Accessibility is part of reusable Component correctness. Consider supported semantic role, accessible label, selected/disabled/expanded/checked state, reading/focus order, dialog/modal semantics, and touch usability.

Use platform-supported ARIA semantics; do not assume every browser ARIA feature exists in Mini Program. Icon-only actions need meaningful accessible labels. Do not communicate important state solely with color.

Important reusable controls should be validated with actual assistive technology/runtime where practical; static markup/simulation cannot prove full accessibility behavior.

## Images/media

Define aspect behavior, loading/failure fallback, and semantic meaning for important images. Distinguish decorative images from meaningful content/action/status imagery. Failed images should not unpredictably collapse layout.

## Animation/skeletons

Animation should communicate transition/state rather than exist for decoration. Do not block useful interaction unnecessarily. Skeletons are optional and should resemble final structure when used; simple loading state may be better for very short waits.

## Empty states

Use product-specific meaning (“no comments”, “no matching results”) rather than generic “no data” when semantics are known. Offer an obvious next action when one exists.

## Component styling

Components normally own internal styles. Parents should not depend on undocumented internal class names. Expose deliberate extension points only when required. Keep global WXSS genuinely global; feature styles remain feature-owned. Style-isolation changes are Component API decisions, not convenience toggles.

## Capability/geometry detection

Prefer capability/measurement-based adaptation over device-model branching. Use relevant safe-area/window/API/renderer information rather than guessing from OS/device name.

## Renderer/Skyline

Renderer choice is an architectural/platform decision, not a theme. WebView/Skyline or other renderer/component-framework choices can affect styling, component compatibility, events, animation, performance, testing, and build behavior. Migrations require dedicated validation and must not be introduced casually.

## WXS/Worklet

WXS/Worklet are specialized presentation execution mechanisms. Keep them in presentation/interactivity concerns. Do not move API/auth/business/state-management logic into them merely because they execute closer to rendering.

## Sharing

Share content creates an external entry path. Shared Pages must be independently reconstructible from safe route identity and authenticated backend state; they must not require EventChannel or previous Page memory. Treat incoming share parameters as untrusted route input.

## Page-level acceptance

Review whether the user can finish the intended task from every supported entry, not just whether requests return data. For meaningful Page changes, verify relevant navigation and back behavior, discoverability of the primary action, status meaning, incomplete/slow/failed data, recoverable mutation errors, component consistency, safe-area and keyboard behavior, and share/direct-entry recovery where exposed. Avoid a universal visual-approval gate for trivial edits; target tests to the changed interaction risks.

## UI validation

Layer evidence:

- pure render/state logic → unit;
- Component interaction → Component tests;
- Page flow → Developer Tools/runtime;
- geometry/safe area/theme → multiple runtime/device configurations;
- accessibility → assistive technology/device;
- precise visuals → controlled screenshot workflow only if justified.

Test boundary conditions: long/empty text, large/one-item lists, missing optional image, slow/error/loading, disabled action, supported Dark Mode, and varied screen geometry.

## Agent rule

For meaningful UI changes, identify the user task, affected entry/interaction, actual reusable capabilities, applicable theme/renderer/platform constraints and state/feedback patterns. Avoid inventing UI from DTO fields. Scope design and validation to the changed behavior; preserve existing semantics for minor edits, inspect consumers for shared changes, and avoid unnecessary permanent design artifacts.

## Core invariant

A UI is not correct merely because it looks correct on one simulator. It must preserve state meaning, interaction meaning, platform behavior, supported device geometry, theme, and accessibility semantics without hiding business logic/security decisions/runtime ownership inside presentation.
