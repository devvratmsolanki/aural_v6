-- SECURITY: stop trusting client-controlled signup metadata for role assignment.
--
-- handle_new_user() is SECURITY DEFINER and previously granted the 'admin' role
-- whenever NEW.raw_user_meta_data->>'is_admin' was true. That metadata comes from
-- the public supabase.auth.signUp() `options.data`, which is fully attacker
-- controlled, so anyone with the (public, bundled) anon key could self-grant
-- admin. New users now always get the 'user' role. Admin is granted only via
-- service-role paths (admin-create-user / bootstrap-admin upsert into user_roles).
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'username', split_part(NEW.email,'@',1)),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END $$;
