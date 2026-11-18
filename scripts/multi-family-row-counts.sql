SELECT to_jsonb(counts) AS row_counts FROM (
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
