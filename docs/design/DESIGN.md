# GiaPha-OS Design System

## Purpose

GiaPha-OS is a private family-tree application for Vietnamese families. The
interface should feel calm, trustworthy, readable, and respectful of family
history while keeping everyday tasks fast on touch devices.

This file is the canonical visual and interaction contract for every route in
the app. Components and pages use these tokens instead of introducing a
page-specific palette.

## Product principles

- Mobile-first. Design for a 375px viewport, then expand through tablet and desktop.
- Content first. Family names, dates, relationships, events, and privacy states remain easy to scan.
- Touch-safe. Interactive controls expose at least a 44px hit area with visible pressed and focus states.
- Private by default. Privacy and account state use clear text and semantic color, never color alone.
- Quiet motion. Use subtle transitions and render the final state immediately for reduced-motion users.

## Color tokens

| Token | Value | Use |
| --- | --- | --- |
| `primary` | `#1C1917` | headings, primary actions, brand text |
| `secondary` | `#57534E` | supporting text and inactive controls |
| `tertiary` | `#D97706` | heritage accent, focus and selected states |
| `neutral` | `#FAFAF9` | page canvas and soft backgrounds |
| `surface` | `#FFFFFF` | cards, dialogs, navigation surfaces |
| `border` | `#E7E5E4` | separators and control boundaries |
| `error` | `#DC2626` | destructive and validation states |
| `success` | `#0F766E` | completed and confirmed states |

Normal text maintains a 4.5:1 contrast ratio. Amber is paired with dark text
or a white surface and is never the only signal for a state.

## Typography

- Brand and editorial headings use Playfair Display.
- Body, labels, names, dates, and controls use Inter.
- Body text starts at 16px with a 1.5 line height.
- Small labels use at least 12px and remain readable at increased browser text size.
- Long names wrap naturally. Truncation is reserved for compact controls with a detail view available.

## Layout and breakpoints

- Base gutter is `clamp(16px, 3vw, 32px)`.
- Use a 4px/8px spacing rhythm with section gaps of 16, 24, 32, and 48px.
- Review widths are 375px, 768px, 1024px, and 1440px.
- Fixed mobile navigation and sticky toolbars include safe-area padding.
- A visualization owns its scrolling region. Large trees and maps never create document-level horizontal scrolling.
- Cards use rounded 16–24px corners. Avatars are circular.

## Navigation

- Desktop uses a compact header and a segmented control where the context is a member view.
- Mobile uses labeled bottom navigation for the four member views.
- Menus expose accessible names, `aria-expanded`, and Escape dismissal.
- Back behavior follows the browser and app hierarchy.

## Components

### Buttons and controls

- Primary action uses `primary` with a high-contrast surface label.
- Secondary action uses a surface or transparent background with a visible border.
- Icon-only controls need an accessible name and a 44px hit area.
- Use Lucide SVG icons. Do not use emoji as structural icons.

### Cards and lists

- Use a surface card with a 1px border and a soft shadow.
- Keep list rows at least 44px tall and group related metadata visually.
- Empty, loading, error, and success states appear near the content they describe.

### Family tree and maps

- Keep the canvas bounded to the available viewport and isolate pan/zoom scrolling inside it.
- Branch collapse controls keep a stable touch target even when the visual tree is zoomed.
- Connectors remain visually lighter than person cards.

### Forms and dialogs

- Every field has a visible label, input purpose, and inline error state.
- Member detail is a bottom sheet or full-height surface on mobile and a centered dialog on desktop.
- Dialogs expose `role="dialog"`, `aria-modal`, Escape close, initial focus, tab wrapping, and a clear close action.
- Preserve user-entered values when validation fails.

## Motion and accessibility

- Standard transitions are 150–250ms with spatial easing.
- Use Framer Motion reduced-motion state alongside the CSS media query.
- Do not rely on hover for essential actions.
- Focus indicators remain visible against neutral and surface backgrounds.
- Keyboard navigation and screen-reader order follow visual order.

## Asset contract

- The GiaPha-OS mark is served from `/icon.png` and reused by the dashboard
  header, favicon, Apple touch icon, and PWA manifest icons.
- Member portraits use the existing SVG avatar families under
  `public/avatar/v0`, `public/avatar/v1`, and `public/avatar/v2`; these remain
  data-compatible and are not replaced by decorative emoji or generated art.
- Gallery uploads are user content. Preserve their aspect ratio, provide an
  accessible alt/name, and keep loading/error states inside the owning card.
- The reference screenshots in `docs/screenshots/` are legacy visual baselines.
  They were audited against this document: the new implementation retains the
  information architecture and actions while replacing saturated multi-color
  cards with the warm stone/amber token system and adding mobile-safe layouts.

## Responsive QA contract

Check every UI change at 375px portrait, 375px landscape, 768px, 1024px, and
1440px. Verify no document overflow, safe-area clearance, readable long names,
keyboard focus, Escape behavior, reduced motion, and touch targets.

## Documentation policy

This file is the canonical design document for the entire app. Route-specific
decisions belong beside this file under `docs/design/`. There is no second
design-token source elsewhere in the repository.
