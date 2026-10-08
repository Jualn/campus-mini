# 11 — UI, Interaction & Accessibility

## Purpose

Define engineering rules for WXML/WXSS structure, reusable UI components, visual state, interaction feedback, layout adaptation, theme support, accessibility, forms, native controls, renderer-specific presentation, and UI-library usage. This is not a brand/visual-design manual.

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

Before UI changes, identify existing UI library, tokens, reusable Components, theme strategy, renderer, style isolation, and existing loading/empty/error components. Reuse established semantics before inventing another system. Preserve accessibility and avoid unrelated visual rewrites.

## Core invariant

A UI is not correct merely because it looks correct on one simulator. It must preserve state meaning, interaction meaning, platform behavior, supported device geometry, theme, and accessibility semantics without hiding business logic/security decisions/runtime ownership inside presentation.
