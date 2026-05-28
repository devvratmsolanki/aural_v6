// deno-lint-ignore-file
// Recommendation edge function: blends user's liked tags, recently played tags,
// and global popularity to surface songs the user hasn't played recently.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supabase.auth.getUser();

    // Score tags from liked + recent
    const tagScore: Record<string, number> = {};
    const seenSongs = new Set<string>();

    if (user) {
      const { data: favs } = await supabase
        .from("favorites")
        .select("song:songs(id, tag_id)")
        .eq("user_id", user.id);
      (favs ?? []).forEach((r: { song?: { id?: string; tag_id?: string } | null }) => {
        if (r.song?.id) seenSongs.add(r.song.id);
        if (r.song?.tag_id) tagScore[r.song.tag_id] = (tagScore[r.song.tag_id] ?? 0) + 3;
      });

      const { data: hist } = await supabase
        .from("play_history")
        .select("song:songs(id, tag_id)")
        .eq("user_id", user.id)
        .order("played_at", { ascending: false })
        .limit(50);
      (hist ?? []).forEach((r: { song?: { id?: string; tag_id?: string } | null }) => {
        if (r.song?.id) seenSongs.add(r.song.id);
        if (r.song?.tag_id) tagScore[r.song.tag_id] = (tagScore[r.song.tag_id] ?? 0) + 1;
      });
    }

    const topTags = Object.entries(tagScore).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => id);

    // Pull candidate songs by top tags
    type Candidate = { id: string; tag_id?: string | null; [key: string]: unknown };
    let candidates: Candidate[] = [];
    if (topTags.length) {
      const { data } = await supabase
        .from("songs")
        .select("*, tag:tags(id,name)")
        
        .eq("status", "active")
        .in("tag_id", topTags)
        .limit(40);
      candidates = data ?? [];
    }

    // Always include global popularity (recent global plays)
    const { data: pop } = await supabase
      .from("play_history")
      .select("song_id")
      .order("played_at", { ascending: false })
      .limit(500);
    const popMap: Record<string, number> = {};
    (pop ?? []).forEach((r: { song_id: string }) => { popMap[r.song_id] = (popMap[r.song_id] ?? 0) + 1; });
    const popularIds = Object.entries(popMap).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([id]) => id);
    if (popularIds.length) {
      const { data } = await supabase
        .from("songs")
        .select("*, tag:tags(id,name)")
        
        .eq("status", "active")
        .in("id", popularIds);
      (data ?? []).forEach((s) => { if (!candidates.find((c) => c.id === s.id)) candidates.push(s); });
    }

    // Fallback: latest songs
    if (candidates.length < 8) {
      const { data } = await supabase
        .from("songs")
        .select("*, tag:tags(id,name)")
        
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(20);
      (data ?? []).forEach((s) => { if (!candidates.find((c) => c.id === s.id)) candidates.push(s); });
    }

    const scored = candidates
      .filter((s) => !seenSongs.has(s.id))
      .map((s) => ({
        ...s,
        _score: (s.tag_id ? (tagScore[s.tag_id] ?? 0) : 0) + (popMap[s.id] ?? 0) * 0.3,
      }))
      .sort((a, b) => b._score - a._score)
      .slice(0, 12)
      .map(({ _score, ...s }) => s);

    return new Response(JSON.stringify({ songs: scored }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
