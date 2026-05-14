-- Allow any authenticated user to delete voice notes (not just author)
DROP POLICY IF EXISTS "users delete own voice notes" ON public.song_voice_notes;
CREATE POLICY "authenticated delete voice notes" ON public.song_voice_notes
  FOR DELETE TO authenticated USING (true);

-- Allow any authenticated user to delete letters (not just author)
DROP POLICY IF EXISTS "authors delete own letters" ON public.song_letters;
CREATE POLICY "authenticated delete letters" ON public.song_letters
  FOR DELETE TO authenticated USING (true);

-- Allow any authenticated user to delete voice note files from storage
DROP POLICY IF EXISTS "auth delete own voice notes" ON storage.objects;
CREATE POLICY "auth delete voice notes" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'voice-notes');

-- Notifications table
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('voice_note', 'letter')),
  song_id uuid NOT NULL REFERENCES public.songs(id) ON DELETE CASCADE,
  song_title text NOT NULL DEFAULT '',
  sender_name text NOT NULL DEFAULT '',
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own notifications" ON public.notifications
  FOR SELECT TO authenticated USING (auth.uid() = recipient_id);
CREATE POLICY "authenticated insert notifications" ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "users mark notifications read" ON public.notifications
  FOR UPDATE TO authenticated USING (auth.uid() = recipient_id);
CREATE POLICY "users delete own notifications" ON public.notifications
  FOR DELETE TO authenticated USING (auth.uid() = recipient_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
