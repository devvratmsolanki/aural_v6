# Supabase Setup Guide

This app (built on Lovable Cloud) uses Supabase under the hood. To deploy it on **your own Supabase project**, follow this guide.

---

## 1. Create a Supabase project

1. Go to https://supabase.com/dashboard and create a new project.
2. Note the **Project URL** and **anon public key** (Settings → API).
3. Note the **service role key** (only used by edge functions / admin scripts — keep secret).

---

## 2. Apply the database schema

You have two options:

### Option A — One-shot SQL (fastest)
1. Open **SQL Editor** in your new Supabase dashboard.
2. Paste the contents of `supabase_schema.sql` (included in this zip).
3. Run it. This creates all tables, enums, RLS policies, functions and triggers.

### Option B — Migrations (recommended for ongoing work)
1. Install Supabase CLI: `npm i -g supabase`
2. `supabase login`
3. `supabase link --project-ref <YOUR_PROJECT_REF>`
4. `supabase db push` — this applies every file inside `supabase/migrations/` in order.

---

## 3. Storage buckets

Create these buckets in **Storage**:

| Bucket name   | Public | Notes                                  |
|---------------|--------|----------------------------------------|
| `covers`      | Yes    | Song cover art                         |
| `audio`       | No     | Song audio files (signed URLs only)    |
| `avatars`     | Yes    | User avatars                           |
| `voice-notes` | Yes    | Voice notes attached to songs          |

For the `audio` bucket (private) add this RLS policy on `storage.objects`:
```sql
CREATE POLICY "authenticated read audio"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'audio');

CREATE POLICY "admins write audio"
ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'audio' AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (bucket_id = 'audio' AND public.has_role(auth.uid(), 'admin'));
```

For `voice-notes` (used by both admin & sunshine):
```sql
CREATE POLICY "authenticated read voice-notes"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'voice-notes');

CREATE POLICY "users write own voice-notes"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'voice-notes' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "users delete own voice-notes"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'voice-notes' AND auth.uid()::text = (storage.foldername(name))[1]);
```

---

## 4. Authentication

In **Authentication → Providers**:
- Enable **Email** (turn off "Confirm email" if you want instant sign-ups for the two of you).
- Set **Site URL** and **Redirect URLs** to your deployed domain (e.g. `https://yourapp.com`).

---

## 5. Edge Functions

The `supabase/functions/` folder contains:
- `admin-create-user`
- `admin-delete-user`
- `admin-delete-song`
- `bootstrap-admin`
- `recommend`
- `sync-lyrics`

Deploy each:
```bash
supabase functions deploy admin-create-user
supabase functions deploy admin-delete-user
supabase functions deploy admin-delete-song
supabase functions deploy bootstrap-admin
supabase functions deploy recommend
supabase functions deploy sync-lyrics
```

### Required function secrets
Set in **Project Settings → Edge Functions → Secrets** (or via CLI `supabase secrets set KEY=value`):

| Secret                      | Used by                              | Notes                              |
|-----------------------------|--------------------------------------|------------------------------------|
| `SUPABASE_URL`              | all                                  | Auto-provided by Supabase          |
| `SUPABASE_ANON_KEY`         | all                                  | Auto-provided                      |
| `SUPABASE_SERVICE_ROLE_KEY` | admin-* functions, bootstrap-admin   | Auto-provided                      |
| `LOVABLE_API_KEY`           | `recommend`, `sync-lyrics`           | Optional — only if using Lovable AI Gateway. Otherwise replace with `OPENAI_API_KEY` and update the function code. |
| `OPENAI_API_KEY`            | optional fallback for AI calls       | Get from https://platform.openai.com |

---

## 6. Bootstrap the admin (you, PJ)

1. Sign up via the app's `/auth` page using your email + password.
2. Call the `bootstrap-admin` edge function once to grant yourself the admin role:
   ```bash
   curl -X POST https://<YOUR_PROJECT_REF>.functions.supabase.co/bootstrap-admin \
     -H "Authorization: Bearer <YOUR_ACCESS_TOKEN>"
   ```
   Or just hit it from the browser console while logged in.
3. Sunshine signs up normally — she'll get the default `user` role.

---

## 7. Frontend env vars

Create a `.env` in the project root:

```
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<your-anon-key>
VITE_SUPABASE_PROJECT_ID=<your-project-ref>
```

Then:
```bash
npm install
npm run build
```

Deploy the `dist/` folder to Vercel / Netlify / Cloudflare Pages / wherever.

---

## 8. Files in this archive

- `supabase_schema.sql` — full public-schema dump (tables, enums, RLS, functions, triggers).
- `supabase/migrations/` — individual timestamped migrations (use with Supabase CLI).
- `supabase/functions/` — edge function source.
- `supabase/config.toml` — function-level config.
- everything else — the React app source.

---

## Troubleshooting

- **"new row violates RLS"** → make sure you ran the *full* schema file (policies are at the bottom).
- **Voice notes 403** → check the `voice-notes` bucket policies above.
- **Admin pages 403** → confirm `user_roles` has a row with `role='admin'` for your user_id.
- **Edge function 500** → check function logs in Supabase dashboard; usually a missing secret.

Made with love for you & sunshine 💌
