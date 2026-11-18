WITH access AS (
\if :migrated_access
  SELECT m.user_id, m.tree_id, m.role, p.is_super_admin, p.is_active
  FROM public.tree_memberships m JOIN public.profiles p ON p.id=m.user_id
\else
  SELECT id AS user_id, '00000000-0000-0000-0000-000000000001'::uuid AS tree_id,
         CASE role WHEN 'admin' THEN 'owner' WHEN 'editor' THEN 'editor' ELSE 'viewer' END AS role,
         role='admin' AS is_super_admin, is_active
  FROM public.profiles
\endif
)
SELECT jsonb_build_object(
  'counts', to_jsonb(counts),
  'access', coalesce((SELECT jsonb_agg(to_jsonb(access) ORDER BY user_id,tree_id) FROM access), '[]'::jsonb)
) AS snapshot FROM (
SELECT (SELECT count(*) FROM public.users) AS users,
       (SELECT count(*) FROM public.profiles) AS profiles,
       (SELECT count(*) FROM public.sessions) AS sessions,
       (SELECT count(*) FROM public.persons) AS persons,
       (SELECT count(*) FROM public.relationships) AS relationships,
       (SELECT count(*) FROM public.person_details_private) AS private_details,
       (SELECT count(*) FROM public.custom_events) AS events,
       (SELECT count(*) FROM public.gallery_items) AS gallery
) AS counts
\if :{?count_prefix}
\gset :count_prefix
\else
\g
\endif
