
-- M2M song_tags
CREATE TABLE public.song_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  song_id uuid NOT NULL REFERENCES public.songs(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(song_id, tag_id)
);
ALTER TABLE public.song_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "song_tags readable by authenticated" ON public.song_tags FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins manage song_tags" ON public.song_tags FOR ALL TO authenticated USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));
CREATE INDEX idx_song_tags_song ON public.song_tags(song_id);
CREATE INDEX idx_song_tags_tag ON public.song_tags(tag_id);
INSERT INTO public.song_tags (song_id, tag_id) SELECT id, tag_id FROM public.songs WHERE tag_id IS NOT NULL ON CONFLICT DO NOTHING;

-- Voice notes
CREATE TABLE public.song_voice_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  song_id uuid NOT NULL REFERENCES public.songs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  file_path text NOT NULL,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.song_voice_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "voice notes readable by authenticated" ON public.song_voice_notes FOR SELECT TO authenticated USING (true);
CREATE POLICY "users insert own voice notes" ON public.song_voice_notes FOR INSERT TO authenticated WITH CHECK (auth.uid()=user_id);
CREATE POLICY "users delete own voice notes" ON public.song_voice_notes FOR DELETE TO authenticated USING (auth.uid()=user_id);
CREATE INDEX idx_voice_notes_song ON public.song_voice_notes(song_id);

-- Letters
CREATE TABLE public.song_letters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  song_id uuid NOT NULL REFERENCES public.songs(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  title text,
  body text NOT NULL,
  unlocked boolean NOT NULL DEFAULT false,
  unlocked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.song_letters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "letters readable by authenticated" ON public.song_letters FOR SELECT TO authenticated USING (true);
CREATE POLICY "users insert own letters" ON public.song_letters FOR INSERT TO authenticated WITH CHECK (auth.uid()=author_id);
CREATE POLICY "users update letters to unlock" ON public.song_letters FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authors delete own letters" ON public.song_letters FOR DELETE TO authenticated USING (auth.uid()=author_id);
CREATE INDEX idx_letters_song ON public.song_letters(song_id);

-- Daily picks
CREATE TABLE public.daily_picks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  song_id uuid NOT NULL REFERENCES public.songs(id) ON DELETE CASCADE,
  picker_id uuid NOT NULL,
  pick_date date NOT NULL DEFAULT current_date,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(pick_date)
);
ALTER TABLE public.daily_picks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "daily picks readable by authenticated" ON public.daily_picks FOR SELECT TO authenticated USING (true);
CREATE POLICY "users insert own picks" ON public.daily_picks FOR INSERT TO authenticated WITH CHECK (auth.uid()=picker_id);
CREATE POLICY "users delete own picks" ON public.daily_picks FOR DELETE TO authenticated USING (auth.uid()=picker_id);

-- Make artist optional
ALTER TABLE public.songs ALTER COLUMN artist DROP NOT NULL;

-- Storage bucket for voice notes (public)
INSERT INTO storage.buckets (id, name, public) VALUES ('voice-notes','voice-notes',true) ON CONFLICT DO NOTHING;
CREATE POLICY "voice notes public read" ON storage.objects FOR SELECT USING (bucket_id='voice-notes');
CREATE POLICY "auth upload voice notes" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='voice-notes');
CREATE POLICY "auth delete own voice notes" ON storage.objects FOR DELETE TO authenticated USING (bucket_id='voice-notes' AND owner=auth.uid());
