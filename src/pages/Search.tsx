import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { Song } from "@/types/music";
import { SongRow } from "@/components/music/SongCard";
import { Input } from "@/components/ui/input";
import { escapeLikePattern } from "@/lib/utils";

const Search = () => {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [results, setResults] = useState<Song[]>([]);

  useEffect(() => {
    const t = setTimeout(() => {
      const term = q.trim();
      if (!term) { setResults([]); return; }
      setParams({ q: term }, { replace: true });
      const escaped = escapeLikePattern(term);
      supabase.from("songs").select("*, tag:tags(id,name)").eq("status", "active")
        .or(`title.ilike.%${escaped}%,artist.ilike.%${escaped}%`)
        .limit(50)
        .then(({ data }) => setResults((data as unknown as Song[]) ?? []));
    }, 250);
    return () => clearTimeout(t);
  }, [q, setParams]);

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-2xl font-semibold tracking-tight">Search</h1>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a song or artist..." className="max-w-lg" autoFocus />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {results.map((s) => <SongRow key={s.id} song={s} queue={results} />)}
      </div>
      {q && results.length === 0 && <p className="text-sm text-muted-foreground">No matches.</p>}
    </div>
  );
};

export default Search;
