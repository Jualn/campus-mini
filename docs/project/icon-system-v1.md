# Icon System v1

## Scope and architecture

The first version provides a project-owned native Mini Program `ui-icon` Component for a bounded Core vocabulary. The actual flow is `Page or business Component → ui-icon → static registry → local SVG`. The Component renders an external `<image>`; it does not own interactions, hit areas, margins, navigation, business state, or accessible labels.

Only `name`, `state`, and `size` are public properties. The current semantic set is `chevron-left`, `chevron-right`, `close`, `clear`, `remove`, `plus`, `search`, `like`, `share`, `image-add`, `send`, `visibility`, `home`, `message`, `user`, `settings`, `comment`, `reply`, `views`, `more`, `preview`, `download`, `location`, `participants`, `contact`, `attachment`, `file`, `link`, `calendar-event`, and `checklist`. The supported states are `default`, `active` (like/TabBar), and `inverse` (back/remove over media). No tone, arbitrary color, path, variant, or optical adjustment property exists. Runtime lookup is static; unknown names render nothing, and invalid states/sizes fall back to the semantic default and `md`. Development warnings are deduplicated.

## Sizes

| Token | Visual box | Usage |
|---|---:|---|
| `sm` | 24rpx | Search and clear, compact close/remove, row chevrons |
| `md` | 32rpx | Like and compact action glyphs |
| `lg` | 40rpx | Back navigation and add/share actions |
| `xl` | 48rpx | Custom TabBar glyph box |

These tokens describe the image box only. Existing buttons, wrappers, rows, and touch areas retain ownership of their geometry.

## Asset ownership and source

Current Core Tabler outlines have a single owner at [`assets/icons/core`](../../assets/icons/core/SOURCES.md). The source manifest records Tabler Icons 3.48.0, upstream icon names, MIT license, and explicit static color edits; the upstream license copy is in that directory. The 2026-09-30 visual refresh replaces the previously reused Core project glyphs with the same Tabler family. `remove` remains its own semantic while sharing the `x.svg` visual with `close`.

The registry and manifest are separate: maintenance provenance does not become runtime descriptor data. No complete icon package or remote asset loader is used.

## Adding an icon

The semantic list above and the Registry define the current v1 vocabulary. Check them first and reuse an existing semantic when its meaning matches; do not add aliases for file names, colors, or upstream family names. `close`, `clear`, and `remove` remain separate meanings even when sharing artwork.

For a new generic UI semantic, add only the needed Tabler SVG to `assets/icons/core/`, then add the static Registry entry and its row in `SOURCES.md` (family, version, upstream name, license, modifications). `IconName` is derived automatically. Update the vocabulary list above. A new state must express the same semantic and have a real caller; update the state type and validator policy when needed. Use existing size tokens and keep button labels, hit areas, and layout in the parent.

Domain artwork stays with its owning feature/package until a shared Domain extension is explicitly needed. Brand/channel artwork and content/illustrations stay outside UiIcon. Existing project glyphs may be reused through Registry with a source record; do not duplicate them into Core. New call sites use UiIcon rather than Core paths or character glyphs. Classification is a review decision, not something a filename blacklist can prove.

Run `pnpm test:icons`, `pnpm validate:icons`, `pnpm typecheck`, and `pnpm audit:packages`; follow with the relevant Mini Program compile/render checks. Dynamic WXML values still need caller review and runtime validation.

## P1 safe migration

The 2026-09-30 safe batch added `image-add`, `send`, and `visibility` based on active UI call sites. `image-add` and `send` retain the existing project glyphs; `visibility` uses Tabler `eye` 3.48.0. Their call sites use `lg`/`md` tokens. The custom TabBar then moved `home`, `message`, and `user` to stateful Registry entries while retaining the existing default/active SVGs and parent transform. Its three icons share a stable 48rpx box, so `xl` was added as an evidenced navigation size tier. The 52rpx settings glyph in a fixed 64rpx button also maps to `xl` with a 4rpx box reduction, preserving the existing project asset. This is a semantic/ownership migration, not a broad visual refresh. Other reviewed P1 candidates were deferred where the meaning was business/domain, the current artwork represented a richer concept, or the rendered box varied beyond the available token hierarchy.

At the migration stage, `remove` and profile back navigation lacked media-background contrast acceptance. The subsequent visual refresh adds explicitly white `inverse` assets for these real media callers; `close` and default `remove` continue to share `x.svg`. This does not introduce arbitrary color/tone properties. Runtime acceptance remains pending.

## Remaining common controls migration

The 2026-09-30 follow-up source audit covered configured Pages, Components, Custom TabBar, ordinary subpackages, and icon references in TypeScript/WXSS. It added twelve semantics using existing project assets with source records, without introducing an icon dependency or moving subpackage resources into the main package. `comment` and `reply` have distinct meanings while sharing artwork; `views` is a readership metric and stays distinct from the audience-setting semantic `visibility`; after the visual refresh they share the same eye artwork.

Migrated callers: PostCard (comment/views/more), CommentPanel (reply/more), UserProfile (more), SharePanel (preview/download), ActivityCard (location/participants), community detail (comment/more and its loading skeleton), activity detail (location/participants/contact/attachment/file), and public-event detail (link). All PostCard action glyphs retain their 40rpx wrappers; all community detail action glyphs now use the existing 48rpx `xl` tier, including the skeleton. Caller wrappers own spacing, opacity and like animation consistently. Other migrated glyphs map to existing `md`/`lg`/`xl` tiers inside centered wrappers that preserve the previous layout boxes and button/event ownership; for example 36rpx comment glyph boxes contain 32rpx icons and 52–76rpx more/preview boxes contain 48rpx icons. These were migration-stage size mappings. The subsequent visual refresh sets all more glyphs to `md` (32rpx) because the Tabler dots occupy more of their canvas; parent button boxes stay unchanged. These size mappings require runtime visual acceptance.

The remaining direct images were classified rather than blindly replaced:

| Remaining callers | Ownership and reason |
|---|---|
| Home/search shortcuts; message filters, message fallback avatars and InAppBanner; public-event category icons | Domain/category artwork, including dynamic paths; not generic controls |
| Comment/message/search/list empty states | Empty-state illustrations and larger artwork; not action icons |
| Activity/public-event timeline, introduction, participation, information-source and official-link section headings | Feature-specific explanatory artwork; not synonyms for generic controls |
| Setting preference rows and report reason choices | Feature-owned notification/account and moderation artwork |
| Profile cover/avatar edit masks and joined-date tag | Feature-owned profile artwork, including contrast-sensitive overlay assets in the user subpackage |
| WeChat share option and exam identity assets | Brand/channel and domain identity artwork |
| Avatars, covers, QR codes, thumbnails, attachments and generated posters | Content images or generated media; retain native image rendering |
| `pages/test` | Development-only upload glyphs, excluded from shipping; not production callers |

The follow-up [visual refresh](icon-visual-language.md) also aligns the remaining feature-owned assets to Tabler shapes and explicit static colors, while retaining their package ownership. Home shortcut icons now use `calendar-event`/`checklist`. Setting and message category glyphs remain feature/domain assets with [source records](../../assets/icons/VISUAL_SOURCES.md); retained image rendering does not imply retained old artwork.

Future generic icon artwork changes belong in the Registry asset and its source record; callers keep semantic names. A replacement path is changed once in `registry.ts`, not separately in each Page. Source provenance and the existing external-image color limitation still apply. Domain/brand/illustration changes stay with their owner until a shared Domain extension is justified. This inventory is a source audit, not evidence of Developer Tools or device rendering.

The subsequent scene-specific refinement preserves lightweight outline controls while giving selected TabBar states blue silhouettes with white internal details. Path geometry remains unchanged; fill/stroke colors and painting order may differ. Home shortcuts use pale body fills with colored outlines; the public-matter shortcut uses `clipboard-list` to pair a bounded document form with the calendar. Existing default/active state ownership and size tokens stay unchanged. These are deliberate group-specific treatments, not a requirement that every project icon be filled or have identical weight.

## Validation and evidence boundary

- `pnpm typecheck` checks component and registry types.
- `pnpm lint` is the repository lint command; scoped component lint can be run with `pnpm exec eslint components/ui-icon/index.ts components/ui-icon/registry.ts`.
- `pnpm test:icons` covers registry resolution, like/TabBar states, unsupported state fallback (including inherited property names), unknown name, size tokens, and missing-asset detection.
- `pnpm validate:icons` checks duplicate semantic declarations through TypeScript AST, default/state coverage, static asset existence, Registry/source-table/Core-file consistency, size/WXSS consistency, literal WXML inputs, direct Core paths and direct registered-asset image references in WXML, UiIcon registration across configured packages, 24px/2px/round SVG specifications, static colors, and unchanged geometry across default/active navigation and like states. Commented markup and dynamic content images are excluded from the direct-reference check. The existing non-Core filename guard is only a heuristic; it does not validate visual classification or dynamic WXML values.
- `pnpm audit:packages` enforces the configured package rules.

The repository Project Profile still marks the supported base-library version and compile/device procedure UNKNOWN. Static checks do not prove SVG rendering, visual alignment, or screen-reader behavior in WeChat Developer Tools or on-device; those remain manual verification items.

Known limitations: dark/translucent-background contrast requires runtime acceptance even though back/remove now have explicitly white `inverse` assets. Core and refreshed feature SVGs use explicit colors; an external image must not be assumed to inherit the parent's text color. Asset decoding/load failures have no component fallback. Parent accessibility labels are explicit markup, not proof of runtime screen-reader acceptance. Real-device rendering and accessibility verification remain pending.
