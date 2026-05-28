-- BUG-3: Enforce that end_at, when set, must be strictly greater than play_from.
-- Prevents invalid clip ranges from being persisted even if the client-side
-- guard is bypassed.

-- First, repair any existing invalid rows (these are currently unplayable —
-- they skip instantly because currentTime starts >= end_at). Nulling end_at
-- makes the song play in full again, and lets the CHECK below apply cleanly
-- instead of failing on pre-existing bad data.
UPDATE public.songs
  SET end_at = NULL
  WHERE end_at IS NOT NULL AND end_at <= play_from;

ALTER TABLE public.songs DROP CONSTRAINT IF EXISTS songs_clip_valid;
ALTER TABLE public.songs ADD CONSTRAINT songs_clip_valid
  CHECK (end_at IS NULL OR end_at > play_from);
