import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { Song } from "@/types/music";
import { SongRow } from "@/components/music/SongCard";
import { Heart } from "lucide-react";

const Liked = () => {
  const { user } = useAuth();
  const [songs, setSongs] = useState<Song[]>([]);

  useEffect(() => {
    if (!user) return;
    supabase.from("favorites").select("song:songs(*, tag:tags(id,name))").eq("user_id", user.id).order("created_at", { ascending: false })
      .then(({ data }) => setSongs(((data ?? []).map((r) => r.song).filter(Boolean)) as unknown as Song[]));
  }, [user]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-4">
        <div className="size-20 bg-gradient-amber rounded-sm flex items-center justify-center shadow-glow">
          <Heart className="h-8 w-8 text-primary-foreground fill-current" />
        </div>
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Playlist</p>
          <h1 className="text-3xl font-semibold tracking-tight">Liked Songs</h1>
          <p className="text-sm text-muted-foreground mt-1">{songs.length} song{songs.length === 1 ? "" : "s"}</p>
        </div>
      </div>
      <div className="space-y-2">
        {songs.map((s) => <SongRow key={s.id} song={s} queue={songs} />)}
        {songs.length === 0 && <p className="text-sm text-muted-foreground">Heart a song from anywhere to add it here.</p>}
      </div>
    </div>
  );
};

export default Liked;
