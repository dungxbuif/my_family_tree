# Heritage Modern Style Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the app-wide stone/black/amber visual system with the approved Heritage Modern cream/deep-green/muted-gold system from `/Users/dungxbuif/Downloads/gia-pha-design-v1`.

**Architecture:** Keep the existing Next.js routes, data behavior, and component structure. Make `docs/design/DESIGN.md` plus its machine-readable token file the design contract, expose the same semantic tokens through Tailwind v4 in `app/globals.css`, and remap legacy utility palette aliases so every existing route changes immediately without a risky 50-file rewrite.

**Tech Stack:** Next.js 16.2, React 19, TypeScript, Tailwind CSS v4, `next/font`, Node test runner.

**Spec:** `docs/design/DESIGN.md`

## Global Constraints

- Vietnamese remains the default language with full diacritic support.
- Canonical palette: deep green `#174D2A`, dark green `#103C23`, cream `#FBF7F0`, card `#FFFDF9`, muted gold `#A47B24`.
- Body text and critical labels meet WCAG AA; gold is not used as small body text on white.
- Existing routes, graph semantics, permissions, APIs, and storage behavior remain unchanged.
- Touch targets remain at least 44×44px and reduced-motion behavior remains supported.

## Review Focus

- Legacy `stone-*`, `amber-*`, and `orange-*` utilities must resolve to Heritage Modern values across all routes.
- Vietnamese font loading must not introduce remote CSS or layout-shift-prone `<link>` tags.
- Focus rings and primary button text must retain sufficient contrast.
- Status colors must stay semantically distinct from brand and accent colors.
- Mobile safe-area and visualization scrolling behavior must remain unchanged.

---

### Task 1: Canonical design contract and token test

**Files:**
- Modify: `docs/design/DESIGN.md`
- Create: `docs/design/tokens/design-tokens.json`
- Create: `docs/design/tokens/theme.css`
- Create: `docs/design/assets/mockups/*.png`
- Create: `docs/design/assets/icons/*.svg`
- Create: `docs/design/assets/illustrations/*.svg`
- Create: `tests/design-system.test.mjs`

**Interfaces:**
- Consumes: approved handoff package at `/Users/dungxbuif/Downloads/gia-pha-design-v1`
- Produces: canonical semantic token names and exact values for runtime CSS

- [ ] Write a Node test asserting the contract, CSS tokens, legacy aliases, and font imports.
- [ ] Run `node --test tests/design-system.test.mjs` and confirm it fails against the old theme.
- [ ] Import the complete approved handoff package: spec, machine-readable tokens, CSS tokens, icons, illustration, and four mockups.

### Task 2: Runtime theme and typography migration

**Files:**
- Modify: `app/globals.css`
- Modify: `app/layout.tsx`
- Modify: `app/login/page.tsx`

**Interfaces:**
- Consumes: semantic values from `docs/design/design-tokens.json`
- Produces: Tailwind theme variables, legacy palette aliases, and Vietnamese-capable font variables

- [ ] Add semantic Heritage Modern CSS variables and Tailwind mappings.
- [ ] Remap legacy stone/amber/orange scales to the new neutral/green/gold family.
- [ ] Replace Inter/Playfair with Be Vietnam Pro/Noto Serif through `next/font`.
- [ ] Replace remaining hard-coded old palette values on the login shell.
- [ ] Run the design-system test until it passes.

### Task 3: Verification and documentation reconciliation

**Files:**
- Modify: `README.md`
- Modify: `docs/design/family-tree-mobile-redesign.md`

**Interfaces:**
- Consumes: migrated runtime theme
- Produces: human-facing implementation note and verified app build

- [ ] Reconcile implementation notes with the Heritage Modern contract.
- [ ] Run `bun run lint`.
- [ ] Run `bun run build`.
- [ ] Inspect representative desktop and mobile routes and confirm the new palette is visibly active.
- [ ] Review the git diff for unrelated changes and stale stone/amber token declarations.

