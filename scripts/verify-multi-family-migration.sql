-- Run immediately after the original cutover, before allowing new writes.
DO $$
DECLARE
  legacy constant uuid := '00000000-0000-0000-0000-000000000001';
  family_table text;
  invalid boolean;
BEGIN
  IF (SELECT count(*) FROM public.family_trees) <> (SELECT CASE WHEN EXISTS(SELECT FROM public.profiles) THEN 1 ELSE 0 END)
     OR EXISTS (SELECT FROM public.family_trees WHERE id<>legacy) THEN
    RAISE EXCEPTION 'Unexpected legacy tree count or identity';
  END IF;
  IF EXISTS (
    SELECT FROM public.profiles p FULL JOIN public.tree_memberships m ON m.user_id=p.id AND m.tree_id=legacy
    WHERE p.id IS NULL OR m.user_id IS NULL OR p.is_super_admin<>(p.role='admin')
       OR m.role<>CASE p.role WHEN 'admin' THEN 'owner' WHEN 'editor' THEN 'editor' ELSE 'viewer' END
  ) THEN RAISE EXCEPTION 'Legacy access mapping differs'; END IF;
  IF EXISTS (SELECT FROM public.family_trees WHERE id=legacy) AND NOT EXISTS (
    SELECT FROM public.tree_memberships m JOIN public.profiles p ON p.id=m.user_id
    WHERE m.tree_id=legacy AND m.role='owner' AND p.is_active
  ) THEN RAISE EXCEPTION 'Migrated legacy tree requires an active Owner'; END IF;
  FOREACH family_table IN ARRAY ARRAY['persons','person_details_private','relationships','custom_events','gallery_items'] LOOP
    EXECUTE format('SELECT EXISTS (SELECT FROM public.%I WHERE tree_id IS DISTINCT FROM $1)',family_table)
      INTO invalid USING legacy;
    IF invalid THEN RAISE EXCEPTION 'Incorrect tree in %', family_table; END IF;
  END LOOP;
END $$;

\set migrated_access true
\ir multi-family-snapshot.sql
