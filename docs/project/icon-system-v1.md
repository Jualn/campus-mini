# Icon System v1

## Scope and architecture

The first version provides a project-owned native Mini Program `ui-icon` Component for a bounded Core vocabulary. The actual flow is `Page or business Component → ui-icon → static registry → local SVG`. The Component renders an external `<image>`; it does not own interactions, hit areas, margins, navigation, business state, or accessible labels.

Only `name`, `state`, and `size` are public properties. The semantic vocabulary is defined by the [static Registry](../../components/ui-icon/registry.ts). The supported states are `default`, `active` (like/bookmark/navigation), and `inverse` (back/remove over media). No tone, arbitrary color, path, variant, or optical adjustment property exists. Runtime lookup is static; unknown names render nothing, and invalid states/sizes fall back to the semantic default and `md`. Development warnings are deduplicated.

## Sizes

| Token | Visual box | Usage |
|---|---:|---|
| `sm` | 24rpx | Search and clear, compact close/remove, row chevrons |
| `md` | 32rpx | Like and compact action glyphs |
| `lg` | 40rpx | Back navigation and add/share actions |
| `xl` | 48rpx | Custom TabBar glyph box |

These tokens describe the image box only. Existing buttons, wrappers, rows, and touch areas retain ownership of their geometry.

## Asset ownership and source

Current Core assets have a single owner at [`assets/icons/core`](../../assets/icons/core/SOURCES.md). The source manifest records Tabler Icons 3.48.0, upstream icon names, MIT license, explicit static color edits, and the project-composed home navigation icons; the upstream license copy is in that directory. The 2026-09-30 visual refresh replaces the previously reused Core project glyphs with the same Tabler family. The home navigation additions use the same 24×24 canvas and rounded stroke rules, with source records identifying them as project-composed assets. `remove` remains its own semantic while sharing the `x.svg` visual with `close`.

The registry and manifest are separate: maintenance provenance does not become runtime descriptor data. No complete icon package or remote asset loader is used.

## Adding an icon

The Registry defines the current vocabulary. Check it first and reuse an existing semantic when its meaning matches; do not add aliases for file names, colors, or upstream family names. `close`, `clear`, and `remove` remain separate meanings even when sharing artwork.

For a new generic UI semantic, add only the needed Tabler SVG to `assets/icons/core/`, then add the static Registry entry and its row in `SOURCES.md` (family, version, upstream name, license, modifications). `IconName` is derived automatically. A new state must express the same semantic and have a real caller; update the state type and validator policy when needed. Use existing size tokens and keep button labels, hit areas, and layout in the parent.

Domain artwork stays with its owning feature/package until a shared Domain extension is explicitly needed. Brand/channel artwork and content/illustrations stay outside UiIcon. Existing project glyphs may be reused through Registry with a source record; do not duplicate them into Core. New call sites use UiIcon rather than Core paths or character glyphs. Classification is a review decision, not something a filename blacklist can prove.

Run `pnpm test:icons`, `pnpm validate:icons`, `pnpm typecheck`, and `pnpm audit:packages`; follow with the relevant Mini Program compile/render checks. Dynamic WXML values still need caller review and runtime validation.

## Consumer and asset boundaries

Generic controls use UiIcon semantics; parent buttons own spacing, hit areas, accessible labels and business actions. Artwork changes belong in the Registry asset/source record, rather than copied paths in Pages. `close`/`clear`/`remove` and `comment`/`reply` remain distinct meanings even when sharing artwork; `views` is a readership metric, distinct from audience-setting `visibility`.

Feature/category art (message filters and fallback icons, settings, section headings), brand/channel assets, empty-state illustrations, avatars/covers/QR codes and generated media stay with their owning feature or package. A similar shape is not sufficient reason to move an asset into Core. Scene-specific shapes/colors follow the [visual language](icon-visual-language.md) and [source records](../../assets/icons/VISUAL_SOURCES.md).

## Validation and evidence boundary

- `pnpm typecheck` checks component and registry types.
- `pnpm lint` is the repository lint command; scoped component lint can be run with `pnpm exec eslint components/ui-icon/index.ts components/ui-icon/registry.ts`.
- `pnpm test:icons` covers registry resolution, like/TabBar states, unsupported state fallback (including inherited property names), unknown name, size tokens, and missing-asset detection.
- `pnpm validate:icons` checks duplicate semantic declarations through TypeScript AST, default/state coverage, static asset existence, Registry/source-table/Core-file consistency, size/WXSS consistency, literal WXML inputs, direct Core paths and direct registered-asset image references in WXML, UiIcon registration across configured packages, 24px/2px/round SVG specifications, static colors, and unchanged geometry across default/active navigation and like states. Commented markup and dynamic content images are excluded from the direct-reference check. The existing non-Core filename guard is only a heuristic; it does not validate visual classification or dynamic WXML values.
- `pnpm audit:packages` enforces the configured package rules.

The repository Project Profile still marks the supported base-library version and compile/device procedure UNKNOWN. Static checks do not prove SVG rendering, visual alignment, or screen-reader behavior in WeChat Developer Tools or on-device; those remain manual verification items.

Known limitations: dark/translucent-background contrast requires runtime acceptance even though back/remove now have explicitly white `inverse` assets. Core and refreshed feature SVGs use explicit colors; an external image must not be assumed to inherit the parent's text color. Asset decoding/load failures have no component fallback. Parent accessibility labels are explicit markup, not proof of runtime screen-reader acceptance. Real-device rendering and accessibility verification remain pending.
