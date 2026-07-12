# Cotto Marketplace — Handoff (Phase 0–5 complete, ready for Phase 6)

Last updated: 2026-07-12. All content below is accurate as of `main` @ commit `a191dc7`.

This doc is meant to let a fresh Claude Code session pick up Phase 6 with zero
re-discovery. Read this fully before touching code.

---

## 1. What this project is

**Cotto Marketplace** — an Etsy-style marketplace for North Shore Chicago food
vendors (home cooks / cottage food operators) with a **cooperative delivery
network**: vendors also deliver each other's orders (not a dedicated driver
fleet). Founder is a non-developer; I (Claude) act as senior full-stack
engineer. Neal Weingarden is a technical overseer with admin access.

**Collaboration model (important, confirmed repeatedly by the user):**
- I build and verify each phase independently — including my own automated/API-level
  smoke testing against the real hosted Supabase + Stripe test mode.
- The user does the **final hands-on gate tests** on their own device/browser
  themselves. I provide exact click-through walkthroughs and set up any backend
  test fixtures they can't create through the UI alone (test vendors, test menu
  items, etc.).
- Work happens in phases. End of phase = summary + numbered acceptance gate,
  then stop and wait for the user's explicit "gate passed" (or equivalent)
  before moving on.
- Commit message convention: `phase N: <description>` for the phase's squash-merge
  commit. Follow-up bug fixes discovered during gate testing get their own small
  branch + PR with a `fix:` or `feat:` prefix, merged immediately (not bundled into
  the phase branch) since they're fixing already-live functionality.
- Never invent secrets. Halt and ask the user directly when one is needed.

---

## 2. Repo layout

```
/apps/mobile   Expo Router (SDK 57) customer + vendor app, NativeWind, React Query
/apps/admin    Next.js 14 App Router, Central Ops admin console, Vercel-deployed
/packages/shared  zod schemas, Supabase generated types, money/fee/pickup-slot math (used by mobile + admin; NOT imported by edge functions, see §6)
/supabase      migrations, edge functions, config.toml, seed.sql
```

Monorepo: pnpm workspaces. Root scripts: `pnpm typecheck`, `pnpm lint`, `pnpm test`
(all run per-workspace via `pnpm -r --if-present run <script>`).

GitHub: `centralops-art/cotto-market`. CI (`typecheck-lint-test` workflow) gates
every PR. Vercel auto-deploys `apps/admin` from `main` (admin.cottomarket.com).
No CI/CD for the mobile app — it's tested via Expo dev client + EAS builds.

---

## 3. Confirmed architecture decisions (do not re-litigate these)

- **Money**: always integer cents. `packages/shared/src/money.ts` has
  `assertIsCents`/`addCents`/`percentOfCents`/`formatCents`. Never floats.
- **Timezones**: stored UTC, rendered/reasoned about in America/Chicago.
  `packages/shared/src/pickup-slots.ts` has the DST-aware Chicago↔UTC conversion
  helpers (`chicagoWallTimeToUTC`, `chicagoPartsOf`, `generatePickupSlots`) — unit
  tested including winter/summer DST round-trips. **Reuse these, don't
  re-derive timezone math.**
- **Stripe architecture: Separate Charges and Transfers.** One PaymentIntent on
  the **platform** Stripe account per order (no `application_fee_amount`, no
  `transfer_data`/destination charge). Cook's Transfer fires from the
  `payment_intent.succeeded` webhook (amount = subtotal − platform fee). The
  **delivery fee stays parked in the platform account** until a driver claims
  the job (Phase 8) — driver payout Transfer doesn't exist yet.
  Delivery split (`driverPayoutCents` / `cottoDeliveryFeeCents`,
  `calculateDeliverySplit` in `fees.ts`) is computed **at claim time** using the
  region's *current* `delivery_payout_split_pct` (not the value at checkout) —
  this function exists and is tested but has no caller yet (Phase 8's job).
- **Region**: single seeded region "North Shore Chicago", 11 ZIPs (60201, 60202,
  60203, 60076, 60077, 60091, 60093, 60022, 60035, 60040, 60062). `$4.99` base +
  `$1.50/mile` delivery fee, 80/20 driver/Cotto split, T1=10/T2=30/T3=60 min claim
  windows (Phase 8/9 territory), `soft_warning` conflict rule.
- **Dual-mode accounts**: `profiles.role` is set once at signup and **never**
  mutated by "Become a Vendor" — vendor-ness is derived purely from
  `vendors.owner_profile_id` ownership. A customer can own a vendor row and keep
  browsing/ordering as a customer simultaneously (self-purchase allowed;
  self-reviews will need blocking in Phase 10).
- **Team members** (`vendor_team_members`) are bio-only display entries — no
  separate login or permission tier. All actions happen under the single vendor
  account.
- **Admin allow-list** (`system_settings.admin_allow_list`): `CentralOps@CottoMarket.com`,
  `Neal.Weingarden@gmail.com`, `CPITTS1183@gmail.com`.
- **Platform fee**: `system_settings.default_platform_fee_pct = 8`. Per-vendor
  override via `vendors.platform_fee_pct` (null = use default). Free trial
  mechanism (`free_trial_ends_at` + cron to reset expired trials back to
  default) is **not built yet** — out of scope until an Admin/ops phase.
- **Stripe Tax**: real Stripe Tax API (not a flat rate — user explicitly chose
  this over a simpler flat-rate fallback). Tax code `txcd_40060003` ("Food for
  Immediate Consumption") applied to the food subtotal only — delivery fee is
  never a taxable line item. Requires a **Tax Registration** per state Stripe is
  told to collect in; Illinois test-mode registration already exists
  (`taxreg_1TsA78FMh2QSmPls7Ka1f7lo`). **If tax ever comes back as $0 in a fresh
  environment, check `stripe.tax.registrations.list()` first** — Stripe
  correctly refuses to collect tax for unregistered jurisdictions, this isn't a
  bug.

---

## 4. Database: migrations 0001–0016 (all applied to hosted + local)

| # | Contents |
|---|---|
| 0001 | pgcrypto, `set_updated_at()` trigger fn, `user_role`/`delivery_conflict_rule` enums, `regions`, `profiles` (+ `allergen_preferences text[]`), `handle_new_user()` trigger auto-creating a profile row on signup |
| 0002 | `vendors` (+ `vendor_status`, `layout_style` enums), `vendor_team_members` |
| 0003 | `vendor_delivery_profiles` (Phase 7 territory, not yet used) |
| 0004 | `menu_categories`, `menu_items` (+ generated `search_tsv` full-text columns on both menu_items and vendors) |
| 0005 | `favorites` (polymorphic vendor-xor-item), `waitlist_entries` |
| 0006 | `carts`, `cart_items`, `orders`, `vendor_suborders`, `order_items` (+ `cart_status`/`fulfillment_type`/`order_payment_status`/`suborder_status` enums) |
| 0007 | delivery claims/dispatch tables (Phase 8 territory) |
| 0008 | reviews, messages tables (Phase 6/10 territory) |
| 0009 | `audit_log`, singleton `system_settings` |
| 0010 | **All RLS policies** for every table + base table GRANTs (critical: `alter default privileges ... grant ... to anon, authenticated, service_role` so new tables in later migrations auto-inherit correct grants) + RLS helper fns (`is_ops_admin()`, `owns_vendor()`, `is_customer_of_order()`, `is_active_driver_for_suborder()`, `can_view_pool_suborder()`) + `guard_vendor_owner_update` trigger |
| 0011–0012 | vendor `draft` status + onboarding wizard support |
| 0013–0015 | CFPM cert storage bucket + expiry cron, vendor-media public bucket |
| 0016 | `orders.cart_id` (nullable FK back to the cart, so the webhook can flip cart→checked_out) |

**RLS pattern for orders/suborders/order_items**: written *only* by service-role
edge functions (checkout function creates them as `pending_payment`; webhook
flips to `paid`). No client-facing INSERT policy on purpose. `vendor_suborders`
has a cook-side UPDATE policy for status transitions (`owns_vendor`) — **this is
what Phase 6 will use** for the kitchen dashboard's status buttons.

`vendor_suborders` columns relevant to Phase 6: `status` (enum: received →
confirmed → preparing → ready → claimed → en_route_to_pickup → picked_up →
en_route_to_customer → delivered → completed / cancelled / refunded),
`ready_at`, `delivery_cycle` (int, scopes claim/release cycles — Phase 8),
`mapbox_eta_minutes` (unused so far).

`messages` table exists (migration 0008) but has no UI or RLS-verified
read/write flow yet — that's explicitly Phase 6 item 3 ("simple thread" between
vendor and customer per suborder). Check its exact schema before building.

**Database type generation**: `pnpm exec supabase gen types typescript --linked
> packages/shared/src/types/database.ts`. Do this after every migration that
changes hosted schema, or `apps/mobile`/`apps/admin` typecheck will drift.

---

## 5. Edge functions (Deno, `supabase/functions/`)

| Function | Purpose | Auth |
|---|---|---|
| `stripe-connect-onboarding` | Creates/reuses vendor's Connect Express account, returns onboarding Account Link | anon+JWT (owns_vendor via RLS) |
| `stripe-connect-status` | Checks a vendor's Connect account status | anon+JWT |
| `notify-vendor-submitted` | Emails admin allow-list when a vendor submits for review | anon+JWT |
| `cron-cfpm-expiry-check` | pg_cron-triggered; auto-suspends vendors with expired CFPM certs, 60-day admin warning email | service-role (cron) |
| `checkout-create-payment-intent` | Computes subtotal/delivery fee (Mapbox)/platform fee/Stripe Tax per vendor, writes `orders`+`vendor_suborders`+`order_items` as `pending_payment`, creates the platform PaymentIntent | anon+JWT (caller's own cart) |
| `stripe-webhook` | Verifies Stripe signature, idempotent on `orders.status`, fires per-vendor Transfers, flips order→paid + cart→checked_out, sends emails | **no JWT verification** (`--no-verify-jwt`, Stripe calls it directly with its own signature) |

**Important Deno quirk**: edge functions do **not** import from
`packages/shared` — that package's TypeScript uses extensionless relative
imports (`./money` not `./money.ts`), which Deno's strict module resolution
rejects. The handful of pure fee-math functions needed in
`checkout-create-payment-intent` are **duplicated inline** with a comment
pointing back to the source of truth. If you touch pricing formulas, update
both places.

**Deploying an edge function**: `pnpm exec supabase functions deploy <name>
--project-ref hlwatggikosoeejskujq` (add `--no-verify-jwt` only for
`stripe-webhook`).

---

## 6. Secrets & environment — current state

**Supabase Edge Function secrets** (hosted project `hlwatggikosoeejskujq`, set via
`supabase secrets set`):
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_RETURN_URL`
(= `https://admin.cottomarket.com/stripe-connect-return`), `MAPBOX_TOKEN`
(same value as the mobile app's public token — reused deliberately, user's
call), `RESEND_API_KEY`, plus the auto-populated `SUPABASE_*` ones.

**Stripe webhook endpoint**: registered via API (not the Dashboard), points at
`https://hlwatggikosoeejskujq.supabase.co/functions/v1/stripe-webhook`,
listening for `payment_intent.succeeded` + `payment_intent.payment_failed`.

**Stripe Tax**: active, head office in Glenview, IL. IL tax registration exists
in test mode. **Real launch will need the live-mode equivalent** — flagged to
the user as a business/legal decision, not done.

**Resend**: `cottomarket.com` domain is verified (has been since Phase 2, used
originally for Supabase Auth SMTP) — sending is enabled. **All transactional
email `from` addresses now correctly use `notifications@cottomarket.com`** (was
a real bug: every send site was hardcoded to the sandbox address
`onboarding@resend.dev` until just now, which silently restricted delivery to
only the account owner's own inbox — fixed across all 4 call sites: admin
`src/lib/resend.ts`, `stripe-webhook`, `notify-vendor-submitted`,
`cron-cfpm-expiry-check`).

**`apps/mobile/.env`** (not committed): `EXPO_PUBLIC_SUPABASE_URL`,
`EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_MAPBOX_TOKEN`,
`EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` (pk_test_... — user provided it, already
in place).

**`apps/admin/.env.local`** (not committed) + **Vercel env vars** (set per-env via
`vercel env add`, separately from `.env.local` — this bit the user once before,
Vercel doesn't read local `.env.local`): `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`,
`STRIPE_SECRET_KEY`.

**Supabase Auth config** (`supabase/config.toml`, synced to hosted via `supabase
config push` — **this command overwrites hosted with whatever's in the local
file**, be careful): `site_url = "https://admin.cottomarket.com"`, custom Resend
SMTP for auth emails, redirect URLs list includes both hosted and local dev
targets.

---

## 7. Mobile app structure (as of end of Phase 5)

```
app/
  _layout.tsx              root: auth-gated redirect logic, StripeProvider wrapper
  index.tsx
  (auth)/                  sign-in, sign-up, forgot/reset password
  (app)/
    complete-profile.tsx
    vendor-onboarding.tsx   5-step cook onboarding wizard
    vendor/                 vendor-owner dashboard (index/storefront/menu/preview), own Stack layout
    vendor-profile/[id].tsx customer-facing storefront (theme/layout rendering, favorite, share, allergen filter, search-scoped menu)
    item/[id].tsx           item detail: images, allergens, favorite, waitlist, add-to-cart w/ qty stepper
    checkout.tsx            Stripe PaymentSheet
    order-confirmation.tsx  polls order status until webhook flips it to 'paid'
    (tabs)/                 bottom tab bar
      _layout.tsx           Tabs from 'expo-router' (NOT @react-navigation/bottom-tabs as a
                             separate package -- expo-router 57.x vendors react-navigation
                             internally; the deprecated-but-functional `Tabs` export works fine
                             and needs zero extra native deps)
      index.tsx              Browse: full-text search (vendors + menu_items), vendor-type filter
      favorites.tsx           refetches on focus (useFocusEffect) -- tab screens stay mounted,
                              see the bug note in §9
      cart.tsx                multi-vendor grouping, pickup/delivery toggle, 15-min slot picker,
                              delivery address geocoding, Remove/Clear cart buttons
      account.tsx             vendor status/CTA + allergen preference editor + sign out
src/
  lib/
    use-cart.ts             useOpenCart (creates cart if needed), useCartItems, useCartBadgeCount
                            (read-only, no side effect -- use this for nav badges), addToCart,
                            clearCart, useInvalidateCart (invalidates all cart-related query keys
                            including the badge)
    use-vendor.ts, upload-image.ts, auth-context.tsx, supabase.ts, query-client.ts
  components/
    cart-button.tsx         persistent Cart shortcut+badge for screens pushed outside the tab bar
  features/
    vendor-onboarding/, storefront-editor/, menu-builder/
```

**Navigation gotcha worth knowing**: `vendor-profile/[id]` and `item/[id]` are
pushed as Stack screens *outside* the `(tabs)` group, so the bottom tab bar
(and therefore Cart tab) isn't reachable from them. Fixed via `CartButton` in
each screen's header. If Phase 6+ adds more screens outside the tabs group
(e.g. an order-tracking screen), consider whether they need the same treatment.

---

## 8. Admin app structure

```
src/app/
  login/, auth/callback/route.ts      magic-link auth (PKCE flow -- see gotcha in §9), allow-list gated
  dashboard/
    page.tsx                          nav hub: Vendors, Orders buttons + sign out
    vendors/                          list (status-tab filtered) + detail + approve/reject actions
    orders/                           list + detail (shows all vendor_suborders + order_items) + refund action
  api/admin/
    vendors/[id]/approve, reject      service-role writes + audit_log + best-effort email
    orders/[id]/refund                stripe.refunds.create + order status update + audit_log +
                                       customer notification email (added post-Phase-5-gate-test)
    request-login                     magic link, allow-list gated
lib/
  supabase/{client,server,middleware}.ts   @supabase/ssr, PKCE flow type (default)
  require-admin.ts                    session + service-role role check -> ops_admin/ops_owner
  resend.ts                           sendEmail() helper, now uses notifications@cottomarket.com
```

Both Vendors and Orders list pages now have a "← Back to dashboard" link (was
missing, fixed during Phase 5 gate testing).

---

## 9. Bugs found + fixed this session (read before repeating any of these)

1. **React Query cache-key collisions** (Phase 3): menu editor and customer
   preview both used `["menu_items", vendorId]` — one screen's filtered result
   leaked into the other's cache. Fixed by scoping keys (`..., "all"` vs
   `..., "published"`). **Lesson: always scope query keys to the exact filter
   applied, especially when two screens query the same table differently.**
2. **Favorites tab showed stale/empty results** (Phase 4): tab screens stay
   mounted in the background in React Navigation — a query that ran once early
   (before any favorites existed) never refetched. Fixed with
   `useFocusEffect` + `invalidateQueries` on focus. **Lesson: any screen behind
   a tab bar that shows "current state of the world" needs an explicit
   refetch-on-focus, not just React Query's default mount-time fetch.**
3. **Stripe RN SDK version mismatch**: `pnpm add @stripe/stripe-react-native`
   grabbed npm's `latest` tag (0.68.0), which is *not* the version Expo curated
   for SDK 57 — caused a `TurboModuleRegistry 'StripeSdk' not found` crash on
   device even though the native code visibly compiled into the APK (verified
   by unzipping and grepping for stripe resource files — the resources were
   there, the module registration wasn't). Fixed with `npx expo install
   @stripe/stripe-react-native`, which correctly resolved 0.64.0. **Lesson:
   always use `expo install` for native dependencies, never plain `pnpm
   add`/`npm install`, even though this repo is a pnpm workspace — `expo
   install` still resolves the right SDK-compatible version and just changes
   package.json under the hood.**
4. **stripe-webhook silently swallowed Resend failures**: `fetch()` only
   rejects on network failure, not HTTP error status — the Resend calls never
   checked `res.ok`, so a 403 (sandbox restriction) vanished with zero trace in
   `audit_log`. Fixed: each email send is now independent (one failing doesn't
   block the others) and every failure is logged with the recipient.
   **Lesson: never `await fetch(...)` without checking `.ok` when the response
   matters — this is the second time in this codebase a missing status check
   hid a real failure (see `notify-vendor-submitted`, which got this right
   from the start with `if (!emailRes.ok) throw ...` — the webhook should have
   matched that pattern from day one).**
5. **All transactional emails sandbox-restricted**: `cottomarket.com` has been
   verified with Resend since Phase 2, but every `from:` address across 4 call
   sites was still hardcoded to `onboarding@resend.dev` (Resend's sandbox
   sender), which only delivers to the account's own verified address. Nobody
   noticed until Phase 5 gate testing because emails to the founder's own inbox
   (the common test path) always "worked." **Lesson: when verifying a service
   like Resend is configured correctly, check the actual `from` address in use,
   not just "is the domain verified" — a verified domain does nothing if the
   code never references it.**
6. **Magic link `exchange_failed`**: Supabase's PKCE flow (default in
   `@supabase/ssr`) ties the code_verifier to the browser/tab that called
   `signInWithOtp`. Clicking the emailed link in a *different* browser context
   (different device, different browser, or an email app's in-app browser)
   fails the code exchange. Not a bug — just needs the user to open the link in
   the same browser session that requested it (or copy-paste the URL there
   directly, which is what worked).
7. **`admin/login` page never surfaces the callback route's `?error=...`
   query param** — it only shows client-side form errors. This is a real (if
   minor) UX gap still outstanding; not fixed yet, listed here so it's not
   forgotten. Low priority.

---

## 10. Test fixtures currently in the database (hosted)

Feel free to reuse these for Phase 6 testing — don't recreate them.

**Vendors:**
- **Tester Kitchen** (`7b3c0beb-ca34-4b6e-8423-1e0df208499b`) — active, Evanston
  IL 60201, owner = Christopher Pitts (the founder's own account,
  `def0da59-82e6-4dbb-a394-51c3cf1bc001`, role `ops_admin`). Stripe Connect
  account `acct_1Ts6zAFTs1uyq1Se` — **fully active** (`transfers: active`),
  Transfers to it succeed for real. Has menu items including "Basil Pesto
  Pasta" ($5.00, no allergens, available) and "Peanut Butter Cookie" ($5.00,
  peanuts allergen, **is_sold_out: true** — useful for waitlist testing).
- **Second Test Kitchen** (`2132bf8c-3863-4a7e-8e7f-2dbd05d3adbd`) — active,
  Wilmette IL 60091, owner = `d29dae44-c183-4694-bbd3-197e53f385f4` (profile
  "Reject Test Kitchen", role `customer`). Stripe Connect account
  `acct_1TsBqZFAYQqYQDWs` — **capabilities inactive** (Express onboarding can't
  be completed via API, only through the real hosted-onboarding-link flow a
  human has to click through). **Transfers to this vendor will fail** (handled
  gracefully — logged to `audit_log` as `checkout_transfer_failed`, doesn't
  block the order). Has one menu item: "Test Tacos" ($8.00).
- **Reject Test Kitchen** (`6bcb5174-def3-4e3a-b6e9-e6c970ae38fe`) — status
  `draft`, unused, no Stripe account, no address.

**Region**: "North Shore Chicago" (`c51915dc-044b-4ab8-b757-91f6384da2f4`),
`is_active: true`, standard config (see §3).

**Test customer profiles** (all role `customer`, no vendor of their own):
`d3a8f420-ab51-405d-96b4-0e073066b023`, `6a6b01de-375d-40e1-8015-2ad89be52357`,
`3f5c9e67-f3ef-4e16-b727-9017c50f99d0` ("Three" — resolves to
`neal.weingarden@gmail.com`, careful with test emails to this one).

**Orders**: several test orders exist in various states (`pending_payment`,
`paid`, `refunded`) from Phase 5 smoke testing and the user's manual gate
tests — harmless leftover data, safe to ignore or reuse, not cleaned up
deliberately in case they're useful reference (per earlier agreement with the
user).

---

## 11. What's next: Phase 6 spec (verbatim from the original mega-prompt)

> ### Phase 6 — Cook order lifecycle (pickup focus)
> 1. Vendor cook order dashboard ("Kitchen" tab): open suborders (oldest
>    first), tap to view detail, status buttons. Each transition writes to
>    `audit_log` and triggers a customer email/SMS.
> 2. Customer order tracking screen with timeline.
> 3. In-app messaging between vendor and customer per suborder (simple
>    thread).
> 4. **For delivery suborders**, when cook sets status to `ready`, the
>    suborder enters the delivery pool (handled in Phase 8) — but the cook
>    side of this phase only needs to write the status correctly. Drivers see
>    nothing yet.
>
> **Acceptance gate:**
> - I drive a pickup order from `received → completed`.
> - I drive a delivery order through the cook side from `received →
>   confirmed → preparing → ready` and see it sitting at `ready` with no
>   driver action yet.
> - Customer receives an SMS/email at each major transition.
> - Messages are visible to both sides and not to anyone else (RLS
>   verified).

**Things to figure out / decide before or during Phase 6 build:**
- **SMS**: no SMS provider is wired up anywhere in this codebase yet (only
  Resend for email). The spec says "email/SMS" — probably reasonable to do
  email-only for MVP and flag SMS as a follow-up, but confirm with the user
  first rather than assuming (matches the established pattern of asking before
  making an architecture-affecting call).
- Check `supabase/migrations/0008_reviews_messages.sql` for the exact
  `messages` table schema before building the messaging thread — it exists but
  hasn't been touched by any application code yet.
- `vendor_suborders.status` transitions need validation (which transitions are
  legal from which state) — probably belongs in a Postgres function/trigger or
  in the edge function/API layer, consistent with how `guard_vendor_owner_update`
  already gates `vendors` status transitions.
- Decide where the "Kitchen" tab lives in the mobile nav — likely a new tab
  only visible to profiles that own an active vendor, or reachable from the
  existing vendor dashboard (`app/(app)/vendor/`).
- Customer order tracking screen: check `orders`/`vendor_suborders` RLS
  (`orders_select`, `vendor_suborders_select` in migration 0010) — customer
  read access already exists, just needs a UI screen.

**Phases after 6** (for context, not in scope now): 7 — Delivery onboarding +
eligible pool, 8 — Claim/deliver/payout, 9 — Unclaimed fallback + customer
offer, 10 — Reviews/favorites polish/waitlist notifications, 11 — Admin
dashboard, 12 — Polish/store submission/launch readiness.

---

## 12. Useful commands reference

```bash
# typecheck/lint/test everything
pnpm typecheck && pnpm lint && pnpm test

# push a new migration to hosted + regen types
pnpm exec supabase db push --linked
pnpm exec supabase gen types typescript --linked > packages/shared/src/types/database.ts

# deploy an edge function
pnpm exec supabase functions deploy <name> --project-ref hlwatggikosoeejskujq

# set a secret
pnpm exec supabase secrets set KEY=value --project-ref hlwatggikosoeejskujq

# reset local DB (applies all migrations + seed.sql)
pnpm exec supabase db reset

# EAS dev build (only needed when a NEW native module is added)
cd apps/mobile && eas build --profile development --platform android --non-interactive
```

**PATH note (Windows/Git Bash environment used this session)**: `node`, `gh`,
and global npm bins aren't on PATH by default in the Bash tool — prefix
commands with:
```bash
export PATH="$PATH:/c/Program Files/nodejs:/c/Program Files/GitHub CLI:/c/Users/Central Ops/AppData/Roaming/npm"
```

**Do not** run `taskkill //F //IM node.exe //T` while the user might have their
own `expo start` terminal running — this has killed their dev server
unintentionally multiple times this session. If a Bash-started server needs to
come down, prefer a more targeted approach.

The Preview MCP tool (`mcp__Claude_Preview__*`) is broken in this environment —
the space in the Windows username ("Central Ops") breaks its process spawning.
Verification throughout this project has instead relied on: `pnpm typecheck`/
`lint`/`test`, throwaway Node smoke-test scripts against the hosted Supabase +
Stripe test mode (always deleted after use, never committed), and the user's
own manual device testing.
