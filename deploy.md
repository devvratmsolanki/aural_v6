# Deploying Aural on a Bare-Metal Ubuntu Server

This guide covers two things:

1. **Deploying the frontend** (the React/Vite app in this repo) on Ubuntu behind Nginx with HTTPS.
2. **Migrating the backend & database** off Lovable Cloud onto a self-hosted Supabase stack on the same (or a different) Ubuntu box.

Tested on **Ubuntu 22.04 / 24.04 LTS**, x86_64, with a public IPv4 and a domain you control (we'll use `aural.example.com` and `api.aural.example.com` as placeholders — replace everywhere).

---

## 0. Can the backend be self-hosted?

**Yes.** Lovable Cloud is a managed Supabase project, and Supabase is open-source. You can run the exact same stack (Postgres + GoTrue auth + PostgREST + Storage + Edge Functions) on your own server with `supabase/docker`. Your client code (`@supabase/supabase-js`) doesn't change — only the URL and anon key do.

Caveats:

- You must move the **schema, data, storage objects, edge function secrets, and auth users** yourself.
- Once you point the app at your self-hosted instance, the Lovable Cloud Connectors panel inside Lovable will stop reflecting reality. Keep Cloud disabled or unused after migration.
- Email auth requires SMTP credentials (e.g. Resend, SES, Mailgun) — Lovable Cloud provided this for free.

---

## 1. Server prerequisites

SSH in as a sudoer and install the basics:

```bash
sudo apt update && sudo apt -y upgrade
sudo apt -y install curl git ufw nginx ca-certificates gnupg

# Node 20 (for building the frontend)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt -y install nodejs

# Docker + Compose (for self-hosted Supabase)
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt update
sudo apt -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER && newgrp docker

# Firewall
sudo ufw allow OpenSSH
sudo ufw allow 80
sudo ufw allow 443
sudo ufw --force enable

# Certbot for HTTPS
sudo apt -y install certbot python3-certbot-nginx
```

Point DNS:

- `aural.example.com`        → server IP (frontend)
- `api.aural.example.com`    → server IP (Supabase REST/Auth/Storage/Functions gateway)
- `studio.aural.example.com` → server IP (optional, Supabase Studio UI)

---

## 2. Self-host Supabase (backend + database)

Skip this section if you want to keep using Lovable Cloud as the backend and only self-host the frontend — in that case go straight to section 4.

### 2.1 Pull the official Supabase docker stack

```bash
sudo mkdir -p /opt/supabase && sudo chown $USER:$USER /opt/supabase
cd /opt/supabase
git clone --depth 1 https://github.com/supabase/supabase
cp -R supabase/docker/* .
cp .env.example .env
rm -rf supabase
```

### 2.2 Configure `.env`

Edit `/opt/supabase/.env` and set, at minimum:

| Variable | Notes |
|---|---|
| `POSTGRES_PASSWORD` | strong random string |
| `JWT_SECRET` | 40+ char random; **must** match the one used to mint anon/service keys |
| `ANON_KEY`, `SERVICE_ROLE_KEY` | generate with the helper at <https://supabase.com/docs/guides/self-hosting/docker#generate-api-keys> using your `JWT_SECRET` |
| `DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD` | login for Studio |
| `SITE_URL` | `https://aural.example.com` |
| `API_EXTERNAL_URL` | `https://api.aural.example.com` |
| `SUPABASE_PUBLIC_URL` | `https://api.aural.example.com` |
| `SMTP_*` | Resend / SES / Mailgun creds for auth emails |
| `OPENAI_API_KEY` | required by the `sync-lyrics` edge function |

Generate strong secrets quickly:

```bash
openssl rand -hex 32   # for POSTGRES_PASSWORD / JWT_SECRET
```

### 2.3 Start the stack

```bash
cd /opt/supabase
docker compose pull
docker compose up -d
docker compose ps   # all should be "healthy"
```

The Kong API gateway listens on `:8000` (HTTP) and Studio on `:3000` — we'll put Nginx in front of both with TLS in section 4.

### 2.4 Create storage buckets

Open Studio (after section 4 sets up TLS, or temporarily via SSH tunnel `ssh -L 3000:localhost:3000 user@server`) and create:

- `covers`   — **public**
- `audio`    — **private**
- `avatars`  — **public**

Or via SQL in the SQL editor:

```sql
insert into storage.buckets (id, name, public) values
  ('covers','covers', true),
  ('audio','audio', false),
  ('avatars','avatars', true);
```

Add storage RLS policies that mirror what Lovable Cloud had (admin write, authenticated read for `audio`, public read for the public buckets). Example for `audio`:

```sql
create policy "audio readable by authenticated"
  on storage.objects for select to authenticated
  using (bucket_id = 'audio');

create policy "audio writable by admins"
  on storage.objects for all to authenticated
  using (bucket_id = 'audio' and public.has_role(auth.uid(), 'admin'))
  with check (bucket_id = 'audio' and public.has_role(auth.uid(), 'admin'));
```

### 2.5 Apply the schema

The full schema lives in `supabase/migrations/`. Run them in order against your new DB:

```bash
# from your laptop or the server
export PGPASSWORD='<POSTGRES_PASSWORD from .env>'
for f in supabase/migrations/*.sql; do
  psql -h api.aural.example.com -p 5432 -U postgres -d postgres -f "$f"
done
```

(If port 5432 isn't exposed publicly, run from inside the server: `psql -h localhost -p 5432 ...` or `docker compose exec db psql -U postgres`.)

### 2.6 Migrate data from Lovable Cloud

From your laptop, dump data only (schema is already applied above):

```bash
# Lovable Cloud connection string is in Lovable → Cloud → Connect → "Direct connection"
pg_dump \
  --data-only --no-owner --no-privileges \
  --schema=public --schema=auth --schema=storage \
  "postgresql://postgres:<password>@db.aaslolzvxopfnbgxmuao.supabase.co:5432/postgres" \
  > aural-data.sql

psql "postgresql://postgres:<new-password>@api.aural.example.com:5432/postgres" -f aural-data.sql
```

Migrate storage objects (one bucket at a time) using the Supabase CLI or `rclone`:

```bash
npx supabase@latest storage cp -r \
  --experimental \
  ss:///audio  ss:///audio \
  --source-project-ref aaslolzvxopfnbgxmuao \
  --target-api-url https://api.aural.example.com
```

### 2.7 Deploy the edge functions

The `sync-lyrics` and `recommend` functions live in `supabase/functions/`. Deploy them with the Supabase CLI pointed at your self-hosted instance:

```bash
npx supabase@latest functions deploy sync-lyrics \
  --project-ref self-hosted \
  --no-verify-jwt=false
npx supabase@latest functions deploy recommend
```

Make sure `OPENAI_API_KEY` is set in `/opt/supabase/.env` (it's exposed to all functions automatically by the self-hosted stack).

### 2.8 Recreate auth users (optional)

`pg_dump` of the `auth` schema already brings users + hashed passwords across, so users keep their credentials. If you skipped that, ask users to use "Forgot password" after migration.

---

## 3. Update the frontend to point at your backend

Edit `.env` in the project root (this is the build-time config Vite reads):

```env
VITE_SUPABASE_URL="https://api.aural.example.com"
VITE_SUPABASE_PUBLISHABLE_KEY="<ANON_KEY from /opt/supabase/.env>"
VITE_SUPABASE_PROJECT_ID="self-hosted"
```

> Note: while inside the Lovable editor, `.env` is auto-managed and will be reset. Make this change **after** you've exported the project to GitHub or downloaded the source — i.e. on the copy you actually deploy.

---

## 4. Build & deploy the frontend

### 4.1 Get the code on the server

```bash
sudo mkdir -p /var/www && sudo chown $USER:$USER /var/www
cd /var/www
git clone <your-github-repo-url> aural
cd aural
npm ci
npm run build         # outputs to dist/
```

### 4.2 Nginx site for the frontend

`/etc/nginx/sites-available/aural`:

```nginx
server {
    listen 80;
    server_name aural.example.com;

    root /var/www/aural/dist;
    index index.html;

    # SPA fallback — required for React Router deep links
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets aggressively
    location ~* \.(js|css|woff2?|svg|png|jpg|jpeg|gif|ico)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

### 4.3 Nginx reverse proxy for Supabase (skip if backend stays on Lovable Cloud)

`/etc/nginx/sites-available/aural-api`:

```nginx
server {
    listen 80;
    server_name api.aural.example.com;

    client_max_body_size 50M;   # raise for audio uploads

    location / {
        proxy_pass         http://127.0.0.1:8000;   # Supabase Kong gateway
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_set_header   Upgrade           $http_upgrade;
        proxy_set_header   Connection        "upgrade";
        proxy_read_timeout 300s;
    }
}

server {
    listen 80;
    server_name studio.aural.example.com;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Enable and reload:

```bash
sudo ln -s /etc/nginx/sites-available/aural      /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/aural-api  /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 4.4 HTTPS with Let's Encrypt

```bash
sudo certbot --nginx \
  -d aural.example.com \
  -d api.aural.example.com \
  -d studio.aural.example.com
```

Auto-renewal is installed as a systemd timer; verify with `systemctl list-timers | grep certbot`.

---

## 5. Updating after code changes

Create `/usr/local/bin/aural-deploy`:

```bash
#!/usr/bin/env bash
set -euo pipefail
cd /var/www/aural
git pull --ff-only
npm ci
npm run build
sudo systemctl reload nginx
echo "✓ Deployed"
```

```bash
sudo chmod +x /usr/local/bin/aural-deploy
```

Run `aural-deploy` after every push.

For backend changes (new migrations / edge functions):

```bash
cd /var/www/aural
for f in supabase/migrations/*.sql; do
  psql "postgresql://postgres:<pw>@localhost:5432/postgres" -f "$f"
done
npx supabase@latest functions deploy --all
```

---

## 6. Backups

Daily Postgres dump + storage rsync via cron:

```bash
sudo mkdir -p /var/backups/aural
sudo tee /etc/cron.daily/aural-backup >/dev/null <<'SH'
#!/usr/bin/env bash
set -euo pipefail
TS=$(date +%F)
docker compose -f /opt/supabase/docker-compose.yml exec -T db \
  pg_dump -U postgres postgres | gzip > /var/backups/aural/db-$TS.sql.gz
find /var/backups/aural -name 'db-*.sql.gz' -mtime +14 -delete
SH
sudo chmod +x /etc/cron.daily/aural-backup
```

Push `/var/backups/aural/` to S3/B2/etc. with `rclone` for off-box safety.

---

## 7. Troubleshooting

| Symptom | Fix |
|---|---|
| 404 on page refresh | Missing `try_files … /index.html` SPA fallback in nginx |
| `Invalid JWT` from API | `JWT_SECRET` in `.env` doesn't match the secret used to generate `ANON_KEY` |
| Storage uploads 413 | Raise `client_max_body_size` in the nginx `api` server block |
| Edge function 500 | `docker compose logs functions` — usually missing env var like `OPENAI_API_KEY` |
| `auth/users` empty after migration | You only dumped `--schema=public`; re-run with `--schema=auth` too |
| CORS errors from browser | Set `ADDITIONAL_REDIRECT_URLS=https://aural.example.com` and `SITE_URL` in `/opt/supabase/.env`, then `docker compose restart auth` |

---

You're live. 🎵