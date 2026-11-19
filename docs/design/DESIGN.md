# Gia Phả — UI Design Specification

> **Status:** APPROVED / LOCKED · **Version:** 2.0 · **Date:** 2026-11-19
> **Product:** Vietnamese genealogy / family history management app
> **Primary target:** Mobile (iOS / Android); responsive web supported
> **Source of truth:** This document + `tokens/design-tokens.json` + the four PNG baselines under `assets/mockups/`. The PNGs are canonical for visual hierarchy, component geometry, spacing, radii, and responsive composition; factual family data still comes from the application.

## 1. Design decision

**Direction: Heritage Modern.** Preserve the warm Vietnamese family-history aesthetic of the four approved mockups: ivory surfaces, forest-green brand, antique-gold secondary accent, leafy/tree motif, portrait-based member cards, light shadows, and elegant type hierarchy. The UI must remain readable and functional without decoration or portrait photos.

### Visual references

| Screen | Reference | Responsibility |
|---|---|---|
| Home | `assets/mockups/01-home.png` | Overview, counts, recent members, upcoming events |
| Family tree | `assets/mockups/02-family-tree.png` | Explore connected people, navigate branches, pan/zoom |
| Member detail | `assets/mockups/03-member-detail.png` | Person identity, close relatives, life events, actions |
| Add / edit member | `assets/mockups/04-member-form.png` | Create and connect a person, validate relationships |

### Non-negotiables

1. Language is **Vietnamese** by default, with full Unicode/diacritic support.
2. Primary palette stays cream + deep green + muted gold. Do not introduce bright gradients, glassmorphism, or dense borders.
3. Tree connections must come from real graph relationships, not names, generation numbers, ordering, or card positioning.
4. Relationship labels (cha, mẹ, vợ/chồng, con, cụ…) are **relative to the selected focus person**; never hard-code them globally.
5. "Nội / Ngoại" is a *view/filter context* relative to a selected root/focus; do not change underlying ancestry based on a toggle.
6. Avoid fictitious death dates, future events, or "còn N ngày" labels from the image; mockups contain illustrative data only.
7. Use responsive, scrollable layouts; do not force all form fields and actions onto one fixed-height screen.
8. Current-user account tab is **"Tài khoản"**, whereas an individual person's page is **"Hồ sơ thành viên"**. This resolves the ambiguous "Hồ sơ" nav label visible in the mockups.

## 2. Foundations

### Pixel-accurate visual contract

- Primary comparison viewport: **430 × 932 CSS px**, excluding the rendered iPhone hardware frame and Dynamic Island.
- Preserve the mockup hierarchy and proportions at 430px: 16px page gutter, 12–16px component gaps, 20px cards, 24px hero/banner corners, 52px primary controls, and 76px bottom navigation plus safe-area inset.
- The four PNGs define the required component composition for Home, Family tree, Member detail, and Add/edit member. Real data may change text length and item count, but must use the same component variants and alignment rules.
- Visual-regression screenshots are captured at 430×932 and compared against stable fixtures. Target tolerance is ≤4px for component bounds and ≤2px for internal alignment; color and typography must use the canonical tokens below.
- At 320–429px, preserve hierarchy and stack/wrap where required. At ≥768px, expand the same components without replacing them with a separate desktop visual language.
- Device chrome in the PNG files is presentation-only and is never implemented inside the web application.
- Production imagery must be supplied as separate assets. Until supplied, the implementation uses the bundled brand-tree/leaf vectors and existing member avatars without extracting raster fragments from the mockup PNGs.

### Color tokens

The values below are the canonical implementation tokens sampled and normalized from the approved reference. Use semantic names rather than inline hex literals. The machine-readable definitions live in `tokens/design-tokens.json`.

| Token | Hex | Use |
|---|---|---|
| `brand.primary` | `#174D2A` | Main CTAs, active navigation, primary headings |
| `brand.primaryDark` | `#103C23` | Hero/banner backgrounds, stronger contrast |
| `brand.primarySoft` | `#EAF0E4` | Selected tabs, small chips |
| `accent.gold` | `#A47B24` | Icons, timeline, secondary highlights |
| `accent.goldSoft` | `#F7EACF` | Relationship badges, date tiles |
| `surface.canvas` | `#FBF7F0` | Main app background |
| `surface.card` | `#FFFDF9` | Elevated cards and fields |
| `surface.muted` | `#F4EDE2` | Secondary panels |
| `text.primary` | `#1D2720` | Body and strong labels |
| `text.secondary` | `#61675E` | Metadata and descriptions |
| `border.subtle` | `#E6DFD2` | Borders, dividers |
| `status.error` | `#B43D31` | Validation and destructive actions |
| `status.success` | `#267347` | Alive/verified states |
| `status.warning` | `#94640C` | Incomplete records, conflicts |

**Contrast:** body text and critical labels must meet WCAG AA (4.5:1 for normal text; 3:1 for large text). Gold is decorative; avoid using it for small text on white. Never rely only on red/green or male/female color to encode meaning.

### Typography

- UI text: `Be Vietnam Pro`, fallback `Noto Sans`, system sans-serif.
- Optional decorative headings: `Noto Serif`, fallback Georgia; reserve for brand/hero or memorial context, **not** input fields or data-dense tree nodes.
- Type scale: display 30/38, h1 26/34, h2 22/30, h3 18/26, body 16/24, body-sm 14/20, caption 12/18 (px/line-height).
- Typical text weight: 400 body, 500 secondary, 600 labels/section titles, 700 key metric.
- Support Android font scaling, iOS Dynamic Type, and text wrapping. Do not truncate the only full representation of a person's name.

### Layout / elevation

- Spacing grid: **4 px**; common gaps 8, 12, 16, 24, 32 px.
- Mobile horizontal padding: **16 px**; larger screens **24–32 px**.
- Card radius: **20 px**; inputs **12 px**; chips **999 px**; hero **24 px**.
- Card shadows: subtle (`0 4px 16px rgba(25,43,25,.08)`); no heavy neumorphism.
- Minimum tap target: **44 × 44 px**; primary button height **52 px**.
- Icons: 20–24 px, consistent outline stroke 1.75–2 px. Use bundled vector assets for brand-specific motifs and an established icon library for generic icons.
- Safe areas: respect top/status-bar and bottom/home-indicator insets; prevent bottom navigation overlap.

## 3. Navigation and information architecture

**Bottom navigation** (persistent on top-level screens only):

1. **Trang chủ** (`home`)
2. **Cây gia phả** (`tree`)
3. **Thành viên** (`members`)
4. **Tài khoản** (`account`)

The public root route `/` redirects directly to `/login`. There is no public
marketing/landing page or unauthenticated family-history summary.

Details and forms are pushed onto their respective stacks; show a Back action and optional persistent Save/Cancel action but **do not** redundantly repeat a bottom nav below a full-screen form unless native navigation convention requires it.

The four destinations open `/dashboard`, `/dashboard/members?view=tree`,
`/dashboard/members?view=list`, and `/dashboard/account`. Member detail and
edit pages use `/dashboard/members/:id` and `/dashboard/members/:id/edit`.
Owners and Editors can also open **Thêm thành viên** directly in the tree.
Opening it from a selected person enables contextual relationship creation.

Under **Tài khoản**, **Cây gia phả của tôi** opens `/dashboard/account/trees`
for tree selection and creation. An Owner can open **Quản lý quyền truy cập**
for the selected tree and add an existing active account by complete email.
**Khóa API** opens `/dashboard/api-keys` for the signed-in user's credentials.
**Quản lý người dùng** opens `/dashboard/users` for Super Admins. Account
administration and tree membership are separate permissions. Long emails and
one-time keys wrap inside the available width. Forms keep labels, focus and
actions reachable above any navigation or safe-area inset.

## 4. Screen specifications

### 4.1 Home

**Hierarchy:** brand header + notification → heritage hero/banner → 2×2 statistics → recent family members → upcoming events. On smaller devices, cards adapt without shrinking text below caption size.

- Stats: total unique persons, count of generations *under selected tree/root*, upcoming events, number of branches. State the scope (entire tree vs branch) via context label.
- Recent people: horizontal cards with avatar or initials, full name, relationship relative to active viewer/focus; tap opens member detail.
- Events: compact date tile, event type/title, Gregorian or lunar calendar marker, date and countdown only when valid.
- Blank states: "Chưa có thành viên" + primary action "Thêm thành viên đầu tiên"; "Chưa có sự kiện" + link "Tạo sự kiện".
- Never present a deceased person as alive by inference or use a generated anniversary date as a real event.

### 4.2 Family tree (highest priority)

**Hierarchy:** sticky tree header → focus search, lineage toggle, filters → pan/zoom tree canvas → focused-person drawer / add action.

- Canvas must pan both axes and zoom from 50–200%; controls `+`, `−`, `Vừa màn hình`, and `Về người đang xem`.
- Nodes: portrait/placeholder, full name with expandable overflow, birth–death years when known, optional role chip, and selection ring. Show unknown data explicitly or omit, never fabricate.
- Edges: partner links visually distinct from parent-child links. Do **not** infer spouses from shared children, or equate all partners with legal marriage.
- Graph supports missing parents, multiple spouses/partnerships, adoption/step relationships, siblings, gender-neutral relationships, uncertain/unknown lineage, and distinct branches.
- Generation is an optional calculated hierarchy **relative to chosen ancestor**, not an immutable person field. A person can be in multiple contexts.
- Search highlights node and centers viewport. Filters never delete relationships; restore when cleared.
- Deep trees: progressive node expansion / branch collapse; virtualize off-screen nodes; provide accessible "Danh sách thành viên" fallback.
- Click/tap node opens compact profile sheet (name, dates, parents, partner(s), children) + "Xem hồ sơ", "Thêm quan hệ".
- "Nội/Ngoại" only shows when parent sides can be identified from the focus context; otherwise use "Tất cả" with clear explanation.

### 4.3 Member detail

**Hierarchy:** portrait identity header → factual fields → immediate-family cluster → timeline → notes → actions.

- Identity: full name, alternate/maiden names if present, birth/death (with privacy controls), branch, relationship to currently focused person.
- Core details: dates (precision may be year-only), hometown, role, biography; field values display only if recorded.
- Immediate family must represent actual stored links (and role labels must be correct); do not force a linear father→mother→self→spouse→child sequence as an actual relationship graph.
- Life events: chronological timeline and event source/notes; support lunar date display when available.
- Primary action "Thêm quan hệ"; secondary "Chỉnh sửa" (permission-gated).
- Unknown data and private data have distinct visual states; a hidden birthdate should not look like an unknown birthdate.

### 4.4 Add / edit member

**Hierarchy:** header → photo → identity → life dates → relationships → optional notes → sticky action area.

- Required: name (and any app-specific minimum identity rules); optional: gender, birth/death, hometown, portrait, biography, branch.
- "Còn sống" should be **Sống / Đã mất / Chưa rõ**, not a boolean with "Sống" assumed by default. Show death date only when relevant.
- Birth/death can be partial/approximate; allow date precision and Gregorian/lunar entry. Validate death >= birth **only when dates have enough precision**.
- Relation entry should be contextual: choose **person** + **relationship type** + optional effective dates. A "Thế hệ" dropdown is not a required truth field; compute when possible.
- Common relationship actions: add father/mother/parent, child, partner/spouse, adoptive parent; show existing links before editing.
- Save errors: field-level messaging; preserve unsaved input; confirm on exit if dirty.
- Validation prevents self-parent/self-child, obvious ancestor cycles, duplicate identical edges, and invalid record references. In uncertain historical cases, allow a deliberate "Chưa xác minh" annotation rather than silently accepting invalid truth.
- Form fields stack into single column on narrow screens. Save/Cancel sit above the safe area and do not obscure the final fields.

## 5. Reusable component inventory

| Component | Required variants / behavior |
|---|---|
| `AppHeader` | Top-level, nested/back, notification badge |
| `HeritageBanner` | Decorative book/leaf motif, text-first fallback |
| `MetricCard` | Count, title, icon, loading skeleton |
| `PersonAvatar` | Image, initials, anonymous/private, missing image |
| `PersonCard` | Compact/recent, tree-node, selected, deceased, uncertain |
| `RelationshipBadge` | Relative link; neutral style by default |
| `TreeConnector` | Parent-child, spouse/partner, adopted/step/uncertain dashed styles |
| `BranchSegment` | All, paternal, maternal, disabled when unsupported |
| `FilterChips` | Selected/unselected, clear-all, count |
| `EventRow` | Lunar/Gregorian, date, type, valid countdown |
| `InfoRow` | Label/value, empty, confidential, edit action |
| `LifeTimeline` | Known/approximate date, linked event, notes |
| `FormField` | Empty, focus, invalid, read-only, disabled |
| `BottomNav` | Four active states, safe-area aware |
| `EmptyState` | Contextual explanation and one CTA |
| `ConfirmDialog` | Unsaved changes, destructive action confirmation |

### Required states

Every data-oriented screen/component needs: **loading, empty, error, retry, permission-denied, success, offline/stale** where applicable. Tree selection must have hover/focus/touch feedback. Toasts may confirm success but must not be the only way to find validation failures.

## 6. Content and localization rules

- Vietnamese names: preserve full Unicode spelling, particles, prefixes, aliases, and surname changes. Do not assume `firstName/lastName` parsing is safe.
- Dates: distinguish solar `dương lịch` and lunar `âm lịch`; display dates based on precision and explicitly annotate calendar. Avoid fabricated day/month from year-only data.
- Events: death anniversary (`giỗ`) is not identical to date of death; recurring lunar anniversary may differ in solar dates year to year. Support leap lunar month policies.
- Role display: use "Cụ", "Ông/Bà", "Cha/Mẹ" only relative to the viewer; store person facts separately.
- Privacy: honor private profiles and edit permissions; never expose living people's sensitive dates automatically in public/shared trees.
- Sample seed data is synthetic and must be replaced with validated data before launch.

## 7. Responsive / accessibility acceptance criteria

- 320 px wide screens: body text remains legible; form fields are single-column; no horizontal page overflow outside tree canvas.
- ≥768 px: home may use 2-column sections; tree canvas fills extra width; member detail gets a two-column information layout.
- Keyboard navigation: visible focus ring, tree node traversal, zoom buttons reachable; non-canvas list alternative.
- Screen reader: semantic role/name for every card, relationship link, toggle, and control.
- Reduced motion: disable ornamental animation; keep meaningful focus transition optional.
- Text scale at 200%: no clipped buttons or hidden field labels.
- Color contrast: AA validated after implementation, especially green-on-cream badges and gold text.
- All destructive actions gated by explicit confirmation; unsaved edits protected.

## 8. Developer handoff / implementation order

1. Import tokens, brand tree icon, typography, app shell, and navigation.
2. Build common components and state variants; use mockups for appearance, not literal content.
3. Build add-member + member detail with correct graph API model and validation.
4. Build tree canvas with fixture graphs covering complicated families; support pan/zoom/focus and accessible fallback.
5. Wire dashboard statistics and time-aware events (including lunar conversion where supported).
6. Audit privacy, loading/empty/error states, date precision, responsive layouts, localization, and accessibility.

### Design QA checklist (ship gate)

- [ ] Four key screens visually consistent with references and semantic tokens
- [ ] Family relationships shown correctly for 1/2/multiple parents and multiple partners
- [ ] Person names/labels never inferred from screen position
- [ ] Unknown, private, and deceased state differentiated
- [ ] Lunar / solar dates labeled and countdown computed from real dates
- [ ] Forms validate graph cycles and retain unsaved input
- [ ] Tree usable with zoom, pan, focus, and list fallback
- [ ] User-account tab not confused with member detail
- [ ] All screens satisfy accessibility and small-screen checks
- [ ] No sample/mock data accidentally shipped as production data

## 9. Assets and licensing

- `assets/mockups/*.png`: **raster concept references** (four approved previews), not editable Figma source or production-ready code. Portraits are generated sample illustrations, **not real lineage members**.
- `assets/icons/brand-tree.svg`: original clean vector brand motif for production adaptation.
- `assets/icons/branch.svg`, `assets/icons/leaf.svg`: original UI accent icons.
- `assets/illustrations/empty-tree.svg`: standalone empty-state illustration.
- `tokens/design-tokens.json` and `tokens/theme.css`: token source and CSS variables.
- For generic icons (home, calendar, search, user, etc.) use a consistent outlined icon pack. Do not export icons directly from raster mockups.

## 10. Change control

This is the **Heritage Modern v2.0 baseline**, replacing the former stone/black/amber application theme. An implementation change that modifies brand palette, navigation destinations, primary information hierarchy, tree graph semantics, or person-date model needs an explicit design decision and version bump. Minor spacing refinements and platform-native behavior are allowed if they preserve the aesthetic and accessibility rules.

**Known deliberate deviations from the images:** renamed account tab, corrected relationships/generation semantics, introduced unknown-living state, stopped showing bottom tab bar in full-screen form, and removed stale illustrative dates/countdowns as product requirements.
