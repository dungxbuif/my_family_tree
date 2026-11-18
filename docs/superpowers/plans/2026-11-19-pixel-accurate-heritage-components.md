# Pixel-Accurate Heritage Components Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the shared UI foundation and four primary flows to match the approved Heritage Modern mockups at 430×932.

**Architecture:** Introduce a focused `components/heritage/` layer for the shell, header, bottom navigation, banners, surface cards, metrics, person previews, events, and page heroes. Existing routes keep their data and actions but compose the new primitives instead of page-specific glass/stone cards.

**Tech Stack:** Next.js 16.2, React 19, TypeScript, Tailwind CSS v4, Lucide, `next/image`.

**Spec:** `docs/design/DESIGN.md`

## Global Constraints

- Mockup content viewport is 430×932 CSS px; device chrome is excluded.
- Preserve existing permissions, routes, graph semantics, server actions, and real data.
- Use semantic Heritage Modern tokens; no glassmorphism or bright decorative gradients.
- All interactive targets remain at least 44×44px and respect safe areas.

## Review Focus

- Long Vietnamese names wrap without changing card alignment.
- Missing portraits retain the same geometry using branded placeholders.
- Empty and short datasets do not leave broken metric/event sections.
- Bottom navigation does not obscure forms or tree controls.
- Tree canvas remains pannable/zoomable while its surrounding chrome matches the baseline.

---

### Task 1: Shared Heritage foundation
- [ ] Add contract tests for the shared component exports and baseline class hooks.
- [ ] Build header, bottom navigation, banner, surface, metric, person-preview, event-row, and page-hero primitives.
- [ ] Install the shared shell in the authenticated dashboard layout.

### Task 2: Home/dashboard composition
- [ ] Replace the launchpad grid with the mockup hierarchy and real counts/recent members/upcoming events.
- [ ] Verify the 430×932 composition and empty states.

### Task 3: Tree composition
- [ ] Replace the member view mode bar and tree route chrome with the mockup header, lineage tabs, filters, generation labels, zoom controls, and add action.
- [ ] Preserve existing tree rendering and interactions.

### Task 4: Member detail and member form
- [ ] Recompose member detail sections and actions using Heritage surfaces.
- [ ] Recompose add/edit form header, grouped fields, relatives, and sticky actions.

### Task 5: Verification
- [ ] Run design contract tests, build, lint baseline comparison, and 430×932 browser screenshots.
- [ ] Keep the existing D3, modal, gallery, and relationship synchronization effects behaviorally unchanged; document narrow lint exceptions where React's effect rule cannot infer the external synchronization boundary.
