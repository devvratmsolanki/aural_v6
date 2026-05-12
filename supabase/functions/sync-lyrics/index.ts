// Edge function: align pasted lyrics to MP3 audio using OpenAI Whisper word-level timestamps.
// Returns an array of { time: number (sec), text: string } lines and persists to songs.timed_lyrics.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface Body {
  song_id: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) return json({ error: "OPENAI_API_KEY not configured" }, 500);

    // Auth check
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) return json({ error: "Unauthorized" }, 401);
    const userId = claimsData.claims.sub;

    // Service client for admin role check + DB writes + signed URL
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) return json({ error: "Forbidden" }, 403);

    const { song_id } = (await req.json()) as Body;
    if (!song_id) return json({ error: "song_id required" }, 400);

    const { data: song, error: songErr } = await admin
      .from("songs")
      .select("id, file_path, lyrics")
      .eq("id", song_id)
      .maybeSingle();
    if (songErr || !song) return json({ error: "Song not found" }, 404);
    if (!song.lyrics?.trim()) return json({ error: "Song has no lyrics to align" }, 400);

    // Download audio
    const { data: signed, error: urlErr } = await admin.storage
      .from("audio")
      .createSignedUrl(song.file_path, 60 * 10);
    if (urlErr || !signed) return json({ error: "Could not access audio file" }, 500);

    const audioResp = await fetch(signed.signedUrl);
    if (!audioResp.ok) return json({ error: "Failed to fetch audio" }, 500);
    const audioBlob = await audioResp.blob();

    // Call Whisper with word-level timestamps
    const fd = new FormData();
    fd.append("file", audioBlob, "audio.mp3");
    fd.append("model", "whisper-1");
    fd.append("response_format", "verbose_json");
    fd.append("timestamp_granularities[]", "word");

    const whisperResp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: fd,
    });
    if (!whisperResp.ok) {
      const errText = await whisperResp.text();
      console.error("Whisper error:", whisperResp.status, errText);
      return json({ error: `Whisper failed: ${whisperResp.status}` }, 502);
    }
    const whisper = await whisperResp.json();
    const words: { word: string; start: number; end: number }[] = whisper.words ?? [];
    if (words.length === 0) return json({ error: "No words detected in audio" }, 422);

    // Align lyrics lines to word stream by token similarity
    const lyricLines = song.lyrics
      .split(/\r?\n/)
      .map((l: string) => l.trim())
      .filter((l: string) => l.length > 0);

    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9'\s]/g, "").trim();
    const timed: { time: number; text: string }[] = [];
    let cursor = 0;

    for (const line of lyricLines) {
      const lineWords = norm(line).split(/\s+/).filter(Boolean);
      if (lineWords.length === 0) continue;
      const firstTok = lineWords[0];
      // Search forward for a matching word
      let matchIdx = -1;
      const searchEnd = Math.min(words.length, cursor + 60);
      for (let i = cursor; i < searchEnd; i++) {
        const w = norm(words[i].word);
        if (w === firstTok || w.startsWith(firstTok) || firstTok.startsWith(w)) {
          matchIdx = i;
          break;
        }
      }
      if (matchIdx === -1) {
        // Fallback: distribute proportionally
        const t = words[Math.min(cursor, words.length - 1)].start;
        timed.push({ time: t, text: line });
      } else {
        timed.push({ time: words[matchIdx].start, text: line });
        cursor = matchIdx + Math.max(1, lineWords.length - 1);
      }
    }

    await admin.from("songs").update({ timed_lyrics: timed }).eq("id", song_id);

    return json({ ok: true, lines: timed.length });
  } catch (e) {
    console.error("sync-lyrics error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});