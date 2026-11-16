# Family Tree Mobile-First Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the Family Tree dashboard to the approved GiaPha-OS redesign with responsive web behavior and a mobile-first interaction model.

**Architecture:** Preserve the existing server data loading, URL state, actions, view engines, and pan/zoom logic. Refactor the shared dashboard shell and presentation components around responsive layout primitives, then validate each view at phone, tablet, and desktop widths.

**Tech Stack:** Next.js 16, React 19, Tailwind CSS 4, Framer Motion, Lucide React, existing TypeScript domain types and server actions.

**Spec:** `docs/superpowers/specs/2026-11-16-family-tree-mobile-redesign-design.md`

## Global Constraints

- Preserve existing data, server actions, URL query state, local-storage root persistence, view modes, filters, exports, and member detail behavior.
- Follow `DESIGN.md` tokens and the persisted design system in `design-system/gia-pha-os/MASTER.md`.
- Use Lucide SVG icons for structural controls and maintain minimum 44px touch targets.
- Support 375px, 768px, 1024px, and 1440px layouts without horizontal page overflow.
- Respect `prefers-reduced-motion` and keep keyboard focus visible.

## Review Focus

- A 375px viewport must keep navigation, root selection, and tree controls reachable without clipping.
- Tree canvas horizontal panning must not become document-level horizontal scrolling.
- Full-width mobile dialogs must preserve close, focus, and scroll behavior.
- Longer Vietnamese names must wrap without changing connector alignment or hiding actions.
- Reduced-motion users must receive the final state without entrance or layout-shifting animations.

### Task 1: Shared responsive tokens and dashboard shell

**Files:**
- Modify: `app/globals.css`
- Modify: `app/dashboard/layout.tsx`
- Modify: `components/DashboardHeader.tsx`
- Modify: `components/Footer.tsx`

**Interfaces:**
- Produces shared classes and CSS variables for content gutters, safe-area padding, responsive surfaces, focus rings, and mobile bottom navigation spacing.

- [ ] **Step 1: Add responsive shell tokens and utility classes**

Define semantic variables for page background, surface, text, borders, interactive accent, content gutters, and safe-area insets while keeping the values from `DESIGN.md`. Add reduced-motion handling and a page-level overflow rule that prevents accidental document scrolling.

- [ ] **Step 2: Refactor `DashboardHeader` for compact mobile layout**

Keep the existing logo and `HeaderMenu`, but use adaptive padding, a stable 44px menu target, and a readable brand lockup that truncates gracefully on narrow screens.

- [ ] **Step 3: Reconcile dashboard and footer spacing**

Ensure the layout reserves space for mobile fixed navigation and footer content without hiding the final scrollable content.

- [ ] **Step 4: Run lint**

Run: `bun run lint`

Expected: PASS with no new lint errors.

### Task 2: Responsive view navigation and member workspace

**Files:**
- Modify: `components/ViewToggle.tsx`
- Modify: `components/MembersViews.tsx`
- Modify: `components/RootSelector.tsx`

**Interfaces:**
- Consumes the shell tokens from Task 1.
- Produces a view navigation that remains keyboard-accessible and a workspace header that exposes root selection and toolbar actions at every breakpoint.

- [ ] **Step 1: Refactor `ViewToggle` into adaptive navigation**

Use a compact desktop segmented control and a fixed mobile bottom navigation with four labeled touch targets. Preserve `ViewMode` values and `setView` behavior. Use Lucide icons and visible selected state.

- [ ] **Step 2: Refactor `MembersViews` workspace layout**

Create responsive regions for root selection, toolbar portal, view content, and mobile bottom-nav clearance. Keep existing `currentView`, root restoration, and dynamic view components unchanged.

- [ ] **Step 3: Make `RootSelector` touch-friendly**

Preserve its selection behavior while providing a 44px trigger, responsive width, and a mobile-friendly popover or full-width menu that does not clip the selected person name.

- [ ] **Step 4: Verify view switching manually**

Check list, tree, mindmap, and bubble modes at 375px and 1440px. Expected: each mode changes without URL or local-storage regressions and no horizontal document overflow appears.

### Task 3: Mobile-first tree canvas and controls

**Files:**
- Modify: `components/FamilyTree.tsx`
- Modify: `components/TreeToolbar.tsx`
- Modify: `components/BaseToolbar.tsx`
- Modify: `hooks/usePanZoom.ts`

**Interfaces:**
- Preserves the existing `FamilyTree` props and pan/zoom callbacks.
- Produces a bounded canvas with touch-safe controls, responsive toolbar grouping, and a secondary settings surface for filters.

- [ ] **Step 1: Bound the tree viewport**

Keep panning inside the tree region, use `touch-action` appropriately, set responsive viewport heights, and prevent tree width from expanding the document body.

- [ ] **Step 2: Refactor tree controls for mobile**

Keep zoom in, zoom out, reset, center, display, and export actions. Group them into a compact mobile control cluster and a desktop toolbar while preserving accessible labels and 44px targets.

- [ ] **Step 3: Move filters into a responsive sheet/popover**

Keep all existing filter state and labels. Use a full-width bottom sheet on narrow screens and the current anchored popover pattern on larger screens. Add Escape and focus-visible behavior where the current component lacks it.

- [ ] **Step 4: Verify pan, zoom, collapse, filters, and export**

At 375px, confirm tree gestures do not scroll the page, branches can still collapse, controls remain reachable, and export remains available to editors.

### Task 4: Responsive node cards and member detail surfaces

**Files:**
- Modify: `components/FamilyNodeCard.tsx`
- Modify: `components/modal/MemberDetailModal.tsx`
- Modify: related member detail/list components discovered during implementation

**Interfaces:**
- Preserves `Person` data, `setMemberModalId`, and existing detail actions.
- Produces readable nodes and touch-safe detail surfaces across phone and desktop widths.

- [ ] **Step 1: Resize and wrap node cards responsively**

Use the existing token system for width, avatar, typography, and connector spacing. Ensure long names wrap predictably, spouse markers use Lucide or text labels instead of emoji icons, and interactive cards expose descriptive accessible names.

- [ ] **Step 2: Make member detail modal responsive**

Use a full-height or near-full-height mobile sheet with safe-area padding and a centered desktop dialog. Preserve edit, delete, gallery, relationship, and close behavior.

- [ ] **Step 3: Verify keyboard and reduced-motion behavior**

Confirm focus visibility, Escape close, readable content at enlarged browser text settings, and no essential motion when reduced motion is enabled.

### Task 5: Documentation, build verification, and responsive QA

**Files:**
- Modify: `docs/superpowers/specs/2026-11-16-family-tree-mobile-redesign-design.md`
- Modify: `README.md` or the most relevant user-facing UI documentation if responsive behavior changes the usage guidance

- [ ] **Step 1: Reconcile the design note with shipped behavior**

Record the final breakpoint behavior, mobile navigation model, toolbar behavior, and any implementation decisions made during coding.

- [ ] **Step 2: Run repository checks**

Run: `bun run lint`

Run: `bun run build`

Expected: both commands pass.

- [ ] **Step 3: Run responsive browser QA**

Use the live or local app at 375px, 768px, 1024px, and 1440px, including landscape at phone width. Verify no horizontal page scroll, visible focus, safe-area clearance, usable touch targets, and working view-specific interactions.

- [ ] **Step 4: Commit the completed redesign**

```bash
git add app components hooks docs design-system
git commit -m "feat: redesign family tree dashboard for mobile"
```
