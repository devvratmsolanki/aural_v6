--
-- PostgreSQL database dump
--

\restrict iR9hq9LR4mQx1bMnpp6Ffjx7VPnUkYeMKbvvMoO72ORoneoAPe0IZ6fK6ZKS8gF

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.9

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'admin',
    'user'
);


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'username', split_part(NEW.email,'@',1)),
    NEW.raw_user_meta_data->>'avatar_url'
  );

  IF COALESCE((NEW.raw_user_meta_data->>'is_admin')::boolean, false) = true THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END $$;


--
-- Name: has_role(uuid, public.app_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;


--
-- Name: tg_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tg_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: daily_picks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_picks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    song_id uuid NOT NULL,
    picker_id uuid NOT NULL,
    pick_date date DEFAULT CURRENT_DATE NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: favorites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.favorites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    song_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: play_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.play_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    song_id uuid NOT NULL,
    played_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: playlist_songs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.playlist_songs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    playlist_id uuid NOT NULL,
    song_id uuid NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    added_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: playlists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.playlists (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    name text,
    avatar_url text,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: song_letters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.song_letters (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    song_id uuid NOT NULL,
    author_id uuid NOT NULL,
    title text,
    body text NOT NULL,
    unlocked boolean DEFAULT false NOT NULL,
    unlocked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: song_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.song_tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    song_id uuid NOT NULL,
    tag_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: song_voice_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.song_voice_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    song_id uuid NOT NULL,
    user_id uuid NOT NULL,
    file_path text NOT NULL,
    duration_ms integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: songs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.songs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    artist text,
    file_path text NOT NULL,
    cover_image text,
    lyrics text,
    play_from integer DEFAULT 0 NOT NULL,
    end_at integer,
    tag_id uuid,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    timed_lyrics jsonb,
    remarks text
);


--
-- Name: tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    remarks text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: daily_picks daily_picks_pick_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_picks
    ADD CONSTRAINT daily_picks_pick_date_key UNIQUE (pick_date);


--
-- Name: daily_picks daily_picks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_picks
    ADD CONSTRAINT daily_picks_pkey PRIMARY KEY (id);


--
-- Name: favorites favorites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorites
    ADD CONSTRAINT favorites_pkey PRIMARY KEY (id);


--
-- Name: favorites favorites_user_id_song_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorites
    ADD CONSTRAINT favorites_user_id_song_id_key UNIQUE (user_id, song_id);


--
-- Name: play_history play_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.play_history
    ADD CONSTRAINT play_history_pkey PRIMARY KEY (id);


--
-- Name: playlist_songs playlist_songs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playlist_songs
    ADD CONSTRAINT playlist_songs_pkey PRIMARY KEY (id);


--
-- Name: playlist_songs playlist_songs_playlist_id_song_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playlist_songs
    ADD CONSTRAINT playlist_songs_playlist_id_song_id_key UNIQUE (playlist_id, song_id);


--
-- Name: playlists playlists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playlists
    ADD CONSTRAINT playlists_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: song_letters song_letters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.song_letters
    ADD CONSTRAINT song_letters_pkey PRIMARY KEY (id);


--
-- Name: song_tags song_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.song_tags
    ADD CONSTRAINT song_tags_pkey PRIMARY KEY (id);


--
-- Name: song_tags song_tags_song_id_tag_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.song_tags
    ADD CONSTRAINT song_tags_song_id_tag_id_key UNIQUE (song_id, tag_id);


--
-- Name: song_voice_notes song_voice_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.song_voice_notes
    ADD CONSTRAINT song_voice_notes_pkey PRIMARY KEY (id);


--
-- Name: songs songs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.songs
    ADD CONSTRAINT songs_pkey PRIMARY KEY (id);


--
-- Name: tags tags_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_name_key UNIQUE (name);


--
-- Name: tags tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);


--
-- Name: idx_letters_song; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_letters_song ON public.song_letters USING btree (song_id);


--
-- Name: idx_song_tags_song; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_song_tags_song ON public.song_tags USING btree (song_id);


--
-- Name: idx_song_tags_tag; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_song_tags_tag ON public.song_tags USING btree (tag_id);


--
-- Name: idx_voice_notes_song; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_voice_notes_song ON public.song_voice_notes USING btree (song_id);


--
-- Name: play_history_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX play_history_user_idx ON public.play_history USING btree (user_id, played_at DESC);


--
-- Name: songs_tag_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX songs_tag_idx ON public.songs USING btree (tag_id);


--
-- Name: playlists playlists_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER playlists_updated BEFORE UPDATE ON public.playlists FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();


--
-- Name: profiles profiles_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();


--
-- Name: songs songs_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER songs_updated BEFORE UPDATE ON public.songs FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();


--
-- Name: tags tags_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tags_updated BEFORE UPDATE ON public.tags FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();


--
-- Name: daily_picks daily_picks_song_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_picks
    ADD CONSTRAINT daily_picks_song_id_fkey FOREIGN KEY (song_id) REFERENCES public.songs(id) ON DELETE CASCADE;


--
-- Name: favorites favorites_song_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorites
    ADD CONSTRAINT favorites_song_id_fkey FOREIGN KEY (song_id) REFERENCES public.songs(id) ON DELETE CASCADE;


--
-- Name: favorites favorites_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorites
    ADD CONSTRAINT favorites_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: play_history play_history_song_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.play_history
    ADD CONSTRAINT play_history_song_id_fkey FOREIGN KEY (song_id) REFERENCES public.songs(id) ON DELETE CASCADE;


--
-- Name: play_history play_history_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.play_history
    ADD CONSTRAINT play_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: playlist_songs playlist_songs_playlist_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playlist_songs
    ADD CONSTRAINT playlist_songs_playlist_id_fkey FOREIGN KEY (playlist_id) REFERENCES public.playlists(id) ON DELETE CASCADE;


--
-- Name: playlist_songs playlist_songs_song_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playlist_songs
    ADD CONSTRAINT playlist_songs_song_id_fkey FOREIGN KEY (song_id) REFERENCES public.songs(id) ON DELETE CASCADE;


--
-- Name: playlists playlists_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playlists
    ADD CONSTRAINT playlists_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: song_letters song_letters_song_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.song_letters
    ADD CONSTRAINT song_letters_song_id_fkey FOREIGN KEY (song_id) REFERENCES public.songs(id) ON DELETE CASCADE;


--
-- Name: song_tags song_tags_song_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.song_tags
    ADD CONSTRAINT song_tags_song_id_fkey FOREIGN KEY (song_id) REFERENCES public.songs(id) ON DELETE CASCADE;


--
-- Name: song_tags song_tags_tag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.song_tags
    ADD CONSTRAINT song_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON DELETE CASCADE;


--
-- Name: song_voice_notes song_voice_notes_song_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.song_voice_notes
    ADD CONSTRAINT song_voice_notes_song_id_fkey FOREIGN KEY (song_id) REFERENCES public.songs(id) ON DELETE CASCADE;


--
-- Name: songs songs_tag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.songs
    ADD CONSTRAINT songs_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON DELETE SET NULL;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles admins manage profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins manage profiles" ON public.profiles TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: user_roles admins manage roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins manage roles" ON public.user_roles TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: song_tags admins manage song_tags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins manage song_tags" ON public.song_tags TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: songs admins manage songs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins manage songs" ON public.songs TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: tags admins manage tags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins manage tags" ON public.tags TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: favorites admins read all favorites; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins read all favorites" ON public.favorites FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: user_roles admins read all roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins read all roles" ON public.user_roles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: song_letters authors delete own letters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authors delete own letters" ON public.song_letters FOR DELETE TO authenticated USING ((auth.uid() = author_id));


--
-- Name: daily_picks daily picks readable by authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "daily picks readable by authenticated" ON public.daily_picks FOR SELECT TO authenticated USING (true);


--
-- Name: daily_picks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.daily_picks ENABLE ROW LEVEL SECURITY;

--
-- Name: favorites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;

--
-- Name: song_letters letters readable by authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "letters readable by authenticated" ON public.song_letters FOR SELECT TO authenticated USING (true);


--
-- Name: play_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.play_history ENABLE ROW LEVEL SECURITY;

--
-- Name: playlist_songs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.playlist_songs ENABLE ROW LEVEL SECURITY;

--
-- Name: playlists; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.playlists ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles readable by authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "profiles readable by authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);


--
-- Name: song_letters; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.song_letters ENABLE ROW LEVEL SECURITY;

--
-- Name: song_tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.song_tags ENABLE ROW LEVEL SECURITY;

--
-- Name: song_tags song_tags readable by authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "song_tags readable by authenticated" ON public.song_tags FOR SELECT TO authenticated USING (true);


--
-- Name: song_voice_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.song_voice_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: songs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.songs ENABLE ROW LEVEL SECURITY;

--
-- Name: songs songs readable by authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "songs readable by authenticated" ON public.songs FOR SELECT TO authenticated USING (((status = 'active'::text) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

--
-- Name: tags tags readable by authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tags readable by authenticated" ON public.tags FOR SELECT TO authenticated USING (true);


--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: daily_picks users delete own picks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users delete own picks" ON public.daily_picks FOR DELETE TO authenticated USING ((auth.uid() = picker_id));


--
-- Name: playlists users delete own playlists; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users delete own playlists" ON public.playlists FOR DELETE TO authenticated USING (((auth.uid() = user_id) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: song_voice_notes users delete own voice notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users delete own voice notes" ON public.song_voice_notes FOR DELETE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: play_history users insert own history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users insert own history" ON public.play_history FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: song_letters users insert own letters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users insert own letters" ON public.song_letters FOR INSERT TO authenticated WITH CHECK ((auth.uid() = author_id));


--
-- Name: daily_picks users insert own picks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users insert own picks" ON public.daily_picks FOR INSERT TO authenticated WITH CHECK ((auth.uid() = picker_id));


--
-- Name: playlists users insert own playlists; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users insert own playlists" ON public.playlists FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: profiles users insert own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK ((auth.uid() = id));


--
-- Name: song_voice_notes users insert own voice notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users insert own voice notes" ON public.song_voice_notes FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: favorites users manage own favorites; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users manage own favorites" ON public.favorites TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: playlist_songs users modify own playlist songs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users modify own playlist songs" ON public.playlist_songs TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.playlists p
  WHERE ((p.id = playlist_songs.playlist_id) AND (p.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.playlists p
  WHERE ((p.id = playlist_songs.playlist_id) AND (p.user_id = auth.uid())))));


--
-- Name: play_history users read own history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users read own history" ON public.play_history FOR SELECT TO authenticated USING (((auth.uid() = user_id) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: user_roles users read own roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users read own roles" ON public.user_roles FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: playlist_songs users see own playlist songs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users see own playlist songs" ON public.playlist_songs FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.playlists p
  WHERE ((p.id = playlist_songs.playlist_id) AND ((p.user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role))))));


--
-- Name: playlists users see own playlists; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users see own playlists" ON public.playlists FOR SELECT TO authenticated USING (((auth.uid() = user_id) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: song_letters users update letters to unlock; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users update letters to unlock" ON public.song_letters FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: playlists users update own playlists; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users update own playlists" ON public.playlists FOR UPDATE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: profiles users update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users update own profile" ON public.profiles FOR UPDATE TO authenticated USING ((auth.uid() = id));


--
-- Name: song_voice_notes voice notes readable by authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "voice notes readable by authenticated" ON public.song_voice_notes FOR SELECT TO authenticated USING (true);


--
-- PostgreSQL database dump complete
--

\unrestrict iR9hq9LR4mQx1bMnpp6Ffjx7VPnUkYeMKbvvMoO72ORoneoAPe0IZ6fK6ZKS8gF

