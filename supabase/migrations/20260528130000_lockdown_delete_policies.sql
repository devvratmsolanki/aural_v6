-- SECURITY: re-scope the "open" delete/update policies (opened up in
-- 20260514102134_notifications_and_open_delete.sql and 20260508063443) back to
-- the owner, so neither user in this two-person app can delete or tamper with
-- the other's letters / voice notes. The letter "unlock" UX is enforced
-- client-side (listen time), not via the DB `unlocked` column, so author-only
-- UPDATE does not affect it.

-- Voice notes: only the author may delete.
DROP POLICY IF EXISTS "authenticated delete voice notes" ON public.song_voice_notes;
DROP POLICY IF EXISTS "users delete own voice notes" ON public.song_voice_notes;
CREATE POLICY "users delete own voice notes" ON public.song_voice_notes
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Letters: only the author may delete.
DROP POLICY IF EXISTS "authenticated delete letters" ON public.song_letters;
DROP POLICY IF EXISTS "authors delete own letters" ON public.song_letters;
CREATE POLICY "authors delete own letters" ON public.song_letters
  FOR DELETE TO authenticated USING (auth.uid() = author_id);

-- Letters: only the author may update (was globally writable USING (true),
-- which let anyone rewrite or unlock another person's letter).
DROP POLICY IF EXISTS "users update letters to unlock" ON public.song_letters;
DROP POLICY IF EXISTS "authors update own letters" ON public.song_letters;
CREATE POLICY "authors update own letters" ON public.song_letters
  FOR UPDATE TO authenticated USING (auth.uid() = author_id) WITH CHECK (auth.uid() = author_id);

-- Storage: only the uploader may delete their own voice-note files.
DROP POLICY IF EXISTS "auth delete voice notes" ON storage.objects;
DROP POLICY IF EXISTS "auth delete own voice notes" ON storage.objects;
CREATE POLICY "auth delete own voice notes" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'voice-notes' AND owner = auth.uid());
