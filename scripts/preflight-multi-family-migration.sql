-- Read-only. Run on the legacy database; also called inside the migration lock.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.users GROUP BY lower(btrim(email)) HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Normalized email collision among System Users';
  END IF;
  IF EXISTS (SELECT FROM public.users u FULL JOIN public.profiles p ON p.id=u.id WHERE u.id IS NULL OR p.id IS NULL)
    OR EXISTS (SELECT FROM public.sessions s LEFT JOIN public.users u ON u.id=s.user_id WHERE u.id IS NULL)
    OR EXISTS (SELECT FROM public.relationships r LEFT JOIN public.persons a ON a.id=r.person_a LEFT JOIN public.persons b ON b.id=r.person_b WHERE a.id IS NULL OR b.id IS NULL OR r.person_a=r.person_b)
    OR EXISTS (SELECT FROM public.person_details_private d LEFT JOIN public.persons p ON p.id=d.person_id WHERE p.id IS NULL)
    OR EXISTS (SELECT FROM public.custom_events e LEFT JOIN public.profiles p ON p.id=e.created_by WHERE e.created_by IS NOT NULL AND p.id IS NULL)
    OR EXISTS (SELECT FROM public.gallery_items g LEFT JOIN public.profiles p ON p.id=g.created_by WHERE g.created_by IS NOT NULL AND p.id IS NULL) THEN
    RAISE EXCEPTION 'Invalid legacy reference in accounts or family records';
  END IF;
  IF (EXISTS (SELECT FROM public.users) OR EXISTS (SELECT FROM public.persons) OR EXISTS (SELECT FROM public.custom_events) OR EXISTS (SELECT FROM public.gallery_items))
    AND NOT EXISTS (SELECT FROM public.profiles WHERE role='admin') THEN
    RAISE EXCEPTION 'Populated legacy database requires an admin to own the legacy tree';
  END IF;
END $$;

\ir multi-family-row-counts.sql
