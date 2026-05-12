import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { z } from "zod";
import { Eye, EyeOff } from "lucide-react";
import logo from "@/assets/logo.png";
import { usernameToEmail } from "@/lib/auth";

const signInSchema = z.object({
  username: z.string().trim().min(1, "Username required").max(64).regex(/^[a-zA-Z0-9_.-]+$/, "Letters, numbers, . _ - only"),
  password: z.string().min(1, "Password required").max(100),
});

const Auth = () => {
  const { user, signIn } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const onSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const parsed = signInSchema.safeParse({ username: f.get("username"), password: f.get("password") });
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    setLoading(true);
    const { error } = await signIn(usernameToEmail(parsed.data.username), parsed.data.password);
    setLoading(false);
    if (error) toast.error(error); else { toast.success("Welcome back"); navigate("/"); }
  };

  return (
    <div className="min-h-dvh flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex flex-col items-center gap-3 mb-4">
            <img src={logo} alt="mySunshine" className="h-20 w-20 drop-shadow-[0_0_20px_hsl(var(--primary)/0.4)]" />
            <h1 className="text-2xl font-display tracking-tight text-primary">mySunshine</h1>
          </div>
          <p className="text-sm text-muted-foreground italic">From me to you, my Sunshine.</p>
        </div>

        <div className="bg-card border border-border rounded-md p-6">
          <h2 className="text-sm font-medium mb-6 text-center text-muted-foreground tracking-widest uppercase">Sign in</h2>
          <form onSubmit={onSignIn} className="space-y-4">
            <div><Label htmlFor="si-username">Username</Label><Input id="si-username" name="username" type="text" autoComplete="username" required maxLength={64} /></div>
            <div>
              <Label htmlFor="si-pw">Password</Label>
              <div className="relative">
                <Input id="si-pw" name="password" type={showPw ? "text" : "password"} autoComplete="current-password" required maxLength={100} className="pr-10" />
                <button type="button" onClick={() => setShowPw((s) => !s)} aria-label={showPw ? "Hide password" : "Show password"} className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground">
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" disabled={loading} className="w-full">{loading ? "Signing in..." : "Sign in"}</Button>
          </form>
          <p className="text-[11px] text-muted-foreground mt-6 text-center">Accounts are created by an administrator. Contact your admin if you need access.</p>
        </div>
      </div>
    </div>
  );
};

export default Auth;
