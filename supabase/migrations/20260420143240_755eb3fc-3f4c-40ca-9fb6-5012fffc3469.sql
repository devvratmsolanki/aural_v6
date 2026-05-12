CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, name, avatar_url)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)), NEW.raw_user_meta_data->>'avatar_url');

  IF NEW.email = 'admin@aural.app' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  END IF;

  RETURN NEW;
END $function$;

-- Promote existing admin@aural.app account if it already exists
DO $$
DECLARE admin_uid uuid;
BEGIN
  SELECT id INTO admin_uid FROM auth.users WHERE email = 'admin@aural.app' LIMIT 1;
  IF admin_uid IS NOT NULL THEN
    DELETE FROM public.user_roles WHERE user_id = admin_uid;
    INSERT INTO public.user_roles (user_id, role) VALUES (admin_uid, 'admin');
  END IF;
END $$;