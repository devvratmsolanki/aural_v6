import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Row { name: string; count: number }

const AdminAnalytics = () => {
  const [topSongs, setTopSongs] = useState<Row[]>([]);
  const [topTags, setTopTags] = useState<Row[]>([]);
  const [activeUsers, setActiveUsers] = useState(0);

  useEffect(() => {
    (async () => {
      const { data: hist } = await supabase.from("play_history").select("song_id, song:songs(title, tag:tags(name))").order("played_at", { ascending: false }).limit(2000);
      const songMap = new Map<string, Row>();
      const tagMap = new Map<string, Row>();
      (hist ?? []).forEach((r: any) => {
        const title = r.song?.title;
        if (title) { const cur = songMap.get(title) ?? { name: title, count: 0 }; cur.count++; songMap.set(title, cur); }
        const tname = r.song?.tag?.name;
        if (tname) { const cur = tagMap.get(tname) ?? { name: tname, count: 0 }; cur.count++; tagMap.set(tname, cur); }
      });
      setTopSongs(Array.from(songMap.values()).sort((a, b) => b.count - a.count).slice(0, 10));
      setTopTags(Array.from(tagMap.values()).sort((a, b) => b.count - a.count).slice(0, 10));

      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: ua } = await supabase.from("play_history").select("user_id").gte("played_at", since);
      setActiveUsers(new Set((ua ?? []).map((r: any) => r.user_id)).size);
    })();
  }, []);

  const Bar = ({ label, count, max }: { label: string; count: number; max: number }) => (
    <div>
      <div className="flex justify-between text-xs mb-1"><span className="truncate pr-2">{label}</span><span className="text-muted-foreground tabular-nums">{count}</span></div>
      <div className="h-1 bg-popover rounded-full overflow-hidden"><div className="h-full bg-filament" style={{ width: `${(count / max) * 100}%` }} /></div>
    </div>
  );

  const maxS = Math.max(1, ...topSongs.map((r) => r.count));
  const maxT = Math.max(1, ...topTags.map((r) => r.count));

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
      <div className="bg-card border border-border rounded-sm p-6">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Active users (last 30 days)</div>
        <div className="text-3xl font-semibold mt-2 text-primary">{activeUsers}</div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-sm p-6 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-2">Most played songs</h2>
          {topSongs.length === 0 ? <p className="text-sm text-muted-foreground">No play history yet.</p> :
            topSongs.map((r) => <Bar key={r.name} label={r.name} count={r.count} max={maxS} />)}
        </div>
        <div className="bg-card border border-border rounded-sm p-6 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-2">Popular tags</h2>
          {topTags.length === 0 ? <p className="text-sm text-muted-foreground">No data yet.</p> :
            topTags.map((r) => <Bar key={r.name} label={r.name} count={r.count} max={maxT} />)}
        </div>
      </div>
    </div>
  );
};

export default AdminAnalytics;
