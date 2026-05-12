import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Wand2 } from "lucide-react";
import type { Song, Tag } from "@/types/music";

interface Form {
  id?: string;
  title: string; artist: string; lyrics: string; remarks: string;
  status: string;
  file_path: string;
  cover_image: string | null;
  tag_ids: string[];
  play_from: number;
  end_at: number | null;
}

const empty: Form = { title: "", artist: "", lyrics: "", remarks: "", status: "active", file_path: "", cover_image: null, tag_ids: [], play_from: 0, end_at: null };

// Sanitize a filename for Supabase Storage keys (no spaces, colons, or unsafe chars).
const sanitizeFilename = (name: string) => {
  const dot = name.lastIndexOf(".");
  const base = (dot > 0 ? name.slice(0, dot) : name)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "audio";
  const ext = (dot > 0 ? name.slice(dot + 1) : "mp3").toLowerCase().replace(/[^a-z0-9]/g, "") || "mp3";
  return `${base}.${ext}`;
};

// HH:MM:SS helpers
const toHMS = (total: number | null | undefined) => {
  const t = Math.max(0, Math.floor(total ?? 0));
  return { h: Math.floor(t / 3600), m: Math.floor((t % 3600) / 60), s: t % 60 };
};
const fromHMS = (h: number, m: number, s: number) => h * 3600 + m * 60 + s;

// Verify the file is actually an MP3 by sniffing its magic bytes.
// Accepts: ID3v2 tag ("ID3") or MPEG audio frame sync (0xFF Ex/Fx range with valid MPEG layer).
const isMp3Bytes = async (file: File): Promise<boolean> => {
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  if (head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33) return true; // "ID3"
  // MPEG audio: byte0=0xFF, byte1 high nibble = 0xF (sync), low nibble's bits 1-2 = layer (must not be 00)
  if (head[0] === 0xff && (head[1] & 0xe0) === 0xe0) {
    const layer = (head[1] >> 1) & 0x03;
    if (layer !== 0) return true;
  }
  return false;
};

const HMSInput = ({ label, value, onChange, allowEmpty = false }: { label: string; value: number | null; onChange: (v: number | null) => void; allowEmpty?: boolean }) => {
  const { h, m, s } = toHMS(value);
  const update = (nh: number, nm: number, ns: number) => {
    const total = fromHMS(nh, nm, ns);
    if (allowEmpty && total === 0) onChange(null);
    else onChange(total);
  };
  return (
    <div>
      <Label>{label}</Label>
      <div className="grid grid-cols-3 gap-2 mt-1">
        <div>
          <Input type="number" min={0} value={h} onChange={(e) => update(Number(e.target.value) || 0, m, s)} />
          <p className="text-[10px] text-muted-foreground mt-1 text-center">hours</p>
        </div>
        <div>
          <Input type="number" min={0} max={59} value={m} onChange={(e) => update(h, Number(e.target.value) || 0, s)} />
          <p className="text-[10px] text-muted-foreground mt-1 text-center">minutes</p>
        </div>
        <div>
          <Input type="number" min={0} max={59} value={s} onChange={(e) => update(h, m, Number(e.target.value) || 0)} />
          <p className="text-[10px] text-muted-foreground mt-1 text-center">seconds</p>
        </div>
      </div>
    </div>
  );
};

const AdminSongs = () => {
  const [songs, setSongs] = useState<Song[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(empty);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const load = async () => {
    let q = supabase.from("songs").select("*").order("created_at", { ascending: false });
    if (search) q = q.or(`title.ilike.%${search}%,artist.ilike.%${search}%`);
    const { data } = await q;
    setSongs((data as any) ?? []);
  };
  useEffect(() => { load(); }, [search]);
  useEffect(() => { supabase.from("tags").select("*").order("name").then(({ data }) => setTags(data ?? [])); }, []);

  const openNew = () => { setForm(empty); setAudioFile(null); setCoverFile(null); setOpen(true); };
  const openEdit = async (s: Song) => {
    const { data: st } = await supabase.from("song_tags").select("tag_id").eq("song_id", s.id);
    setForm({ id: s.id, title: s.title, artist: s.artist ?? "", lyrics: s.lyrics ?? "", remarks: s.remarks ?? "", status: s.status, file_path: s.file_path, cover_image: s.cover_image ?? null, tag_ids: (st ?? []).map((r: any) => r.tag_id), play_from: s.play_from ?? 0, end_at: s.end_at ?? null });
    setAudioFile(null); setCoverFile(null); setOpen(true);
  };

  const save = async () => {
    if (!form.title.trim()) { toast.error("Title required"); return; }
    if (audioFile) {
      const extOk = /\.mp3$/i.test(audioFile.name);
      const mimeOk = audioFile.type === "" || audioFile.type === "audio/mpeg" || audioFile.type === "audio/mp3";
      if (!extOk || !mimeOk) { toast.error("Only .mp3 files are allowed for songs."); return; }
      const realMp3 = await isMp3Bytes(audioFile);
      if (!realMp3) { toast.error("This file isn't a real MP3 (renamed file detected). Please upload an actual .mp3."); return; }
    }
    setBusy(true);
    try {
      let file_path = form.file_path;
      if (audioFile) {
        const path = `${Date.now()}-${sanitizeFilename(audioFile.name)}`;
        const { error } = await supabase.storage.from("audio").upload(path, audioFile);
        if (error) throw error;
        file_path = path;
      }
      if (!file_path) { toast.error("MP3 file required"); setBusy(false); return; }

      let cover_image = form.cover_image;
      if (coverFile) {
        const path = `${Date.now()}-${sanitizeFilename(coverFile.name)}`;
        const { error } = await supabase.storage.from("covers").upload(path, coverFile, { contentType: coverFile.type });
        if (error) throw error;
        cover_image = path;
      }

      const payload = {
        title: form.title.slice(0, 200), artist: form.artist.trim() ? form.artist.slice(0, 200) : null,
        lyrics: form.lyrics, remarks: form.remarks || null, status: form.status, file_path,
        cover_image,
        tag_id: form.tag_ids[0] ?? null,
        play_from: form.play_from || 0,
        end_at: form.end_at,
      };
      let songId = form.id;
      if (form.id) {
        await supabase.from("songs").update(payload).eq("id", form.id);
      } else {
        const { data: ins, error: insErr } = await supabase.from("songs").insert(payload).select("id").single();
        if (insErr) throw insErr;
        songId = ins!.id;
      }
      // Sync song_tags m2m
      if (songId) {
        await supabase.from("song_tags").delete().eq("song_id", songId);
        if (form.tag_ids.length) {
          await supabase.from("song_tags").insert(form.tag_ids.map((tag_id) => ({ song_id: songId!, tag_id })));
        }
      }
      toast.success(form.id ? "Updated" : "Created");
      setOpen(false); load();
    } catch (e: any) {
      toast.error(e.message ?? "Save failed");
    } finally { setBusy(false); }
  };

  const toggleStatus = async (s: Song) => {
    await supabase.from("songs").update({ status: s.status === "active" ? "inactive" : "active" }).eq("id", s.id);
    load();
  };

  const remove = async (s: Song) => {
    if (!confirm(`Delete "${s.title}"?`)) return;
    const t = toast.loading("Deleting song & files…");
    try {
      const { data, error } = await supabase.functions.invoke("admin-delete-song", { body: { song_id: s.id } });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("Song deleted", { id: t });
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Delete failed", { id: t });
    }
  };

  const syncLyrics = async (s: Song) => {
    if (!s.lyrics?.trim()) { toast.error("Add lyrics first"); return; }
    setSyncingId(s.id);
    const t = toast.loading("Syncing lyrics with audio…");
    try {
      const { data, error } = await supabase.functions.invoke("sync-lyrics", { body: { song_id: s.id } });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(`Synced ${(data as any)?.lines ?? 0} lines`, { id: t });
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Sync failed", { id: t });
    } finally { setSyncingId(null); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Songs</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />New song</Button></DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{form.id ? "Edit" : "New"} song</DialogTitle></DialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 mt-2">
              <div><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={200} /></div>
              <div><Label>Artist <span className="text-muted-foreground text-[10px]">(optional)</span></Label><Input value={form.artist} onChange={(e) => setForm({ ...form, artist: e.target.value })} maxLength={200} /></div>

              <div>
                <Label>MP3 file</Label>
                <Input type="file" accept="audio/mpeg,audio/mp3,.mp3" onChange={(e) => setAudioFile(e.target.files?.[0] ?? null)} />
                {form.file_path && !audioFile && <p className="text-[10px] text-muted-foreground mt-1 truncate">Current: {form.file_path}</p>}
              </div>
              <div>
                <Label>Cover image (optional)</Label>
                <Input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)} />
                {form.cover_image && !coverFile && <p className="text-[10px] text-muted-foreground mt-1 truncate">Current: {form.cover_image}</p>}
              </div>

              <div>
                <Label>Tags</Label>
                <div className="flex flex-wrap gap-2 mt-2 p-2 rounded-md border border-input bg-background min-h-10">
                  {tags.length === 0 && <span className="text-xs text-muted-foreground">No tags yet — create one in the Tags tab.</span>}
                  {tags.map((t) => {
                    const active = form.tag_ids.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setForm({ ...form, tag_ids: active ? form.tag_ids.filter((x) => x !== t.id) : [...form.tag_ids, t.id] })}
                        className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${active ? "bg-primary/15 border-primary text-primary" : "border-border text-muted-foreground hover:text-silver"}`}
                      >
                        {t.name}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <Label>Visibility</Label>
                <div className="h-10 flex items-center gap-3 px-3 rounded-md border border-input bg-background">
                  <Switch checked={form.status === "active"} onCheckedChange={(v) => setForm({ ...form, status: v ? "active" : "inactive" })} />
                  <span className="text-sm text-muted-foreground">{form.status === "active" ? "Visible to users" : "Hidden"}</span>
                </div>
              </div>

              <HMSInput label="Play from" value={form.play_from} onChange={(v) => setForm({ ...form, play_from: v ?? 0 })} />
              <HMSInput label="End at (optional)" value={form.end_at} onChange={(v) => setForm({ ...form, end_at: v })} allowEmpty />

              <div className="md:col-span-2">
                <Label>Lyrics</Label>
                <Textarea rows={5} value={form.lyrics} onChange={(e) => setForm({ ...form, lyrics: e.target.value })} placeholder="Paste the song lyrics here. They'll be shown to listeners while the song plays." />
                <p className="text-[10px] text-muted-foreground mt-1">Tip: after saving, click the magic-wand on the row to auto-sync these lyrics with the audio for karaoke-style highlighting.</p>
              </div>
              <div className="md:col-span-2">
                <Label>Private notes</Label>
                <Textarea rows={2} value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} placeholder="Just for the two of us — memories, dates, why this song matters." maxLength={1000} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6"><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} disabled={busy}>{busy ? "Saving..." : "Save"}</Button></div>
          </DialogContent>
        </Dialog>
      </div>

      <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {songs.length === 0 && <div className="p-6 text-center text-muted-foreground text-sm bg-card border border-border rounded-sm">No songs.</div>}
        {songs.map((s) => (
          <div key={s.id} className="bg-card border border-border rounded-sm p-3 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{s.title}</div>
                {s.artist && <div className="text-xs text-muted-foreground truncate">{s.artist}</div>}
              </div>
              <Switch checked={s.status === "active"} onCheckedChange={() => toggleStatus(s)} />
            </div>
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              <span>Lyrics {s.lyrics ? "✓" : "—"}</span>
              <span>Synced {s.timed_lyrics && s.timed_lyrics.length > 0 ? `✓ ${s.timed_lyrics.length}` : "—"}</span>
            </div>
            <div className="flex items-center justify-end gap-1 pt-1 border-t border-border/50">
              <Button size="sm" variant="ghost" onClick={() => syncLyrics(s)} disabled={syncingId === s.id} title="Auto-sync">
                <Wand2 className={`h-4 w-4 ${syncingId === s.id ? "animate-pulse text-primary" : ""}`} />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => openEdit(s)}><Pencil className="h-4 w-4 mr-1" /> Edit</Button>
              <Button size="sm" variant="ghost" onClick={() => remove(s)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block bg-card border border-border rounded-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-popover text-xs uppercase tracking-widest text-muted-foreground">
            <tr><th className="px-4 py-3 text-left">Title</th><th className="text-left">Artist</th><th className="text-left">Lyrics</th><th className="text-left">Synced</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {songs.map((s) => (
              <tr key={s.id} className="border-t border-border">
                <td className="px-4 py-3">{s.title}</td>
                <td>{s.artist}</td>
                <td className="text-muted-foreground">{s.lyrics ? "✓" : "—"}</td>
                <td className="text-muted-foreground">{s.timed_lyrics && s.timed_lyrics.length > 0 ? `✓ ${s.timed_lyrics.length}` : "—"}</td>
                <td className="text-center"><Switch checked={s.status === "active"} onCheckedChange={() => toggleStatus(s)} /></td>
                <td className="text-right pr-4">
                  <Button size="icon" variant="ghost" onClick={() => syncLyrics(s)} disabled={syncingId === s.id} title="Auto-sync lyrics with audio">
                    <Wand2 className={`h-4 w-4 ${syncingId === s.id ? "animate-pulse text-primary" : ""}`} />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => remove(s)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </td>
              </tr>
            ))}
            {songs.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No songs.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminSongs;
