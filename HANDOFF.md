# Cotto Marketplace — Handoff (Phase 6 built, pending gate test)

Last updated: 2026-07-12. `main` is still at commit `a191dc7` (Phase 0-5) —
Phase 6's code is built and DB changes are live on the hosted project, but
nothing is committed/merged yet; see §11 for why.

This doc is meant to let a fresh Claude Code session pick up mid-Phase-6 (or
Phase 7, once the gate passes) with zero re-discovery. Read this fully before
touching code.

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
| 0017 | Phase 6: `guard_suborder_status_transition()` trigger on `vendor_suborders` — enforces the legal cook-side state machine (received→confirmed→preparing→ready→completed for pickup; delivery stops at `ready`; cancel allowed from received/confirmed/preparing) for non-admin/non-service-role callers, mirrors `guard_vendor_owner_update`. Also auto-populates `ready_at` on entering `ready` if not already set. |
| 0018 | Phase 6: `suborder_customer_profile_id(so_id)` SECURITY DEFINER function — lets a cook read the customer's `profiles.id` for a suborder they own (needed to address the `messages` thread), without widening `orders_select` RLS (which would leak the whole multi-vendor order's financials to every vendor on it). |
| 0019 | Phase 6: `profiles.sms_opt_in` (boolean, default false) — gates the SMS send in `update-suborder-status`. Superseded in practice by 0020 (see §12). |
| 0020 | Phase 6: `handle_new_user()` now seeds `sms_opt_in` from signup metadata, same mechanism already used for `full_name` — bundles SMS consent into the mandatory signup checkbox. |
| 0021-0028 | **Security fixes from external code review — see §12 for full detail.** 0021: vendor/delivery-profile self-approval guard (`BEFORE INSERT`). 0022: `cart_items` price/vendor integrity (`sync_cart_item_price()`). 0023: reviews require a completed order, messages require the real counterpart. 0024: guest carts moved to Supabase Anonymous Sign-Ins, dropped `carts.session_id`, `profile_id` now `NOT NULL`. 0025: `is_order_paid()` gates vendor suborder visibility/updates. 0026: `vendor_suborders.stripe_transfer_reversal_id` for refund reconciliation. 0027: `orders_cart_id_pending_unique` partial index (checkout idempotency). 0028: `processed_stripe_events` table (webhook idempotency). |
| 0021 | **Security fix** (external code review, see §13): `guard_vendor_owner_insert` / `guard_delivery_profile_owner_insert` BEFORE INSERT triggers — closes a vendor/delivery-profile self-approval hole where a direct `.insert({status: 'active', ...})` bypassed admin review entirely (the existing guard triggers were UPDATE-only). |
| 0022 | **Security fix** (external code review, see §13): `sync_cart_item_price()` BEFORE INSERT OR UPDATE trigger on `cart_items` — makes `unit_price_cents`/`vendor_id` an authoritative mirror of the live `menu_items` row for every caller, closing a price-tampering hole where checkout trusted client-supplied cart values. |

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
| `update-suborder-status` (Phase 6) | Cook-driven suborder status transitions. Body `{suborderId, newStatus}`, `newStatus` ∈ confirmed/preparing/ready/completed/cancelled. Verifies caller owns the vendor, performs the update (still independently gated by migration 0017's trigger), writes `audit_log`, sends best-effort email (Resend) + SMS (Twilio) to the customer. | anon+JWT (caller's own vendor) |

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
call), `RESEND_API_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
`TWILIO_FROM_NUMBER` (added Phase 6, for `update-suborder-status`'s SMS
notifications — SMS sends automatically to `profiles.phone`, no opt-in gate,
per confirmed product decision), plus the auto-populated `SUPABASE_*` ones.

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
    kitchen/[id].tsx        Phase 6: cook's suborder detail -- items, fulfillment info, status
                             action buttons (calls update-suborder-status), MessageThread. Pushed
                             outside (tabs), same "no bottom tab bar reachable" gotcha as below.
    order-tracking/[id].tsx Phase 6: customer's suborder detail -- status timeline (pickup vs
                             delivery step lists), items, MessageThread. Same nav gotcha.
    (tabs)/                 bottom tab bar
      _layout.tsx           Tabs from 'expo-router' (NOT @react-navigation/bottom-tabs as a
                             separate package -- expo-router 57.x vendors react-navigation
                             internally; the deprecated-but-functional `Tabs` export works fine
                             and needs zero extra native deps). Phase 6 added "orders" (always
                             visible) and "kitchen" (href: null unless the signed-in profile
                             owns an active vendor -- see the query-key note below).
      index.tsx              Browse: full-text search (vendors + menu_items), vendor-type filter
      orders.tsx              Phase 6: customer's own suborders grouped by order, newest first,
                              status badges, tap through to order-tracking/[id]
      favorites.tsx           refetches on focus (useFocusEffect) -- tab screens stay mounted,
                              see the bug note in §9
      cart.tsx                multi-vendor grouping, pickup/delivery toggle, 15-min slot picker,
                              delivery address geocoding, Remove/Clear cart buttons
      kitchen.tsx              Phase 6: cook's open suborders (oldest first), tap through to
                              kitchen/[id]. Uses query key ["vendor_for_kitchen", ...] --
                              deliberately NOT ["vendor", ...] (used by account.tsx/use-vendor.ts
                              with a `select("*")`) to avoid the cache-collision class of bug
                              in §9 bug #1: two screens sharing a key but selecting different
                              columns means whichever query runs first silently wins the cache.
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
    message-thread.tsx      Phase 6: shared by kitchen/[id] and order-tracking/[id]. Given a
                            vendor_suborder_id + the other party's profile id, lists messages
                            oldest-first, send box, marks incoming unread as read on view.
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

## 11. Phase 6 — built, pending your manual gate test

All four decisions were confirmed with the user before building: SMS via
Twilio (not email-only), sent automatically with no opt-in gate; a new
"Kitchen" bottom tab visible only to profiles owning an active vendor; a
Postgres trigger (not app-layer) enforcing legal status transitions; and a
full customer "My Orders" list + tracking detail screen (not just a
single-order view), since none existed before this phase.

**What shipped:**
1. Migration 0017: `guard_suborder_status_transition()` trigger — the state
   machine is received→confirmed→preparing→ready→completed for pickup;
   delivery suborders stop at `ready` (claimed-onward is Phase 8); cancel is
   allowed from received/confirmed/preparing. Enforced at the DB layer
   regardless of caller, so it can't be bypassed outside the app. Also
   auto-populates `ready_at` (Phase 8's unclaimed-fallback clocks will read
   this).
2. Migration 0018: `suborder_customer_profile_id()` — narrow SECURITY DEFINER
   lookup so a cook can address the customer in the `messages` thread without
   widening `orders_select` RLS.
3. Edge function `update-suborder-status` — the single place that performs
   the transition, writes `audit_log`, and sends the email+SMS. Notification
   failures are logged (never block the transition), matching the established
   `stripe-webhook` pattern.
4. Mobile: Kitchen tab (list + `kitchen/[id]` detail with status buttons +
   messaging), Orders tab (list + `order-tracking/[id]` detail with a
   pickup/delivery-aware timeline + messaging), shared `MessageThread`
   component.

**Verified server-side already** (throwaway edge function + fixtures,
deleted after use, same discipline as prior phases): legal pickup chain
received→completed succeeds; illegal skip (received→completed) is rejected
with a clear error; delivery's ready→completed is rejected (pickup-only);
`ready_at` auto-populates; a non-owner calling the function gets a clean 403
(fixed during this pass — it originally leaked a raw Postgres error message);
`audit_log` rows land for every transition; messages are readable by both
parties and invisible to an unrelated third profile (RLS confirmed); Twilio
SMS correctly authenticates and sends (confirmed via a deliberately-invalid
test number bouncing with Twilio's own "invalid number" error, not an auth
error — the wiring is correct, a real number should deliver).

**SMS opt-in (migrations 0019 + 0020) — went through two iterations:**
1. First pass (0019): "automatic, no opt-in gate" didn't survive contact with
   Twilio's A2P 10DLC registration — the campaign was rejected (error 30909)
   for describing a signup checkbox that didn't exist in the app. Added
   `profiles.sms_opt_in` (boolean, default false) gating the SMS send in
   `update-suborder-status`, with the checkbox living on the post-signup
   `complete-profile.tsx` phone step.
2. Second pass (0020), after a second campaign resubmission was *also*
   rejected: consent needed to be bundled into the same mandatory checkbox as
   Terms & Conditions / Privacy Policy acceptance, blocking the Sign Up button
   itself — not a separate later step. `apps/mobile/app/(auth)/sign-up.tsx`
   now has a required checkbox (Terms & Conditions + Privacy Policy links via
   `Linking.openURL` to `cottomarket.com/terms-and-conditions` and
   `/privacy-policy` + SMS consent text) that disables Sign Up until checked.
   `signUpWithPassword()` passes `sms_opt_in: true` through signup metadata;
   `handle_new_user()` (migration 0020) seeds `profiles.sms_opt_in` from it,
   same mechanism it already used for `full_name`. The standalone
   `complete-profile.tsx` checkbox was removed (redundant — consent is
   already captured at signup); `account.tsx`'s toggle stays as the
   in-app post-hoc opt-out mechanism.

Verified server-side (throwaway fixtures, deleted after use): signup with
`sms_opt_in: true` metadata correctly seeds `profiles.sms_opt_in = true`;
signup without that key defaults safely to `false`; `update-suborder-status`
only calls Twilio when `sms_opt_in = true`.

**Third iteration (migrations 0030 + code changes) — consent moved from
signup to the actual phone-collection screens.** The second rejection
(30922, "Website does not meet campaign verification requirements") turned
out to be two separate things: `cottomarket.com` really was an unfinished
Canva placeholder at the time (fixed by the user, verified after a caching
delay on this end — real content, real Terms/Privacy pages, confirmed via
the actual page text, not just trusting the URLs). Separately, **Twilio's
follow-up guidance changed the required consent mechanism entirely**: the
disclosure must be inline, directly below the phone number field, on the
*specific screen where that phone number is actually collected* — not
bundled into an earlier signup checkbox before a phone number even exists.
Verbatim customer and vendor disclosure text was provided, with explicit
instruction not to use a checkbox for either.

Rebuilt to match:
- `apps/mobile/app/(auth)/sign-up.tsx`'s checkbox is now Terms & Conditions +
  Privacy Policy only — the SMS sentence was removed (this screen has no
  phone field and shouldn't make an SMS-specific representation).
  `signUpWithPassword()` no longer sets `sms_opt_in` in signup metadata.
- `apps/mobile/app/(app)/complete-profile.tsx` (where customers actually
  provide their phone) now has Twilio's verbatim customer disclosure text
  directly below the phone field, with tappable Privacy Policy / Terms of
  Service links, no checkbox. `completeProfile()` sets
  `profiles.sms_opt_in = true` unconditionally on submit — the visible
  disclosure plus tapping Continue *is* the consenting action, per Twilio's
  explicit instruction.
- `apps/mobile/src/features/vendor-onboarding/business-basics-step.tsx`
  (where vendors provide their business phone, onboarding step 0) now has
  the equivalent verbatim vendor disclosure text below that field. New
  `vendors.sms_opt_in` column (migration 0030, mirrors `profiles.sms_opt_in`)
  — set `true` unconditionally when this step is submitted. Vendor-facing
  SMS sends themselves (order alerts, delivery notifications, payout
  confirmations) are **not built yet** — this only captures consent so it's
  ready when that notification path exists.
- `TERMS_URL`/`PRIVACY_URL` extracted to `packages/shared/src/legal.ts`
  (single source of truth now that 3 screens reference them).

Verified server-side: a signup with no metadata key leaves
`profiles.sms_opt_in = false`; the `completeProfile()`-equivalent call flips
it to `true`; a fresh vendor defaults to `sms_opt_in = false`; the
business-basics-equivalent patch flips it to `true`.

**Not yet resubmitted to Twilio as of this writing.** Suggested
`message_flow` text for the resubmission, describing this actual mechanism:
*"End users consent to receive automated SMS messages via two inline
disclosures, each shown directly below the phone number field before the
user can proceed — customers on the profile-completion screen after signup,
vendors on the business-details step of onboarding. Each names the specific
message types, discloses message frequency and 'Msg & data rates may
apply,' gives STOP/HELP instructions, and links directly to the Privacy
Policy and Terms of Service. No checkbox is used; tapping Continue/Next past
the visible disclosure is the consenting action. Consent may be revoked at
any time by replying STOP."*

**Lesson (still holds): verify a Twilio A2P 10DLC campaign's status directly
via `GET .../Services/{sid}/Compliance/Usa2p`** — the Console can make brand
approval look like the whole thing is done, but campaign approval is
separate and covers actual sending. **New lesson: don't trust a
"the page/URL exists" claim without loading it** — the Canva placeholder
was live and had been for a while; a quick browser check would have caught
it before the first campaign submission rather than after two rejections.

**Known limitation, not fixed:** the Kitchen screens don't show the
customer's name — `profiles` RLS only allows a profile to read its own row
(`profiles_select_own_or_admin`), so a cook can't join to the customer's
`full_name`. Order items, fulfillment time/address, and messaging work
regardless. If you want cooks to see a customer's first name (e.g. for
pickup verification), that needs a deliberate, scoped RLS decision — flag it
if you want it before Phase 6 gate-passes, otherwise it's a fine follow-up.

**Not committed yet** — per the established workflow, this stays uncommitted
until you gate-test and confirm. Migrations 0017/0018 and the new edge
function are already live on the hosted project (that part can't be staged
locally the way code can), but nothing is pushed to `main`.

### Gate-test walkthrough

Sign in as `CPITTS1183@gmail.com` (owns **Tester Kitchen**, `active` status,
Stripe Connect fully active) — you'll be both the customer and the cook for
this test, which is fine (self-purchase is allowed by design).

**Pickup, full cycle:**
1. Browse tab → add "Basil Pesto Pasta" from Tester Kitchen → Cart → choose
   **Pickup**, pick a time slot → checkout with `4242 4242 4242 4242`.
2. Open the new **Orders** tab. The order should appear with a "Received"
   badge. Tap it → the tracking timeline should show only "Order received"
   lit.
3. The new **Kitchen** tab should now be visible (it wasn't before — it only
   shows once you own an active vendor). Open it; the order you just placed
   should be there.
4. Tap in. Confirm the item and pickup time are correct. Tap **Confirm
   order** → status flips to Confirmed. Check your email and phone for a
   notification.
5. Tap **Start preparing** → Preparing, check for a notification again.
6. Tap **Mark ready** → Ready, check for a notification. Switch to the
   Orders tab tracking screen for this same order (may need a few seconds —
   it polls every 10s) and confirm "Ready" is now lit.
7. Tap **Mark completed** → Completed, check for a notification. Confirm the
   order disappears from the Kitchen tab's open list and shows "Completed"
   in Orders.

**Delivery, cook side only (should stop at ready):**
8. Repeat steps 1-2 but choose **Delivery** and confirm an address instead.
9. In Kitchen, walk it received→confirmed→preparing→ready as before. At
   `ready`, confirm there is **no** "Mark completed" button — instead you
   should see "waiting in the delivery pool for a driver to claim it." On
   the customer side, the tracking timeline should stay lit through "Ready"
   with "Driver assigned" onward greyed out.

**Messaging:**
10. From either suborder's Kitchen detail screen, send a message. Switch to
    that same suborder's Orders tracking screen and confirm the message
    appears. Reply from there and confirm it shows back on the Kitchen side.

**Also worth a quick spot-check (not in the original acceptance gate):**
11. Try the **Cancel order** button (available from received/confirmed/
    preparing) on a throwaway suborder if you want to confirm it works —
    it's built but not covered by the acceptance gate above.

Once you confirm this passes, let me know and I'll prep the commit + squash
merge (`phase 6: cook order lifecycle`) and move on to Phase 7.

**Phases after 6** (for context, not in scope now): 7 — Delivery onboarding +
eligible pool, 8 — Claim/deliver/payout, 9 — Unclaimed fallback + customer
offer, 10 — Reviews/favorites polish/waitlist notifications, 11 — Admin
dashboard, 12 — Polish/store submission/launch readiness.

---

## 12. External code review + security fixes (2026-07-17)

While waiting on Twilio's A2P 10DLC campaign review, the user had ChatGPT
Codex review a sanitized full-codebase export (no secrets — built by
concatenating tracked files + Phase 6's untracked additions into one
document; excluded `.env*`, the lockfile, the generated `database.ts`, and
binary assets). Every finding below was independently re-verified against
the actual code before anything was fixed or dismissed — do not assume an
external review's severity or framing is correct without checking; in this
case nearly everything held up, and one (guest carts) was actually worse
than described.

**Fixed (migrations 0021-0029 + code changes):**

1. **Admin dashboard had no role check.** All 5 `/dashboard/**` pages
   (`dashboard/page.tsx`, `orders/page.tsx`, `orders/[id]/page.tsx`,
   `vendors/page.tsx`, `vendors/[id]/page.tsx`) only checked `if (!user)
   redirect("/login")`, then queried with the **service-role client**
   (bypasses RLS). `requireAdmin()` already existed and was correctly used
   in the mutation API routes — it was just never called on the read pages.
   Any authenticated Supabase user in the shared project (not just the
   admin allow-list — that only gates who *receives* a magic link, not who
   can present a valid session) could see every order, customer email,
   vendor Stripe account ID, and a signed URL to CFPM certificate images.
   Fixed with a new `apps/admin/src/app/dashboard/layout.tsx` calling
   `requireAdmin()` as the primary gate (single enforcement point, so a
   future new dashboard page can't omit it), plus every page updated to use
   `requireAdmin()` directly instead of a raw `getUser()` check.
2. **Vendor / delivery-profile self-approval.** `vendors_insert_own` and
   `vendor_delivery_profiles_insert` (migration 0010) only checked
   ownership — `guard_vendor_owner_update` / `guard_delivery_profile_owner_update`
   only ran `BEFORE UPDATE`, never `BEFORE INSERT`. A direct
   `.insert({status: 'active', platform_fee_pct: 0, stripe_account_id: '...'})`
   bypassed admin review entirely. Fixed with `guard_vendor_owner_insert` /
   `guard_delivery_profile_owner_insert` (migration 0021) — forces `status`
   and other privileged columns back to safe defaults for any non-admin/
   non-service-role caller. Verified server-side: an attacker profile
   attempting exactly this insert got `status: 'draft'`,
   `platform_fee_pct: null`, `stripe_account_id: null` back, and a
   delivery-profile insert attempting `delivery_active` got `not_started`.
3. **Cart price/vendor tampering.** `cart_items_own_or_guest`'s policy only
   checked cart ownership, never validated `unit_price_cents`/`vendor_id`
   against the live `menu_items` row — and `checkout-create-payment-intent`
   trusted `cart_items.unit_price_cents` directly when computing the
   charge. Fixed two ways: `sync_cart_item_price()` (migration 0022, `BEFORE
   INSERT OR UPDATE` on `cart_items`, no service-role bypass — there's no
   legitimate reason for a cart line to ever disagree with its menu item)
   makes the DB the source of truth regardless of caller; and
   `checkout-create-payment-intent` was independently rewritten to re-derive
   price and vendor fresh from `menu_items` at checkout time rather than
   trusting `cart_items` at all (true defense in depth — verified both the
   insert-time and a follow-up update-time tamper attempt were overwritten
   back to the real menu item's price).
4. **Reviews/messages abuse.** `reviews_insert_own` had no check that the
   customer actually had a completed suborder with that vendor — anyone
   could review any vendor. `messages_insert` was *not* wide open like
   reviews (it correctly required the sender to be the real customer or
   vendor owner of a specific suborder) but never validated `to_profile_id`
   was the actual counterpart, so a legitimate customer could address a
   message on their own real order to an arbitrary third profile. Fixed:
   extended the existing `guard_review_not_self()` trigger (migration 0010)
   to also require the suborder belong to that customer, match the vendor,
   and be `completed` (migration 0023); added `is_valid_message_recipient()`
   and rewrote `messages_insert`'s `with check` to require sender and
   recipient be the two opposite parties on the suborder. Verified
   server-side: a stranger reviewing a vendor they never ordered from —
   rejected; reviewing a not-yet-completed order — rejected; the real
   customer reviewing after completion — succeeds; messaging an arbitrary
   third profile — rejected by RLS; messaging the real vendor owner —
   succeeds.

5. **Guest carts — worse than the original review described, now fixed
   (migration 0024).** `carts_own_or_guest`'s `using (profile_id = auth.uid()
   or profile_id is null or ...)` wasn't scoped per guest at all — a plain
   `.from('carts').select('*')` with no filter returned **every** guest cart
   on the platform to any caller. The migration 0006 comment's assumption
   ("the random ID is the secret") never held given how the policy was
   actually written. Confirmed before fixing: the mobile app's cart code
   never actually created a `profile_id`-null cart (no live guest-checkout UI
   exists), and the `session_id` column was never wired into RLS by anything —
   both were unused scaffolding from an earlier phase. Replaced with Supabase
   **Anonymous Sign-Ins** (`enable_anonymous_sign_ins = true`, pushed via
   `supabase config push`) rather than a custom session-token scheme — a
   guest now gets a real `auth.uid()` from a real (disposable) session, so
   `profile_id = auth.uid()` works uniformly for signed-up and anonymous
   users with no special-casing, and (unlike a custom cookie/token) needs no
   extra client-side plumbing since it reuses the exact same JWT-based
   session mechanism `auth-context.tsx` already handles generically. Dropped
   the now-fully-dead `session_id` column and made `profile_id` `NOT NULL`
   (confirmed zero existing null rows on hosted first). Verified server-side
   with two separate anonymous sessions: Guest B reading Guest A's cart by
   ID — null; Guest B's unfiltered `select('*')` — zero rows (previously
   returned every guest cart platform-wide); Guest B's delete attempt on
   Guest A's cart — 0 rows affected, Guest A's cart survived intact. No
   guest-checkout UI was built — this was a data-model/RLS fix so that a
   future guest-checkout feature has the right foundation already in place
   (`signInAnonymously()` + existing session machinery) rather than needing
   the cart security model reworked at that point.

6. **Unpaid orders visible to vendors — now fixed (migration 0025).**
   `vendor_suborders_select` had no `orders.status = 'paid'` filter, and
   `checkout-create-payment-intent` writes the suborder as `received` before
   the PaymentIntent is confirmed — a vendor could see (and, via
   `vendor_suborders_update_cook_or_admin`, act on: confirm, start
   preparing) an order that was never actually paid for. Fixed with a new
   `is_order_paid(order_id)` helper (same idiom as `is_customer_of_order`/
   `owns_vendor`) gating the `owns_vendor` branch of both the select and
   update policies — `is_customer_of_order` and `is_ops_admin` are
   untouched, since the customer legitimately needs to see their own
   suborder pre-payment while `order-confirmation.tsx`/the Orders tab poll
   for the webhook to flip status, and admins need full visibility for
   support. Fixing the update policy transitively protects the
   driver-visibility clauses too (`is_active_driver_for_suborder`/
   `can_view_pool_suborder` only ever match a suborder already at
   `ready`/`claimed`, which a cook can no longer reach for an unpaid order).
   Verified server-side: cook cannot see or update an unpaid suborder
   (update silently affects 0 rows, no error); customer can still see their
   own unpaid suborder; after marking the order paid, the cook can see it
   and successfully advance its status — legitimate paths unaffected.

7. **Checkout/webhook idempotency — now fixed (migrations 0027, 0028).**
   `checkout-create-payment-intent` had no protection against a double-tap
   or network retry creating duplicate orders/PaymentIntents for the same
   cart (a cart's `status` only flips to `checked_out` once payment actually
   succeeds, so an abandoned attempt left the cart `open` indefinitely,
   meaning even a *later, deliberate* re-checkout of the same cart could
   create a second order). `stripe-webhook`'s `order.status === 'paid'`
   check only guarded against *sequential* replay — concurrent duplicate
   deliveries of the same event could both pass that check before either
   finished writing, double-paying a vendor. Fixed: a partial unique index
   `orders_cart_id_pending_unique` (`cart_id` unique `where status =
   'pending_payment'`) is the DB-level backstop for true concurrent
   duplicates; `checkout-create-payment-intent` now proactively cancels any
   existing pending order for the cart (voiding its PaymentIntent) before
   creating a fresh one reflecting current cart contents, rather than
   blindly reusing a possibly-stale amount; a 23505 (unique violation) from
   the true-race case returns a clean 409 asking the client to retry.
   `stripe-webhook` now claims each `event.id` in a new
   `processed_stripe_events` table *before* doing any work — whichever
   concurrent request's insert wins processes the event, the loser bails out
   immediately with `alreadyProcessed: true`. Caught and fixed a real bug in
   my own first pass here: claiming the event before the work completes
   means a genuine failure must release the claim (delete the row) in the
   `catch` block, or a legitimate Stripe retry after a real error would be
   silently swallowed forever with the order stuck at `pending_payment`.
   Also added a Stripe `idempotencyKey` (`transfer-${suborder.id}`) on the
   `transfers.create` call itself as an independent backstop. Verified
   server-side: a double-tap on checkout leaves exactly one `pending_payment`
   order (the stale one cancelled); the unique index blocks a second
   `pending_payment` insert for the same cart outright; the event-tracking
   table blocks a duplicate `event_id` insert outright.
8. **Refund/transfer reconciliation — now fixed (migration 0026 +
   `/api/admin/orders/[id]/refund`).** Refunding a customer after a vendor
   Transfer had already fired left Cotto absorbing the loss with no
   reversal mechanism. Policy decided: reverse the vendor's Transfer via
   `stripe.transfers.createReversal()`, protected by an explicit 2-day
   Connect payout hold set at account creation
   (`stripe-connect-onboarding`) — verified against the real Tester Kitchen
   test-mode account that 2 days is Stripe's platform-enforced *minimum*
   for a US Express account (`delay_days: 1` is rejected outright) and
   already the account's default, so the vendor's payout can't have left
   their Connect balance before a same-day-or-next-day refund reverses it.
   New `vendor_suborders.stripe_transfer_reversal_id` column mirrors the
   existing `stripe_transfer_id` column for a queryable audit trail. Scope
   note: only full refunds trigger automatic reversal — the current UI only
   ever sends a full refund (`OrderActions`'s "Confirm full refund" is the
   only refund path built), and there's no unambiguous rule for mapping a
   partial dollar amount to a specific vendor's portion of a multi-vendor
   order, so a partial refund (reachable only via a direct API call, not the
   UI) logs `partial_refund_transfer_reversal_skipped` to `audit_log`
   instead of guessing. Verified against a real test-mode Transfer +
   reversal: `transfers.createReversal()` succeeds, the reversal ID
   persists correctly, and Stripe's own transfer object confirms
   `amount_reversed` and `reversed: true`.
9. **Storage buckets — now fixed (migration 0029).** Neither `cfpm-certs`
   nor `vendor-media` had `file_size_limit`/`allowed_mime_types` set. Both
   now capped at 10MiB; `vendor-media` restricted to
   `image/jpeg|png|webp`, `cfpm-certs` additionally allows `application/pdf`
   (certs are commonly scanned as PDFs). Verified against the real hosted
   buckets via the Storage Admin API (`storage.getBucket()` — the `storage`
   schema isn't exposed through PostgREST, so this can't be queried via
   `.from()`).
10. **Auth hardening — done, including email confirmation (correcting an
    earlier false alarm in this same doc).** `minimum_password_length`
    raised 6 → 8. `auth.rate_limit.email_sent` raised from Supabase's
    default of 2/hour to 30 (at 2/hour, this project would start silently
    rejecting real signups/resets/magic-links after only two in the same
    hour).

    **`enable_confirmations` is now on and working — the earlier "SMTP is
    broken" conclusion was a test-methodology bug, not a real one.** First
    attempt: every `signUp()`/`resetPasswordForEmail()`/`signInWithOtp()`
    call failed with a 500 `AuthRetryableFetchError` (empty body) — *every*
    email type, not just confirmation, which was wrongly read as evidence of
    a broken SMTP relay. Actual cause: every test used a fake
    `@example.com` recipient, which was undeliverable and surfaced as a
    generic 500 regardless of email type. Retested against a real address
    (with the user's permission, a `+alias` of their own inbox) and it
    worked cleanly first try: `signUp()` succeeded, no session (correct —
    pending confirmation), and the confirmation email genuinely arrived and
    the link worked.

    That retest *did* surface one real, separate bug: the confirmation link
    redirected to the **admin app's login page**. Cause: `signUpWithPassword()`
    never passed `emailRedirectTo`, so GoTrue fell back to `site_url`
    (`https://admin.cottomarket.com`) — correct for the admin app's own
    magic links, wrong for a mobile-app customer's signup confirmation, who
    has no reason to land on an internal admin tool (and confirming in a
    browser tab doesn't establish a session in the mobile app anyway — the
    user still needs to return to the app and sign in normally, which the
    "check your email" screen already tells them to do).

    Fixed: `signUpWithPassword()` (`packages/shared/src/auth.ts`) now takes
    an explicit `emailRedirectTo` parameter; `sign-up.tsx` passes
    `https://admin.cottomarket.com/email-confirmed`, a new minimal public
    page in the admin app (reuses existing hosting, no new infra) with
    generic "you're confirmed, return to the app" copy. The URL (plus
    `127.0.0.1:3000`/`localhost:3000` variants for local dev) was added to
    `additional_redirect_urls` and pushed. **Not yet re-verified end-to-end
    with the corrected redirect** — the fix is built and the URL is
    allow-listed, but confirming the *link itself* now lands on the new page
    (rather than admin login) needs one more real signup attempt, which
    wasn't re-tested after this specific fix landed.

    **Admin MFA — done (project confirmed on Supabase Pro).** TOTP enabled
    via `[auth.mfa.totp] enroll_enabled/verify_enabled = true`, pushed live.
    Enforced in two places, not just one:
    - `requireAdmin()` (`apps/admin/src/lib/require-admin.ts`) now also
      checks `getAuthenticatorAssuranceLevel().currentLevel === 'aal2'` —
      this is what actually protects every `/api/admin/**` mutation route,
      since a magic-link sign-in only ever grants AAL1. The dashboard layout
      gate alone would only cover page loads, not API calls.
    - `apps/admin/src/app/dashboard/layout.tsx` does its own inline
      role+MFA check (not just calling `requireAdmin()`, which only returns
      admin-or-null) so it can route correctly: no verified TOTP factor →
      `/mfa/enroll`; factor exists but this session is still AAL1 →
      `/mfa/verify`.
    - Two new pages: `/mfa/enroll` (`supabase.auth.mfa.enroll()` + QR code +
      manual-entry secret + `challengeAndVerify()`) and `/mfa/verify`
      (`listFactors()` + `challenge()` + `verify()` for a returning admin).
      Both are client components using the browser Supabase client: MFA
      enrollment/step-up needs the same session the browser already holds,
      not a fresh server-side one. `middleware.ts` now also protects
      `/mfa/**`, not just `/dashboard/**`.
    - Verified end-to-end against real Supabase Auth (a real TOTP secret,
      real RFC 6238 code generation via Web Crypto HMAC-SHA1, no mocking):
      AAL1 before enrollment → enroll + correct code → AAL2, factor status
      `verified`. **Critically**, a *fresh* sign-in with the same
      already-enrolled user starts back at AAL1 (proving the step-up
      challenge actually re-fires every session, not just once ever) — a
      wrong code is rejected (`"Invalid TOTP code entered"`), and a correct
      code on a fresh challenge reaches AAL2 again.
    - **CAPTCHA: explicitly deferred to post-V1** (user's call — needs an
      hCaptcha/Turnstile account, and the team decided not to add one for
      V1). `[auth.captcha]` stays disabled; revisit before a real public
      launch if bot signups become a problem.
11. **`seed.sql` — now fixed.** The three real admin emails
    (`CentralOps@CottoMarket.com`, `Neal.Weingarden@gmail.com`,
    `CPITTS1183@gmail.com`) are replaced with placeholders
    (`support@example.com` / `admin@example.com`) in the git-tracked file.
    This only affects local dev resets (`supabase db reset`) — the hosted
    `system_settings` row already has the real values and is untouched by
    this change; a comment now flags that testing the admin allow-list gate
    locally requires updating the placeholder to a real local test email
    first. Not addressed: the real emails still exist in this repo's git
    history from before this fix (low practical risk since the repo isn't
    public, but a history rewrite would be a separate, more disruptive ask
    if ever wanted).

All items from the external code review are now addressed except CAPTCHA
and admin MFA (both blocked on the user's input) and the SMTP/confirmation-
email issue discovered above (needs its own investigation, likely starting
with checking Resend's dashboard for delivery failures/domain issues around
the specific template GoTrue uses for confirmation emails).

## 13. Useful commands reference

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
