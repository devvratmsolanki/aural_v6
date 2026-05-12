import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const Stat = ({ label, value }: { label: string; value: number | string }) => (
  <div className="bg-card border border-border rounded-sm p-6">
    <div className="text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
    <div className="text-3xl font-semibold mt-2 text-primary">{value}</div>
  </div>
);

const AdminDashboard = () => {
  const [stats, setStats] = useState({ users: 0, songs: 0, active: 0, inactive: 0, playlists: 0, tags: 0 });

  useEffect(() => {
    (async () => {
      const [u, s, act, ina, pl, tg] = await Promise.all([
        supabase.from("profiles").select("*", { count: "exact", head: true }),
        supabase.from("songs").select("*", { count: "exact", head: true }),
        supabase.from("songs").select("*", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("songs").select("*", { count: "exact", head: true }).eq("status", "inactive"),
        supabase.from("playlists").select("*", { count: "exact", head: true }),
        supabase.from("tags").select("*", { count: "exact", head: true }),
      ]);
      setStats({ users: u.count ?? 0, songs: s.count ?? 0, active: act.count ?? 0, inactive: ina.count ?? 0, playlists: pl.count ?? 0, tags: tg.count ?? 0 });
    })();
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Stat label="Total users" value={stats.users} />
        <Stat label="Total songs" value={stats.songs} />
        <Stat label="Active songs" value={stats.active} />
        <Stat label="Inactive songs" value={stats.inactive} />
        <Stat label="Playlists" value={stats.playlists} />
        <Stat label="Tags" value={stats.tags} />
      </div>
    </div>
  );
};

export default AdminDashboard;
