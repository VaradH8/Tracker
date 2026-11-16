# Design system

Every colour, width and motion value lives in [`demo/lib/design-tokens.ts`](../demo/lib/design-tokens.ts). Tailwind reads it (`demo/tailwind.config.ts`), and so does code that can't use a class: SVG charts, the logo and the browser theme colour. `__tests__/design-tokens.test.ts` enforces the rules below in CI.

## Colour

### Text and surfaces (`ink`)

| Token | Hex | Use | On white |
| --- | --- | --- | --- |
| `ink-900` | #202124 | Headings, primary text | 16.1:1 |
| `ink-800` | #2E3134 | Strong body text | 13.1:1 |
| `ink-700` | #3C4043 | Body text, form labels | 10.5:1 |
| `ink-600` | #4D5156 | Secondary body text | 8.0:1 |
| `ink-500` | #5F6368 | Secondary text, captions | 6.0:1 |
| `ink-400` | #676C71 | **Lightest text allowed**: hints, placeholders, meta | 5.3:1 |
| `ink-300` | #9AA0A6 | **Decorative only**: status dots, rules, de-emphasised bars. Never text or icons. | 2.6:1 |
| `ink-200` | #DADCE0 | Borders, dividers | — |
| `ink-100` | #F1F3F4 | Hover fills, chips | — |
| `ink-50` | #F8F9FA | Page background | — |

### Brand

Each hue comes in a set: a **fill** (bright, for shapes and buttons), a **Text** shade (AA-safe for words and icons), and a **Bg** tint (pills, banners).

| Hue | Fill | Text | Bg |
| --- | --- | --- | --- |
| Blue | `brand-blue` #1A73E8 (primary button, focus ring) | `brand-blueText` #1967D2 | `brand-blueBg` |
| Red | `brand-red` #EA4335 | `brand-redText` #C5221F (also danger-button fill; hover `brand-redHover`) | `brand-redBg` |
| Yellow | `brand-yellow` #F9AB00 | `brand-yellowText` #9A5300 | `brand-yellowBg`, `brand-yellowBorder` |
| Green | `brand-green` #34A853 | `brand-greenText` #137333 | `brand-greenBg` |

Rules:

- **Words and icons use a `*Text` shade or `ink-400` and darker.** The bright fills are 1.9–4.3:1 as text, below WCAG AA (4.5:1).
- **White text sits only on `brand-blue` or a `*Text` fill** (avatars, badges, danger buttons).
- Status is never shown by colour alone: pair it with a word or an icon.
- `navy-900` / `navy-800` are only for the Inventive brand band (`brandNavyGradient`).

### Charts

`chart` in the tokens file. Marks (`accent`, `track`, `deemph`, `good`, `warning`, `critical`, `ordinal`) are shapes. Labels use `ink`, `ink2`, `ink3` or `muted` (all AA). A status word drawn in SVG uses `criticalText`.

## Type

Space Grotesk (`font-heading`) for headings, Poppins (`font-sans`) for everything else, both self-hosted by `next/font`.

| Class | Size | Use |
| --- | --- | --- |
| `text-xs` | 12 px | **Minimum.** Labels, meta, table headers, badges |
| `text-sm` | 14 px | Default UI text: tables, forms, buttons |
| `text-base` | 16 px | Reading text, empty-state headings |
| `text-lg` | 18 px | Card and section titles (`font-heading`) |
| `text-xl` / `text-2xl` | 20 / 24 px | Page titles (`font-heading`) |

No `text-[Npx]` values and no SVG `fontSize` below 12.

## Space and layout

- Tailwind's 4 px spacing scale only (`p-4` = 16 px, `gap-2` = 8 px).
- Page widths: `max-w-container-wide` (1400 px: boards, tables), `max-w-container` (1200 px: dashboards, lists), `max-w-container-narrow` (1100 px: settings, forms).
- Tables keep `min-w-table` (760 px) inside an `overflow-x-auto` wrapper, so they scroll sideways on a phone instead of squashing.
- Radius: `rounded` (4 px) for fields and buttons, `rounded-card` (8 px) for cards, `rounded-pill` for chips.
- Shadow: `shadow-card` only.
- Arbitrary values (`w-[…]`) are allowed only for content-specific measurements, such as a table's minimum width or chart geometry. If a value repeats, it becomes a token.

## Motion

| Token | Value | Use |
| --- | --- | --- |
| Tailwind default | 150 ms | Hover and colour changes (`transition-colors`) |
| `duration-enter` / `animate-fade-in`, `animate-rise-in` | 200 ms | Things appearing: toasts, popovers |
| `duration-panel` / `animate-slide-in-left` | 250 ms | Panels and drawers |
| `ease-standard` | cubic-bezier(0.2, 0, 0, 1) | All of the above |

Animations are written `motion-safe:animate-…`. `app/globals.css` also turns transitions off under the OS "reduce motion" setting.

## Components to reuse

| Need | Use |
| --- | --- |
| Buttons | `.btn-primary`, `.btn-ghost` (globals.css) |
| Status chips | `.pill-blue` / `-red` / `-yellow` / `-green` / `-grey` |
| Cards | `.card` |
| Loading | `PageSkeleton`, `CardSkeleton`, `ListSkeleton`, `ShellSkeleton` |
| Empty | `EmptyState` |
| Errors | `SectionErrorBoundary` |
| Confirm, undo | `useConfirm()`, then a toast with an Undo action |
| Icon-only button | `aria-label` + `tap-target` |
| Form field | `<label htmlFor>` + `id` (or `useId()` in reusable components); a group of toggles gets `role="group"` + `aria-labelledby`, and each toggle `aria-pressed` |
