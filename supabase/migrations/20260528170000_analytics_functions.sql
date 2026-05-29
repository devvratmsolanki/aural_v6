-- BUG-9: Server-side analytics aggregation. Replaces fetching up to 2000 raw
-- play_history rows and counting in JS (which undercounts past the cap and is
-- an N+1 join pattern). These run as SECURITY INVOKER (the default), so
-- play_history RLS still applies: admins read all history and get global stats,
-- and the Analytics page is admin-only anyway.

CREATE OR REPLACE FUNCTION public.analytics_top_songs(limit_n integer DEFAULT 10)
RETURNS TABLE(name text, count bigint)
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $$
  SELECT s.title AS name, count(*)::bigint AS count
  FROM public.play_history ph
  JOIN public.songs s ON s.id = ph.song_id
  GROUP BY s.title
  ORDER BY count DESC, s.title ASC
  LIMIT GREATEST(limit_n, 0);
$$;

CREATE OR REPLACE FUNCTION public.analytics_top_tags(limit_n integer DEFAULT 10)
RETURNS TABLE(name text, count bigint)
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $$
  SELECT t.name AS name, count(*)::bigint AS count
  FROM public.play_history ph
  JOIN public.songs s ON s.id = ph.song_id
  JOIN public.tags t ON t.id = s.tag_id
  GROUP BY t.name
  ORDER BY count DESC, t.name ASC
  LIMIT GREATEST(limit_n, 0);
$$;

CREATE OR REPLACE FUNCTION public.analytics_active_users(since timestamptz)
RETURNS integer
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $$
  SELECT count(DISTINCT user_id)::integer
  FROM public.play_history
  WHERE played_at >= since;
$$;

GRANT EXECUTE ON FUNCTION public.analytics_top_songs(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_top_tags(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_active_users(timestamptz) TO authenticated;
