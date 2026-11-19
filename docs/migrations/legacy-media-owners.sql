-- Historical signer: UUIDv4 for gallery/avatars, or a SHA-256 identity for
-- retryable avatars. Only the two historical proxy namespaces were routable.
CREATE TEMP TABLE verified_legacy_media ON COMMIT DROP AS
WITH refs AS (
  SELECT avatar_url AS url,tree_id,'avatars' AS folder FROM public.persons
  UNION ALL SELECT image_url,tree_id,'gallery' FROM public.gallery_items
), unique_owner AS (
  SELECT url FROM refs GROUP BY url HAVING count(DISTINCT (tree_id,folder))=1
)
SELECT DISTINCT refs.url,refs.tree_id,refs.folder FROM refs JOIN unique_owner USING(url)
WHERE refs.tree_id='00000000-0000-0000-0000-000000000001' AND url ~ ('^/api/storage/(family-tree/)?' || folder ||
  '/([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}' ||
  CASE WHEN folder='avatars' THEN '|[0-9a-f]{64}' ELSE '' END ||
  ')\.(jpg|png|webp|gif)$');
