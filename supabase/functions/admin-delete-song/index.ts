// deno-lint-ignore-file
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
    const { data: roles } = await userClient.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin");
    if (!roles?.length) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });

    const { song_id } = await req.json();
    if (!song_id) return new Response(JSON.stringify({ error: "song_id required" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Lookup song to grab file paths
    const { data: song } = await admin.from("songs").select("file_path, cover_image").eq("id", song_id).maybeSingle();

    // Voice notes — files + rows
    const { data: vn } = await admin.from("song_voice_notes").select("file_path").eq("song_id", song_id);
    const vnPaths = (vn ?? []).map((r: any) => r.file_path).filter(Boolean);
    if (vnPaths.length) await admin.storage.from("voice-notes").remove(vnPaths);

    // Storage cleanup for the song itself
    if (song?.file_path) await admin.storage.from("audio").remove([song.file_path]);
    if (song?.cover_image && !/^https?:\/\//i.test(song.cover_image)) {
      await admin.storage.from("covers").remove([song.cover_image]);
    }

    // FK-safe row cleanup (no real FKs but clean for hygiene)
    await admin.from("song_voice_notes").delete().eq("song_id", song_id);
    await admin.from("song_letters").delete().eq("song_id", song_id);
    await admin.from("song_tags").delete().eq("song_id", song_id);
    await admin.from("favorites").delete().eq("song_id", song_id);
    await admin.from("play_history").delete().eq("song_id", song_id);
    await admin.from("playlist_songs").delete().eq("song_id", song_id);
    await admin.from("daily_picks").delete().eq("song_id", song_id);

    const { error: delErr } = await admin.from("songs").delete().eq("id", song_id);
    if (delErr) throw delErr;

    return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("admin-delete-song error", e);
    return new Response(JSON.stringify({ error: e.message ?? String(e) }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});