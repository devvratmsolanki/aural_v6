import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Song } from "@/types/music";
import { SongRow, PolaroidCard } from "@/components/music/SongCard";
import { TagFilter } from "@/components/music/TagFilter";
import { List, Image as ImageIcon, Shuffle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { usePlayer } from "@/contexts/PlayerContext";
import { uuidList } from "@/lib/utils";

type View = "polaroid" | "list";
type Scope = "all" | "new" | "liked";

const Home = () => {
  const { user } = useAuth();
  const { playShuffle } = usePlayer();
  const [tags, setTags] = useState<string[]>([]);
  const [songs, setSongs] = useState<Song[]>([]);
  const [view, setView] = useState<View>(() => {
    const v = localStorage.getItem("home:view") as View | null;
    return v === "list" ? "list" : "polaroid";
  });
  const [scope, setScope] = useState<Scope>(() => (localStorage.getItem("home:scope") as Scope) || "all");

  const setAndStore = (v: View) => { setView(v); localStorage.setItem("home:view", v); };
  const setScopeStore = (s: Scope) => { setScope(s); localStorage.setItem("home:scope", s); };

  // On each browser session, if there are unplayed songs switch to "New" tab
  useEffect(() => {
    if (!user) return;
    const sessionKey = `aural:new-check:${user.id}`;
    if (sessionStorage.getItem(sessionKey)) return;
    sessionStorage.setItem(sessionKey, "1");
    (async () => {
      const { data: played } = await supabase.from("play_history").select("song_id").eq("user_id", user.id);
      const playedIds = uuidList((played ?? []).map((r) => r.song_id as string));
      if (playedIds.length === 0) { setScopeStore("new"); return; }
      const { count } = await supabase.from("songs").select("id", { count: "exact", head: true })
        .eq("status", "active")
        .not("id", "in", `(${playedIds.join(",")})`);
      if ((count ?? 0) > 0) setScopeStore("new");
    })();
  }, [user?.id]);

  useEffect(() => {
    (async () => {
      let songIds: string[] | null = null;
      if (tags.length > 0) {
        const { data: rows } = await supabase.from("song_tags").select("song_id").in("tag_id", tags);
        songIds = Array.from(new Set((rows ?? []).map((r) => r.song_id as string)));
        if (songIds.length === 0) { setSongs([]); return; }
      }
      if (scope === "liked") {
        if (!user) { setSongs([]); return; }
        const { data } = await supabase.from("favorites").select("song:songs(*, tag:tags(id,name))").eq("user_id", user.id).order("created_at", { ascending: false });
        let list = ((data ?? []).map((r) => r.song).filter(Boolean)) as unknown as Song[];
        if (songIds) list = list.filter((s) => songIds!.includes(s.id));
        setSongs(list);
        return;
      }
      let excludeIds: string[] = [];
      if (scope === "new") {
        const { data: played } = await supabase.from("play_history").select("song_id").eq("user_id", user!.id).limit(2000);
        excludeIds = uuidList(Array.from(new Set((played ?? []).map((r) => r.song_id as string))));
      }
      let q = supabase.from("songs").select("*, tag:tags(id,name)").eq("status", "active").order("created_at", { ascending: false }).limit(48);
      if (songIds) q = q.in("id", songIds);
      if (excludeIds.length) q = q.not("id", "in", `(${excludeIds.join(",")})`);
      const { data } = await q;
      setSongs((data as unknown as Song[]) ?? []);
    })();
  }, [tags, scope, user]);

  const Tab = ({ k, label }: { k: Scope; label: string }) => (
    <button onClick={() => setScopeStore(k)} className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${scope === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{label}</button>
  );

  return (
    <div className="space-y-8 animate-fade-in">
      <TagFilter value={tags} onChange={setTags} />
      {tags.length > 1 && (
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground -mt-6">Showing songs matching any selected genre</p>
      )}

      <section>
        <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
          <div className="flex items-center gap-1 bg-popover/60 border border-border rounded-full p-1 overflow-x-auto">
            <Tab k="all" label="All" />
            <Tab k="new" label="New" />
            <Tab k="liked" label="My favs" />
            <button
              onClick={() => songs.length && playShuffle(songs)}
              disabled={songs.length === 0}
              aria-label="Shuffle play"
              title="Shuffle play"
              className="size-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 disabled:hover:text-muted-foreground"
            >
              <Shuffle className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-center gap-1 bg-popover/60 border border-border rounded-full p-1">
            <button onClick={() => setAndStore("polaroid")} aria-label="Polaroid view" className={`size-8 rounded-full flex items-center justify-center transition-colors ${view === "polaroid" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}><ImageIcon className="h-4 w-4" /></button>
            <button onClick={() => setAndStore("list")} aria-label="List view" className={`size-8 rounded-full flex items-center justify-center transition-colors ${view === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}><List className="h-4 w-4" /></button>
          </div>
        </div>
        {songs.length === 0 ? (
          <p className="text-sm text-muted-foreground">{scope === "liked" ? "No favs yet — tap the heart on a song to save it here." : scope === "new" ? "Nothing new — every song has been played at least once." : "No songs yet — ask an admin to add some."}</p>
        ) : view === "polaroid" ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6 md:gap-8 pt-2">
            {songs.map((s, i) => <PolaroidCard key={s.id} song={s} queue={songs} index={i} />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {songs.map((s) => <SongRow key={s.id} song={s} queue={songs} />)}
          </div>
        )}
      </section>
    </div>
  );
};

export default Home;
