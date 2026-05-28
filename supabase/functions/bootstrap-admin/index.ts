// One-shot bootstrap: creates (or resets) the default admin user.
// Safe to call only when no admins exist OR when targeting the seed username.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ACCOUNTS: { username: string; password: string; name: string; isAdmin: boolean }[] = [
  { username: "admin", password: "Sunshine@2026", name: "Admin", isAdmin: true },
  { username: "sunshine", password: "Sunshine@2026", name: "Sunshine", isAdmin: false },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // SECURITY: this function is unauthenticated (verify_jwt = false) so it can
    // seed the very first admin. Once an admin exists it must be a no-op —
    // otherwise anyone on the internet could POST here to reset the admin
    // password to the seed value and take over the account.
    const { count: adminCount } = await admin
      .from("user_roles")
      .select("user_id", { count: "exact", head: true })
      .eq("role", "admin");
    if ((adminCount ?? 0) > 0) {
      return new Response(JSON.stringify({ ok: true, skipped: "admin already exists" }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (listErr) throw listErr;

    const out: { username: string; password: string; role: string }[] = [];
    for (const acc of ACCOUNTS) {
      const email = `${acc.username}@mysunshine.local`;
      const existing = list.users.find((u) => u.email === email);
      let userId: string;
      if (existing) {
        const { error } = await admin.auth.admin.updateUserById(existing.id, {
          password: acc.password,
          email_confirm: true,
          user_metadata: { ...existing.user_metadata, name: acc.name, username: acc.username },
        });
        if (error) throw error;
        userId = existing.id;
      } else {
        const { data: created, error } = await admin.auth.admin.createUser({
          email, password: acc.password, email_confirm: true,
          user_metadata: { name: acc.name, username: acc.username },
        });
        if (error) throw error;
        userId = created.user!.id;
      }
      if (acc.isAdmin) {
        await admin.from("user_roles").upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id,role" });
      }
      out.push({ username: acc.username, password: acc.password, role: acc.isAdmin ? "admin" : "user" });
    }

    return new Response(JSON.stringify({ ok: true, accounts: out }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});