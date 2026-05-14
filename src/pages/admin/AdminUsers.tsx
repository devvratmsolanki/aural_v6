import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Trash2, Plus, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usernameToEmail } from "@/lib/auth";

interface Row { id: string; name: string | null; status: string; playlists?: number; isAdmin?: boolean }

const AdminUsers = () => {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", username: "", password: "", admin: false });
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [{ data: profiles }, { data: adminRoles }] = await Promise.all([
      supabase.from("profiles").select("id,name,status").order("created_at", { ascending: true }),
      supabase.from("user_roles").select("user_id").eq("role", "admin"),
    ]);
    const adminIds = new Set((adminRoles ?? []).map((r) => r.user_id));
    const out = await Promise.all((profiles ?? []).map(async (p) => {
      const { count } = await supabase.from("playlists").select("*", { count: "exact", head: true }).eq("user_id", p.id);
      return { ...p, playlists: count ?? 0, isAdmin: adminIds.has(p.id) } as Row;
    }));
    setRows(out);
  };
  useEffect(() => { load(); }, []);

  const toggle = async (r: Row) => {
    if (r.isAdmin) return;
    await supabase.from("profiles").update({ status: r.status === "active" ? "disabled" : "active" }).eq("id", r.id);
    load();
  };

  const remove = async (r: Row) => {
    if (r.isAdmin || r.id === user?.id) return;
    if (!confirm(`Delete ${r.name ?? "this user"}? This removes all their data.`)) return;
    const { data, error } = await supabase.functions.invoke("admin-delete-user", { body: { user_id: r.id } });
    if (error || (data as any)?.error) toast.error(error?.message ?? (data as any).error);
    else { toast.success("User deleted"); load(); }
  };

  const create = async () => {
    if (!form.username || !form.password) { toast.error("Username & password required"); return; }
    if (!/^[a-zA-Z0-9_.-]+$/.test(form.username)) { toast.error("Letters, numbers, . _ - only"); return; }
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("admin-create-user", {
      body: { name: form.name || form.username, email: usernameToEmail(form.username), password: form.password, admin: form.admin },
    });
    setBusy(false);
    if (error || (data as any)?.error) { toast.error(error?.message ?? (data as any).error); return; }
    toast.success("User created");
    setOpen(false); setForm({ name: "", username: "", password: "", admin: false }); load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />New user</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create user</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Display name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label>Username</Label><Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })} placeholder="lowercase letters, numbers" /></div>
              <div><Label>Password</Label><Input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Min 6 characters" /></div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.admin} onChange={(e) => setForm({ ...form, admin: e.target.checked })} /> Make this user an admin</label>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={create} disabled={busy}>{busy ? "Creating..." : "Create"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {rows.length === 0 && <div className="p-6 text-center text-muted-foreground text-sm bg-card border border-border rounded-sm">No users.</div>}
        {rows.map((r) => {
          const isYou = r.id === user?.id;
          const protected_ = r.isAdmin || isYou;
          return (
            <div key={r.id} className="bg-card border border-border rounded-sm p-3 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate flex items-center gap-1.5">
                  {r.name ?? "—"}
                  {isYou && <span className="text-[10px] text-muted-foreground">(you)</span>}
                  {r.isAdmin && <ShieldCheck className="h-3.5 w-3.5 text-primary shrink-0" />}
                </div>
                <div className="text-[11px] text-muted-foreground">{r.playlists} playlist{r.playlists === 1 ? "" : "s"}</div>
              </div>
              <Switch checked={r.status === "active"} onCheckedChange={() => toggle(r)} disabled={r.isAdmin} />
              {!protected_
                ? <Button size="icon" variant="ghost" onClick={() => remove(r)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                : <div className="w-8 shrink-0" />}
            </div>
          );
        })}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block bg-card border border-border rounded-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-popover text-xs uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">Name</th>
              <th className="px-4 text-left">Role</th>
              <th className="text-left">Playlists</th>
              <th>Active</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isYou = r.id === user?.id;
              const protected_ = r.isAdmin || isYou;
              return (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1.5">
                      {r.name ?? "—"}
                      {isYou && <span className="text-[10px] text-muted-foreground">(you)</span>}
                    </span>
                  </td>
                  <td className="px-4 text-muted-foreground">
                    {r.isAdmin
                      ? <span className="inline-flex items-center gap-1 text-primary text-xs font-medium"><ShieldCheck className="h-3.5 w-3.5" />admin</span>
                      : <span className="text-xs">user</span>}
                  </td>
                  <td className="text-muted-foreground">{r.playlists}</td>
                  <td className="text-center">
                    <Switch checked={r.status === "active"} onCheckedChange={() => toggle(r)} disabled={r.isAdmin} />
                  </td>
                  <td className="text-right pr-4">
                    {!protected_ && (
                      <Button size="icon" variant="ghost" onClick={() => remove(r)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No users.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminUsers;
