DROP POLICY IF EXISTS "songs readable by authenticated" ON public.songs;
CREATE POLICY "songs readable by authenticated" ON public.songs
  FOR SELECT TO authenticated
  USING (status = 'active' OR has_role(auth.uid(), 'admin'::app_role));
ALTER TABLE public.songs DROP COLUMN IF EXISTS deleted_at;