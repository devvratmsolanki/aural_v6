import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePlayer } from "@/contexts/PlayerContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Mic, Square, Trash2, Lock, Unlock, MessageCircleHeart, ScrollText, Plus, Play, Pause, ArrowRight } from "lucide-react";
import { toast } from "sonner";

interface Props { songId: string; songTitle?: string; section?: "all" | "voice" | "letters"; listenSeconds?: number }

const UNLOCK_AFTER = 30; // seconds of listening before sealed items unlock
const MAX_REC_SECONDS = 30; // max length of a voice note recording

interface VoiceNote { id: string; user_id: string; file_path: string; created_at: string }
interface Letter { id: string; author_id: string; title: string | null; body: string; unlocked: boolean; created_at: string }

const PUBLIC = (path: string) => supabase.storage.from("voice-notes").getPublicUrl(path).data.publicUrl;

const fmtTime = (s: number) => {
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60).toString().padStart(2, "0");
  return `${m}:${ss}`;
};

const VoiceNotePlayer = ({ path }: { path: string }) => {
  const [src, setSrc] = useState<string>("");
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.storage.from("voice-notes").createSignedUrl(path, 60 * 60);
      if (active) setSrc(data?.signedUrl ?? PUBLIC(path));
    })();
    return () => { active = false; };
  }, [path]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onTime = () => setPos(el.currentTime);
    const onDur = () => {
      const d = el.duration;
      if (isFinite(d) && d > 0) {
        setDur(d);
      } else {
        // webm/opus blobs often report Infinity until we force a seek
        const onSeeked = () => {
          el.currentTime = 0;
          setDur(el.duration && isFinite(el.duration) ? el.duration : 0);
          el.removeEventListener("seeked", onSeeked);
        };
        el.addEventListener("seeked", onSeeked);
        try { el.currentTime = 1e101; } catch { /* noop */ }
      }
    };
    const onEnd = () => { setPlaying(false); setPos(0); };
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("loadedmetadata", onDur);
    el.addEventListener("ended", onEnd);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("loadedmetadata", onDur);
      el.removeEventListener("ended", onEnd);
    };
  }, [src]);

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) { el.play(); setPlaying(true); } else { el.pause(); setPlaying(false); }
  };

  const pct = dur > 0 ? (pos / dur) * 100 : 0;

  return (
    <div className="flex items-center gap-3 flex-1">
      <audio
        ref={audioRef}
        src={src || undefined}
        preload="metadata"
        onError={() => { if (src) toast.error("Couldn't load voice note"); }}
      />
      <button
        onClick={toggle}
        className="size-9 rounded-full bg-primary/15 hover:bg-primary/25 text-primary flex items-center justify-center shrink-0 transition-colors"
        aria-label={playing ? "Pause" : "Play"}
      >
        {playing ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current ml-0.5" />}
      </button>
      <div className="flex-1 min-w-0">
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-primary transition-[width] duration-150" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex justify-between text-[10px] tabular-nums text-muted-foreground mt-1">
          <span>{fmtTime(pos)}</span>
          <span>{fmtTime(dur)}</span>
        </div>
      </div>
    </div>
  );
};

export const SongExtras = ({ songId, songTitle = "", section = "all", listenSeconds = 0 }: Props) => {
  const { user, isAdmin, profile } = useAuth();
  const { isPlaying, toggle: playerToggle } = usePlayer();
  const [notes, setNotes] = useState<VoiceNote[]>([]);
  const [letters, setLetters] = useState<Letter[]>([]);
  const [recording, setRecording] = useState(false);
  const [recElapsed, setRecElapsed] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [showLetterForm, setShowLetterForm] = useState(false);
  const [lTitle, setLTitle] = useState("");
  const [lBody, setLBody] = useState("");
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const recTimerRef = useRef<number | null>(null);

  const unlockedByListen = listenSeconds >= UNLOCK_AFTER;
  const remaining = Math.max(0, UNLOCK_AFTER - Math.floor(listenSeconds));

  const load = async () => {
    const [{ data: vn }, { data: lt }, { data: pr }] = await Promise.all([
      supabase.from("song_voice_notes").select("*").eq("song_id", songId).order("created_at", { ascending: false }),
      supabase.from("song_letters").select("*").eq("song_id", songId).order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, name"),
    ]);
    setNotes((vn as any) ?? []);
    setLetters((lt as any) ?? []);

    const map: Record<string, string> = {};
    (pr ?? []).forEach((p: any) => { map[p.id] = p.name || "Unknown"; });
    setProfiles(map);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [songId]);

  // Once the listener crosses the 30s threshold, persist unlock for letters not theirs
  useEffect(() => {
    if (!unlockedByListen || !user) return;
    const toUnlock = letters.filter((l) => !l.unlocked && l.author_id !== user.id);
    if (!toUnlock.length) return;
    (async () => {
      await supabase
        .from("song_letters")
        .update({ unlocked: true, unlocked_at: new Date().toISOString() })
        .in("id", toUnlock.map((l) => l.id));
      setLetters((prev) => prev.map((l) => toUnlock.find((u) => u.id === l.id) ? { ...l, unlocked: true } : l));
    })();
  }, [unlockedByListen, letters, user]);

  const labelFor = (id: string) => profiles[id] ?? "…";
  // Two-person app: the recipient is always the other person
  const recipientId = (fromId: string) =>
    Object.keys(profiles).find((id) => id !== fromId) ?? fromId;

  const sendNotification = async (type: "voice_note" | "letter") => {
    if (!user) return;
    const toId = recipientId(user.id);
    if (toId === user.id) return; // only one user in the app, skip
    await supabase.from("notifications").insert({
      recipient_id: toId,
      sender_id: user.id,
      type,
      song_id: songId,
      song_title: songTitle,
      sender_name: profile?.name ?? "Someone",
    });
  };

  const pickMime = () => {
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4;codecs=mp4a.40.2",
      "audio/mp4",
      "audio/ogg;codecs=opus",
      "audio/ogg",
    ];
    for (const t of candidates) {
      // @ts-ignore
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(t)) return t;
    }
    return "";
  };

  const startRec = async () => {
    if (isPlaying) playerToggle(); // pause background music while recording
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = pickMime();
      const mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data && e.data.size) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        if (recTimerRef.current) { window.clearInterval(recTimerRef.current); recTimerRef.current = null; }
        setRecElapsed(0);
        const actualType = mr.mimeType || mime || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: actualType });
        stream.getTracks().forEach((t) => t.stop());
        if (!user) return;
        setUploading(true);
        const ext = actualType.includes("mp4") ? "m4a" : actualType.includes("ogg") ? "ogg" : "webm";
        const path = `${user.id}/${songId}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("voice-notes").upload(path, blob, { contentType: actualType, upsert: false });
        if (upErr) { setUploading(false); toast.error(upErr.message); return; }
        const { error: insErr } = await supabase.from("song_voice_notes").insert({ song_id: songId, user_id: user.id, file_path: path });
        if (insErr) { setUploading(false); toast.error("Couldn't save voice note: " + insErr.message); return; }
        setUploading(false);
        toast.success("Voice note saved");
        await sendNotification("voice_note");
        load();
      };
      mr.start();
      recRef.current = mr;
      setRecording(true);
      setRecElapsed(0);
      recTimerRef.current = window.setInterval(() => setRecElapsed((s) => s + 1), 1000) as unknown as number;
      // auto-stop at MAX_REC_SECONDS
      setTimeout(() => { if (mr.state === "recording") mr.stop(); setRecording(false); }, MAX_REC_SECONDS * 1000);
    } catch (e: any) {
      toast.error("Mic access denied");
    }
  };
  const stopRec = () => { recRef.current?.stop(); setRecording(false); };

  const deleteNote = async (n: VoiceNote) => {
    await supabase.storage.from("voice-notes").remove([n.file_path]);
    await supabase.from("song_voice_notes").delete().eq("id", n.id);
    load();
  };

  const saveLetter = async () => {
    if (!user || !lBody.trim()) return;
    const { error } = await supabase.from("song_letters").insert({ song_id: songId, author_id: user.id, title: lTitle || null, body: lBody });
    if (error) { toast.error(error.message); return; }
    setLTitle(""); setLBody(""); setShowLetterForm(false);
    toast.success("Letter sealed 💌");
    await sendNotification("letter");
    load();
  };

  const deleteLetter = async (id: string) => {
    await supabase.from("song_letters").delete().eq("id", id);
    load();
  };

  const SenderReceiver = ({ fromId }: { fromId: string }) => {
    const toId = recipientId(fromId);
    return (
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground flex-wrap">
        <span className="text-muted-foreground/70">From</span>
        <span className="text-foreground/80 normal-case tracking-normal">{labelFor(fromId)}</span>
        <ArrowRight className="h-3 w-3" />
        <span className="text-muted-foreground/70">To</span>
        <span className="text-foreground/80 normal-case tracking-normal">{labelFor(toId)}</span>
      </div>
    );
  };

  const VoiceSection = (
    <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
            <MessageCircleHeart className="h-3.5 w-3.5 text-primary" /> Voice notes
          </div>
          {!recording && !uploading ? (
            <Button size="sm" variant="ghost" onClick={startRec}><Mic className="h-3.5 w-3.5 mr-1" /> Record</Button>
          ) : uploading ? (
            <span className="text-xs text-muted-foreground italic">Saving…</span>
          ) : (
            <Button size="sm" variant="ghost" onClick={stopRec} className="text-primary"><Square className="h-3.5 w-3.5 mr-1 fill-current" /> Stop</Button>
          )}
        </div>
        {recording && (
          <div className="mb-4 p-4 rounded-md border border-primary/40 bg-primary/5 flex items-center gap-3">
            <span className="relative flex size-3">
              <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-60 animate-ping" />
              <span className="relative inline-flex size-3 rounded-full bg-primary" />
            </span>
            <div className="flex-1">
              <div className="text-sm font-medium">Recording…</div>
              <div className="h-1 mt-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${Math.min(100, (recElapsed / MAX_REC_SECONDS) * 100)}%` }} />
              </div>
            </div>
            <div className="text-sm tabular-nums text-primary font-semibold">{fmtTime(recElapsed)} / {fmtTime(MAX_REC_SECONDS)}</div>
          </div>
        )}
        {uploading && (
          <div className="mb-4 p-3 rounded-md border border-border bg-popover/40 text-sm text-muted-foreground italic">
            Sealing your voice note…
          </div>
        )}
        {notes.length === 0 && !recording && !uploading && (
          <p className="text-xs text-muted-foreground italic">No voice notes yet — leave one for them.</p>
        )}
        <div className="space-y-3">
          {notes.map((n) => {
            const mine = n.user_id === user?.id;
            const locked = !mine && !unlockedByListen;
            return (
              <div key={n.id} className="rounded-md border border-border bg-popover/40 p-3">
                <div className="flex items-center justify-between mb-2">
                  <SenderReceiver fromId={n.user_id} />
                  <button onClick={() => deleteNote(n)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
                {locked ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground italic">
                    <Lock className="h-3.5 w-3.5" /> Unlocks after {remaining}s of listening
                  </div>
                ) : (
                  <VoiceNotePlayer path={n.file_path} />
                )}
              </div>
            );
          })}
        </div>
      </div>
  );

  const LettersSection = (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
          <ScrollText className="h-3.5 w-3.5 text-primary" /> Letters
        </div>
        <Button size="sm" variant="ghost" onClick={() => setShowLetterForm((v) => !v)}><Plus className="h-3.5 w-3.5 mr-1" /> Write</Button>
      </div>
      {showLetterForm && (
        <div className="space-y-2 mb-4 p-3 rounded-sm border border-primary/30 bg-primary/5">
          <Input placeholder="Title (optional)" value={lTitle} onChange={(e) => setLTitle(e.target.value)} maxLength={120} />
          <Textarea placeholder="A long letter, sealed until they play this song…" value={lBody} onChange={(e) => setLBody(e.target.value)} rows={5} maxLength={4000} />
          <div className="flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => setShowLetterForm(false)}>Cancel</Button><Button size="sm" onClick={saveLetter} disabled={!lBody.trim()}>Seal</Button></div>
        </div>
      )}
      {letters.length === 0 && !showLetterForm && <p className="text-xs text-muted-foreground italic">No letters tied to this song yet.</p>}
      <div className="space-y-3">
        {letters.map((l) => {
          const mine = l.author_id === user?.id;
          const visible = mine || l.unlocked || unlockedByListen;
          return (
            <div key={l.id} className="rounded-sm border border-border p-3 bg-popover/30">
              <div className="flex items-center justify-between mb-2 gap-2">
                <SenderReceiver fromId={l.author_id} />
                <div className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                  {visible ? <Unlock className="h-3 w-3 text-primary" /> : <Lock className="h-3 w-3" />}
                  {mine ? "You wrote" : visible ? "Unlocked" : "Sealed"}
                </div>
                <button onClick={() => deleteLetter(l.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
              </div>
              {l.title && <div className="text-sm font-medium mb-1">{l.title}</div>}
              {visible ? (
                <p className="text-sm whitespace-pre-wrap leading-relaxed text-foreground/90">{l.body}</p>
              ) : (
                <p className="text-xs text-muted-foreground italic flex items-center gap-1.5">
                  <Lock className="h-3 w-3" /> A letter waits. Unlocks after {remaining}s of listening.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  if (section === "voice") return <div className="mt-4">{VoiceSection}</div>;
  if (section === "letters") return <div className="mt-4">{LettersSection}</div>;

  return (
    <div className="space-y-6 mt-8">
      {VoiceSection}
      {LettersSection}
    </div>
  );
};
