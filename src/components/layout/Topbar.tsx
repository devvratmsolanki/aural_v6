import { Link, useNavigate } from "react-router-dom";
import { Search, User as UserIcon, Shield, LogOut, Settings } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { usePlayer } from "@/contexts/PlayerContext";
import logo from "@/assets/logo.png";

const fmt = (s: number) => {
  if (!isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60).toString().padStart(2, "0");
  return `${m}:${ss}`;
};

export const Topbar = () => {
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  const { user, isAdmin, signOut } = useAuth();
  const { current, position, duration } = usePlayer();
  const [profile, setProfile] = useState<{ name: string | null; avatar_url: string | null } | null>(null);

  useEffect(() => {
    if (!user) { setProfile(null); return; }
    supabase.from("profiles").select("name,avatar_url").eq("id", user.id).maybeSingle().then(({ data }) => setProfile(data ?? null));
  }, [user]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    navigate(`/search?q=${encodeURIComponent(q)}`);
  };

  return (
    <header className="h-16 md:h-20 flex items-center justify-between gap-3 px-4 md:px-10 shrink-0 border-b border-border bg-background/80 backdrop-blur">
      <Link to="/" className="flex items-center gap-2">
        <img src={logo} alt="mySunshine" className="h-7 w-7" />
        <span className="text-base font-display tracking-tight text-primary">mySunshine</span>
      </Link>
      <form onSubmit={submit} className="hidden md:flex items-center w-full max-w-sm bg-popover rounded-full border border-border px-4 py-2">
        <Search className="h-4 w-4 text-muted-foreground mr-3" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search songs, artists..."
          className="bg-transparent border-0 h-auto p-0 text-sm placeholder:text-muted-foreground focus-visible:ring-0"
        />
      </form>
      <div className="ml-auto flex items-center gap-2">
        {current && (
          <div className="hidden sm:flex items-center gap-2 text-[11px] tabular-nums text-muted-foreground bg-popover/60 border border-border rounded-full px-3 py-1">
            <span className="size-1.5 rounded-full bg-primary animate-pulse" />
            <span className="text-foreground/80 truncate max-w-[120px]">{current.title}</span>
            <span>{fmt(position)} / {fmt(duration)}</span>
          </div>
        )}
        <Link to="/search" className="md:hidden size-9 rounded-full bg-popover border border-border flex items-center justify-center" aria-label="Search">
          <Search className="h-4 w-4 text-silver" />
        </Link>
        {user ? (
          <Popover>
            <PopoverTrigger asChild>
              <button className="size-9 rounded-full bg-popover border border-border overflow-hidden flex items-center justify-center hover:border-primary transition-colors" aria-label="Profile">
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <UserIcon className="h-4 w-4 text-silver" />
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-60 p-0">
              <div className="p-4 flex items-center gap-3 border-b border-border">
                <div className="size-12 rounded-full bg-popover overflow-hidden ring-1 ring-border">
                  {profile?.avatar_url ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full bg-gradient-amber" />}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{profile?.name ?? "You"}</div>
                  <div className="text-[11px] text-muted-foreground truncate">{isAdmin ? "Admin" : "Listener"}</div>
                </div>
              </div>
              <div className="p-1">
                {isAdmin && (
                  <Link to="/admin" className="flex items-center gap-2 px-3 py-2 text-sm rounded-sm hover:bg-popover-foreground/5 text-foreground"><Shield className="h-4 w-4 text-muted-foreground" /> Admin panel</Link>
                )}
                <Link to="/profile" className="flex items-center gap-2 px-3 py-2 text-sm rounded-sm hover:bg-popover-foreground/5 text-foreground"><Settings className="h-4 w-4 text-muted-foreground" /> Profile settings</Link>
                <button onClick={() => signOut()} className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-sm hover:bg-popover-foreground/5 text-foreground">
                  <LogOut className="h-4 w-4 text-muted-foreground" /> Sign out
                </button>
              </div>
            </PopoverContent>
          </Popover>
        ) : (
          <Button asChild size="sm" variant="default"><Link to="/auth">Sign in</Link></Button>
        )}
      </div>
    </header>
  );
};
