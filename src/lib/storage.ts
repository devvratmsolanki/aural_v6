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

export function coverUrl(path: string | null): string {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  const { data } = supabase.storage.from("covers").getPublicUrl(path);
  return data.publicUrl;
}
