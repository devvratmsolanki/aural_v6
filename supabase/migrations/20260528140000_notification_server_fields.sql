-- SECURITY: derive notification display fields server-side. The insert policy
-- only verifies auth.uid() = sender_id, so a client could otherwise forge
-- sender_name / song_title (a spoofing / phishing vector, since these are
-- realtime-broadcast to the recipient). Overwrite them from trusted sources.
CREATE OR REPLACE FUNCTION public.set_notification_fields() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.sender_name := COALESCE((SELECT name FROM public.profiles WHERE id = NEW.sender_id), '');
  NEW.song_title  := COALESCE((SELECT title FROM public.songs WHERE id = NEW.song_id), '');
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS notifications_set_fields ON public.notifications;
CREATE TRIGGER notifications_set_fields
  BEFORE INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.set_notification_fields();
