**Cotto Marketplace — MVP Specification (v1.1)**

Refined from the original Development Outline and User Stories sheet.  
Audience: a non‑dev / light‑dev founder with technical oversight support.  
Goal: ship a real, testable marketplace for \~10 vendors and a few hundred customers in the North Shore Chicago corridor (Evanston, Skokie, Wilmette, and adjacent).

**What's new in v1.1 of this spec:** Delivery is back in scope using a **vendor‑as‑driver cooperative network** — the same vendors who cook also deliver other vendors' orders during their off hours. This is Cotto's signature differentiator vs. DoorDash and the original outline.

**1\. MVP Goal & Non‑Goals**

**MVP goal:** Prove the core marketplace loop AND the cooperative delivery network — *vendors can list, customers can order, money moves, and other vendors carry the delivery.*

**In scope for v1:**

* Three user types: **Central Ops (admin)**, **Vendor** (acts as both cook AND driver), **Customer**.

* Vendor onboarding (with CFPM cert upload \+ admin approval gate).

* **Delivery onboarding** — driver's license upload, vehicle attestation, insurance attestation, delivery agreement acceptance. Optional; a vendor can be cook‑only.

* Vendor storefront with **customizable colors, layout, and header image**.

* Customer browse, search, favorites, and **waitlist for sold‑out items**.

* Multi‑vendor cart, **checkout via Stripe Connect**.

* **Cooperative delivery network**: customer picks delivery → order enters a regional pool → any eligible on‑duty vendor can claim and deliver → 80/20 fee split (configurable) → fallback to manual dispatch if unclaimed.

* Status‑based delivery tracking with **Mapbox ETA estimates** (no live map in v1).

* Single region: **North Shore Chicago** (Evanston, Skokie, Wilmette, Winnetka, Glencoe, Northbrook, Highland Park).

* Cottage food law disclaimer \+ allergen/ingredient fields per item.

* Vendor order management (cook side) and delivery queue (driver side) — same app, two tabs.

* Star ratings & customer reviews (lightweight; flag‑for‑review moderation).

**Explicitly deferred to v1.1+ (designed for, but not built):**

* **Live driver location on map** for the customer (we ship status‑only \+ ETA in v1).

* **Outside drivers** — only vendors can deliver in v1. Opening to non‑vendor 1099 drivers is a future expansion.

* **Delivery shuttle / multi‑stop bundling with dynamic discounts** — single‑stop deliveries only.

* Donations to social causes, community polls, community fund dashboard.

* Appointments (services/health & beauty vendors).

* Live‑stream food prep and batch countdown timers.

* Multi‑region expansion (data model is region‑aware from day one, but only one region is seeded).

* Customer "Spotlight" link sharing, vendor recommendations between vendors.

* Vendor sales analytics beyond a basic dashboard.

* Native push notifications (use email/SMS in v1).

**Hard non‑goals for MVP:**

* No standalone driver app (deliveries happen inside the vendor app's "Deliveries" tab).

* No nonprofit/charity accounting.

* No public API.

* No multi‑language.

**2\. Personas (v1)**

| Persona | Count at launch | Primary jobs |
| :---- | :---- | :---- |
| **Central Ops Admin** (founder \+ 1 helper) | 1–2 | Approve vendors, approve delivery onboarding, manage categories, view orders/sales, suspend accounts, manage region config & fees & fee splits. |
| **Vendor** (home cook, farmers‑market stallholder) | \~10 | Onboard, build storefront, manage menu, fulfill orders. Optionally: complete delivery onboarding, claim deliveries from the pool, drive them, get paid for both cooking AND delivery. |
| **Customer** (North Shore household) | 50–500 in beta | Browse, search, order, pay, review, favorite, waitlist. |

A vendor has up to 4 "modes" they can hold simultaneously, each gated by onboarding completeness and admin approval:

* cook\_active — kitchen is open, accepting orders.

* cook\_away — kitchen is hidden (vendor‑set).

* delivery\_eligible — completed delivery onboarding \+ admin approved.

* delivery\_on\_duty — actively willing to claim deliveries right now (vendor‑set toggle).

**3\. User Flows (v1)**

**3.1 Vendor onboarding (admin‑gated) — cook side**

1. Sign up → email verify.

2. Choose vendor type (home cook / farmers market / pop‑up / food truck).

3. Business details (legal name, DBA, service address, phone, EIN optional).

4. **Stripe Connect Express onboarding** (Stripe handles KYC \+ bank info). Same Connect account is used for both cooking revenue and delivery payouts.

5. **Upload CFPM certificate** image \+ expiration date.

6. Accept cottage food law agreement.

7. Submit → status pending\_review.

8. Central Ops reviews in admin → approve / reject with reason.

9. On approve → vendor can build storefront; storefront stays unpublished until vendor clicks **Publish**.

**3.2 Delivery onboarding (separate, optional, admin‑gated)**

A vendor can complete this any time after cook approval. Skipping it means cook‑only (still valid). 

1. From vendor home, "Become a Delivery Partner" → wizard:

   1. Driver's license upload (front \+ back) \+ expiration date.

   2. Vehicle type (sedan / SUV / truck / bike / e‑bike / scooter / on foot — bike/foot OK for short-radius deliveries).

   3. Insurance attestation: vendor checks "I have valid auto insurance covering occasional commercial use OR I am not using a motor vehicle." (No insurance doc upload in v1 — attestation only; flagged for legal review.)

   4. Acceptance of **Cotto Delivery Partner Agreement** (markdown stored in system\_settings).

   5. Default delivery radius willing to drive (3 / 5 / 10 / 15 miles).

   6. Default delivery availability windows (recurring weekly schedule).

2. Status set to delivery\_pending\_review.

3. Admin reviews in admin app, approves → vendor sees a new **"Deliveries"** tab in their app.

**3.3 Vendor storefront build**

* Header: upload header image, set storefront name, tagline, hours of operation, days accepting preorders.

* Theme: pick from 3 starter color palettes, accent color, layout (compact list / detail list / image grid / detail grid).

* About: team bios (1–5 members), photos.

* Menu: add categories (sections), add items (name, price, description, ingredients, allergens, images up to 5, available toggle, sold‑out toggle).

* Promotions: simple percent‑off or fixed‑amount promo codes (deferred — flag only in data model).

* Preview → Publish.

**3.4 Customer order**

1. Land on home → see nearby published vendors (filtered by service address ZIP).

2. Browse / search / filter (vendor type, distance, allergen‑excluded).

3. Open vendor → menu → item detail → add to cart with quantity (+ pickup/delivery toggle).

4. Cart supports **multiple vendors**; each vendor block has its own pickup/delivery selector and pickup time slot.

5. Checkout → enter delivery address (if any), confirm contact info, pay via Stripe.

6. For delivery suborders, an estimated delivery window is shown based on Mapbox ETA \+ a buffer.

7. Order confirmation page \+ email with itemized receipt and per‑vendor pickup/delivery instructions.

8. Track order: received → confirmed → preparing → ready → completed for pickup; received → confirmed → preparing → ready → claimed → en\_route\_to\_pickup → picked\_up → en\_route\_to\_customer → delivered → completed for delivery.

9. After completion → prompt to review each item (1–5 stars \+ optional text \+ 1 photo) AND, for delivery suborders, rate the driver (1–5 stars, optional comment).

**3.5 Vendor order management (cook side)**

* "Open orders" list (oldest first) with pickup/delivery badge.

* Click order → see items, customer name, delivery/pickup details, customer message field.

* Status buttons: **Confirm Order → Start Preparing → Ready → Completed** (for pickup). For delivery: when vendor sets status to **Ready**, the suborder enters the delivery pool automatically.

* Vendor can message the customer (in‑app thread, also emails customer).

* Vendor sees a "kitchen orders open" counter at top of screen — used by the soft‑warning logic when they try to claim a delivery.

**3.6 Vendor delivery side ("Deliveries" tab, only visible if delivery\_eligible)**

* Toggle at top: **Delivery Mode: ON / OFF**. When ON, the vendor is shown in the eligible-driver pool and can claim. Toggle does NOT auto-hide the kitchen — vendors with sufficient staff can stay on for both. (See conflict rule below.)

* Three sub-screens:

  * **Available** — list of unclaimed delivery suborders in the region, sorted by pickup proximity. Each card shows: pickup vendor, distance from current location to pickup, distance pickup → drop‑off, payout in dollars, customer first name only.

  * **My Queue** — claimed deliveries in progress, with the active-status buttons for the current step.

  * **History** — completed deliveries with payout summary.

* **Conflict rule (soft warning):** When the vendor taps "Claim", if they currently have any open kitchen suborder in received, confirmed, or preparing status, show a banner: *"You have N open kitchen orders. Make sure your team can cover both. Claim anyway?"* Vendor decides. (Admin setting allows switching this to a hard block per region if needed.)

* **Self‑claim block (hard):** A vendor cannot claim a delivery suborder for which they are themselves the cooking vendor. \[Need to enable members of a Vendor Team to claim delivery of orders to their own storefront.  Team members should be listed as bio only under the vendor account and all deliveries should be done under the vendor account\]

* **Status flow once claimed:** claimed → en\_route\_to\_pickup → picked\_up → en\_route\_to\_customer → delivered. Each transition is a button tap; "Open in Maps" launches the device's default nav app with the appropriate address pre‑filled.

**3.7 Unclaimed delivery fallback**

Configurable per region (defaults shown):

* **T1 \= 10 minutes** unclaimed since cook marked Ready → Edge function sends SMS \+ email to the regional dispatch contact with full order details.

* **T2 \= 30 minutes** unclaimed → Customer gets a push/email/SMS: *"No driver available yet. Switch to pickup or get a full refund?"* with two action buttons.

* If customer chooses refund, Stripe processes a full refund (cooking vendor is notified). Central Ops will have to absorb cost of unclaimed delivery orders that have already been prepared

* If customer chooses pickup, suborder converts to pickup with a pickup window starting in 15 min.

* T3 \= 60 minutes unclaimed → if the customer never taps either link, there is a T3 auto-resolution to issue a full refund.  A driver can still claim while the T2 offer is pending (racing the customer's refund tap) which will cancel the offer for a refund

**3.8 Central Ops admin**

* Dashboard: vendor count, customer count, orders last 7/30 days, GMV last 7/30 days, platform fee revenue, **delivery network stats** (deliveries claimed by vendor, average claim time, unclaimed rate).

* Vendors list: filter by status (pending / active / suspended) and delivery status (cook-only / delivery-eligible / delivery-pending). Click → approve / reject / suspend / view documents (CFPM cert, driver's license).

* Customers list: search by name/email; suspend; reset password.

* Orders: all orders, filter by vendor / status / date, with a sub-filter for delivery status (claimed / unclaimed / completed / cancelled).

* Region settings (single region in v1, but data model supports many): name, ZIPs, dispatch contact email/phone, base delivery fee, per‑mile fee, **delivery payout split percentage** (default 80/20), claim window timers T1/T2.

* Categories: vendor types, menu categories — global CRUD.

* System settings: platform fee % (default **8%**, with per‑vendor override to **0%** for free‑trial early adopters), free‑trial expiration date per vendor, delivery partner agreement markdown, cottage food disclaimer markdown.

**4\. Data Model (Supabase / Postgres)**

Tables (snake\_case). All have id uuid pk, created\_at, updated\_at. Soft delete via deleted\_at where noted.

* profiles — extends auth.users (Supabase auth). Fields: role enum(customer,vendor\_owner,vendor\_member,ops\_admin,ops\_owner), full\_name, phone, username (unique, customer), avatar\_url.

* regions — name, slug, zip\_codes text\[\], dispatch\_contact\_name, dispatch\_email, dispatch\_phone, base\_delivery\_fee\_cents, per\_mile\_fee\_cents, delivery\_payout\_split\_pct (default 80), claim\_window\_t1\_minutes (default 10), claim\_window\_t2\_minutes (default 30), delivery\_conflict\_rule enum(soft\_warning,hard\_block) default soft\_warning, health\_regs\_url, is\_active.

* vendors — owner\_profile\_id, region\_id, storefront\_name, slug (unique), tagline, description, vendor\_types text\[\], address\_line1, city, state, zip, lat, lng, phone, email, website, header\_image\_url, theme\_palette jsonb, layout\_style enum, hours jsonb, preorder\_hours jsonb, status enum(pending\_review,active,suspended,unpublished), published\_at, platform\_fee\_pct numeric (nullable; overrides system default), free\_trial\_ends\_at, stripe\_account\_id, cfpm\_cert\_url, cfpm\_cert\_expires\_on, cottage\_food\_acknowledged\_at.

* vendor\_delivery\_profiles — **new for v1.1.** vendor\_id (1:1), status enum(not\_started,delivery\_pending\_review,delivery\_active,delivery\_suspended), drivers\_license\_front\_url, drivers\_license\_back\_url, drivers\_license\_expires\_on, vehicle\_type enum(sedan,suv,truck,bike,ebike,scooter,on\_foot), insurance\_attested\_at, delivery\_agreement\_accepted\_at, default\_radius\_miles, availability jsonb (weekly schedule), on\_duty boolean default false.

* vendor\_team\_members — vendor\_id, profile\_id, display\_name, role\_title, bio, photo\_url, sort\_order.

* menu\_categories — vendor\_id, name, sort\_order.

* menu\_items — vendor\_id, menu\_category\_id, name, description, price\_cents, ingredients, allergens text\[\], image\_urls text\[\], is\_available, is\_sold\_out, sort\_order, deleted\_at.

* favorites — profile\_id, target polymorphic (vendor\_id xor menu\_item\_id), unique.

* waitlist\_entries — menu\_item\_id, profile\_id, notified\_at, unique pair.

* carts — profile\_id (nullable for guest), session\_id, status (open,abandoned,checked\_out).

* cart\_items — cart\_id, menu\_item\_id, vendor\_id (denormalized), quantity, unit\_price\_cents, customization jsonb.

* orders — customer\_profile\_id, region\_id, subtotal\_cents, delivery\_fee\_cents, tax\_cents, platform\_fee\_cents, total\_cents, currency, status enum, payment\_intent\_id, created\_at.

* vendor\_suborders — order\_id, vendor\_id, fulfillment enum(pickup,delivery), pickup\_at (nullable), delivery\_address jsonb (nullable), delivery\_lat, delivery\_lng, delivery\_instructions, subtotal\_cents, delivery\_fee\_cents, platform\_fee\_cents, vendor\_payout\_cents, status enum(received,confirmed,preparing,ready,claimed,en\_route\_to\_pickup,picked\_up,en\_route\_to\_customer,delivered,completed,cancelled,refunded), ready\_at timestamptz, mapbox\_eta\_minutes integer, stripe\_transfer\_id (cook payout).

* delivery\_claims — **new for v1.1.** vendor\_suborder\_id (1:1 active claim), driver\_vendor\_id (the claiming vendor), claimed\_at, picked\_up\_at, delivered\_at, released\_at (if vendor cancels claim), driver\_payout\_cents, cotto\_delivery\_fee\_cents (the platform's slice of the delivery fee), stripe\_transfer\_id (driver payout), customer\_rating smallint nullable, customer\_rating\_comment.

* delivery\_dispatch\_events — **new for v1.1.** vendor\_suborder\_id, event\_type enum(t1\_sms\_sent,t2\_customer\_offer\_sent,customer\_chose\_pickup,customer\_chose\_refund), occurred\_at, payload jsonb. 

* order\_items — vendor\_suborder\_id, menu\_item\_id, name\_snapshot, unit\_price\_cents, quantity, customization jsonb.

* reviews — vendor\_suborder\_id, customer\_profile\_id, vendor\_id, rating\_overall 1–5, body, image\_url, is\_flagged, flagged\_reason.

* review\_items — review\_id, menu\_item\_id, rating 1–5, body.

* messages — vendor\_suborder\_id, from\_profile\_id, to\_profile\_id, body, read\_at.

* audit\_log — admin actions (who approved/suspended what, when, why) — also logs claim/release events on delivery.

* system\_settings — singleton row: default\_platform\_fee\_pct, free\_trial\_default\_days, support\_email, cottage\_food\_disclaimer\_md, delivery\_partner\_agreement\_md, admin\_allow\_list text\[\].

**RLS policies** (Supabase Row Level Security):

* Customers: read own profile, own orders, own favorites/waitlist; read any active vendor/menu\_item.

* Vendors: read/write own vendor row, own menu, own suborders; read customer profile fields strictly necessary for fulfillment (name, phone, delivery address) on suborders they cook OR drive; read all unclaimed delivery suborders in their region (the pool view).

* Ops admins: full access via service role from admin app.

**Money math (delivery split):**

* Total delivery fee on a suborder \= region.base\_delivery\_fee\_cents \+ (distance\_miles\_round\_trip \* region.per\_mile\_fee\_cents).

* Driver payout \= delivery\_fee\_cents \* region.delivery\_payout\_split\_pct / 100.

* Cotto's slice \= delivery\_fee\_cents \- driver\_payout.

* Cook still receives full food revenue minus platform\_fee\_pct.

* All three settle via Stripe Connect transfer calls on the payment\_intent.succeeded (for cook & platform) \+ a deferred transfer on delivered confirmation (for driver — withhold until proven delivered).

**5\. Tech Stack & Architecture**

**Stack:**

* **Mobile**: React Native via **Expo (managed workflow)** — one codebase for iOS \+ Android. Used by both customers and vendors (cook \+ driver roles inside the vendor experience). Use Expo Router.

* **Web admin (Central Ops)**: **Next.js 14 (App Router)** \+ Tailwind \+ shadcn/ui.

* **Backend**: **Supabase** (Postgres \+ Auth \+ Storage \+ RLS \+ Edge Functions \+ cron).

* **Payments**: **Stripe Connect Express** (separate Connect onboarding flow; platform charges \+ application\_fee\_amount \+ deferred transfers for driver payouts).

* **Email**: Resend (transactional).

* **SMS / dispatch**: Twilio (used by both customer notifications and the T1 unclaimed-fallback dispatch).

* **Image hosting**: Supabase Storage with public read for storefronts, private bucket for CFPM certs and driver's licenses.

* **Search**: Postgres full‑text on vendors and menu\_items.

* **Maps / distance / ETA**: Mapbox (Geocoding, Directions API for ETAs).

* **Realtime**: Supabase Realtime subscriptions for the delivery pool (drivers see new claimable orders pop in live) and for order-status updates on the customer side.

* **Deploy**:

  * Mobile: **Expo EAS Build \+ EAS Submit** (TestFlight \+ Google Play internal track).

  * Web admin: **Vercel**.

  * Supabase project: hosted.

* **Monorepo**: pnpm workspaces — apps/mobile, apps/admin, packages/shared.

* **CI**: GitHub Actions running typecheck \+ lint \+ tests on PR.

**Why this stack:**

* One Postgres \= one source of truth for customer \+ cook \+ driver \+ admin views.

* RLS pushes most authorization into the DB.

* Stripe Connect handles KYC, bank info, tax docs.

* Supabase Realtime is critical for the delivery pool — drivers see unclaimed orders update live without polling.

* Expo lets a non‑dev ship to both stores from cloud builds.

**6\. Acceptance Criteria (definition of done for v1)**

A vendor (cook side) can:

* ☐ Sign up, complete Stripe Connect Express onboarding, upload CFPM cert, submit for review.

* ☐ After approval, build a storefront with header image, theme, menu categories, ≥5 items with images, allergens, and ingredients.

* ☐ Publish the storefront and see it live in the customer app.

* ☐ Receive a real order, mark statuses through to completed.

* ☐ Receive a Stripe payout (in test mode end‑to‑end, in live mode for at least one real $1 transaction).

A vendor (delivery side) can:

* ☐ Complete the delivery onboarding wizard and submit for admin review.

* ☐ After approval, toggle Delivery Mode ON and see the available-orders pool live.

* ☐ Claim an order, mark each status transition, deliver it, and see the driver payout in their Stripe dashboard.

* ☐ NOT claim their own order (system blocks it). 

* ☐ See the soft warning when claiming with open kitchen orders.

A customer can:

* ☐ Create an account, browse vendors in the region, search by keyword, filter by allergen and vendor type.

* ☐ Add items from 2 different vendors to one cart, choose pickup for one and delivery for the other, check out with a real card.

* ☐ Receive an itemized email receipt; track each suborder; leave a review (food \+ driver) after completion.

* ☐ When a delivery is unclaimed for 30 minutes, receive the pickup-or-refund choice and have it executed correctly.

* ☐ Favorite vendors and items; join a waitlist for a sold‑out item; receive an email when it returns.

Central Ops can:

* ☐ Approve / reject a cook vendor with a reason; approve / reject a delivery vendor; suspend either; suspend a customer.

* ☐ See live orders, GMV, platform‑fee revenue, delivery network stats for the last 7 / 30 days.

* ☐ Set platform fee % globally and override per vendor (incl. 0% trial).

* ☐ Edit region settings: dispatch contact, base delivery fee, per‑mile fee, payout split %, T1/T2/T3 timers, conflict rule.

Compliance:

* ☐ Cottage food disclaimer shown on each food item detail and at checkout.

* ☐ CFPM cert visible (admin only) on the vendor record with expiration date.

* ☐ Delivery Partner Agreement acceptance timestamp recorded; driver's license images visible to admin only.

* ☐ Stripe Connect KYC completed for every active vendor.

Quality bar:

* ☐ Mobile app builds and runs on a fresh device via TestFlight \+ Google Play internal.

* ☐ Web admin deploys to Vercel with magic-link login restricted to an allow‑list.

* ☐ Test coverage on critical paths: cart math, fee calc, payout split math, status transitions, claim race conditions, Stripe webhook handling.

**7\. Known Risks & Gaps to Watch**

1. **Personal auto insurance for occasional delivery** — Illinois insurance carriers typically exclude commercial use. The MVP uses attestation only, which is acceptable for a closed beta but **must be reviewed by an Illinois attorney before live launch**. Consider requiring proof of a rideshare endorsement (\~$10–30/mo add-on) before scaling beyond beta. For bike/foot deliveries, this is much less fraught.

2. **W-2 vs 1099 classification** — Vendor drivers are independent contractors, same as DoorDash. The Cotto Delivery Partner Agreement must spell this out. Tax forms (1099-NEC if a driver earns \>$600) are handled by Stripe Connect annually.

3. **Claim race conditions** — Two drivers tapping "Claim" on the same order at the same time must be handled with a database-level optimistic lock (single-row update with status \= 'ready' condition; second update returns 0 rows and the UI shows "Already claimed"). Test this hard.

4. **Driver going dark mid-delivery** — If a driver claims, marks picked\_up, then disappears, the order is stuck. v1 mitigation: auto-release a claim if no status update in 60 minutes (configurable) AND notify dispatch. v1.1: live location.

5. **Illinois cottage food law specifics** — Disclaimer text and allowed item types must be attorney-reviewed before live launch.

6. **Refund policy on failed delivery** — If a delivery fails (driver no-show after claim, or unclaimed past T2), customer gets full refund of food \+ delivery fee. The cook is paid nothing (no food was ever picked up). If the cook had already started prep, this is a real cost to them — flag for founder to absorb during beta or build a "prep started" partial-pay rule in v1.1. 

7. **CFPM expiration** — admin needs a 60‑day warning before a cert expires; auto‑suspend on expiration. Same goes for driver's license expiration. Cron job in Supabase. 

8. **Stripe Connect approval** — Apply for Connect platform account on day one (1–2 week wait).

9. **Background checks** — None in v1. The whole point is that drivers are already vetted as vendors (CFPM cert \+ admin approval). For v1.1+ if outside drivers are added, third-party background check (Checkr, etc.) becomes mandatory.

**8\. Phased Build Plan**

| Phase | Duration | Output |
| :---- | :---- | :---- |
| **0\. Foundations** | 2–3 days | Monorepo, Supabase project, schema migrations, RLS, env scaffolding, GitHub Actions, deploy targets stubbed. |
| **1\. Auth & roles** | 2 days | Email/password \+ magic link auth on mobile and admin. Role gating. |
| **2\. Cook onboarding \+ admin approval** | 4 days | Vendor sign‑up wizard, Stripe Connect Express embed, CFPM upload, admin approve/reject. |
| **3\. Storefront builder** | 5 days | Header, theme, hours, team, menu categories, menu items with images. |
| **4\. Customer browse & search** | 3 days | Region‑filtered vendor list, search, filters, vendor profile, item detail. |
| **5\. Cart & checkout** | 5 days | Multi‑vendor cart, suborder split, Stripe Connect destination charges, webhooks, receipts. |
| **6\. Order lifecycle (cook side)** | 3 days | Vendor cook order management, status transitions, customer tracking for pickup orders. |
| **7\. Delivery onboarding \+ pool** | 4 days | Delivery onboarding wizard, admin approval, driver's license storage, eligibility logic, region pool view. |
| **8\. Claim → deliver → payout** | 5 days | Claim flow with race-safe DB lock, status transitions, Mapbox ETA, deferred Stripe transfers on delivered, self-claim block, soft warning. |
| **9\. Unclaimed fallback \+ customer offer** | 2 days | Supabase cron \+ edge functions for T1 SMS dispatch, T2 customer pickup-or-refund offer, refund execution. |
| **10\. Reviews, favorites, waitlist** | 2 days | All three small features, including driver rating. |
| **11\. Admin dashboard** | 3 days | KPIs incl. delivery stats, vendor lists, customer list, region & fee settings, payout split. |
| **12\. Polish & store submission** | 3–5 days | Empty states, error boundaries, Sentry, TestFlight \+ Play internal track. |

**Estimated calendar**: 8–10 weeks at solid pace by one capable dev with Claude Code; longer for a non‑dev driving Claude Code with oversight. The vendor-as-driver feature adds roughly 2 weeks vs. the cook-only path.

**9\. Open Items Before Build Starts**

* \[ \] Founder applies for **Stripe Connect platform account** (1–2 week approval window).

* \[ \] Founder registers **Apple Developer ($99/yr)** and **Google Play Developer ($25 one‑time)** accounts.

* \[ \] Founder buys domain (suggest cotto.market or cottamarket.com) and sets up Resend with SPF/DKIM.

* \[ \] Founder gets the cottage food disclaimer **and the Cotto Delivery Partner Agreement** reviewed by an Illinois attorney before live launch. The DPA should cover: independent contractor status, insurance attestation, liability waiver, payout terms, suspension/termination rules.

* \[ \] Confirm logo and brand colors (or use a clean default and iterate later).

* \[ \] Confirm region name and final ZIP list for "North Shore Chicago".

* \[ \] Confirm default delivery fee math for the North Shore: suggested $4.99 base \+ $1.50/mile. Founder to decide.

* \[ \] Founder considers: will Cotto offer beta vendors a one-time "delivery insurance" stipend or partner discount (e.g., rideshare endorsement) as a launch perk? This is a cheap goodwill move and de-risks the legal exposure.