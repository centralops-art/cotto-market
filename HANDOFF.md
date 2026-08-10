# Cotto Marketplace — Handoff (Phase 11 merged, Phase 12 next)

Last updated: 2026-08-10. Phases 6 through 11 are all merged to `main` and
fully gate-tested (§15, §16, §18, §19, §20, §21). Phase 11 (admin dashboard:
KPIs incl. delivery network stats, vendor/customer lists + suspend, region
settings CRUD, platform fee settings incl. automated free-trial expiry)
squash-merged as commit `9f55c34` — all 6 acceptance-gate steps passed live
against the Vercel preview deployment, no bugs found during the walkthrough
(the one hiccup — a stuck Metro bundler on the founder's mobile dev client —
was an unrelated local dev-environment issue, not a Phase 11 bug; see §21's
gate-test-results note).

**Phase 12 (polish, store submission, launch readiness — see the spec's
phase table) is next and has not been started.**

This doc is meant to let a fresh Claude Code session pick up cleanly with
zero re-discovery. Read this fully before touching code. (§11/§12 are kept
as-is for historical record of how Phase 6 was built and verified; §15 has
its final close-out; §16 has Phase 7; §19 has Phase 9; §20 has Phase 10;
§21 has Phase 11.)

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
(all run per-workspace via `pnpm -r --if-present run <script>`). Root
`package.json`'s `name` is `"cotto"` -- relevant if you ever run a bare
`vercel` CLI command from repo root, see the Vercel CLI gotchas in §14.

GitHub: `centralops-art/cotto-market`. CI (`typecheck-lint-test` workflow) gates
every PR. Vercel auto-deploys `apps/admin` from `main` (admin.cottomarket.com),
project name **`cotto-market`** (not `cotto` -- see §14 gotcha #1 before
running any `vercel` CLI command in this repo). No CI/CD for the mobile app —
it's tested via Expo dev client + EAS builds.

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

## 4. Database: migrations 0001–0031 (all applied to hosted + local)

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
| 0021-0029 | **Security fixes from external code review — see §13 for full detail.** 0021: vendor/delivery-profile self-approval guard (`BEFORE INSERT`). 0022: `cart_items` price/vendor integrity (`sync_cart_item_price()`). 0023: reviews require a completed order, messages require the real counterpart. 0024: guest carts moved to Supabase Anonymous Sign-Ins, dropped `carts.session_id`, `profile_id` now `NOT NULL`. 0025: `is_order_paid()` gates vendor suborder visibility/updates. 0026: `vendor_suborders.stripe_transfer_reversal_id` for refund reconciliation. 0027: `orders_cart_id_pending_unique` partial index (checkout idempotency). 0028: `processed_stripe_events` table (webhook idempotency). 0029: storage bucket file-size/MIME limits. |
| 0030 | Phase 6 (third SMS-consent iteration): `vendors.sms_opt_in`, mirrors `profiles.sms_opt_in` for the business-basics onboarding step. See §13. |
| 0031 | **2026-08-02 gate-test follow-up (§12):** `suborder_customer_display_name(so_id)` SECURITY DEFINER function — same gate as `suborder_customer_profile_id` (0018), returns the customer's `full_name` instead of just their profile id. Lets Kitchen screens show who placed the order. |
| 0032 | Phase 7: private `drivers-licenses` storage bucket (10MiB, image/jpeg\|png\|webp + application/pdf) + owner/admin RLS policies, mirrors `cfpm-certs` (0013) but with the size/MIME limits folded in at creation instead of a follow-up migration. |
| 0033 | Phase 7: `vendor_delivery_profiles.drivers_license_expiry_warned_at` — mirrors `vendors.cfpm_expiry_warned_at` (0012), lets the new expiry cron avoid re-warning admins every day. |
| 0034 | Phase 7: daily `pg_cron` schedule for `cron-driver-license-expiry-check`, mirrors `0014_cfpm_expiry_cron.sql` exactly, offset 15 min after the CFPM job. |
| 0035 | Phase 7: `pool_suborder_customer_first_name(so_id)` SECURITY DEFINER function — gated on `can_view_pool_suborder` (not `owns_vendor`/`is_customer_of_order` like 0018/0031), returns only `split_part(full_name, ' ', 1)`. A pool-viewing driver hasn't claimed anything yet, so they see less than a cook/driver who has (spec 3.6: "customer first name only"). |
| 0036 | Phase 8: `claim_delivery(so_id)` and `release_delivery_claim(so_id, reason)` SECURITY DEFINER RPCs — the race-safe claim (atomic `UPDATE ... WHERE status='ready'` + `delivery_claims` insert with the payout split locked in) and its counterpart (voluntary release or watchdog auto-release, differentiated internally by `auth.role()`). |
| 0037 | Phase 8: full `create or replace` of `guard_suborder_status_transition()` (0017) extending the allow-list with the driver-side claim lifecycle (`ready→claimed→en_route_to_pickup→picked_up→en_route_to_customer→delivered→completed`, plus `{claimed,en_route_to_pickup}→ready` for release). Safe as a direct allow-list addition (not a role-bypass trick) because drivers have zero RLS UPDATE grant on `vendor_suborders` at all — this trigger only ever sees these transitions arrive via the Phase 8 RPCs/functions. |
| 0038 | Phase 8: `delivery_claims.stuck_notified_at` — idempotency marker for the stuck-claim watchdog's dispatch email, mirrors `drivers_license_expiry_warned_at`. |
| 0039 | Phase 8: full `create or replace` of `is_valid_message_recipient()` (0023), additively extending it to also recognize customer↔(currently active driver) as a valid message pair. **Fixed a real pre-existing gap**: driver↔customer messaging didn't work before this — the function only recognized customer↔cook. |
| 0040 | Phase 8: every-5-minute `pg_cron` schedule for `cron-stuck-delivery-watchdog`, same `pg_net`/Vault-secret idiom as 0014/0034 but sub-hourly given the 20-minute stuck-claim threshold. |
| 0041 | Phase 8: `suborder_driver_display_name(so_id)` SECURITY DEFINER function, mirrors `suborder_customer_display_name` (0031) in reverse — lets a customer's order-tracking screen show who's delivering their order. |
| 0042 | Phase 9: `vendor_suborders.tax_cents` — the per-suborder Stripe Tax figure was computed at checkout but only ever persisted as the order-level sum; needed for suborder-scoped refunds. |
| 0043 | Phase 9: `claim_delivery()` now logs `claim_cancelled_pending_offer` when a driver's claim wins the race against an active T2 offer (audit trail only, no behavior change). |
| 0044 | Phase 9: `suborder_pending_customer_offer(so_id)` SECURITY DEFINER function — returns the T3 deadline if an unresolved T2 offer exists for the suborder's current `delivery_cycle`, else null. |
| 0045 | Phase 9: every-5-minute `pg_cron` schedule for `cron-unclaimed-delivery-check`. |
| 0046 | Phase 10: public `review-images` storage bucket (10MiB, image/jpeg\|png\|webp), limits folded in at creation (0032's one-step pattern). Path scoped by `{customer_profile_id}/...`; public read, owner write/update/delete. |
| 0047 | Phase 10: `report_review(review_id, reason)` SECURITY DEFINER RPC — any authenticated profile can flag someone else's review (sets `is_flagged`/`flagged_reason`; a second report just overwrites the reason, no separate reports table). `rate_delivery_claim(so_id, rating, comment)` SECURITY DEFINER RPC — the real customer's one-time driver rating on the completed suborder's most recent `delivery_claims` row (`delivery_claims` had zero client-facing UPDATE grant since migration 0010, which explicitly reserved this for Phase 10). |
| 0048 | Phase 10: every-5-minute `pg_cron` schedule for `cron-waitlist-restock-check`. |
| 0049 | Phase 10: `review_customer_first_name(review_id)` SECURITY DEFINER function, same pattern as 0031/0035/0041 — `reviews_select` is public but `profiles` RLS only lets a profile read its own row, so without this a review's byline would always render blank to anyone but the reviewer. Granted to `anon` too since reviews are publicly viewable. |

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
| `cron-driver-license-expiry-check` (Phase 7) | pg_cron-triggered (0034); auto-suspends `vendor_delivery_profiles` (`delivery_active` → `delivery_suspended`) whose license expired, 60-day admin warning digest email. Direct field-substituted mirror of `cron-cfpm-expiry-check`. | service-role (cron) |
| `update-delivery-status` (Phase 8) | Driver-driven delivery status transitions (`en_route_to_pickup`/`picked_up`/`en_route_to_customer`/`delivered`). Verifies claim ownership under the caller's own JWT, then switches to the service-role client for the actual writes (drivers have no RLS UPDATE grant on `vendor_suborders`). On `delivered`: fires the driver's Stripe Transfer (mirrors the cook-side Transfer in `stripe-webhook`), then a *separate* update to `completed` (the guard trigger only allows one status-step per statement). | anon+JWT (caller's own active claim) |
| `compute-delivery-eta` (Phase 8) | Best-effort Mapbox ETA, called by the mobile client right after a successful claim (fire-and-forget). Mirrors `checkout-create-payment-intent`'s Directions call shape, reads `duration` instead of `distance`. | anon+JWT (caller's own active claim) |
| `cron-stuck-delivery-watchdog` (Phase 8) | pg_cron-triggered every 5 min (0040); auto-releases claims stuck in `claimed`/`en_route_to_pickup` 20+ minutes (food hasn't left the kitchen yet — safe to re-offer), notifies `regions.dispatch_email` once (not auto-recoverable) for claims stuck in `picked_up`/`en_route_to_customer` 20+ minutes. | service-role (cron) |
| `cron-unclaimed-delivery-check` (Phase 9) | pg_cron-triggered every 5 min (0045); T1/T2/T3 fallback for unclaimed `ready` delivery suborders — dispatch email, customer pickup-or-refund offer, auto-refund. | service-role (cron) |
| `resolve-delivery-offer` (Phase 9) | Customer's in-app response to the T2 offer (`{suborderId, choice: "pickup" \| "refund"}`). | anon+JWT (caller's own order) |
| `cron-waitlist-restock-check` (Phase 10) | pg_cron-triggered every 5 min (0048); emails each unnotified `waitlist_entries` row once its `menu_items.is_sold_out` flips false, then sets `notified_at` (consumed on first notification, no repeat emails on a later restock). Email-only — see §20. | service-role (cron) |

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

**`apps/admin/.env.local`** (not committed, points at **local** Supabase --
`http://127.0.0.1:54321`, requires `supabase start`/Docker) + **Vercel env
vars** (set per-env via `vercel env add`, separately from `.env.local` — this
bit the user once before, Vercel doesn't read local `.env.local`):
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `STRIPE_SECRET_KEY`.

**As of 2026-08-02, all 5 of these are now set for both the `Production` and
`Preview` Vercel environments** on the `cotto-market` project (Preview was
previously missing all 5 entirely, breaking every PR preview deploy that
touched the MFA pages — see §12 for the fix and the "Sensitive" env var
gotcha, and §14 for the general Vercel CLI gotchas). If you ever need to
re-sync Preview from Production values, do **not** use `vercel env pull` to
read Production's values first — those vars are marked "Sensitive" in
Vercel, so pulling them back returns a redacted placeholder string, not the
real value. Source real values from `apps/mobile/.env` (Supabase URL/anon
key), a fresh `supabase projects api-keys --project-ref hlwatggikosoeejskujq`
(service role key), or `apps/admin/.env.local` (Resend/Stripe -- same
accounts as production, just not Vercel-managed).

**If the hosted project's `SUPABASE_SERVICE_ROLE_KEY` is ever rotated**: it
needs updating in the Vercel env var (`apps/admin`, both Production and
Preview) or every `requireAdmin()`-gated admin route and the vendor-approval/
refund routes will break. Edge functions get their own copy auto-injected by
the Supabase platform and should stay in sync automatically. You do not need
the user to paste the key in chat -- fetch it live via
`supabase projects api-keys --project-ref hlwatggikosoeejskujq` (already
authenticated) rather than storing it. **Do not print the raw key value into
your visible output/response** -- write it straight to a local file and read
from there, the same way §12's fixes handled it; a legacy service_role key
accidentally got printed into a session transcript once already this
project (2026-08-02), flagged to the user, their call whether to rotate.

**Supabase Auth config** (`supabase/config.toml`, synced to hosted via `supabase
config push` — **this command overwrites hosted with whatever's in the local
file**, be careful): `site_url = "https://admin.cottomarket.com"`, custom Resend
SMTP for auth emails, redirect URLs list includes both hosted and local dev
targets. As of migration-adjacent config from 2026-08-02, also includes a
custom `[auth.email.template.magic_link]` (see §12) surfacing `{{ .Token }}`
(the 6-digit OTP code) alongside the default `{{ .ConfirmationURL }}` link.

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
    kitchen/[id].tsx        Phase 6: cook's suborder detail -- items, fulfillment info, customer name
                             (added 2026-08-02, see §12), status action buttons (calls
                             update-suborder-status), MessageThread. Pushed outside (tabs),
                             same "no bottom tab bar reachable" gotcha as below.
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
  login/                               magic-link + 6-digit-code auth (PKCE flow -- see
                                        §9 bug #6 and §12 for why both paths exist), allow-list
                                        gated. Now surfaces /auth/callback's ?error= reason
                                        (previously silently dropped, see §9 bug #7 -- fixed
                                        2026-08-02).
  auth/callback/route.ts               magic-link click path: exchangeCodeForSession, then
                                        gateAdminUser()
  api/admin/
    verify-code/route.ts               2026-08-02: 6-digit-code path, verifyOtp({type:"email"}),
                                        then gateAdminUser() -- same gate as the callback route,
                                        works cross-device since verifyOtp has no PKCE
                                        code_verifier dependency (see §12)
    request-login                      magic link + code request, allow-list gated
    vendors/[id]/approve, reject       service-role writes + audit_log + best-effort email
    orders/[id]/refund                 stripe.refunds.create + order status update + audit_log +
                                        customer notification email (added post-Phase-5-gate-test)
  dashboard/
    page.tsx                          nav hub: Vendors, Orders buttons + sign out
    vendors/                          list (status-tab filtered) + detail + approve/reject actions
    orders/                           list + detail (shows all vendor_suborders + order_items) + refund action
lib/
  supabase/{client,server,middleware}.ts   @supabase/ssr, PKCE flow type (default)
  admin-login-gate.ts                  2026-08-02: gateAdminUser(user) -- shared allow-list +
                                        role-elevation check, used by both /auth/callback and
                                        /api/admin/verify-code so the logic isn't duplicated
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
6. **Magic link `exchange_failed` — FIXED 2026-08-02 (see §12).** Originally
   logged here as "not a bug — just needs the user to open the link in the
   same browser session that requested it." That framing was wrong: it *is* a
   real usability problem, not a one-off mistake to be careful about. Root
   cause: Supabase's PKCE flow (default in `@supabase/ssr`) stores the
   `code_verifier` in a cookie on whichever browser/device called
   `signInWithOtp` — since `/api/admin/request-login` runs server-side, that
   cookie lives on the browser that submitted the login form. Clicking the
   emailed link from a *different* browser, device, or an email app's in-app
   browser can never have that cookie, so the exchange always fails — no
   amount of user care avoids it. Fixed by adding a 6-digit code as an
   alternative sign-in path (`verifyOtp` has no code_verifier dependency, so
   it works from any device) — see §12 for the implementation. **Lesson: when
   a "just be careful" workaround for a recurring failure survives more than
   one gate-test cycle, it's a sign the workaround is actually masking a real
   architectural constraint worth fixing properly.**
7. **`admin/login` page never surfaced the callback route's `?error=...`
   query param — FIXED 2026-08-02 (§12).** Previously only showed client-side
   form errors, silently dropping the actual reason a sign-in failed (e.g.
   `exchange_failed`). Now maps each error code to a specific message,
   including pointing the user at the 6-digit code specifically when the
   link fails cross-device.

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
`neal.weingarden@gmail.com`, careful with test emails to this one; note this
is currently the only test/fixture customer profile with a non-null
`profiles.full_name`, useful if you need to test anything that displays the
customer's name, e.g. `suborder_customer_display_name` from migration 0031).

**Orders**: several test orders exist in various states (`pending_payment`,
`paid`, `refunded`) from Phase 5 smoke testing and the user's manual gate
tests — harmless leftover data, safe to ignore or reuse, not cleaned up
deliberately in case they're useful reference (per earlier agreement with the
user). Also harmless: a throwaway auth user
`cpitts1183+cottotest0802@gmail.com` (a `+alias` of the founder's real inbox)
created 2026-08-02 to verify the email-confirmation redirect fix (§12) --
left in place rather than chasing down the hosted service-role key again
just to delete it.

---

## 11. Phase 6 — built, gate-tested except the Twilio-gated portion

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

**Resubmitted to Twilio as of 2026-08-02, awaiting approval.** The
resubmission responded to Twilio's most recent rejection reason (sample
messages outside the campaign's stated scope) by narrowing the sample
messages to match the stated scope exactly. `message_flow` text used:
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
separate and covers actual sending. **Lesson from the second rejection:
don't trust a "the page/URL exists" claim without loading it** — the Canva
placeholder was live and had been for a while; a quick browser check would
have caught it before the first campaign submission rather than after two
rejections.

**Known limitation from earlier in Phase 6 — FIXED 2026-08-02 (§12).** The
Kitchen screens previously couldn't show the customer's name (`profiles`
RLS only allows a profile to read its own row). Migration 0031 added a
narrow SECURITY DEFINER lookup for this; `kitchen/[id].tsx` now displays it.

**Merge status: fully closed as of 2026-08-08 -- see §15.** This subsection
is kept as historical record of the provisional-merge period: Phase 6 was
merged early to `main` (commit `8a6fd90`, 2026-07-30) to unblock other work
while waiting on Twilio's A2P 10DLC campaign review, before the gate test
in §11 could be fully completed. Everything not needing SMS was verified
during that period (§12); the SMS-dependent steps below (4-7, 9) were
blocked until Twilio's approval, which landed 2026-08-08 -- §15 has the
close-out verification.

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
   notification. *(SMS portion blocked on Twilio approval.)*
5. Tap **Start preparing** → Preparing, check for a notification again.
   *(SMS portion blocked on Twilio approval.)*
6. Tap **Mark ready** → Ready, check for a notification. Switch to the
   Orders tab tracking screen for this same order (may need a few seconds —
   it polls every 10s) and confirm "Ready" is now lit. *(SMS portion blocked
   on Twilio approval.)*
7. Tap **Mark completed** → Completed, check for a notification. Confirm the
   order disappears from the Kitchen tab's open list and shows "Completed"
   in Orders. *(SMS portion blocked on Twilio approval.)*

**Delivery, cook side only (should stop at ready):**
8. Repeat steps 1-2 but choose **Delivery** and confirm an address instead.
9. In Kitchen, walk it received→confirmed→preparing→ready as before. At
   `ready`, confirm there is **no** "Mark completed" button — instead you
   should see "waiting in the delivery pool for a driver to claim it." On
   the customer side, the tracking timeline should stay lit through "Ready"
   with "Driver assigned" onward greyed out. *(SMS portion blocked on Twilio
   approval.)*

**Messaging:**
10. From either suborder's Kitchen detail screen, send a message. Switch to
    that same suborder's Orders tracking screen and confirm the message
    appears. Reply from there and confirm it shows back on the Kitchen side.

**Also worth a quick spot-check (not in the original acceptance gate):**
11. Try the **Cancel order** button (available from received/confirmed/
    preparing) on a throwaway suborder if you want to confirm it works —
    it's built but not covered by the acceptance gate above.

**Once Twilio approves**, re-run steps 4-7 and 9 specifically to confirm the
SMS notifications fire, then let me know and I'll prep the commit history
cleanup if needed + move on to Phase 7.

**Phases after 6** (for context, not in scope now): 7 — Delivery onboarding +
eligible pool, 8 — Claim/deliver/payout, 9 — Unclaimed fallback + customer
offer, 10 — Reviews/favorites polish/waitlist notifications, 11 — Admin
dashboard, 12 — Polish/store submission/launch readiness.

---

## 12. Phase 6 gate-test follow-up fixes (2026-08-02)

With the full gate test blocked on Twilio, this session worked through
everything that *could* be verified/fixed independently, one item at a time.
All code changes went through the established `fix:` branch → PR →
`typecheck`/`lint` → server-side verification → merge workflow.

**1. Email-confirmation redirect (§13 item 10) — verified, no code
changes needed.** §13 item 10 had built the fix (an `emailRedirectTo`
pointing signup confirmation at a new `/email-confirmed` admin page instead
of falling back to `site_url`/admin login) but never re-verified it
end-to-end. Triggered a real signup for a `+alias` of the founder's inbox
(`cpitts1183+cottotest0802@gmail.com`, left in the DB as harmless leftover
test data, see §10) and the founder confirmed the link correctly landed on
`/email-confirmed`. Confirmed fixed.

**2. Cooks couldn't see the customer's name — fixed,
[PR #13](https://github.com/centralops-art/cotto-market/pull/13), migration
0031.** See §4 (migration table) and §11 (known limitation, now resolved).
`suborder_customer_display_name(so_id)` mirrors the existing
`suborder_customer_profile_id()` pattern exactly (same
`owns_vendor`/`is_customer_of_order`/`is_ops_admin` gate). Verified
server-side with real sessions (via `auth.admin.generateLink` +
`verifyOtp`, no passwords needed): the vendor owner correctly sees the real
name; an unrelated authenticated profile calling the same RPC for the same
suborder gets `null`.

**3. Admin magic link required the same browser/device — fixed,
[PR #14](https://github.com/centralops-art/cotto-market/pull/14).** See §9
bug #6 for the root-cause writeup and §8 for the file layout. Summary: a
6-digit code (`verifyOtp({type: "email"})`) was added as an alternative to
the link, since verifying a numeric code has no PKCE `code_verifier`
dependency and therefore works regardless of which device/browser requested
it. Required a custom `magic_link` email template
(`supabase/templates/magic_link.html`, wired via
`[auth.email.template.magic_link]` in `config.toml`, pushed to hosted via
`supabase config push`) to actually surface the code in the email — the
default Supabase template only shows the link. Verified server-side
(`generateLink` + `verifyOtp` with the real generated code establishes a
session; reusing the same code afterward is correctly rejected as
expired/invalid) and **gate-tested live by the founder**: opened the link in
a new window, got correctly routed to the code prompt, entered the code, it
worked, and MFA was still required afterward (confirming the code path goes
through the same `gateAdminUser()` + MFA enforcement as the link path, not
some parallel weaker route).

**4. Vercel Preview deployments were broken — fixed (infra only, no code
merged).** Discovered as a side effect of PR #13/#14: `cotto-market`'s
Vercel `Preview` environment had **none** of the 5 env vars Production had
(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `STRIPE_SECRET_KEY`),
so every Preview build touching the MFA pages (`/mfa/enroll`, `/mfa/verify`
— client components that call `createClient()` at the top of the component
body, which Next.js still executes during static prerendering even for
`"use client"` pages) crashed with `@supabase/ssr: Your project's URL and
API key are required`. Production wasn't affected since Production already
had all 5 set.

Fixing this took two wrong turns worth remembering:
- First attempt copied Production's values via `vercel env pull`, but
  Production's vars are marked **"Sensitive"** in Vercel — pulling a
  Sensitive var back returns the literal string `[SENSITIVE]`, not the real
  value, silently. All 5 Preview vars ended up set to that placeholder
  garbage string until this was caught (the build failure looked identical
  either way, which is what made it non-obvious). Real values were instead
  sourced from `apps/mobile/.env` (Supabase URL/anon key, same hosted
  project), a fresh `supabase projects api-keys` call (service role key),
  and `apps/admin/.env.local` (Resend/Stripe — same accounts as production).
- `vercel deploy --cwd <repo root>` and an earlier `vercel link --yes`
  (without `--project`) each auto-created a stray, unwanted Vercel project
  (`admin`, then `cotto`, named after the root `package.json`'s `"cotto"`)
  instead of using/linking the real `cotto-market` project. The `cotto` one
  had gotten a live GitHub integration and started posting duplicate,
  confusing check results on PRs before it was caught. Both were deleted
  (`vercel project rm <name>`, needs `y` piped to stdin — `--yes` and
  `--non-interactive` don't suppress the confirmation prompt on this
  subcommand in CLI 58.4.4). See §14 for the gotchas extracted from this.

Verified via a real GitHub-triggered Preview build (not just an ad-hoc CLI
deploy, which turned out to be misleading during debugging — see §14 gotcha
#2) on a throwaway branch/PR, closed without merging afterward.

**What's left**: nothing — the Twilio-dependent items were closed out
2026-08-08, see §15.

---

## 13. External code review + security fixes (2026-07-17)

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
10. **Auth hardening — done, including email confirmation.**
    `minimum_password_length` raised 6 → 8. `auth.rate_limit.email_sent`
    raised from Supabase's default of 2/hour to 30 (at 2/hour, this project
    would start silently rejecting real signups/resets/magic-links after
    only two in the same hour).

    **`enable_confirmations` is on and working.** First attempt: every
    `signUp()`/`resetPasswordForEmail()`/`signInWithOtp()` call failed with
    a 500 `AuthRetryableFetchError` (empty body) — *every* email type, not
    just confirmation, which was wrongly read as evidence of a broken SMTP
    relay. Actual cause: every test used a fake `@example.com` recipient,
    which was undeliverable and surfaced as a generic 500 regardless of
    email type. Retested against a real address (with the user's
    permission, a `+alias` of their own inbox) and it worked cleanly first
    try: `signUp()` succeeded, no session (correct — pending confirmation),
    and the confirmation email genuinely arrived and the link worked.

    That retest *did* surface one real, separate bug: the confirmation link
    redirected to the **admin app's login page**. Cause: `signUpWithPassword()`
    never passed `emailRedirectTo`, so GoTrue fell back to `site_url`
    (`https://admin.cottomarket.com`) — correct for the admin app's own
    magic links, wrong for a mobile-app customer's signup confirmation, who
    has no reason to land on an internal admin tool. Fixed:
    `signUpWithPassword()` (`packages/shared/src/auth.ts`) now takes an
    explicit `emailRedirectTo` parameter; `sign-up.tsx` passes
    `https://admin.cottomarket.com/email-confirmed`, a minimal public page
    in the admin app with generic "you're confirmed, return to the app"
    copy. **Re-verified end-to-end 2026-08-02 (§12 item 1)**: a real signup's
    confirmation link correctly lands on `/email-confirmed`, confirmed by
    the founder.

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
      code on a fresh challenge reaches AAL2 again. **Re-confirmed live by
      the founder 2026-08-02** during the §12 item 3 gate test (MFA was
      still required after signing in via the new 6-digit-code path).
    - **CAPTCHA: explicitly deferred to post-V1** (user's call — needs an
      hCaptcha/Turnstile account, and the team decided not to add one for
      V1). `[auth.captcha]` stays disabled; revisit before a real public
      launch if bot signups become a problem. This is the only intentionally
      unaddressed item from this review — not a bug, a deferred decision.
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
(explicitly deferred to post-V1, the user's own decision, not an open bug).

## 14. Useful commands reference

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

**Vercel CLI gotchas (learned the hard way 2026-08-02, see §12 item 4)**:
1. **Always pass `--project cotto-market` on first link, or link from
   `apps/admin` where a `.vercel/project.json` might already exist** — a
   bare `vercel link --yes` (no `--project`) or running any `vercel deploy`
   with `--cwd` pointed somewhere not yet linked will silently auto-create a
   **new** project named after the nearest `package.json`'s `"name"` field
   (root is `"cotto"`, `apps/admin` is `"admin"`) instead of linking the
   real `cotto-market` project. Check `npx vercel project ls` if a project
   name in output ever looks unfamiliar. Deleting a wrongly-created project:
   `vercel project rm <name>` prompts for confirmation regardless of `--yes`
   / `--non-interactive` (CLI 58.4.4) — pipe `echo "y" |` into it.
2. **An ad-hoc `vercel deploy` from the CLI is not a reliable proxy for
   what a real GitHub-triggered Preview build will do**, especially in a
   monorepo with a `--cwd` pointed at the repo root — it can end up building
   against a different/wrongly-linked project (see gotcha #1) with
   completely different env vars, giving misleading "still broken" results.
   To actually verify a Preview-environment fix, push a real commit to a
   throwaway branch/PR and check `gh pr checks`, not a local `vercel
   deploy`.
3. **Env vars added via `vercel env add` default to "Sensitive"** as of CLI
   58.4.4, meaning `vercel env pull` (and the dashboard) can never read the
   real value back afterward — pulling a Sensitive var returns the literal
   string `[SENSITIVE]`. This matters most for `NEXT_PUBLIC_*` vars if you
   ever need to copy them between environments: don't pull-then-copy, get
   the real value from its actual source (a `.env` file, a fresh CLI/API
   call to the underlying service) every time. `--no-sensitive` on `env add`
   stores it in a way that can be read back later, if that's ever needed
   (in the end this project didn't need it — sensitivity turned out to be
   unrelated to the actual build failure, see §12 item 4).

---

## 15. Phase 6 close-out — Twilio approved, full gate test passed (2026-08-08)

Twilio approved the resubmitted A2P 10DLC campaign (the third resubmission,
see §11's history of rejections). This session closed out the only remaining
open item from §11/§12.

**1. Server-side Twilio smoke test (Claude, before the founder's own
walkthrough).** Same throwaway-fixture discipline as every other
server-side verification in this project: inserted a paid `orders` row +
`vendor_suborders` row (pickup, `received`) + `order_items` row directly via
service role, for the founder's own profile against Tester Kitchen (self-
purchase, allowed by design) — no real checkout/Stripe flow needed since the
fixture starts already `paid`. Established a real session for the founder's
account via `auth.admin.generateLink` + `verifyOtp` (same no-password pattern
used in §12 item 3), then called `update-suborder-status` for real to
transition `received → confirmed`. Edge function returned `200 ok: true`,
**zero rows** logged to `audit_log` matching `suborder_notify_%_failed` —
both the Resend and Twilio calls returned `res.ok`. Fixture (order,
suborder, order_item, audit_log rows) deleted immediately after; confirmed
clean via `git status` (no tracked files touched — this was pure hosted-DB
fixture data, same as every prior throwaway verification in this project).
**The founder independently confirmed the SMS text actually arrived** —
important because a clean Twilio API response only means the carrier
accepted the message, not that A2P filtering didn't silently drop it
afterward.

**2. Founder's full hands-on gate-test walkthrough (§11) — passed.**
Re-ran steps 4-7 and 9 (the SMS-dependent notification checks) on-device;
SMS confirmed received at every notifiable transition (confirmed, preparing,
ready, completed, and the delivery-side received→ready sequence). Also
independently exercised the checkout screen's Cancel affordance (the
"Cancel" link under the "Pay now" button on `checkout.tsx`) — confirmed
working, separate from the Kitchen `[id].tsx` "Cancel order" button covered
by walkthrough step 11.

**Phase 6 is now fully closed.** Every item in §11's acceptance gate has
been verified — either server-side by Claude or hands-on by the founder.
No code changes were needed this session; this was verification-only. The
existing commit history (`4666edc` phase 6 squash-merge → `ec3acfb`/`8a6fd90`
follow-up `fix:` PRs → `50e30f8` docs update) already matches this project's
established convention (phase commit, then separate `fix:`-prefixed PRs for
gate-test follow-ups, never bundled into the phase branch) — there is no
irregular or squash-worthy history here, so no rebase/rewrite is needed.

**Next**: Phase 7 (Delivery onboarding + eligible pool) — see §16.

---

## 16. Phase 7 — Delivery onboarding + pool (2026-08-08/09, built + fully gate-tested)

Scope per `Cotto_MVP_Spec.md`'s phase table: the wizard that lets an
already-approved cook vendor also become a delivery driver, admin review of
that application, and a **read-only** view of the regional delivery job
pool. Claim/deliver/payout is Phase 8, explicitly out of scope here.

Three decisions confirmed with the founder before building:
1. Scope stops at the read-only pool view — no working Claim button, no My
   Queue, no History (Phase 8's race-safe claim RPC).
2. Distance uses **live device GPS** (not the vendor's registered address) —
   `expo-location` is a new dependency, installed via `npx expo install
   expo-location` (not `pnpm add`, per §9 bug #3's lesson).
3. Pool updates via polling (~10s, matching `kitchen.tsx`/`orders.tsx`), not
   Supabase Realtime.

**What shipped:**
1. Migrations 0032–0035 (see §4) — private `drivers-licenses` storage
   bucket, an expiry-tracking column, the license-expiry cron schedule, and
   `pool_suborder_customer_first_name()`. `vendor_delivery_profiles`
   (migration 0003) and its self-approval guard triggers (0010, 0021) and
   the pool-visibility function `can_view_pool_suborder()` (0010) already
   existed from earlier phases and needed **no changes** — direct read
   confirmed `can_view_pool_suborder` already correctly requires
   `on_duty = true` and `status = 'delivery_active'` and excludes
   already-claimed suborders.
2. Edge function `cron-driver-license-expiry-check` (see §5).
3. `packages/shared/src/delivery-onboarding.ts` — `VEHICLE_TYPES`,
   `VEHICLE_TYPE_LABELS`, `DELIVERY_RADIUS_OPTIONS`, `Availability` type +
   per-step zod schemas, mirroring `vendor-onboarding.ts`'s pattern.
4. Mobile: `delivery-onboarding.tsx` wizard (6 steps in
   `src/features/delivery-onboarding/`: license upload front+back, vehicle
   type, insurance attestation, agreement acceptance, radius, weekly
   availability), a "Become a Delivery Partner" CTA on `account.tsx`
   (gated on an already-`active` cook vendor), a new gated "Deliveries" tab
   (`(tabs)/_layout.tsx`, visible only once `vendor_delivery_profiles.status
   === 'delivery_active'`), and `(tabs)/deliveries.tsx` — the Available pool
   screen: an on-duty toggle (in scope — it's eligibility state, not the
   Phase 8 claim action, and without it the pool is permanently empty since
   `on_duty` defaults `false`), GPS permission flow with a non-crashing
   denied-state fallback, a 10s-polling pool query, straight-line (haversine,
   `src/lib/geo.ts`) distances rather than a Mapbox Directions call per card
   per poll, and an estimated payout via the existing (already-tested,
   previously-uncalled) `calculateDeliverySplit` from `packages/shared/src/fees.ts`.
5. Admin: `vendors` list now joins `vendor_delivery_profiles(status)` for a
   second status badge; vendor detail page shows both license images (signed
   URLs, same pattern as the CFPM cert), vehicle/radius/availability/attestation
   fields, and Approve/Reject buttons; new routes
   `api/admin/vendor-delivery-profiles/[id]/approve` and `.../reject`, direct
   mirrors of the existing vendor approve/reject routes. **Reject sets status
   back to `not_started`** (not `delivery_suspended`) — this deliberately
   mirrors the vendor route's actual behavior (`status: 'draft'` on reject),
   confirmed by reading that route's source rather than assumed.
   `delivery_suspended` is reserved for post-approval suspension (the
   license-expiry cron, or a future manual admin action).

**New function not in the original spec scaffolding:**
`pool_suborder_customer_first_name(so_id)` (migration 0035). The existing
`suborder_customer_display_name()` (0031) returns the customer's *full* name
but is gated on `owns_vendor OR is_customer_of_order OR is_ops_admin` — it
doesn't cover a driver who can merely see the pool. Spec 3.6 also wants
"customer first name only" pre-claim, deliberately less than what a cook
sees. Widening 0031's function instead would have leaked every ready
delivery order's customer's full name to every on-duty vendor in the
region, not just whoever ends up claiming it — so this is a narrow,
purpose-built function instead.

**Verified this session (server-side, throwaway-fixture discipline, same as
every prior phase — service-role client, insert/delete, deleted immediately
after, confirmed clean via `git status`):**
- Non-admin INSERT into `vendor_delivery_profiles` with `status:'delivery_active'`
  in the payload lands as `not_started` (`guard_delivery_profile_owner_insert`).
- Non-admin UPDATE attempting to self-approve (`status:'delivery_active'`
  directly) is rejected (`guard_delivery_profile_owner_update`).
- Non-admin UPDATE to `status:'delivery_pending_review'` with all six wizard
  fields succeeds.
- Service-role approve → `delivery_active`; reject → `not_started` +
  `rejected_reason`.
- An on-duty `delivery_active` driver in the cooking vendor's region sees a
  `ready` delivery suborder in the pool; flipping `on_duty` to `false` hides
  it immediately.
- `pool_suborder_customer_first_name` returns the real first name for the
  eligible driver and `null` for an unrelated profile.
- `cron-driver-license-expiry-check` auto-suspends a fixture with a
  backdated `drivers_license_expires_on` (`delivery_active` →
  `delivery_suspended`) and writes the expected `audit_log` row.
- Storage RLS rejects an authenticated user's upload attempt into another
  user's `drivers-licenses/{profile_id}/...` folder.

All 12 checks passed. `pnpm typecheck && pnpm lint && pnpm test` also pass
across all three workspaces, including new unit coverage for the new
`haversineMiles` helper (`apps/mobile/src/lib/geo.test.ts`).

**Not independently re-verified this session** (visually confirmed correct
by direct file read instead, not worth the setup cost of a live empirical
test): cross-region pool invisibility — `can_view_pool_suborder`'s
`driver_vendor.region_id = cooking_vendor.region_id` clause is a simple,
directly-readable one-line predicate, and this project has only one active
region seeded, so testing it live would require standing up a second
throwaway region + vendor + session just for this one assertion.

**Not verified at all this session** (needs a real device — Deno/Node smoke
tests can't grant OS location permission, take a photo, or render RN
components): the mobile UI itself. The admin app's new UI also wasn't
browser-previewed — `apps/admin/.env.local` points at **local** Supabase
(`http://127.0.0.1:54321`), which requires `supabase start`/Docker, and
Docker wasn't running this session (confirmed by a `WARNING: Docker is not
running` message during an unrelated CLI call). Same established
limitation as every prior phase (§14): this project relies on
typecheck/lint/test + throwaway server-side smoke tests + the founder's own
device/browser testing, not this environment's browser preview tooling.

### Gate-test walkthrough

Sign in as `CPITTS1183@gmail.com` (owns **Tester Kitchen**, `active` status)
on mobile, and as an admin allow-list account in the admin app.

1. On mobile, Account tab → confirm **"Become a Delivery Partner"** appears
   (only shows once your cook vendor is `active`); tap it.
2. Walk all 6 wizard steps in order (License → Vehicle → Insurance →
   Agreement → Radius → Availability). Confirm Back/Next both work and
   progress survives an app restart mid-wizard (it re-reads the DB row, not
   local state).
3. Upload real front/back license photos on-device; confirm both preview
   correctly before moving on.
4. Submit the final step; confirm the app returns to Account and the
   "Continue Delivery Application" button is gone (replaced by "pending
   review" text) — the wizard should redirect away if you try to navigate
   back into it.
5. In the admin app, open Vendors → your vendor → confirm a second
   ("delivery pending review") badge appears in the list and on the detail
   page; confirm both license images render, and vehicle type/radius/
   availability/attestation timestamps all show the values you entered.
6. Reject once with a reason; confirm on mobile that Account shows the
   rejection reason and "Continue Delivery Application" reappears (you're
   back at `not_started`, not a dead end).
7. Resubmit and Approve this time; confirm the approval email arrives and
   the **"Deliveries"** tab appears in the mobile bottom tab bar.
8. Open Deliveries; grant location permission when prompted; flip **Delivery
   Mode ON**. With at least one `ready` delivery suborder from a *different*
   vendor sitting in the pool (you may need me to seed one via a throwaway
   fixture, same as always, if there's no real one to test against — cannot
   be your own Tester Kitchen order, self-claim is blocked), confirm it
   appears: vendor name, both distances, an estimated payout in dollars, and
   the customer's first name only (not full name).
9. Deny location permission (fresh install, or reset the permission in OS
   settings) and reopen Deliveries; confirm a clear, non-crashing empty
   state appears with a working "Try again" button, not a blank screen or
   crash.
10. With Delivery Mode still ON and location granted, confirm the list
    auto-refreshes roughly every 10 seconds without a manual pull (ask me to
    add/remove a fixture suborder server-side mid-test and watch it
    appear/disappear).
11. Flip **Delivery Mode OFF**; confirm the pool list immediately goes
    empty.
12. (Optional, needs a throwaway fixture) Backdate a test profile's license
    expiry and have me manually invoke the cron function; confirm the
    profile flips to suspended and the Deliveries tab disappears on next
    app foreground.

### Gate test results (2026-08-09) — all 12 steps passed

The founder ran the full walkthrough on-device (Android, real hardware) and
the admin PR #16 preview URL. All 12 steps passed. Two real bugs surfaced
along the way — both root-caused, fixed, and pushed to the same
`phase-7-delivery-onboarding-pool` branch as follow-up commits (not
squashed into the original phase commit, consistent with this project's
established convention of separate `fix:` commits for gate-test findings):

**1. Admin dashboard served stale data after an out-of-band DB change
(found at step 6).** Reject the delivery application → resubmit from
mobile → revisit the vendor detail page in the *same admin browser
session* → still showed the pre-reject render, hiding the new
Approve/Reject buttons. Root cause: nothing under `/dashboard/**` opted out
of Next.js's default caching, so a snapshot from before the mobile
resubmission could be served instead of a fresh query — and this data
changes constantly from outside any given browser session (vendors and
customers act from the mobile app). Not specific to Phase 7's new pages;
this was a latent risk across the whole admin dashboard that Phase 7's
reject→resubmit→reapprove cycle happened to be the first flow to exercise
within a single test session. Fixed with `export const dynamic =
"force-dynamic"` on `apps/admin/src/app/dashboard/layout.tsx` — single
enforcement point, same reasoning as the auth/MFA gate already there,
covers every current and future page under `/dashboard/**`.

**2. Deliveries tab hung on a spinner forever with system Location
Services disabled (found at step 9).** App-level location permission
stays `granted` even after the user turns off phone-wide Location Services
entirely (these are separate OS concepts on Android) — so
`requestLocation()` skipped straight past the permission-denied check to
`getCurrentPositionAsync()`, which hung/rejected uncaught, leaving
`locationStatus` stuck at `"requesting"` indefinitely. Toggling Delivery
Mode off/on didn't help either, since only screen *focus* re-triggers a
location request, not the on-duty toggle. Fixed in
`apps/mobile/app/(app)/(tabs)/deliveries.tsx`: explicit
`Location.hasServicesEnabledAsync()` check up front, the whole flow wrapped
in try/catch, and a 15s timeout guard — any failure mode now lands on the
same visible "location required" state with a working "Try again" button
instead of an indefinite spinner. Verified live: founder disabled Location
Services, confirmed the persistent message + retry button appeared (no
more spinner), re-enabled services, tapped Try Again, pool loaded
normally.

Also verified live (steps 10 and 12, both needed a throwaway fixture from
Claude, cleaned up immediately after each):
- **10:** a live `ready` delivery order seeded from Second Test Kitchen
  appeared in the founder's pool within one ~10s poll cycle with no manual
  pull, and disappeared the same way once removed.
- **12:** the founder's own Tester Kitchen delivery profile was
  temporarily backdated (`drivers_license_expires_on` → a past date), the
  cron function invoked manually, confirmed the profile flipped to
  `delivery_suspended` and the Deliveries tab disappeared on next app
  foreground (Account correctly showed "suspended... contact Central Ops"),
  then fully restored to the real `delivery_active` status and real
  license expiry date afterward — confirmed via a direct query, not just
  assumed.

**Phase 7 is fully gate-tested and merged** (PR #16, squash-merged to
`main` as commit `e7bba0f`). Phase 8 (claim → deliver → payout) is up
next — see §17.

---

## 17. Phase 8 — Claim → deliver → payout (2026-08-09, built, awaiting founder gate test)

Scope per `Cotto_MVP_Spec.md`'s phase table: race-safe claim flow, driver-side
status transitions, Mapbox ETA, a deferred Stripe Transfer to the driver on
delivery, self-claim block, and the region's soft/hard conflict-rule
warning. Phase 9 (T1/T2/T3 fallback for orders that are *never* claimed) is
explicitly out of scope.

Three decisions confirmed with the founder before building:
1. Build a "stuck-claim watchdog" cron now (a driver claims, then goes
   dark — auto-release + notify dispatch), but the silence threshold is
   **20 minutes**, not the spec's suggested 60.
2. Skip driver payout-confirmation notifications — the spec's acceptance
   criteria only requires seeing the payout in the driver's own Stripe
   dashboard.
3. Compute and store `vendor_suborders.mapbox_eta_minutes` via a real
   Mapbox Directions call (not skipped).

**What was already built, needing zero changes** (confirmed by direct
reads before writing any code): `delivery_claims` (migration 0007 — every
column already present, including the race-safety backstop
`delivery_claims_one_active_per_suborder_uidx`), `is_active_driver_for_suborder()`
and `can_view_pool_suborder()` (0010), `regions.delivery_conflict_rule`/
`dispatch_email`/`delivery_payout_split_pct` (0001). Drivers have **zero
RLS UPDATE grant on `vendor_suborders`** by design — every driver-side
write goes through a SECURITY DEFINER function, never a raw client
`.update()`.

**Two real pre-existing gaps found and fixed, not assumed:**
- Driver↔customer messaging didn't work — `is_valid_message_recipient()`
  only recognized `(customer, cook)` as a valid pair (migration 0039).
- `guard_suborder_status_transition()`'s allow-list stopped at `ready` for
  delivery orders (migration 0037).

**What shipped:**
1. Migrations 0036–0041 (see §4).
2. Edge functions `update-delivery-status`, `compute-delivery-eta`,
   `cron-stuck-delivery-watchdog` (see §5).
3. Mobile: `(tabs)/deliveries.tsx` gained a local 3-chip segmented control
   (Available / My Queue / History) and a working **Claim** button on each
   Available card — with a client-side confirm dialog (soft-warning copy,
   or a blocking message for `hard_block` regions) using the driver's own
   open-kitchen-order count, before ever calling the RPC. A new
   `deliveries/[id].tsx` claimed-order detail screen (mirrors
   `kitchen/[id].tsx`'s structure) adds the status-transition buttons, ETA
   display, an **"Open in Maps"** button (`Linking.openURL` to a Google
   Maps universal link — genuinely new, no prior art existed in this app),
   a **"Release claim"** button, and the reused `MessageThread` component.
   `order-tracking/[id].tsx` now also shows the assigned driver's name once
   claimed.

**Architecture decisions worth remembering for later phases:**
- `claim_delivery` is a **pure Postgres RPC**, not an edge function — keeps
  the one truly race-critical step (a single `UPDATE ... WHERE
  status='ready'`, immediately followed by the `delivery_claims` insert)
  fast and free of external HTTP calls. Mapbox ETA is a **separate
  best-effort follow-up edge function** (`compute-delivery-eta`, fire-and-
  forget from the mobile client right after a successful claim) for
  exactly this reason.
- `release_delivery_claim` is shared by both voluntary driver cancellation
  and the watchdog cron (branches internally on `auth.role()`) — single
  source of truth, not duplicated logic.
- `update-delivery-status` (the only one of the three new functions that's
  an edge function, not an RPC) exists specifically because `delivered`
  needs a real Stripe API call, which plpgsql can't do. `delivered` is
  handled as **two separate `vendor_suborders` UPDATE statements**
  (`→delivered` then `→completed`) — the guard trigger only allows one
  status-step per statement; combining them into one call would be
  silently rejected.
- A claim stuck in `claimed`/`en_route_to_pickup` auto-reverts to the pool
  (food hasn't left the kitchen yet); a claim stuck in
  `picked_up`/`en_route_to_customer` does **not** auto-revert (food is
  already out) — the watchdog only notifies dispatch for those, once,
  never auto-releasing them. This is a genuine, not-yet-solved gap for
  that specific failure mode, flagged explicitly rather than papered over.

**Verified this session (server-side, throwaway-fixture discipline —
service-role client, insert/delete, deleted immediately after, confirmed
clean via `git status`):** 24 checks, all passing, including:
- **The race test** (the single most important correctness property of
  this phase): two driver sessions calling `claim_delivery` on the same
  `ready` suborder via `Promise.all` — exactly one won, the other got a
  clean "just claimed by another driver" error, exactly one active
  `delivery_claims` row resulted.
- Self-claim rejection; the full transition sequence ending in
  `completed`; release rejected once `picked_up`; the hard-block conflict
  rule rejecting a claim attempt with an open kitchen order (temporarily
  flipped the region's setting, reverted after); voluntary release
  reverting to `ready` with `delivery_cycle` incremented; the watchdog
  auto-releasing a backdated stuck `claimed` fixture and notifying-once
  (not twice) for a backdated stuck `picked_up` fixture;
  `compute-delivery-eta` populating a real ETA (14 minutes, sane); a
  driver→customer message now succeeding under the extended RLS.
- **A real Stripe Transfer**, landing on Tester Kitchen's real test-mode
  Connect account (`acct_1Ts6zAFTs1uyq1Se`) — `tr_1U2O5JFMh2QSmPlsAAINnbMd`,
  $6.39 (80% of a $7.99 delivery fee). First attempt failed with a genuine
  Stripe error ("insufficient available funds") — this was a **test-mode
  balance limitation, not a code bug**: the throwaway fixture order was
  inserted directly into the DB rather than charged through a real
  PaymentIntent, so the platform's test-mode balance had never actually
  been credited. Fixed by crediting $50 of instantly-available test
  balance via Stripe's documented `tok_bypassPending` test token (a
  one-time top-up of the *platform's* Stripe test account — safe, test
  mode only, not touching any real money), then re-ran the full transition
  sequence and got a real, successful Transfer. Notably, the code's
  graceful-degradation path (catch, log to `audit_log`, still mark the
  order `completed`) worked exactly as designed even during the failed
  attempt — the order reached `completed` both times, confirming a failed
  driver payout never blocks completion, matching the cook-side webhook's
  established tolerance.

All 24 checks pass. `pnpm typecheck && pnpm lint && pnpm test` also pass
across all three workspaces.

**Not verified this session** (needs a real device, same established
limitation as every prior phase — §14): the mobile UI itself, including
the confirm-dialog copy, the segmented control, "Open in Maps" actually
opening a real navigation app, and the claim→transition→release flow as
experienced hands-on. No admin changes were made this phase (confirmed:
delivery network stats are Phase 11's scope), so no admin-side testing is
needed here.

### Gate-test walkthrough

Sign in as `CPITTS1183@gmail.com` (Tester Kitchen, already `delivery_active`
from Phase 7's gate test) on mobile. You'll need a **second** delivery order
from a vendor other than Tester Kitchen to claim (self-claim is blocked) —
ask me to seed one via a throwaway fixture, same as Phase 7's gate test.

1. Deliveries tab → Available → confirm the seeded order's card shows
   distance, estimated payout, and the customer's first name (same as
   Phase 7), now with a working **Claim** button.
2. Tap Claim. If you have any open kitchen orders at the time, confirm the
   soft-warning dialog appears with a sensible message before claiming
   (North Shore Chicago defaults to `soft_warning`, not `hard_block`, so
   this should let you proceed either way — ask me to temporarily flip the
   region to `hard_block` if you want to see the blocking version too).
3. Confirm you land on the claimed-order detail screen, and the order now
   appears under **My Queue**.
4. Confirm the ETA appears within a few seconds (shows "Calculating..."
   briefly right after claiming, since the fetch is best-effort and
   asynchronous).
5. Tap **"Open in Maps"** — confirm it opens your phone's real Maps app
   with the pickup vendor's address, then again after "Picked up" and
   confirm it switches to the customer's delivery address.
6. Walk every status button in order: Heading to pickup → Picked up → Out
   for delivery → Mark delivered. Confirm each one updates immediately and
   the order disappears from My Queue once delivered/completed, showing up
   in **History** instead with the payout amount.
7. Send a message from the claimed-order detail screen; confirm it also
   appears on the customer-side `order-tracking` screen for that order
   (use a second test account, or ask me to seed a message from the
   "customer" side to confirm the reverse direction).
8. Confirm the customer's `order-tracking` screen now shows "Driver:
   [name]" once the order reaches `claimed` or later, and the full
   timeline lights up through `completed`.
9. Claim a **second** throwaway order (ask me to seed one), then tap
   **"Release claim"** while still `claimed`; confirm it disappears from
   My Queue and reappears in another driver's Available pool (or your own,
   if you switch to a second test driver account).
10. After `delivered` on step 6, open your real Stripe Express dashboard
    (via the Connect account linked to Tester Kitchen) and confirm you can
    see the real payout Transfer — no in-app confirmation is expected, per
    decision #2 above.
11. *(Optional, needs a throwaway fixture)* — ask me to backdate a claim's
    timestamp and manually trigger the watchdog cron; confirm a stuck
    `claimed` order reverts to the pool on its own.

### Gate test results (2026-08-09) — all 11 steps passed

The founder ran the full walkthrough on-device, working around a real
constraint: only one Android phone was available for testing (Expo Go on
iPhone isn't compatible with this build's custom native dev client, so a
second physical device wasn't an option). Worked around by having the
founder be **customer, driver, and admin all on one account** for the
solo-testable steps (self-claim block only cares about cooking vendor vs.
driver vendor, not who the customer is) — a fresh fixture order was seeded
with the founder as customer specifically for steps 7-9, letting them
switch between the Orders tab (customer view) and Deliveries tab (driver
view) on the same phone to verify messaging both directions, the driver-name
display, and the release-to-pool behavior solo. The one piece that
genuinely needs a second driver (a true cross-driver race) was already
covered by the automated server-side race test, not re-verified by hand.

One real bug surfaced, root-caused, fixed, and pushed as a follow-up
commit to the same `phase-8-claim-deliver-payout` branch:

**Completed deliveries stayed in "My Queue" forever (found at step 6).**
After marking an order delivered, it correctly showed in History but also
*stayed* in My Queue showing "Completed" — a driver's queue would grow
without bound as they completed more deliveries. Root cause: the queue
query filtered only on `delivery_claims.released_at is null`, but a
successfully completed claim's `released_at` stays null forever too (it
was never released, it finished normally) — the exact same trap already
called out in `cron-stuck-delivery-watchdog`'s own code comments, just not
applied to this query. Fixed in
`apps/mobile/app/(app)/(tabs)/deliveries.tsx` by flipping the query's base
table from `delivery_claims` to `vendor_suborders` and filtering on the
suborder's own status (`claimed`/`en_route_to_pickup`/`picked_up`/
`en_route_to_customer` = queue, anything else = history) — the real signal
for "still in progress," same reasoning as the watchdog. Verified directly
against the hosted DB before considering it fixed: a synthetic active claim
correctly stayed in the queue query's results while a synthetic completed
one was correctly excluded (and vice versa for the history query) — this
is also where the `!inner` embedded-table filtering syntax
(`.eq("delivery_claims.driver_vendor_id", ...)`) used in both queries got
its first real exercise in this codebase.

One non-bug worth recording: step 8's walkthrough text described the
driver display as showing "your storefront name" — that was a documentation
error, not a code error. `suborder_driver_display_name()` (migration 0041)
was always designed to return the driver's personal `full_name`,
deliberately mirroring `suborder_customer_display_name()`'s existing
personal-name convention on the Kitchen screen. Confirmed with the founder
this is the *desired* behavior (not a business name) — no code change
needed, only my description of it was wrong.

Also verified live (steps 10 and 11):
- **10:** the real Stripe Transfer from the founder's own completed
  delivery (`tr_1U2YMkFMh2QSmPlsnADTnv9y`, $6.39) was located and confirmed
  directly in the Stripe Dashboard's Connect → Transfers view (test mode).
- **11:** the founder's real claimed order was backdated 25 minutes via a
  throwaway service-role update, the watchdog invoked manually, confirmed
  it auto-released back to `ready` and disappeared from My Queue/reappeared
  in Available on-device. (The watchdog also caught and cleaned up one
  unrelated stale claim left over from earlier automated testing in the
  same run — expected behavior, not a bug.)

All throwaway fixture orders from this gate-test session (the seeded
"solo order" left in `completed` status as harmless historical data, plus
two `ready`-status ones used for the watchdog step) were deleted after use,
confirmed via a direct query, per this project's established discipline.

**Phase 8 is fully gate-tested. PR #17
(`phase-8-claim-deliver-payout` → `main`) is open and ready to merge —
ask the founder before merging, per this project's standing rule that
pushes/merges need explicit sign-off each time.** Once merged, Phase 9
(unclaimed-order fallback: T1/T2/T3 SMS/customer-offer/refund) can be
scoped.

---

## 18. PR #17 merge correction

This doc's top summary said PR #17 was "open, ask before merging" as of
2026-08-09, but a repo check at the start of the Phase 9 session found it
had already been merged (`mergedAt: 2026-08-09T16:58:53Z`, merged by
`centralops-art`, squashed into `main` as commit `a97ffc4`). Recorded here
only because this doc briefly had stale state — no further action needed,
Phase 8 is cleanly on `main`.

---

## 19. Phase 9 — Unclaimed delivery fallback (2026-08-09, built, awaiting founder gate test)

Scope per `Cotto_MVP_Spec.md` section 3.7: a region-configurable T1/T2/T3
cron (`regions.claim_window_t1/t2/t3_minutes`, defaults 10/30/60, already
existed since migration 0001) that, for a `ready` delivery suborder sitting
unclaimed: at T1 alerts the region's dispatch contact, at T2 offers the
customer a pickup-or-refund choice, and at T3 auto-refunds if the customer
never responds.

Two decisions confirmed with the founder before building (see the
conversation that opened this phase):
1. **No push notifications.** The spec says "push/email/SMS" for the T2
   offer, but no push infrastructure exists in this app at all (no
   `expo-notifications`, no token storage) and building it would need a new
   native module + EAS rebuild. Went with email + SMS only, reusing the
   existing Resend/Twilio wiring.
2. **In-app only, no new web surface.** The customer's pickup-or-refund
   choice is two buttons on the existing `order-tracking/[id].tsx` screen
   (shown whenever `suborder_pending_customer_offer()` returns non-null),
   not a one-tap email/SMS link to a new public page. Simpler, no new
   action-token security surface to design.

**A real gap found and fixed before building the fallback logic itself**:
`checkout-create-payment-intent` already computed a per-vendor Stripe Tax
amount for every suborder, but only ever persisted the order-level *sum*
(`orders.tax_cents`) — the per-suborder figure was silently discarded.
Refunding a single suborder inside a possibly multi-vendor order needs that
exact figure, not a guess. Migration 0042 adds `vendor_suborders.tax_cents`
(mirrors the existing `subtotal_cents`/`delivery_fee_cents` columns);
`checkout-create-payment-intent` now persists the value it was already
computing.

**Also found**: the admin app's existing order-level refund route
(`apps/admin/src/app/api/admin/orders/[id]/refund`) reverses *every*
vendor's Stripe Transfer on the order for a full refund — correct for its
own use case (an admin manually refunding a whole order), but wrong to
reuse here, since an unclaimed delivery is only ONE suborder inside a
possibly multi-vendor order. Reusing that route would have incorrectly
clawed back an unrelated vendor's payout. Phase 9 has its own
suborder-scoped refund helper instead (see below).

**What shipped:**
1. Migration 0042: `vendor_suborders.tax_cents` (see above).
2. Migration 0043: `claim_delivery()` now logs `claim_cancelled_pending_offer`
   (an enum value that already existed since migration 0007, reserved for
   exactly this) when a driver's claim wins the race against an active T2
   offer. No behavior change to the claim itself — its existing atomic
   `update ... where status = 'ready'` already made the driver win this
   race for free; this is purely the audit trail the events table was built
   for.
3. Migration 0044: `suborder_pending_customer_offer(so_id)` — narrow
   SECURITY DEFINER function, same pattern as
   `suborder_customer_display_name`/`suborder_driver_display_name`/
   `pool_suborder_customer_first_name`. Returns the T3 deadline if there's
   an active, unresolved T2 offer for the suborder's *current*
   `delivery_cycle`, else null. This is what the mobile order-tracking
   screen polls to decide whether to show the two action buttons, without
   widening `delivery_dispatch_events`' RLS (currently admin-only) to every
   customer.
4. `supabase/functions/_shared/refund-suborder.ts` — new shared module
   (this project's edge functions don't import from `packages/shared`, see
   §5's Deno extensionless-import note, but a same-directory `_shared/`
   relative import with `.ts` works fine and already existed for
   `cors.ts`). `refundSuborder()` refunds exactly one suborder's share
   (subtotal + delivery fee + its own `tax_cents`) and reverses only that
   suborder's own Transfer, if it has one. Race-safe: it does an atomic
   `update vendor_suborders set status='refunded' where status='ready' and
   delivery_cycle=X` *before* calling Stripe — the same idiom as
   `claim_delivery`'s atomic claim — so a concurrent claim or a second
   resolution attempt affects 0 rows and fails cleanly instead of
   double-refunding. If the Stripe call itself then fails, it compensates
   by reverting status back to `ready` so the order stays retryable rather
   than stuck in a limbo `refunded` status with no money actually moved.
5. Edge function `cron-unclaimed-delivery-check` — every-5-minute cron
   (migration 0045, same `pg_cron`/`pg_net`/Vault pattern as every prior
   cron in this project), scanning `ready` delivery suborders by
   `ready_at` age (which resets to a fresh timestamp on every claim
   release, per `release_delivery_claim`'s existing comment — so a
   released-and-reclaimed suborder correctly gets its own fresh T1/T2/T3
   countdown) against the region's configured minutes. Idempotent per
   stage via `delivery_dispatch_events`, keyed by event type + the
   suborder's current `delivery_cycle` in the payload.
   - **T1**: email only to `regions.dispatch_email` — **deliberately
     deviates from the spec's literal "SMS + email," confirmed with the
     founder.** This project's Twilio A2P 10DLC campaign took about a
     month and multiple rejections to get its first approval (§11); an
     ops-alert SMS to a business dispatch number is a different message
     type the approved campaign doesn't cover. Founder's explicit call:
     email-only, do not reopen that Twilio review cycle for this. Matches
     the precedent already set by `cron-stuck-delivery-watchdog` (Phase
     8), which also only emails dispatch. This preference generalizes:
     any future SMS-adjacent feature should default to email-only unless
     it clearly fits the already-approved campaign's scope.
   - **T2**: email + SMS to the customer (SMS gated on
     `profiles.sms_opt_in`, same as every other customer notification in
     this app), telling them to open the app. Logs `t2_customer_offer_sent`
     with the T3 deadline in the payload.
   - **T3**: calls `refundSuborder`, then emails both the customer and the
     cook (the cook needs to know they won't be paid further on this
     order — per spec item 6, "the cook is paid nothing," which required an
     explicit Transfer reversal since this project pays the cook
     immediately at `payment_intent.succeeded`, well before delivery).
6. Edge function `resolve-delivery-offer` — the customer's in-app action,
   `{suborderId, choice: "pickup" | "refund"}`. Verifies the caller is
   really the order's customer, and defense-in-depth re-checks there's
   genuinely an active, unresolved T2 offer for the current cycle before
   doing anything.
   - `refund`: calls the same `refundSuborder` helper as T3.
   - `pickup`: converts `fulfillment` to `pickup`, clears the delivery
     address/lat/lng/instructions, sets `pickup_at` ~15 minutes out
     (spec 3.7's literal wording — deliberately not run through
     `generatePickupSlots`'s business-hours grid, since this is an
     emergency fallback, not a normal checkout-time slot pick), and
     partial-refunds *only* the delivery fee (subtotal + tax stay charged
     — the food is still being fulfilled). Guarded by its own atomic
     conditional update (`where status='ready' and fulfillment='delivery'
     and delivery_cycle=X`) before ever calling Stripe; reverts the
     fulfillment change back if the Stripe refund call fails, so a
     customer never ends up converted to pickup without actually getting
     the delivery fee back.
   Both paths email the vendor (cook) — a fulfillment change or refund on
   their order is something they need to know about even though it's not
   an error on their end.
7. Mobile: `order-tracking/[id].tsx` now polls
   `suborder_pending_customer_offer` every 10s (same interval as its
   existing queries) and shows an amber card with "Switch to pickup" /
   "Get a refund" buttons when it returns non-null, each behind an
   `Alert.alert` confirm dialog (same pattern as `deliveries.tsx`'s claim
   confirm), calling `resolve-delivery-offer` and invalidating both the
   suborder detail and pending-offer queries on success.

**Verified this session (server-side, throwaway-fixture discipline, same
as every prior phase — a Node script against the hosted Supabase + Stripe
test mode, deleted after use, confirmed clean via `git status`): 26/26
checks passed**, including:
- T1 fires past 10 minutes and is idempotent across repeated cron ticks.
- T2 fires past 30 minutes; `suborder_pending_customer_offer` correctly
  returns the deadline for the real customer and correctly returns `null`
  for an unrelated profile (tested against a genuinely non-admin stranger
  — the first attempt at this check used the founder's own profile as the
  "stranger," which is invalid since the founder's profile is `ops_admin`
  and admins are legitimately allowed to see it; caught and corrected
  before trusting the result).
- **The race test**: a driver's `claim_delivery` succeeds while a T2 offer
  is pending, `claim_cancelled_pending_offer` gets logged exactly once, and
  `suborder_pending_customer_offer` correctly flips to `null` afterward.
- Customer's refund choice: **a real Stripe test-mode Transfer was
  genuinely reversed** via this call site (not just T3's) —
  `transfers.retrieve` confirmed `reversed: true` and the exact amount;
  `orders.status` updated; a second resolution attempt on the same
  suborder is cleanly rejected, not double-processed.
- Customer's pickup choice: **Stripe confirmed exactly $7.99 (the delivery
  fee) was refunded, not the subtotal or tax** — `fulfillment` flipped to
  `pickup`, delivery address fields cleared, `pickup_at` landed within a
  minute of the expected 15-minute-out target, suborder stayed `ready`
  (not claimed/refunded).
- Acting before any T2 offer exists is rejected; a stranger acting on
  someone else's order is rejected with a clean 403.
- **T3 auto-refund with a real Stripe test-mode Transfer**: PaymentIntent
  created and confirmed via a real test payment method (no mobile UI
  needed), a real Transfer sent to Tester Kitchen's actual Connect account
  (mirroring how the payout would already have fired at checkout),
  suborder correctly flips to `refunded`, `transfers.retrieve` confirms the
  Transfer was fully reversed, and Stripe confirms a real refund of
  exactly subtotal + delivery fee + tax.

`pnpm typecheck && pnpm lint && pnpm test` all pass across all three
workspaces.

**Not verified this session** (needs a real device, same established
limitation as every prior phase — §14): the mobile UI itself — the amber
offer card, the two buttons, the confirm dialogs, and the full T1→T2→T3
timeline as experienced hands-on on a real unclaimed order. No admin
changes were made this phase, so no admin-side testing is needed.

### Gate-test walkthrough

This one is slower to walk through live than prior phases, since T1/T2/T3
are real elapsed-time thresholds (10/30/60 minutes by default) — ask me to
temporarily lower a *test* region's `claim_window_t1/t2/t3_minutes` (or
backdate a fixture suborder's `ready_at`, same throwaway-fixture approach
used for every other timing-dependent gate test in this project) rather
than actually waiting an hour.

Sign in as `CPITTS1183@gmail.com` (Tester Kitchen). You'll need a delivery
order from a **different** vendor sitting unclaimed in `ready` status — ask
me to seed one via a throwaway fixture, same as Phases 7/8's gate tests.

1. Ask me to backdate the fixture's `ready_at` so it's past the region's T1
   threshold, then manually trigger `cron-unclaimed-delivery-check`.
   Confirm you (as the region's dispatch contact, if `dispatch_email` is
   set to your inbox) receive the T1 email with the order details.
2. Ask me to backdate further past T2, trigger the cron again. Confirm you
   receive the "no driver available" email and SMS as the customer. Open
   the Orders tab → tap into that order's tracking screen → confirm the
   amber "No driver has claimed this delivery yet" card appears with
   **Switch to pickup** / **Get a refund** buttons.
3. Tap **Switch to pickup**, confirm the dialog copy, confirm. Verify: the
   card disappears, the order-tracking screen now shows "Pickup order"
   instead of "Delivery order," and you receive a partial-refund
   confirmation for just the delivery fee (check your bank/card statement
   or the Stripe test dashboard).
4. Ask me to seed a **second** unclaimed order and push it past T2 again.
   This time tap **Get a refund**, confirm, and verify the order shows
   "Order refunded" on the tracking screen and you receive a full-refund
   email.
5. Ask me to seed a **third** unclaimed order, push it past T2 (offer
   sent), then — before you tap anything — ask me to claim it as a driver
   from a second test account. Confirm the amber offer card disappears
   from your tracking screen on its own (poll interval is 10s) once
   claimed.
6. Ask me to seed a **fourth** unclaimed order and push it all the way
   past T3 without you doing anything. Confirm you receive the
   auto-refund email and the tracking screen shows "Order refunded"
   without you having tapped either button.
7. As the cook (Tester Kitchen), confirm you also received an email for
   whichever of steps 3/4/6 actually completed against your own vendor
   (a fulfillment-change or refund notice) — you'll need at least one of
   the throwaway fixtures to be assigned to your own vendor as the cook to
   check this (self-purchase is allowed by design, same as prior phases).

### Gate test results (2026-08-09) — all 7 steps passed

The founder ran the full walkthrough live, with Claude seeding each
backdated fixture (real confirmed test-mode PaymentIntents throughout,
learned partway through — see bug 1 below) and manually invoking
`cron-unclaimed-delivery-check` in place of waiting for the real 5-minute
schedule. Four real bugs surfaced, all root-caused, fixed, and pushed as
follow-up commits to the same `phase-9-unclaimed-delivery-fallback`
branch:

**1. T1 dispatch email referenced the suborder by raw UUID (found at step
1).** Illegible to a human dispatcher. Fixed: the email now lists the
actual items ordered and a direct link into the admin order detail page
(`https://admin.cottomarket.com/dashboard/orders/{order_id}`).

**2. `resolve-delivery-offer` errors showed a useless generic message
(found at step 3).** The first "Switch to pickup" attempt failed (the
fixture had no real Stripe PaymentIntent behind it yet — a test-setup
gap, not a product bug) but the app surfaced only "Edge Function returned
a non-2xx status code" instead of the real reason. Root cause:
supabase-js's `FunctionsHttpError.message` is generic by design — the
actual `{error: "..."}` body the edge function sent back lives unread on
`error.context` (the raw `Response`). Fixed in
`order-tracking/[id].tsx`'s `resolveOffer` mutation to parse and surface
it. All subsequent fixture orders were also given real confirmed
test-mode PaymentIntents (`payment_method: "pm_card_visa"`,
`confirm: true`) rather than a bare fixture — the same gap this session's
earlier automated verification script had already hit and fixed for
itself, just not yet carried into the gate-test fixtures.

**3. `order-tracking/[id].tsx` never rendered the delivery address or
pickup time at all (found at step 6, but pre-existing since Phase 6 — not
something Phase 9 introduced or broke).** The screen already fetched
`delivery_address`/`pickup_at` in its query but never displayed either.
Fixed by mirroring the existing `kitchen/[id].tsx` pattern exactly.

**4. The T3 cook-notification email and both `resolve-delivery-offer`
vendor emails had the same raw-UUID problem as bug 1 (found at step 7,
after bug 1 was already fixed for the T1 email specifically — the founder
caught that the fix hadn't been applied everywhere).** Fixed all three
remaining sites the same way: item descriptions instead of a suborder id.

Also verified live:
- **Step 3** (switch to pickup): Stripe confirmed exactly $7.99 (the
  delivery fee) refunded, not the $8.00 subtotal or $0.64 tax; suborder
  flipped to `fulfillment: "pickup"` with delivery fields cleared.
- **Step 4** (get a refund): full $16.63 refund confirmed via Stripe;
  suborder and order both flipped to `refunded`.
- **Step 5** (race): a driver claim made server-side by Claude while the
  T2 offer was showing caused the amber card to disappear from the
  founder's screen within one ~10s poll cycle, with no action from the
  founder — confirming a real claim (not just the automated test's
  service-role simulation) correctly beats a pending offer.
- **Step 6** (T3 auto-refund): full refund fired with zero taps from the
  founder; confirmed via the tracking screen and the refund email.
- **Step 7** (cook notification): confirmed on a fixture where the
  founder's own Tester Kitchen was the cooking vendor (self-purchase,
  same discipline as every prior phase's solo-testable gate steps) —
  received both the customer refund email and the separate cook
  notification email in the same inbox.

All throwaway fixture orders (6 total across the 7 steps) were deleted
after use, confirmed via a direct query, per this project's established
discipline.

**Phase 9 is fully gate-tested. PR #18
(`phase-9-unclaimed-delivery-fallback` → `main`) is open and ready to
merge — ask the founder before merging, per this project's standing
rule.** Once merged, Phase 10 (reviews, favorites polish, waitlist
notifications, including driver rating) is next.

---

## 20. Phase 10 — Reviews, favorites polish, waitlist notifications, driver rating (2026-08-09/10, built, fully gate-tested and merged)

Scope per `Cotto_MVP_Spec.md` §3.4 item 9 / §3.7-adjacent table row 10: after
a completed order, prompt the customer to review each item (1–5 stars +
optional text + one photo) and, for delivery suborders, rate the driver;
lightweight flag-for-review moderation; waitlist restock emails; and a
favorites polish pass.

Four decisions confirmed with the founder before building (see the
conversation that opened this phase):
1. **Review moderation: customer report + auto-hide, not admin-only.** Any
   signed-in customer can report a review; reporting immediately sets
   `is_flagged = true` (hidden from public view right away via the existing
   partial index from migration 0008), pending an admin decide-to-restore/
   delete queue in the admin app.
2. **Driver rating write path: a one-time SECURITY DEFINER RPC**, matching
   this project's established pattern of zero raw client RLS grants on
   sensitive tables (drivers/customers never get a raw `UPDATE` — see
   `claim_delivery`/`release_delivery_claim` from Phase 8). A second rating
   attempt is rejected rather than silently overwriting the first.
3. **Waitlist restock notifications: email-only**, not email+SMS. Matches
   this project's established precedent (T1 dispatch alerts in
   `cron-unclaimed-delivery-check`, the stuck-claim watchdog) of not
   expanding SMS message types beyond what's already disclosed in the
   approved Twilio A2P 10DLC campaign, to avoid reopening that review
   cycle for a notification type the campaign doesn't cover.
4. **Favorites polish scope: item-vs-vendor distinction specifically** — no
   other open bugs/TODOs existed in `favorites.tsx` at the start of this
   phase, so scope was narrowed to what the founder actually wanted:
   showing which vendor sells a favorited dish, and quick-unfavorite
   directly from the list.

**A design finding worth recording**: HANDOFF.md §3 previously flagged
"self-reviews will need blocking in Phase 10" as an open item. Reading
`guard_review_not_self()` (migration 0010, extended by 0023) before writing
any code showed this was **already fully built** — the trigger has blocked
a vendor owner from reviewing their own storefront since Phase 6's security
pass, and 0023 additionally already requires the review's suborder be a
real, completed order the reviewing customer placed with that vendor.
Nothing needed building here; the §3 note was simply stale. No code changes
were made for this — verified via the server-side test suite below instead
(a fresh assertion that this unrelated-to-Phase-10 trigger still holds after
the rest of this phase's changes).

**What shipped:**
1. Migrations 0046–0049 (see §4): the public `review-images` storage bucket,
   the `report_review`/`rate_delivery_claim` RPCs, the
   `cron-waitlist-restock-check` schedule, and `review_customer_first_name`
   (a narrow SECURITY DEFINER lookup added once it became clear a review's
   byline would otherwise always render blank to anyone but the reviewer —
   `reviews_select` is public, but `profiles` RLS only lets a profile read
   its own row; same pattern as 0031/0035/0041).
2. Edge function `cron-waitlist-restock-check` (see §5).
3. Mobile:
   - `uploadReviewImage` (`src/lib/upload-image.ts`), mirroring
     `uploadVendorImage` but scoped to the reviewing customer's profile id.
   - New `src/components/star-rating.tsx` — tappable or read-only 5-star
     row, reused across the review form, the storefront review list, the
     item rating summary, and the driver-rating section.
   - New `app/(app)/review/[id].tsx` — the post-completion review screen:
     overall rating + optional text + optional one photo, a per-item
     rating/note row (pre-filled to the overall rating so a customer isn't
     forced to tap every star individually), and — only for delivery
     suborders — a driver rating section that calls `rate_delivery_claim`.
     Reached via a new "Leave a review" card on `order-tracking/[id].tsx`,
     shown once `status === 'completed'` and no review exists yet for that
     suborder/customer pair.
   - New `src/components/review-list.tsx` — the vendor storefront's public
     review list (average rating, each review's text/photo, a "Report"
     action wired to `report_review` behind an `Alert.alert` confirm),
     mounted at the bottom of `vendor-profile/[id].tsx`. `item/[id].tsx`
     gained a compact average-rating line sourced from `review_items`.
   - `favorites.tsx`: favorited dishes now show which vendor sells them
     (`menu_items(*, vendors(storefront_name))`), and both the Vendors and
     Dishes sections got a quick-unfavorite star directly in the list row
     (previously required navigating into the detail screen to unfavorite).
4. Admin: new `dashboard/reviews/page.tsx` — lists every `is_flagged = true`
   review (vendor, customer name, rating, body, photo, flagged reason) with
   Restore/Delete actions, via new `api/admin/reviews/[id]/restore` and
   `.../delete` routes (direct mirrors of the existing vendor approve/reject
   route pattern, each writing an `audit_log` row). Nav link added to
   `dashboard/page.tsx`.

**A schema wrinkle handled along the way**: `order_items.menu_item_id` is
nullable (set null if the referenced menu item is later deleted), which
`review/[id].tsx` has to account for — an order line for a since-deleted
menu item is filtered out of the per-item rating list entirely (nothing
sensible to attach a `review_items` row to). Caught by `pnpm typecheck`,
not by manual review.

**Verified this session (server-side, throwaway-fixture discipline, same as
every prior phase — a Node script against the hosted Supabase using real
per-user sessions via `auth.admin.generateLink` + `verifyOtp`, deleted after
use, confirmed clean via `git status`): 18/18 checks passed**, including:
- A customer can review their own completed order; `review_customer_first_name`
  is callable by a stranger without erroring on a fixture profile with no
  `full_name` set, and returns the real first name for the one fixture
  profile that has one ("Three").
- A stranger can `report_review` another customer's review; the row's
  `is_flagged`/`flagged_reason` are actually set; the flagged review is
  correctly hidden from that stranger's own `reviews_select` view but stays
  visible to its own author; reporting a nonexistent review id fails
  cleanly.
- The vendor-owner self-review block (migration 0010/0023, unchanged this
  phase) still holds after everything above.
- A customer can rate the driver on their own completed delivery via
  `rate_delivery_claim`; a second rating attempt is rejected and doesn't
  overwrite the first; a stranger cannot rate someone else's delivery; an
  out-of-range rating (7) is rejected.
- `cron-waitlist-restock-check` runs cleanly, notifies a fixture waitlist
  entry once its item flips `is_sold_out: false`, sets `notified_at`, and a
  second cron run doesn't re-notify the same (already-notified) entry.

`pnpm typecheck && pnpm lint && pnpm test` all pass across all three
workspaces.

**A process note, logged per HANDOFF.md §6's standing instruction to flag
this if it ever happens**: while fetching the hosted service-role key for
this session's verification script, the first `supabase projects api-keys`
call was run directly through Bash without piping straight to a file, so
the raw key value appeared in that tool call's visible output once. Flagged
to the founder in-session; every subsequent key fetch in this phase was
piped straight to a local file with no intermediate echo. Founder's call
whether this warrants a key rotation (same standing position as the prior
occurrence noted in §6).

**Not verified this session** (needs a real device, same established
limitation as every prior phase — §14): the mobile UI itself — the review
form (star taps, photo picker, per-item rows), the storefront review list
and Report confirm dialog, the item rating summary, the favorites
quick-unfavorite star, and the "Leave a review" card's appearance timing.
No local admin browser-preview either, same Docker-not-running limitation
noted in every phase since §16 — the new `dashboard/reviews` page was
read-reviewed against the existing `dashboard/vendors` pattern instead.

### Gate-test walkthrough

Sign in as `CPITTS1183@gmail.com` (owns **Tester Kitchen**). You'll want at
least one *other* completed order to review normally, plus one completed
**delivery** suborder (for the driver-rating step) — ask me to seed
throwaway fixtures via the same service-role script discipline as every
prior phase's gate test if there's no real completed order handy yet.

1. Open the Orders tab, tap into a **completed** pickup order's tracking
   screen. Confirm a **"Leave a review"** card appears (it shouldn't appear
   on any order that isn't `completed` yet, or one you've already reviewed).
2. Tap in. Set an overall star rating (required — try submitting without
   one first and confirm it's blocked with a clear message), add optional
   text, attach a photo from your library, and confirm each per-item row is
   pre-filled to the overall rating but individually adjustable. Submit.
3. Confirm you land back on the tracking screen and the "Leave a review"
   card is now gone. Re-open the same order and confirm you instead see
   "You've already reviewed this order."
4. Go to that vendor's storefront (`vendor-profile/[id]`) and scroll to the
   bottom. Confirm your review appears — rating, text, photo, and your
   first name as the byline — and the average rating at the top reflects it.
5. Open the item you reviewed (`item/[id]`) and confirm the average rating
   line under the price reflects your per-item star.
6. From a **second** test account (or ask me to simulate one server-side),
   tap **Report** on your review from that storefront. Confirm it
   disappears from the public list immediately.
7. In the admin app, open **Flagged reviews** from the dashboard. Confirm
   your reported review appears with its rating/text/photo and the reported
   reason. Tap **Restore** — confirm it reappears on the storefront. Report
   it again, then tap **Delete** — confirm it's gone from the storefront and
   from the flagged-reviews queue permanently.
8. On a **completed delivery** suborder's tracking screen, leave a review
   and confirm the driver-rating section appears (star + optional comment) —
   it should **not** appear on a pickup order's review screen. Submit with a
   driver rating, then ask me to confirm server-side that `delivery_claims.
   customer_rating` was actually set for that claim.
9. Favorite a vendor and a dish you haven't favorited yet (from their
   respective detail screens), then open the **Favorites** tab. Confirm the
   favorited dish now shows which vendor sells it, and tap the star directly
   in either list row to unfavorite — confirm it disappears without needing
   to open the detail screen.
10. *(Optional, needs a throwaway fixture)* — favorite a sold-out item, ask
    me to flip it back in stock and manually trigger
    `cron-waitlist-restock-check`; confirm the "back in stock" email
    arrives.

### Gate test results (2026-08-09/10) — all 10 steps passed

The founder ran the full walkthrough live against PR #19's Vercel preview
deployment (admin) and the mobile dev client, seeded with two real
throwaway orders from Second Test Kitchen (a completed pickup order and a
completed delivery order with a delivered claim, so both fixtures show up
in the real Orders tab rather than needing a synthetic API-level check).
Three real bugs surfaced, all root-caused, fixed, and pushed as follow-up
commits to the same `phase-10-reviews-favorites-waitlist` branch (not
squashed into the original phase commit, consistent with this project's
established convention):

**1. The "Leave a review" button didn't disappear after submitting (found
at step 3).** `order-tracking/[id].tsx` and `review/[id].tsx` each had
their own `existingReviewQuery` under different React Query cache keys
(`["existing_review", id]` vs. `["existing_review", id, profile?.id]`), so
the review screen's post-submit `invalidateQueries` call never touched the
tracking screen's cached "no review yet" result — the button stayed
visible until the screen was unmounted and remounted. Fixed by unifying
both to the same key. Also added a "You've already reviewed this order"
message in place of the button once a review exists, instead of silently
just hiding it with no confirmation — the founder correctly flagged the
missing message as confusing in the same step.

**2. Deleting a flagged review left a dangling driver rating that
permanently blocked resubmission (found at step 7, a two-part bug).** A
review and its driver rating live in separate tables with no FK
relationship (`reviews` vs. `delivery_claims.customer_rating`, set by the
Phase 10 `rate_delivery_claim` RPC), so `api/admin/reviews/[id]/delete`
only cleared the review — `rate_delivery_claim`'s one-time guard then
permanently rejected a fresh driver rating on any resubmitted review for
that order, with nothing on record to explain why. Compounding it: the
mobile review-submission mutation wasn't atomic — by the time the driver-
rating call hit that dangling state and threw, the `reviews` +
`review_items` inserts immediately before it had already committed as
independent network calls. The UI surfaced a bare error with no success
message, so the founder backed out believing nothing had saved — but a
real review row had, in fact, already been created. Fixed two ways:
the admin delete route now also clears
`delivery_claims.customer_rating`/`customer_rating_comment` for the
review's suborder (deleting a review is meant to fully undo the customer's
review action for that order, including the bundled driver rating); and
the driver-rating call inside the submit mutation is now best-effort,
matching this codebase's existing pattern for secondary notification sends
(`stripe-webhook`, `update-suborder-status`) — a failure there now surfaces
as "Review saved, but the driver rating couldn't be submitted: `<reason>`"
instead of reading as a total failure. The dangling state this had already
produced in the founder's live gate-test data (an orphaned review, a stuck
`customer_rating`) was cleaned up directly, confirmed via a direct query,
and the founder re-ran the delete→resubmit cycle afterward to confirm a
clean pass.

Also verified live:
- **Step 6** (report): reporting a review from a second test account
  ("Threes Kitchen") made it disappear from the public storefront list
  immediately, confirming `is_flagged` correctly gates `reviews_select`'s
  public-facing branch in real time, not just in the server-side test
  suite.
- **Step 8** (driver rating, after the fix): a fresh review + 5-star driver
  rating was submitted cleanly on the second attempt; confirmed directly
  against `delivery_claims.customer_rating` that it landed as `5`, matching
  the review's own overall rating.
- **Step 10** (waitlist restock): the founder favorited and waitlisted the
  real, reusable "Peanut Butter Cookie is sold out" fixture (§10); Claude
  flipped `is_sold_out` false, manually triggered
  `cron-waitlist-restock-check` (`{notified: 1, emailFailures: 0}`), the
  founder confirmed the email arrived, and the fixture was restored to
  `is_sold_out: true` afterward so it stays reusable for future phases.

**Phase 10 is fully gate-tested and merged** (PR #19, squash-merged to
`main` as commit `9e7fb3b`). Phase 11 (admin dashboard) is up next — see
the note below before scoping it.

**Known gap to fold into Phase 11's scope, flagged proactively (the
founder already raised this once during Phase 9, 2026-08-09): the admin
app has no UI to edit `regions` row settings at all** (dispatch contact,
base/per-mile delivery fee, delivery payout split %, claim window
T1/T2/T3 minutes, conflict rule) — every edit so far has gone through a
direct service-role script run by Claude. The spec's phase table puts
"Region settings... CRUD" under Phase 11, so this isn't a surprise, but
two things beyond a plain CRUD form are worth building at the same time:
(1) `regions.dispatch_email` is currently a single `text` column pointed
at the founder's own inbox — it needs to become a list (e.g. `text[]`,
mirroring `regions.zip_codes`'s existing array-column pattern) so a real
ops team's dispatch alerts aren't capped at one recipient; (2) whatever
UI validates region settings should account for the T1 < T2 < T3 ordering
`cron-unclaimed-delivery-check` assumes but never itself validates.

---

## 21. Phase 11 — Admin dashboard (2026-08-09, built + server-side verified, not yet merged)

Scope per `Cotto_MVP_Spec.md` row 11 (KPIs incl. delivery stats, vendor/customer
lists, region & fee settings, payout split) plus the acceptance-gate items
under "Central Ops can:" (§6): approve/reject/suspend vendors and customers,
see live orders/GMV/platform-fee/delivery-network stats for 7/30 days, set
platform fee % globally and per-vendor (incl. trial), edit region settings.

Four decisions confirmed with the founder before building:
1. **Customer suspend blocks checkout only** — no full auth lockout. A
   suspended customer can still sign in and browse; `profiles.status`
   (migration 0050) gates `checkout-create-payment-intent` specifically.
2. **Vendor suspend hides the storefront immediately; in-flight orders/
   suborders are left untouched** — consistent with this project's standing
   rule (first stated in Phase 9) of never disrupting money already in
   motion. `vendors.status = 'suspended'` already fell out of
   `vendors_select`'s public-visibility branch for free (migration 0010) —
   no RLS change needed, just a new admin action to reach that status from
   `active` (previously only reachable via the pending-review reject flow).
3. **Free-trial fee override gets full automation**, not just a manual admin
   field. `vendors.platform_fee_pct` / `free_trial_ends_at` already existed
   as schema (flagged in HANDOFF.md §3 as "not built yet") — this phase adds
   the admin UI to set them *and* a new daily cron
   (`cron-vendor-trial-expiry-check`, migration 0052) that resets the
   override back to the platform default once the trial date passes. A
   `free_trial_ends_at` left blank means the override is permanent (verified
   the cron leaves those untouched, see below).
4. **KPI dashboard: core delivery stats + driver leaderboard + per-region
   breakdown.** Active delivery partners, % of deliveries claimed before T1,
   avg time-to-claim, T3 auto-refund count, a completed-deliveries/avg-rating
   leaderboard per driver, and GMV/order-count broken out by region.

**What shipped:**

1. **Migrations 0050-0053:**
   - 0050: `profiles.status` (`active`/`suspended`) + `guard_profile_status_change`
     trigger (mirrors the existing `guard_profile_role_change` pattern from
     migration 0010 exactly) so a customer can't smuggle their own status
     change through the existing `profiles_update_own_or_admin` RLS policy.
   - 0051: `regions.dispatch_email` (single `text`) → `dispatch_emails`
     (`text[]`, mirrors the `zip_codes` array pattern), existing single value
     migrated into a one-element array. Also adds
     `regions_claim_window_order`, a `CHECK` constraint enforcing
     `T1 < T2 < T3` — closes the known gap flagged at the end of §20.
   - 0052: daily `pg_cron` schedule for `cron-vendor-trial-expiry-check`
     (13:45 UTC, same stagger pattern as every other daily cron in this
     project).
   - 0053: `vendors.suspended_reason` / `profiles.suspended_reason` (mirrors
     `vendors.rejected_reason` from migration 0002) so an admin's reason is
     visible on the record, not just in `audit_log`.
2. **Edge functions:**
   - `checkout-create-payment-intent` now checks the caller's
     `profiles.status` immediately after resolving the authenticated user
     (before any cart lookup) and returns a 403 with a clear message if
     suspended.
   - `cron-unclaimed-delivery-check` and `cron-stuck-delivery-watchdog`
     updated for `dispatch_emails` (array) instead of `dispatch_email`
     (single string) — Resend's `to` field accepts an array directly, so
     this was a straight rename plus an emptiness check, no per-recipient
     loop needed.
   - New `cron-vendor-trial-expiry-check` (daily): resets
     `platform_fee_pct`/`free_trial_ends_at` to null for any vendor whose
     trial date has passed, writes an `audit_log` row per vendor, and sends
     a best-effort email to the vendor (not just an admin warning, since
     this isn't punitive — matches the never-block-on-a-notification-failure
     pattern from `stripe-webhook`/`update-suborder-status`).
3. **Admin app (`apps/admin`):**
   - `dashboard/vendors/[id]`: `VendorActions` extended with Suspend
     (active → suspended, reason required, emails the vendor) and Reactivate
     (suspended → active) actions, alongside the existing pending-review
     Approve/Reject. New `FeeSettings` component on the same page for the
     per-vendor platform-fee override + trial-end date.
   - New `dashboard/customers` (list, name/email/role/status, email sourced
     via `auth.admin.listUsers()` — profiles has no email column) and
     `dashboard/customers/[id]` (detail + Suspend/Reactivate + recent orders).
   - New `dashboard/regions` (list) and `dashboard/regions/[id]` (edit form:
     dispatch contact name/phone, dispatch emails as an add/remove list,
     base + per-mile delivery fee, driver payout split %, T1/T2/T3 claim
     windows with client-side ordering validation before it ever reaches the
     DB constraint, conflict rule).
   - New `dashboard/settings`: `system_settings.default_platform_fee_pct` and
     `free_trial_default_days`.
   - New `dashboard/kpis`: 7d/30d toggle; live-order count (in-flight
     suborders right now, not windowed), GMV and platform-fee revenue
     (windowed, counts `paid`/`refunded`/`partially_refunded` orders — a
     later refund doesn't retroactively remove an order from GMV, same
     "what actually transacted" framing `refund-suborder.ts` uses);
     delivery network stats (active delivery partners, % claimed before T1,
     avg minutes-to-claim, T3 auto-refund count — computed by joining
     `vendor_suborders.ready_at` against `delivery_claims.claimed_at` and
     each suborder's own region's `claim_window_t1_minutes`); a driver
     leaderboard (completed deliveries + avg `customer_rating` per driver,
     windowed by `claimed_at`); and a per-region GMV/order-count breakdown.
   - Nav links added to `dashboard/page.tsx` for all of the above.

**A schema note worth recording**: `vendors.status = 'suspended'` was already
usable by `vendors_select`'s RLS policy (migration 0010: only `status = 'active'`
is customer-visible) and already blocked from vendor self-service via
`guard_vendor_owner_update` (migration 0010: owners can only toggle between
`active`/`unpublished`) — both written back in the original security-review
pass (§13) even though nothing in the admin app could reach `suspended` from
`active` until this phase. Confirmed via the verification script below rather
than assumed.

**Verified this session (server-side, throwaway-fixture discipline, same as
every prior phase — a Node script against the hosted Supabase using real
per-user sessions via `auth.admin.generateLink` + `verifyOtp`, deleted after
use, confirmed clean via `git status`): 22/22 checks passed**, including:
- A customer cannot self-suspend (`guard_profile_status_change` blocks it);
  the service role can. `checkout-create-payment-intent` returns a 403 with
  a suspension-specific message for a suspended customer's session and lets
  an active customer's session through to the (expected-to-fail-differently)
  cart lookup, proving the gate fires specifically on suspension.
- A vendor owner cannot self-suspend their own active vendor
  (`guard_vendor_owner_update` blocks it); the service role can. A suspended
  vendor is confirmed invisible to an unauthenticated stranger's `vendors`
  query and visible again immediately after reactivation.
- The DB rejects a `T1 >= T2` claim-window update (the new check constraint);
  `dispatch_emails` round-trips as a real 2-element array, not a stringified
  list.
- `cron-vendor-trial-expiry-check`: a fixture vendor with an expired
  `free_trial_ends_at` gets `platform_fee_pct`/`free_trial_ends_at` reset to
  null and an `audit_log` row; a **separate** fixture with a fee override but
  no `free_trial_ends_at` (a permanent override) is confirmed untouched by
  the same cron run.
- `cron-unclaimed-delivery-check` and `cron-stuck-delivery-watchdog` both run
  cleanly end-to-end against the renamed `dispatch_emails` column (regression
  check — both previously referenced the now-dropped `dispatch_email`
  column and would have thrown on their next real cron tick otherwise).

`pnpm typecheck && pnpm lint && pnpm test` all pass across all three
workspaces.

**Not verified this session** (needs a human clicking through the real admin
UI, same limitation noted in every prior phase for `apps/admin` — no local
Docker/Supabase to run the Next.js dev server against, and this phase has no
mobile-app changes to test): every new admin page and form itself — the
Suspend/Reactivate buttons and their confirm-reason flow, the fee-override
and platform-settings forms, the region-settings form's client-side
validation and the emails add/remove list, and the KPI dashboard's actual
rendered numbers against real data. The server-side script above proves the
underlying DB guarantees (RLS, guard triggers, check constraint, cron
correctness) hold; it does not prove the UI wired up to them correctly.

### Gate-test walkthrough

Sign in to the admin app as `CPITTS1183@gmail.com`.

1. Open **Customers**, pick a test customer profile that isn't your own
   admin account, open its detail page, tap **Suspend**, enter a reason,
   confirm. Confirm the badge flips to "suspended" and the reason appears.
   Ask me to seed a cart + attempt a checkout as that customer (or use a
   throwaway test account of your own) and confirm checkout is blocked with
   a clear "suspended" message. Tap **Reactivate** and confirm checkout
   works again.
2. Open **Vendors** → an `active` vendor that isn't Tester Kitchen (ask me
   to point you at a safe throwaway one, or we seed a fresh fixture). Tap
   **Suspend**, enter a reason, confirm. Confirm the vendor's storefront
   disappears from the mobile app's Browse tab / search within a few
   seconds. Tap **Reactivate** and confirm it reappears.
3. On that same vendor's detail page, set a **Fee override** to `0` and a
   **Trial ends on** date of today, save. Ask me to backdate it (or wait)
   and manually trigger `cron-vendor-trial-expiry-check`; confirm the fee
   override clears back to the default and you receive the "trial ended"
   email at the vendor's address.
4. Open **Platform settings**, change the default platform fee %, save,
   confirm it persists on reload.
5. Open **Region settings** → North Shore Chicago. Add a dispatch email,
   remove it, add a different one, save — confirm it persists. Try setting
   T1 to a value greater than T2 and confirm the form blocks the save with
   a clear message instead of a raw error.
6. Open **KPIs**. Confirm the 7-day/30-day toggle changes the numbers.
   Cross-check GMV against a couple of known recent test orders' totals.
   Confirm the delivery network stats and driver leaderboard show sensible
   numbers if you have recent delivery test fixtures, or ask me to seed a
   couple of claimed/completed delivery fixtures first if the numbers all
   read zero.

### Gate test results (2026-08-10) — all 6 steps passed

The founder ran the full walkthrough live against [PR #20](https://github.com/centralops-art/cotto-market/pull/20)'s
Vercel preview deployment (admin) and the mobile dev client. No product bugs
surfaced. One process note and one real-but-unrelated hiccup, both handled
inline:

**1. Step 1's customer fixture turned out to be leftover debris from this
session's own earlier server-side verification script (Claude's mistake, not
the founder's).** The script that produced the "22/22 checks passed" result
above actually ran twice — its first attempt crashed partway through (a bug
in how it read a freshly-created session's access token, fixed before the
second run) *after* creating two throwaway auth users and a throwaway vendor,
but *before* reaching its own cleanup step. That first run's fixtures were
never deleted, unlike the second (successful) run's, which cleaned up after
itself as intended. The founder picked one of those orphaned users
(`phase11-verify-vendorowner-...@example.com`) for step 1 without knowing it
was debris rather than an intentionally-seeded test account. Confirmed
harmless (a disposable test account, not a real person) and used for the
test anyway; all three leftover rows (the extra vendor + both auth users)
were deleted afterward, confirmed via a direct query. **Lesson: a
verification script's cleanup step must run even on a crash path — this one
didn't, and the debris briefly leaked into a live gate test.** Worth
wrapping fixture creation/cleanup in try/finally in future verification
scripts rather than a linear top-to-bottom script that only cleans up on the
happy path.
**2. The mobile Metro bundler got stuck at 0% mid-step-2, unrelated to any
Phase 11 change** (Phase 11 touched zero files under `apps/mobile`). Resolved
with a standard `expo start --clear` cache-clear restart. Worth noting
because it briefly looked like a caching bug in the Browse tab (Second Test
Kitchen was still visible after a suspend + soft reload) — that turned out to
be genuine React Query staleness from the tab having stayed mounted since
before the suspend (same class of issue as the Favorites-tab bug fixed back
in Phase 4), not a bug in the suspend feature itself. A truly fresh cold
launch (after the bundler was unstuck) correctly showed the vendor gone.

Also verified live:
- **Step 1**: reactivating the suspended customer was independently
  confirmed server-side — the same checkout call that returned 403
  ("Your account has been suspended...") while suspended returned 404 ("Cart
  not found or not yours", the expected next failure for a bogus test cart
  ID) immediately after reactivation, proving the suspension check
  specifically was what changed.
- **Step 2**: Second Test Kitchen's suspend/reactivate was independently
  confirmed server-side both directions — an anonymous customer-facing query
  returned nothing while suspended, and the real row again once reactivated.
- **Step 3**: backdating Second Test Kitchen's trial and triggering
  `cron-vendor-trial-expiry-check` correctly reset `platform_fee_pct: 0` →
  `null` and cleared `free_trial_ends_at`, with a matching `audit_log` row.
  The trial-ended notification email itself bounced (`emailFailures: 1`) —
  expected, since the fixture vendor's email is `second-test-kitchen@example.com`,
  not a real deliverable address; the send was attempted and failed
  gracefully without blocking the reset, exactly as designed.
- **Step 6**: the founder screenshotted Stripe's raw Payments ledger and
  asked for a reconciliation against the KPI page's $126.67 GMV / $3.48
  platform fee / 8 transacted orders for the last-7-days window — recomputing
  directly from the `orders` table matched exactly. Stripe's ledger shows
  more entries than that because it retains PaymentIntents forever, while
  this project deliberately deletes throwaway gate-test `orders` rows
  afterward (per the established fixture-cleanup discipline) and Stripe also
  includes at least one non-order infrastructure transaction ("Phase 8 smoke
  test -- top up available balance") — neither should appear in GMV, and
  neither did.

**Phase 11 is fully gate-tested and merged** (PR #20, squash-merged to `main`
as commit `9f55c34`). Phase 12 (polish, store submission, launch readiness)
is next.

**Known gap, flagged proactively by the founder, not urgent:** the region
settings CRUD built this phase only supports editing the existing region —
there's no "create a new region" flow anywhere in the admin app (`regions`
has always been treated as a single-row fixture, seeded directly, per §3).
**Founder's explicit call: defer this until the business is actually ready
to expand to a second region** — don't build it speculatively. When that
day comes, this needs a `dashboard/regions/new` page + a
POST `/api/admin/regions` route (the existing `PATCH .../regions/[id]`
route and `RegionForm` component should mostly just work for it). It also
needs a region picker somewhere in the "Become a Vendor" flow -- confirmed
by reading the code, not assumed: `apps/mobile/app/(app)/(tabs)/account.tsx`
picks `region_id` via `.eq("is_active", true).limit(1).maybeSingle()`,
silently defaulting every new vendor to whichever active region happens to
come back first. Fine with exactly one region; needs a real choice once a
second one exists.

**2026-08-10, out-of-phase styling pass**: the admin app's visual theme now
matches `cotto-web` (the marketing site) — warm cream backgrounds, brick-red
primary / forest-green secondary / amber accent, Lora headings over Mulish
body text, pill-shaped buttons with an offset-shadow press effect. Palette
and fonts extracted directly from `cotto-web/index.html`'s CSS (see
[PR #21](https://github.com/centralops-art/cotto-market/pull/21),
squash-merged as commit `08c5c4c`). Also fixed a latent bug found in the
process: `tailwind.config.ts` never had a `fontFamily` extension, so
`font-sans` was silently falling back to the browser's default system font
stack the entire time despite Inter being loaded via `next/font` — if a
future session touches typography again, the fix (mapping `fontFamily.sans`/
`.heading`/`.mono` to the `--font-*` CSS variables) is the pattern to keep
following, not the old un-wired setup.
