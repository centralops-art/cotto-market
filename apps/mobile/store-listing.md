# Store listing copy — CottoMarket

Reference doc for filling in App Store Connect and Google Play Console.
Voice/content drawn directly from cottomarket.com (How It Works, What We
Don't Do, FAQ) so the store listings match the live site rather than
inventing new language. Character counts verified against each field's
platform limit — see the check script note at the bottom before pasting
if any copy here is edited.

---

## Shared basics

- **App name**: CottoMarket
- **Category**: Food & Drink
- **Support URL**: https://cottomarket.com/FAQ
- **Marketing URL**: https://cottomarket.com
- **Privacy Policy URL**: https://cottomarket.com/privacy-policy
- **Support email**: centralops@cottomarket.com
- **Copyright**: © 2026 Cotto Marketplace

---

## App Store Connect (iOS)

**Subtitle** (30 char max):
```
Local food. Neighbor delivery.
```

**Promotional text** (170 char max — the only field editable without a new build submission, good for seasonal/beta messaging):
```
North Shore Chicago's neighborhood food marketplace. Home-cooked meals, farm stands, food trucks & pop-ups — ordered in a tap, delivered by the vendors themselves.
```

**Keywords** (100 char max, comma-separated, no spaces after commas):
```
local food,home cooked,farmers market,food delivery,cottage food,food truck,North Shore,Chicago
```

**Description** — see "Full description" section below (shared with Play Store).

**Age rating questionnaire**: answer honestly — no violence/gambling/mature content. The one question worth answering carefully is **User-Generated Content**: Cotto has customer reviews with optional photos (`review-images` bucket) and messaging between customer/vendor/driver. Moderation exists (any user can report a review, which immediately hides it pending admin review — see `HANDOFF.md` §20) but isn't pre-screened before posting. Answer "Yes, contains unmoderated UGC" if Apple's wording distinguishes pre- vs. post-moderation — don't claim pre-moderation that doesn't exist.

---

## Google Play Console (Android)

**Short description** (80 char max):
```
Local home-cooked food & farm goods, ordered and delivered by your neighbors.
```

**Full description**: see below (shared with App Store).

**Data safety section**: see the data inventory below — this is the single most important section to get right, since Google cross-checks it against the app's actual behavior and will reject/suspend listings for mismatches.

**Content rating questionnaire (IARC)**: same honesty note as Apple's — flag unmoderated user-generated content (review text/photos) when asked.

**Target audience**: general audience, not primarily directed at children. No ads in the app.

---

## Full description (both stores)

```
Cotto connects you with the home cooks, farmers market stalls, food trucks, and pop-ups making real food right in your North Shore Chicago neighborhood — ordered in a tap, brought to your door by the vendors themselves.

WHAT YOU CAN GET
Browse by category — produce, baked goods, prepared meals, preserves & drinks — from vendors across North Shore Chicago. See what's in stock, what's sold out, and every item's allergens before you order.

HOW IT WORKS
1. Browse local vendors and dishes near you.
2. Order and pay securely with Stripe. A cart with dishes from three different cooks automatically becomes three separate orders behind the scenes — no extra work for you.
3. Your vendor gets notified instantly, confirms your order, and starts preparing it. Track live status from received to preparing to ready.
4. Choose pickup directly from the vendor, or delivery through Cotto's cooperative delivery network — nearby vendors who are already out delivering can pick up your order too, so it moves through the neighborhood, not a warehouse.
5. Rate your experience once your order's complete, to help other neighbors discover great vendors.

A COOPERATIVE DELIVERY NETWORK
There's no separate fleet of drivers. When your order is ready, a nearby vendor who's already out delivering can claim the job — neighbors delivering for neighbors, keeping more of every dollar in the local food community.

BUILT DIFFERENT, ON PURPOSE
Cotto is a community-first marketplace, not a Wall-Street-backed delivery giant:
- No surge pricing during high-demand periods.
- No dark patterns designed to push you into bigger orders.
- No pay-to-win search results — vendors aren't buried for refusing to pay for placement.
- Fair delivery pay for the neighbors who bring you your food.

FOR HOME COOKS & SMALL VENDORS
If you're an Illinois cottage food producer, farmers market vendor, food truck, or pop-up, Cotto gives you a storefront, your own menu, and a built-in delivery network — without locking you into exclusivity or taking ownership of your brand. Apply to sell at cottomarket.com.

Cotto currently serves North Shore Chicago. More neighborhoods coming as the community grows.
```

---

## Data safety / App privacy inventory

Verified against this codebase's actual schema and edge functions, not
guessed — cross-check against `HANDOFF.md` §4/§5 if anything changes.

| Data type | Collected? | Purpose | Shared with a third party? |
|---|---|---|---|
| Name | Yes (`profiles.full_name`) | Account functionality | No |
| Email address | Yes (Supabase Auth) | Account functionality, transactional email | Resend (email delivery only) |
| Phone number | Yes (`profiles.phone`, `vendors.phone`) | Account functionality, order/delivery SMS (opt-in only, `sms_opt_in`) | Twilio (SMS delivery only, opted-in users) |
| Physical address | Yes (delivery address, vendor address) | App functionality (pickup/delivery, fee calculation) | Mapbox (geocoding/distance only) |
| Precise location | Yes (driver GPS while on duty in the Deliveries tab) | App functionality (delivery pool distances) | No |
| Photos | Yes (CFPM certs, driver's license, menu items, review photos, vendor header image) | App functionality, vendor/driver verification | No (private storage buckets, signed URLs only to authorized viewers) |
| Payment info | **Not collected by Cotto** — handled entirely by Stripe's SDK, card data never reaches Cotto's servers | N/A | Stripe (full processor relationship) |
| User-generated content | Yes (reviews, review photos, in-app messages) | App functionality | No |
| Crash/diagnostic data | Yes, as of Phase 12 (Sentry) | App stability/bug fixing | Sentry (crash reports only) |
| Precise location of other users | No | — | — |
| Advertising/analytics ID | No — no ad SDK, no analytics SDK | — | — |

**Deletion**: no self-service account/data deletion flow exists in the
app yet. If either store's questionnaire requires a working deletion
path or a stated process, that's a real gap to flag back to this
project — not something to answer with a placeholder.

---

*Character counts verified 2026-11-07 (measured, not hand-counted):
subtitle 30/30, promotional text 163/170, keywords 95/100, short
description 77/80, full description 2172/4000. If you edit any of
these fields, re-check length before saving — both stores reject
over-limit text at save time, so there's no real risk of accidentally
shipping something too long, just a wasted round-trip.*
