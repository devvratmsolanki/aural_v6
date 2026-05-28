import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { LogOut, X } from "lucide-react";
import { emailToUsername } from "@/lib/auth";
import { useNavigate } from "react-router-dom";

const Profile = () => {
  const { user, signOut, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pwBusy, setPwBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("name,avatar_url").eq("id", user.id).maybeSingle().then(({ data }) => {
      setName(data?.name ?? "");
      setAvatar(data?.avatar_url ?? null);
    });
  }, [user]);

  const upload = async (file: File) => {
    if (!user) return;
    // Best-effort: remove the old avatar file before uploading the new one so
    // stale files don't accumulate in the avatars bucket.
    if (avatar) {
      try {
        // The public URL is of the form: .../storage/v1/object/public/avatars/<path>
        // Extract everything after "/avatars/" as the storage object path.
        const marker = "/object/public/avatars/";
        const idx = avatar.indexOf(marker);
        if (idx !== -1) {
          const oldPath = avatar.slice(idx + marker.length);
          if (oldPath) await supabase.storage.from("avatars").remove([oldPath]);
        }
      } catch { /* ignore — old file removal is best-effort */ }
    }
    const path = `${user.id}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (error) { toast.error(error.message); return; }
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    setAvatar(data.publicUrl);
    await supabase.from("profiles").update({ avatar_url: data.publicUrl }).eq("id", user.id);
    await refreshProfile();
    toast.success("Avatar updated");
  };

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ name: name.slice(0, 100) }).eq("id", user.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    await refreshProfile();
    toast.success("Saved");
  };

  const changePassword = async () => {
    if (!user?.email) return;
    if (oldPw.length < 1 || newPw.length < 6) { toast.error("New password must be 6+ characters"); return; }
    setPwBusy(true);
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email: user.email, password: oldPw });
    if (signInErr) { setPwBusy(false); toast.error("Current password is incorrect"); return; }
    const { error } = await supabase.auth.updateUser({ password: newPw });
    setPwBusy(false);
    if (error) toast.error(error.message);
    else { toast.success("Password updated"); setOldPw(""); setNewPw(""); }
  };

  return (
    <div className="max-w-md space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Your profile</h1>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={signOut} className="text-muted-foreground hover:text-foreground">
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </Button>
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Close" className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="size-20 rounded-full bg-popover overflow-hidden ring-1 ring-border">
          {avatar ? <img src={avatar} alt="avatar" className="w-full h-full object-cover" /> : <div className="w-full h-full bg-gradient-amber" />}
        </div>
        <Input type="file" accept="image/*" onChange={(e) => e.target.files && upload(e.target.files[0])} />
      </div>
      <div>
        <Label htmlFor="name">Name</Label>
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
      </div>
      <div className="text-sm text-muted-foreground">Username: {emailToUsername(user?.email)}</div>
      <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save changes"}</Button>

      <div className="pt-8 border-t border-border space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Change password</h2>
        <div><Label htmlFor="old-pw">Current password</Label><Input id="old-pw" type="password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} autoComplete="current-password" /></div>
        <div><Label htmlFor="new-pw">New password</Label><Input id="new-pw" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" /></div>
        <Button onClick={changePassword} disabled={pwBusy || !oldPw || !newPw}>{pwBusy ? "Updating..." : "Update password"}</Button>
      </div>
    </div>
  );
};

export default Profile;
