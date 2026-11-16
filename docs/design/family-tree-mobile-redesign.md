# Family Tree Mobile Redesign

The app redesign keeps existing data loading, server actions, URL state, view
modes, filters, exports, and member detail behavior. It applies the canonical
GiaPha-OS system to the landing page, authentication, dashboard, member list,
tree, mindmap, bubble map, events, gallery, kinship, lineage, statistics, user
management, backups, and member detail routes.

Responsive behavior is mobile-first. Navigation becomes a labeled bottom bar on
member views, visualizations own their scroll regions, controls stay at least
44px tall, dialogs become bottom sheets, and reduced-motion users receive final
states without spatial animation.

The implementation preserves the current PostgreSQL schema, permissions,
relationship semantics, storage routes, and export formats.
