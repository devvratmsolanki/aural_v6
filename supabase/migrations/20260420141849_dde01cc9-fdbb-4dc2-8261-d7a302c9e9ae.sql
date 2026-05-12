
-- Roles enum + table
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "users read own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "admins read all roles" ON public.user_roles FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admins manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text,
  avatar_url text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles readable by authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "users insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "admins manage profiles" ON public.profiles FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.tg_set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE TRIGGER profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Auto-create profile + user role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, name, avatar_url)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)), NEW.raw_user_meta_data->>'avatar_url');
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Tags
CREATE TABLE public.tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER tags_updated BEFORE UPDATE ON public.tags FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE POLICY "tags readable by authenticated" ON public.tags FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins manage tags" ON public.tags FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Songs
CREATE TABLE public.songs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  artist text NOT NULL,
  file_path text NOT NULL,
  cover_image text,
  lyrics text,
  play_from int NOT NULL DEFAULT 0,
  end_at int,
  tag_id uuid REFERENCES public.tags(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
ALTER TABLE public.songs ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER songs_updated BEFORE UPDATE ON public.songs FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE INDEX songs_tag_idx ON public.songs(tag_id);
CREATE INDEX songs_status_idx ON public.songs(status) WHERE deleted_at IS NULL;
CREATE POLICY "songs readable by authenticated" ON public.songs FOR SELECT TO authenticated USING (deleted_at IS NULL AND (status='active' OR public.has_role(auth.uid(),'admin')));
CREATE POLICY "admins manage songs" ON public.songs FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Playlists
CREATE TABLE public.playlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.playlists ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER playlists_updated BEFORE UPDATE ON public.playlists FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE POLICY "users see own playlists" ON public.playlists FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "users insert own playlists" ON public.playlists FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users update own playlists" ON public.playlists FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "users delete own playlists" ON public.playlists FOR DELETE TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));

-- Playlist songs (pivot)
CREATE TABLE public.playlist_songs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id uuid REFERENCES public.playlists(id) ON DELETE CASCADE NOT NULL,
  song_id uuid REFERENCES public.songs(id) ON DELETE CASCADE NOT NULL,
  position int NOT NULL DEFAULT 0,
  added_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (playlist_id, song_id)
);
ALTER TABLE public.playlist_songs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users see own playlist songs" ON public.playlist_songs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.playlists p WHERE p.id = playlist_id AND (p.user_id = auth.uid() OR public.has_role(auth.uid(),'admin'))));
CREATE POLICY "users modify own playlist songs" ON public.playlist_songs FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.playlists p WHERE p.id = playlist_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.playlists p WHERE p.id = playlist_id AND p.user_id = auth.uid()));

-- Favorites
CREATE TABLE public.favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  song_id uuid REFERENCES public.songs(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, song_id)
);
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own favorites" ON public.favorites FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "admins read all favorites" ON public.favorites FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- Play history
CREATE TABLE public.play_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  song_id uuid REFERENCES public.songs(id) ON DELETE CASCADE NOT NULL,
  played_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.play_history ENABLE ROW LEVEL SECURITY;
CREATE INDEX play_history_user_idx ON public.play_history(user_id, played_at DESC);
CREATE POLICY "users insert own history" ON public.play_history FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users read own history" ON public.play_history FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));

-- Storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('covers','covers',true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('audio','audio',false) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars','avatars',true) ON CONFLICT DO NOTHING;

CREATE POLICY "covers public read" ON storage.objects FOR SELECT USING (bucket_id = 'covers');
CREATE POLICY "admins write covers" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='covers' AND public.has_role(auth.uid(),'admin'));
CREATE POLICY "admins update covers" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id='covers' AND public.has_role(auth.uid(),'admin'));
CREATE POLICY "admins delete covers" ON storage.objects FOR DELETE TO authenticated USING (bucket_id='covers' AND public.has_role(auth.uid(),'admin'));

CREATE POLICY "auth read audio" ON storage.objects FOR SELECT TO authenticated USING (bucket_id='audio');
CREATE POLICY "admins write audio" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='audio' AND public.has_role(auth.uid(),'admin'));
CREATE POLICY "admins update audio" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id='audio' AND public.has_role(auth.uid(),'admin'));
CREATE POLICY "admins delete audio" ON storage.objects FOR DELETE TO authenticated USING (bucket_id='audio' AND public.has_role(auth.uid(),'admin'));

CREATE POLICY "avatars public read" ON storage.objects FOR SELECT USING (bucket_id='avatars');
CREATE POLICY "users upload own avatar" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "users update own avatar" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id='avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "users delete own avatar" ON storage.objects FOR DELETE TO authenticated USING (bucket_id='avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Seed tags
INSERT INTO public.tags (name, remarks) VALUES
  ('Ambient','Atmospheric, textural soundscapes'),
  ('Modern Jazz','Contemporary jazz selections'),
  ('Electronic','Synthesized, club-ready tracks'),
  ('Lo-Fi','Warm beats for focus'),
  ('Classical','Orchestral & chamber works');
