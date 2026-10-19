---
version: alpha
name: Marketplace Solidario Super Carnes
description: Catálogo comunitario panameño para encontrar productores locales y contactarlos directamente.
colors:
  primary: "#003399"
  secondary: "#1649B8"
  accent: "#FFD400"
  background: "#F3F6FC"
  surface: "#FFFFFF"
  text: "#18243A"
  muted: "#66748D"
  border: "#D6DFEF"
  success: "#1649B8"
  warning: "#8B5B0B"
  danger: "#9F3530"
  focus: "#1649B8"
typography:
  display:
    fontFamily: "Fraunces, Georgia, serif"
  body:
    fontFamily: "Atkinson Hyperlegible, system-ui, sans-serif"
  utility:
    fontFamily: "Atkinson Hyperlegible, system-ui, sans-serif"
rounded:
  sm: "0.45rem"
  md: "0.8rem"
  lg: "1.25rem"
  pill: "999px"
spacing:
  page-max: "78rem"
  section-gap: "3.5rem"
  control-height: "2.9rem"
components:
  button:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    height: "2.9rem"
    rounded: "0.8rem"
    padding: "0.76rem 1.15rem"
  card:
    backgroundColor: "#FFFFFF"
    rounded: "1.25rem"
  field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    height: "2.9rem"
    rounded: "0.8rem"
  harvest-label:
    backgroundColor: "{colors.accent}"
    textColor: "#003399"
  status-success:
    backgroundColor: "{colors.success}"
    textColor: "{colors.surface}"
  status-warning:
    backgroundColor: "{colors.warning}"
    textColor: "{colors.surface}"
  status-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.surface}"
  divider:
    backgroundColor: "{colors.border}"
  focus-ring:
    backgroundColor: "{colors.focus}"
  muted-copy:
    textColor: "{colors.muted}"
---

## Overview

### Creative North Star

Super Carnes' original blue-and-yellow shop sign is the marketplace's shared identity. Blue navigation and actions carry the brand across public and administrative screens; yellow marks the harvest and local-market moments. The interface should feel made for real Azuero producers rather than an online supermarket.

### Product context and register

- **Audience and primary job:** Panamanian buyers discover local offers; producers publish manually and receive direct inquiries.
- **Target market(s) and evidence:** Panama, especially Azuero; defined in the product brief and roadmap, not inferred from interface language.
- **Locale(s) and language policy:** Spanish (Panama), plain regional-neutral copy; use USD/B/. display where configured and `es-PA` dates/numbers.
- **Usage scene:** Phone first, outdoor/light use, variable connectivity, short attention windows and occasional operator-assisted entry.
- **Register:** Hybrid. Public home/catalog can carry market identity; producer/admin tools prioritize task clarity, predictable forms and data readability.
- **Memorable signature:** Yellow harvest labels on otherwise restrained product cards and route headings.
- **Restraint:** Forms, moderation queues, errors, consent, evidence and safety guidance remain quiet and explicit.
- **Anti-references:** Checkout funnels, supermarket shelf pricing, discount stickers, highly saturated campaign gradients, and claims that Super Carnes guarantees producer quality or transactions.
- **Token ownership/runtime mapping:** This file authors durable visual tokens; `frontend/src/styles/tokens.css` maps them once to semantic CSS variables. Shared components consume variables. No duplicated Tailwind theme. `npm run verify:design` lints this contract and checks token declarations.

## Colors

Super Carnes navy `primary` anchors navigation and important actions. Clear brand blue `secondary` carries links and positive states. Cool white-blue `background` and white `surface` distinguish page from content. Logo yellow `accent` marks harvest moments; it is not a success state. `text` and `muted` carry hierarchy, `border` defines controls, and semantic `success`, `warning`, and `danger` never rely on color alone. `focus` is a high-contrast blue outline. The initial product ships a light theme; forced-colors and high-contrast modes keep native outlines and borders.

## Typography

Fraunces appears only in short page titles and editorial phrases. Atkinson Hyperlegible carries body, labels, buttons, numeric fields, dates and dense admin content. Use local/system fallbacks so content remains readable when network fonts fail. Body line height is 1.55; controls are 1.1. Sentence case, active verbs and short labels are preferred. Long producer names wrap in detail views and truncate only in compact cards with full text available on the destination.

## Layout

Public pages use a centered 78rem maximum width, a compact institutional header and generous editorial home spacing. Catalog uses a filter rail on wide screens and an in-flow filter section on narrow screens. Cards use fixed aspect-ratio image frames to prevent layout shift. Producer/admin use a stable app shell with a collapsible mobile navigation. Admin tables own their internal scrolling and use server pagination; public browsing uses explicit load-more or server pagination with committed filters in URL search parameters. Forms retain natural document scrolling. Global layout does not hide document overflow to fit a table.

Spacing follows a 0.25rem base with named section and page tokens above; dense admin areas may reduce gaps, but touch targets stay at least 44px. Breakpoints: 40rem phone/wide-phone transition, 58rem tablet navigation, 78rem wide catalog.

## Elevation & Depth

Hierarchy comes from cool white-blue surfaces and thin blue-gray borders. Product photography carries the visual richness. Shadows are reserved for anchored menus and dialogs; cards use a small hover lift only on pointer devices. No blur behind primary content, no heavy dashboard shadows and no fixed overlays that obscure the viewport.

## Shapes

Cards and dialogs use the larger paper-label radius; controls use the medium radius and small status chips use a pill. Dividers are thin blue-gray. Icons use a consistent 1.8px outline and never replace a label for an unfamiliar action. Harvest labels are rectangular yellow tags with one clipped corner; this is the only decorative shape language.

## Components

### Foundational visual states

Buttons, links and fields have visible hover, focus-visible, pressed, disabled, busy and invalid states. Focus uses a 3px offset blue outline. Busy controls preserve width and expose an accessible status. The default loading state is a small app-owned spinner; skeletons are not used. Success, warning and error always include an icon or text label.

### Buttons and actions

Emphasis (solid/outline/ghost) is independent from intent (brand/neutral/success/warning/info/danger). Primary actions are Super Carnes blue; high-impact danger only appears in the final confirmation step and stays separated from safe actions. A button never changes size while busy.

### Navigation and data display

Public navigation remains short and uses descriptive links. Private navigation identifies the signed-in role. Status uses text and a semantic icon. Tables are read-oriented semantic tables with real sort buttons, URL-backed state, range/total labels, and pagination. Cards remain navigation links with a separate contact action where appropriate.

### Forms and overlays

All product forms use application-owned validation (`noValidate`), real labels, inline correction guidance, preserved values and first-error focus. Search clears immediately, waits 300ms before remote requests, cancels stale work and respects IME composition. Selects are native where platform popup geometry is acceptable; date values are typed unless the product later adopts a locale-owned calendar. Upload uses an accessible picker first, optional drag/drop, per-file validation and remove actions. Dialogs use app-owned accessible primitives; browser dialogs are prohibited. Toasts share one live-region provider and do not replace inline errors.

### Iconography

Lucide outline icons, 18–20px in controls and 22px in navigation. Icon-only actions require an accessible name and tooltip; text remains on report, contact, moderation and destructive actions.

### Motion

Use 140–180ms ease-out for hover/focus transitions and 220ms for small navigation changes. Motion communicates an action and never gates content. Under `prefers-reduced-motion`, remove transforms and nonessential transitions.

### Content and data visualization

Use practical Spanish: “Ver producto”, “Enviar a revisión”, “Pausar publicación”, “Solicitar cambios”. Never call a contact click a sale or a badge a guarantee. Dates use `es-PA`; currency uses the product-configured USD/B/. code. Dashboard metrics state what they count and never imply completed sales from clicks.

## Do's and Don'ts

- **Do:** Keep producers and their own photography at the center of public discovery.
- **Do:** Use the same button, field, status, toast and validation behavior across routes.
- **Don't:** Add checkout, supermarket inventory patterns, discount urgency, or guarantees to the public marketplace.
- **Don't:** Expose exact locations, documents, or private report evidence in public UI.
