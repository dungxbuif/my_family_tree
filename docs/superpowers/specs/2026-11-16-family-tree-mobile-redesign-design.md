# Family Tree Mobile-First Redesign

## Intent

Migrate the existing Family Tree dashboard to a cohesive new visual system with responsive behavior designed from the smallest phone upward. The dashboard should make browsing a family tree, switching views, selecting a root person, filtering, and opening member details comfortable on touch devices while remaining efficient on desktop.

## Current state

- The app is a Next.js 16 application using React 19, Tailwind CSS, Framer Motion, and Lucide icons.
- The shared visual tokens are defined in `DESIGN.md` and `app/globals.css`.
- The dashboard supports list, tree, mindmap, and bubble views through `MembersViews` and `ViewToggle`.
- The tree view uses a pan/zoom canvas, a root selector, a portal-based toolbar, collapsible branches, avatar visibility, filters, and export actions.
- The production app is available at `https://family.dungxbuif.com`.

## Goals

- Establish one responsive dashboard shell for all member views.
- Make the primary navigation and high-frequency actions reachable with one hand on a 375px viewport.
- Preserve existing server actions, data loading, URL state, local-storage root persistence, view modes, tree pan/zoom, filters, exports, and member detail behavior.
- Use semantic design tokens, consistent Lucide iconography, visible focus states, and touch targets of at least 44px.
- Validate layout at 375px, 768px, 1024px, and 1440px, including landscape behavior and reduced-motion preferences.

## Non-goals

- Changing the database schema, authentication model, relationship semantics, or export formats.
- Replacing the tree layout algorithm or removing any existing view.
- Adding new family-management capabilities unrelated to responsive presentation.

## Anti-goals

- A desktop layout that merely shrinks until it overflows on mobile.
- Horizontal rows of controls that become unusable on narrow screens.
- Emoji used as structural controls or icons.
- Mobile-only behavior that makes the desktop experience inconsistent.

## Approaches considered

1. **Shared shell and presentation migration**
   Keep all current data and view engines and redesign the dashboard header, view navigation, root selector, toolbars, node cards, modal surfaces, and responsive spacing. This gives broad consistency with low data risk.
2. **Tree-only redesign first**
   Optimize the production tree screen before touching other views. This would deliver a faster visible improvement but leave the dashboard visually split between old and new patterns.
3. **Full dashboard migration**
   Apply the shared shell and new mobile-first interaction model to list, tree, mindmap, bubble, member detail, and modal surfaces in one pass. This is the selected approach because the requested outcome is a new design for the current app and the existing view switcher makes consistency important.

## Design decisions

- Use the persisted GiaPha-OS visual language as the baseline, with warm neutral surfaces, high-contrast stone text, amber accent states, Inter for interface text, and Playfair Display for brand and headings.
- Use a compact top bar on mobile and a fixed bottom navigation for the four member views. Desktop keeps the navigation in the top content area.
- Keep the root selector and primary tree actions in a sticky, safe-area-aware mobile action region. Secondary filters and display settings open in a bottom sheet or full-width popover on small screens.
- Preserve the tree canvas and pan/zoom model, but give it a predictable viewport height, larger touch targets, clearer zoom controls, and node sizing that remains readable without causing accidental horizontal page scroll.
- Use full-screen or near-full-screen member detail surfaces on mobile and centered rounded dialogs on larger screens.
- Respect `prefers-reduced-motion` and avoid layout-shifting hover transforms on touch layouts.

## Affected surfaces

- `app/globals.css` and shared layout styles
- `components/DashboardHeader.tsx`, `components/ViewToggle.tsx`, and `components/MembersViews.tsx`
- `components/FamilyTree.tsx`, `components/TreeToolbar.tsx`, `components/BaseToolbar.tsx`, `components/FamilyNodeCard.tsx`
- list, member detail, modal, and shared dashboard components as needed
- responsive and accessibility documentation in this design note after implementation

## Verification plan

- Run the repository lint and production build.
- Use the live app and local preview to inspect the tree, list, mindmap, and bubble views at 375px, 768px, 1024px, and 1440px.
- Verify no horizontal page overflow, usable tree pan/zoom, visible active navigation, safe-area padding, and 44px minimum touch targets.
- Verify keyboard focus order and accessible names for icon controls.
- Verify reduced-motion behavior and that existing root selection, filters, exports, and member detail interactions still work.

## Implementation notes

- The shared dashboard shell now reserves mobile bottom-navigation space and uses safe-area-aware padding.
- View navigation switches from a desktop segmented control to a labeled mobile bottom bar.
- Root selection, toolbar actions, and filter controls use 44px touch targets and responsive popover positioning.
- The tree canvas is bounded to its own scroll region and supports touch drag panning in addition to pointer panning.
- Member detail surfaces become bottom sheets on small screens and centered dialogs on larger screens.
- Repository lint passes with three pre-existing image optimization warnings in `GalleryGrid.tsx` and `UploadModal.tsx`. The unrelated `prefer-const` error in `app/actions/gallery.ts` was corrected so the check is green.
