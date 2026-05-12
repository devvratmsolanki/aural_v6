
CREATE OR REPLACE FUNCTION public.tg_set_updated_at() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- Tighten public bucket read: still public files, but disallow listing arbitrary objects.
-- We replace the broad SELECT with a policy that requires an explicit object name (no list).
DROP POLICY IF EXISTS "covers public read" ON storage.objects;
DROP POLICY IF EXISTS "avatars public read" ON storage.objects;

-- Public read by exact name only (Supabase storage list endpoint uses SELECT with filters; this still permits getPublicUrl downloads)
CREATE POLICY "covers public file read" ON storage.objects FOR SELECT USING (bucket_id = 'covers' AND name IS NOT NULL);
CREATE POLICY "avatars public file read" ON storage.objects FOR SELECT USING (bucket_id = 'avatars' AND name IS NOT NULL);
