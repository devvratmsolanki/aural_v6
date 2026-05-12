import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tag } from "@/types/music";

interface Props { value: string[]; onChange: (ids: string[]) => void }

export const TagFilter = ({ value, onChange }: Props) => {
  const [tags, setTags] = useState<Tag[]>([]);
  useEffect(() => {
    (async () => {
      const [{ data: allTags }, { data: used }] = await Promise.all([
        supabase.from("tags").select("*").order("name"),
        supabase.from("song_tags").select("tag_id"),
      ]);
      const usedIds = new Set((used ?? []).map((r: any) => r.tag_id));
      setTags((allTags ?? []).filter((t: any) => usedIds.has(t.id)));
    })();
  }, []);
  const toggle = (id: string) => {
    if (value.includes(id)) onChange(value.filter((v) => v !== id));
    else onChange([...value, id]);
  };
  const Btn = ({ id, label, active, onClick }: { id: string | null; label: string; active: boolean; onClick: () => void }) => (
    <button
      onClick={onClick}
      className={`px-4 py-1.5 rounded-full border text-xs font-medium tracking-wide transition-colors ${
        active ? "border-primary text-primary bg-primary/5" : "border-border text-muted-foreground hover:text-silver hover:border-muted-foreground"
      }`}
    >
      {label}
    </button>
  );
  return (
    <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
      <Btn id={null} label="All" active={value.length === 0} onClick={() => onChange([])} />
      {tags.map((t) => <Btn key={t.id} id={t.id} label={t.name} active={value.includes(t.id)} onClick={() => toggle(t.id)} />)}
    </div>
  );
};
