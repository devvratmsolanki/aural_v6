import { Outlet, Navigate, NavLink } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Music2, Tag, Users, BarChart3, LayoutDashboard, ArrowLeft, Menu } from "lucide-react";
import { usePlayer } from "@/contexts/PlayerContext";
import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const fmt = (s: number) => {
  if (!isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60).toString().padStart(2, "0");
  return `${m}:${ss}`;
};

const AdminLayout = () => {
  const { user, isAdmin, loading } = useAuth();
  const { current, position, duration } = usePlayer();
  const [open, setOpen] = useState(false);
  if (loading) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;

  const Item = ({ to, icon: Icon, label }: { to: string; icon: typeof Music2; label: string }) => (
    <NavLink to={to} end onClick={() => setOpen(false)} className={({ isActive }) =>
      `flex items-center gap-3 px-3 py-2 text-sm rounded-sm transition-colors ${isActive ? "bg-popover text-foreground" : "text-muted-foreground hover:text-foreground"}`
    }>
      <Icon className="h-4 w-4" /> {label}
    </NavLink>
  );

  const NavBody = (
    <>
      <NavLink to="/" onClick={() => setOpen(false)} className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="h-3 w-3" /> Back to app
      </NavLink>
      <div className="text-xs font-semibold tracking-[0.3em] text-primary mb-4">ADMIN</div>
      <Item to="/admin" icon={LayoutDashboard} label="Dashboard" />
      <Item to="/admin/songs" icon={Music2} label="Songs" />
      <Item to="/admin/tags" icon={Tag} label="Tags" />
      <Item to="/admin/users" icon={Users} label="Users" />
      <Item to="/admin/analytics" icon={BarChart3} label="Analytics" />
    </>
  );

  return (
    <div className="min-h-dvh flex bg-background text-foreground">
      <aside className="hidden md:flex w-60 bg-card border-r border-border p-6 flex-col gap-2 shrink-0">
        {NavBody}
      </aside>
      <main className="flex-1 p-4 md:p-8 overflow-y-auto min-w-0">
        <div className="md:hidden flex items-center gap-3 mb-4">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button aria-label="Open menu" className="p-2 -ml-2 text-foreground"><Menu className="h-5 w-5" /></button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-6 flex flex-col gap-2 bg-card">
              {NavBody}
            </SheetContent>
          </Sheet>
          <span className="text-xs font-semibold tracking-[0.3em] text-primary">ADMIN</span>
        </div>
        {current && (
          <div className="mb-4 inline-flex items-center gap-2 text-[11px] tabular-nums text-muted-foreground bg-popover/60 border border-border rounded-full px-3 py-1">
            <span className="size-1.5 rounded-full bg-primary animate-pulse" />
            <span className="text-foreground/80 truncate max-w-[200px]">{current.title}</span>
            <span>{fmt(position)} / {fmt(duration)}</span>
          </div>
        )}
        <Outlet />
      </main>
    </div>
  );
};

export default AdminLayout;
