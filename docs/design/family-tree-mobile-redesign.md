# Family Tree Heritage Modern Migration

The app keeps existing data loading, server actions, URL state, view modes,
filters, exports, and member detail behavior. It applies the canonical
Heritage Modern system from `DESIGN.md` to the landing page, authentication,
dashboard, member list, tree, mindmap, bubble map, events, gallery, kinship,
lineage, statistics, user management, backups, and member detail routes.

The 2026-11-19 migration replaces the former stone/black/amber palette with
warm ivory surfaces, forest-green brand and action colors, muted antique-gold
accents, Be Vietnam Pro UI text, and Noto Serif editorial headings. The full
approved handoff—including tokens, SVG assets, illustration, and four visual
mockups—lives beside this note under `docs/design/`.

Responsive behavior is mobile-first. Navigation becomes a labeled bottom bar on
member views, visualizations own their scroll regions, controls stay at least
44px tall, dialogs become bottom sheets, and reduced-motion users receive final
states without spatial animation.

The implementation preserves the current PostgreSQL schema, permissions,
relationship semantics, storage routes, and export formats.

Deployment exposes `GET /readyz` as a minimal process-readiness probe. It does
not return storage credentials or replace authenticated database/S3 checks.
