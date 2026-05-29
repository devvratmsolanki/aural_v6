import { supabase } from "@/integrations/supabase/client";
import type { Song } from "@/types/music";

const urlCache = new Map<string, { url: string; exp: number }>();

export async function resolveAudioUrl(song: Song, forceRefresh = false): Promise<string> {
  // If already a full URL, return as is.
  if (/^https?:\/\//i.test(song.file_path)) return song.file_path;

  const cached = urlCache.get(song.file_path);
  if (!forceRefresh && cached && cached.exp > Date.now()) return cached.url;

  const { data, error } = await supabase.storage.from("audio").createSignedUrl(song.file_path, 60 * 60);
  if (error || !data) throw error ?? new Error("Could not sign audio URL");
  urlCache.set(song.file_path, { url: data.signedUrl, exp: Date.now() + 55 * 60 * 1000 });
  return data.signedUrl;
}

/**
 * Synchronous cache accessor. Returns a usable audio URL *without any await /
 * Promise* when one is available — either because `file_path` is already a full
 * http(s) URL, or because a non-expired signed URL is in the in-memory cache.
 * Returns `null` on a cache miss (caller must fall back to `resolveAudioUrl`).
 *
 * This exists so the track-transition path can set `el.src` and call `el.play()`
 * inside the SAME event-loop turn as the `ended` / `aural:ended` handler. A
 * locked / backgrounded mobile browser only allows *continuation* of media in
 * that turn; an async network gap (the `createSignedUrl` call) before `play()`
 * makes the OS treat the next track as a fresh autoplay with no user gesture and
 * blocks it — which is why playback used to die at every track transition.
 */
export function getCachedAudioUrl(song: Song): string | null {
  if (/^https?:\/\//i.test(song.file_path)) return song.file_path;
  const cached = urlCache.get(song.file_path);
  if (cached && cached.exp > Date.now()) return cached.url;
  return null;
}

/**
 * Warm the cache for an upcoming track so its signed URL is ready synchronously
 * (via `getCachedAudioUrl`) by the time the current track ends. Fire-and-forget:
 * never throws, and is a no-op when the URL is already cached or external.
 */
export function prefetchAudioUrl(song: Song | null | undefined): void {
  if (!song) return;
  if (getCachedAudioUrl(song)) return; // already warm (or external) — nothing to do
  // Swallow errors: a failed prefetch just means the transition falls back to
  // the async path; it must never surface as an unhandled rejection.
  void resolveAudioUrl(song).catch(() => { /* best-effort warm-up */ });
}

export function coverUrl(path: string | null): string {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  const { data } = supabase.storage.from("covers").getPublicUrl(path);
  return data.publicUrl;
}
