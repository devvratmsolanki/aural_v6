import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Tag } from "@/types/music";

const AdminTags = () => {
  const [tags, setTags] = useState<Tag[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{ id?: string; name: string; remarks: string }>({ name: "", remarks: "" });

  const load = () => supabase.from("tags").select("*").order("name").then(({ data }) => setTags(data ?? []));
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.name.trim()) { toast.error("Name required"); return; }
    if (form.id) await supabase.from("tags").update({ name: form.name.slice(0, 80), remarks: form.remarks }).eq("id", form.id);
    else {
      const { error } = await supabase.from("tags").insert({ name: form.name.slice(0, 80), remarks: form.remarks });
      if (error) { toast.error(error.message); return; }
    }
    setOpen(false); setForm({ name: "", remarks: "" }); load();
  };

  const remove = async (t: Tag) => {
    const { count } = await supabase.from("songs").select("*", { count: "exact", head: true }).eq("tag_id", t.id);
    if ((count ?? 0) > 0) { toast.error("Cannot delete: tag is used by songs"); return; }
    if (!confirm(`Delete tag "${t.name}"?`)) return;
    await supabase.from("tags").delete().eq("id", t.id); load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Tags</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button onClick={() => setForm({ name: "", remarks: "" })}><Plus className="h-4 w-4 mr-2" />New tag</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{form.id ? "Edit" : "New"} tag</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={80} /></div>
              <div><Label>Remarks</Label><Input value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} /></div>
            </div>
            <div className="flex justify-end gap-2 mt-4"><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save}>Save</Button></div>
          </DialogContent>
        </Dialog>
      </div>
      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {tags.length === 0 && <div className="p-6 text-center text-muted-foreground text-sm bg-card border border-border rounded-sm">No tags.</div>}
        {tags.map((t) => (
          <div key={t.id} className="bg-card border border-border rounded-sm p-3 flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="font-medium truncate">{t.name}</div>
              {t.remarks && <div className="text-[11px] text-muted-foreground truncate">{t.remarks}</div>}
            </div>
            <Button size="icon" variant="ghost" onClick={() => { setForm({ id: t.id, name: t.name, remarks: t.remarks ?? "" }); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" onClick={() => remove(t)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </div>
        ))}
      </div>
      {/* Desktop table */}
      <div className="hidden md:block bg-card border border-border rounded-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-popover text-xs uppercase tracking-widest text-muted-foreground"><tr><th className="px-4 py-3 text-left">Name</th><th className="text-left">Remarks</th><th></th></tr></thead>
          <tbody>
            {tags.map((t) => (
              <tr key={t.id} className="border-t border-border">
                <td className="px-4 py-3">{t.name}</td>
                <td className="text-muted-foreground">{t.remarks}</td>
                <td className="text-right pr-4">
                  <Button size="icon" variant="ghost" onClick={() => { setForm({ id: t.id, name: t.name, remarks: t.remarks ?? "" }); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => remove(t)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminTags;
