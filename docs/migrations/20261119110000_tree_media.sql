BEGIN;
SET LOCAL lock_timeout = '30s';
SELECT pg_advisory_xact_lock(20261119100000);

-- Retain ownership after tree deletion until the private bucket is cleaned.
CREATE TABLE IF NOT EXISTS public.tree_media (
  object_url text PRIMARY KEY,
  tree_id uuid NOT NULL,
  folder text NOT NULL CHECK (folder IN ('avatars','gallery')),
  cleanup_after timestamptz NOT NULL
);

-- Capture existing application-generated URLs once. A shared legacy key
-- cannot safely be assigned to either tree. Roll back for operator review.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.schema_migrations WHERE version='20261119110000') THEN RETURN; END IF;
  LOCK TABLE public.persons, public.gallery_items IN SHARE MODE;
  INSERT INTO public.tree_media(object_url,tree_id,folder,cleanup_after)
  SELECT DISTINCT url,tree_id,folder,now() FROM (
    SELECT avatar_url AS url,tree_id,'avatars' AS folder FROM public.persons
    UNION ALL SELECT image_url,tree_id,'gallery' FROM public.gallery_items
  ) refs WHERE url ~ ('^/api/storage/([a-zA-Z0-9_-]+/)*' || folder || '/[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp|gif)$');
END $$;
CREATE INDEX IF NOT EXISTS tree_media_cleanup ON public.tree_media(cleanup_after);
CREATE INDEX IF NOT EXISTS gallery_media_refs ON public.gallery_items(tree_id,image_url);
CREATE INDEX IF NOT EXISTS avatar_media_refs ON public.persons(tree_id,avatar_url) WHERE avatar_url IS NOT NULL;
INSERT INTO public.schema_migrations(version) VALUES ('20261119110000') ON CONFLICT DO NOTHING;
COMMIT;
