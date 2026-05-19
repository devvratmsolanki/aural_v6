# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev            # Vite dev server on http://localhost:8080 (HMR overlay disabled)
npm run build          # production build → dist/
npm run build:dev      # build with development mode (keeps lovable-tagger)
npm run lint           # ESLint over the repo
npm test               # run vitest once (jsdom env)
npm run test:watch     # vitest in watch mode
npx vitest run path/to/file.test.ts   # run a single test file
```

The package manager is npm (with a `bun.lock` also present — npm is what the scripts assume). The path `@/` resolves to `src/`.

Frontend env vars (in `.env`, see `.env.example`):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY` (anon key)
- `VITE_SUPABASE_PROJECT_ID`

## Architecture

This is a private two-person music-sharing app (admin + user). React 18 + Vite + TypeScript on the frontend; Supabase (Postgres + Auth + Storage + Edge Functions) on the backend. UI is shadcn/ui on top of Radix primitives, styled with Tailwind.

### Provider tree (`src/App.tsx`)
`ErrorBoundary → QueryClientProvider → TooltipProvider → BrowserRouter → AuthProvider → PlayerProvider → Routes`. All authenticated pages render inside `AppShell` behind a `RequireAuth` guard; `/admin/*` is a separate top-level route tree (admin pages do their own access check via `useAuth().isAdmin`).

### AuthContext (`src/contexts/AuthContext.tsx`)
Wraps `supabase.auth`. After every auth state change it queries `user_roles` to set `isAdmin`, and `profiles` for display data. The role check is deferred with `setTimeout(..., 0)` to avoid a known Supabase pitfall where running queries synchronously inside `onAuthStateChange` can deadlock the session. `signOut()` dispatches a `aural:stop` custom DOM event before calling `supabase.auth.signOut()` — this is how the player learns to pause without coupling the two contexts.

### PlayerContext (`src/contexts/PlayerContext.tsx`)
Owns the single `HTMLAudioElement` for the whole app. Audio state lives here: `queue`, `index`, `shuffle`, `loop`, `shuffleHistory`, `position`, `duration`, `volume`. Key behaviors:
- `playSong(song, list)` sets the queue to `list` (or `[song]`) and starts at the song's index.
- Shuffle is asymmetric: `next()` jumps to a random index and pushes the previous index onto `shuffleHistory`; `prev()` pops from that stack to truly walk back through played songs.
- End-of-track is handled via a custom `aural:ended` window event (dispatched from the audio element's `ended` listener) so the `next()` callback can read fresh closure state.
- `end_at` enforcement is a position-watching effect that dispatches a synthetic `ended` event when reached.
- `aural:stop` listener pauses on logout.
- Audio URLs come from `resolveAudioUrl()` in `src/lib/storage.ts`, which signs URLs from the private `audio` bucket and caches them for ~55 minutes.

### Storage helpers (`src/lib/storage.ts`)
- `audio` bucket is private → use `createSignedUrl` (cached in-memory).
- `covers` bucket is public → `getPublicUrl`.
- Both helpers pass through full http(s) URLs unchanged, so songs can also reference external files.

### Supabase backend (`supabase/`)
- `supabase_schema.sql` is the canonical one-shot dump; `supabase/migrations/*.sql` are the incremental migrations (apply via `supabase db push`). When changing the schema, add a new timestamped migration — do not edit old ones.
- Edge functions live in `supabase/functions/`: `admin-create-user`, `admin-delete-user`, `admin-delete-song`, `bootstrap-admin`, `recommend`, `sync-lyrics`. Admin functions must use the service-role key inside the function (not the caller's JWT) when checking roles — RLS on `user_roles` would otherwise block the lookup (see recent commit history for the fix pattern).
- `supabase/config.toml` controls per-function JWT verification (`bootstrap-admin` is the only `verify_jwt = false` function, by design — it grants the first admin).
- Required buckets and their RLS policies are documented in `SUPABASE_SETUP.md`.

### Cross-component signaling
The app uses three custom DOM events instead of threading state through context:
- `aural:ended` — audio finished naturally (PlayerContext internal).
- `aural:stop` — pause everything (fired by AuthContext on signOut).
- A `play_history` row is inserted on every `loadAndPlay` so the Home page can compute the "Newly added" tab (unplayed songs).

### Routing model
Two top-level route groups under `App.tsx`:
- App routes (`/`, `/search`, `/liked`, `/profile`) — wrapped in `RequireAuth` + `AppShell` (sidebar + topbar + persistent `<Player />` footer).
- Admin routes (`/admin/*`) — under `AdminLayout`, which has its own access guard.

### Patterns worth knowing before editing
- The `Song` type's `play_from` / `end_at` fields let admins clip a track without re-encoding; both player code and `SongDuration` in `SongCard.tsx` honor them when computing effective duration.
- The artist column on `songs` is nullable in the schema, but the form sends an empty string rather than `null` to dodge legacy NOT NULL constraints on un-migrated production DBs.
- Vite dedupes `react`, `react-dom`, jsx-runtime, and `@tanstack/react-query` (see `vite.config.ts`) — needed because some shadcn components otherwise pulled duplicate copies.
