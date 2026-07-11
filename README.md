# Cotto Marketplace

Etsy-style marketplace for North Shore Chicago food vendors, with a cooperative
delivery network where vendors deliver each other's orders. See
[`Cotto_MVP_Spec.md`](./Cotto_MVP_Spec.md) for the full product spec.

## Monorepo layout

```
/apps/mobile      Expo React Native (customer + vendor: cook + driver)
/apps/admin       Next.js 14 App Router (Central Ops admin)
/packages/shared  zod schemas, Supabase generated types, money/fee math
/supabase         migrations, seed data, edge functions
```

## Prerequisites

- Node.js 20+, pnpm 9+ (`corepack enable` or `npm i -g pnpm`)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (for local Supabase)
- [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) (installed as a repo devDependency; run via `pnpm supabase ...`)
- [GitHub CLI](https://cli.github.com/) (optional, for PRs from the terminal)
- Expo Go app on your phone (for scanning the mobile dev QR code)

## Setup

```bash
pnpm install
pnpm db:reset       # starts local Supabase (via Docker) and applies migrations + seed
```

Then copy the env templates and fill in secrets (never commit real secrets):

```bash
cp apps/admin/.env.example apps/admin/.env.local
cp apps/mobile/.env.example apps/mobile/.env
```

`pnpm db:reset` (via `supabase start`) prints the local `API URL` and `anon key`
-- paste those into both `.env` files as `NEXT_PUBLIC_SUPABASE_URL` /
`NEXT_PUBLIC_SUPABASE_ANON_KEY` (admin) and `EXPO_PUBLIC_SUPABASE_URL` /
`EXPO_PUBLIC_SUPABASE_ANON_KEY` (mobile).

## Required secrets (fill in as each phase needs them)

| Key | Used by | Needed starting |
| --- | --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | admin | Phase 1 (bypasses RLS -- server-only) |
| `RESEND_API_KEY` | admin | Phase 2 (vendor approval emails) |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | admin | Phase 2 / 5 (Connect onboarding, checkout) |
| `EXPO_PUBLIC_MAPBOX_TOKEN` | mobile | Phase 2 (service address map pin) |

Never invent these -- if a phase needs one you don't have, it'll be flagged so
you can paste it into the right `.env` file.

## Common commands

```bash
pnpm typecheck              # all workspaces
pnpm lint                   # all workspaces
pnpm test                   # all workspaces (vitest)
pnpm --filter admin dev     # Next.js admin at localhost:3000
pnpm --filter mobile start  # Expo dev server (scan QR with Expo Go)
pnpm db:reset               # reset local Supabase DB + reapply migrations/seed
pnpm db:diff                # generate a migration from local schema changes
```

## Edge functions & the daily CFPM expiry cron

Edge functions read secrets from `supabase/.env` locally (`pnpm exec supabase
functions serve --env-file supabase/.env`) and from `supabase secrets set
KEY=value` on the hosted project -- neither is the same as the Next.js/Expo
`.env` files, which only cover the two apps.

The CFPM expiry cron (`cron-cfpm-expiry-check`) is scheduled via `pg_cron` +
`pg_net`, reading the project URL and service role key from Supabase Vault by
name so neither is hardcoded in a migration. **One-time setup per
environment:**

```sql
-- Local: run against 127.0.0.1:54322. Note the INTERNAL hostname (kong:8000),
-- not the host-mapped 127.0.0.1:54321 -- pg_net calls originate from inside
-- the postgres container, where 127.0.0.1 means the container itself.
select vault.create_secret('http://kong:8000', 'project_url');
select vault.create_secret('<local service_role_key from supabase start>', 'service_role_key');

-- Hosted: run via `supabase db query --linked "<sql>"`, using the real
-- project URL and its actual service role key from the dashboard.
select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
select vault.create_secret('<hosted service_role_key>', 'service_role_key');
```

`pnpm db:reset` wipes local Vault secrets (they're runtime data, not part of
migrations) -- re-run the two `local` statements above after every reset if
you need to test the cron locally.

## Deploys

- **Admin (Vercel)**: import this repo in the Vercel dashboard with **Root
  Directory** set to `apps/admin`. Vercel auto-detects the pnpm workspace and
  Next.js framework. PRs get preview deploys once connected. *(One-time manual
  step -- requires your Vercel account login, not automatable from here.)*
- **Mobile (EAS)**: `eas build`/`eas submit` profiles land in Phase 12.
- **Supabase**: hosted project + `supabase link` + `supabase db push` land
  alongside the first phase that needs a shared (non-local) database.

## Region seeded for v1

"North Shore Chicago" -- Evanston, Skokie, Wilmette, Winnetka, Glencoe,
Highland Park, Highwood, Northbrook. Base delivery fee $4.99 + $1.50/mile,
80/20 driver/Cotto delivery split, T1/T2/T3 claim windows at 10/30/60 minutes.
All configurable in the admin Region Settings page (Phase 11).
