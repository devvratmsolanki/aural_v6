import { Link, useNavigate, useLocation } from "react-router-dom";
import { Search, User as UserIcon, Shield, LogOut, Settings, Bell, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { usePlayer } from "@/contexts/PlayerContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import logo from "@/assets/logo.png";

const fmt = (s: number) => {
  if (!isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60).toString().padStart(2, "0");
  return `${m}:${ss}`;
};

interface Notif {
  id: string;
  type: "voice_note" | "letter" | "private_note";
  song_id: string;
  song_title: string;
  sender_name: string;
  read_at: string | null;
  created_at: string;
}

export const Topbar = () => {
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAdmin, profile, signOut } = useAuth();
  const { current, position, duration } = usePlayer();
  const [notifs, setNotifs] = useState<Notif[]>([]);

  const loadNotifs = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("recipient_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30);
    setNotifs((data as Notif[]) ?? []);
  }, [user]);

  useEffect(() => { loadNotifs(); }, [loadNotifs]);

  // Real-time: toast + add to list when a new notification arrives
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`notifs:${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${user.id}` },
        (payload) => {
          const n = payload.new as Notif;
          setNotifs((prev) => [n, ...prev]);
          const label = n.type === "voice_note" ? "voice note 🎤" : n.type === "private_note" ? "private note 🔒" : "letter 💌";
          toast(`${n.sender_name} sent you a ${label}`, { description: n.song_title });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const markAllRead = async () => {
    const unread = notifs.filter((n) => !n.read_at).map((n) => n.id);
    if (!unread.length) return;
    const ts = new Date().toISOString();
    const { error } = await supabase.from("notifications").update({ read_at: ts }).in("id", unread);
    if (error) return; // leave them unread; next open retries
    setNotifs((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? ts })));
  };

  const dismiss = async (id: string) => {
    await supabase.from("notifications").delete().eq("id", id);
    setNotifs((prev) => prev.filter((n) => n.id !== id));
  };

  const clearAll = async () => {
    if (!user) return;
    await supabase.from("notifications").delete().eq("recipient_id", user.id);
    setNotifs([]);
  };

  const unreadCount = notifs.filter((n) => !n.read_at).length;

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
      <form onSubmit={submit} className={`hidden md:flex items-center w-full max-w-sm bg-popover rounded-full border border-border px-4 py-2 ${location.pathname === "/search" ? "invisible pointer-events-none" : ""}`}>
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

        {/* Notification bell — only for non-admin users */}
        {user && !isAdmin && (
          <Popover onOpenChange={(open) => { if (open) markAllRead(); }}>
            <PopoverTrigger asChild>
              <button className="relative size-9 rounded-full bg-popover border border-border flex items-center justify-center hover:border-primary transition-colors" aria-label="Notifications">
                <Bell className="h-4 w-4 text-silver" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full bg-primary text-[9px] font-bold text-primary-foreground flex items-center justify-center px-1">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-0">
              <div className="p-3 border-b border-border flex items-center justify-between">
                <span className="text-sm font-medium">Notifications</span>
                {notifs.length > 0 && (
                  <button onClick={clearAll} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                    Clear all
                  </button>
                )}
              </div>
              <div className="max-h-72 overflow-y-auto">
                {notifs.length === 0 && (
                  <p className="p-4 text-sm text-muted-foreground text-center">Nothing here yet</p>
                )}
                {notifs.map((n) => (
                  <div key={n.id} className={`p-3 border-b border-border last:border-0 flex items-start gap-3 ${!n.read_at ? "bg-primary/5" : ""}`}>
                    <span className="text-base shrink-0 mt-0.5">{n.type === "voice_note" ? "🎤" : n.type === "private_note" ? "🔒" : "💌"}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm leading-snug">
                        <span className="font-medium">{n.sender_name}</span>{" "}
                        left you a {n.type === "voice_note" ? "voice note" : n.type === "private_note" ? "private note" : "letter"}
                      </p>
                      {n.song_title && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{n.song_title}</p>
                      )}
                    </div>
                    <button onClick={() => dismiss(n.id)} className="text-muted-foreground hover:text-foreground shrink-0 mt-0.5 transition-colors" aria-label="Dismiss">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        )}

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
