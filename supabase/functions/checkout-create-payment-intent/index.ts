// Starts checkout for ONE kitchen in the caller's cart (Stripe Direct
// charges, HANDOFF.md §39 step 4). Prices that kitchen's items (subtotal,
// delivery fee via Mapbox Directions, platform fee, Stripe Tax on the cook's
// own account), writes `orders` / one `vendor_suborders` / `order_items` as
// `pending_payment`, and returns what the app's PaymentSheet needs:
//
//   pickup:   { mode: "pickup", clientSecret, stripeAccountId }
//             Food PaymentIntent on the cook's connected account
//             (amount = subtotal + tax, application_fee_amount = platform fee).
//   delivery: { mode: "delivery", clientSecret }
//             Manual-capture PaymentIntent on the platform for the delivery
//             fee, on the customer's platform Customer, saving the card.
//             checkout-complete then charges the food on the cook's account
//             with that card and captures (or cancels) the delivery fee.
//
// Request: { cartId, vendorId, fulfillment, checkoutVersion: 2 }. Requests
// without vendorId come from app builds before Direct charges and are told
// to update.
//
// Requires STRIPE_SECRET_KEY and MAPBOX_TOKEN secrets.
//
// NOTE: calculateSubtotalCents/calculatePlatformFeeCents/calculateDeliveryFeeCents/
// metersToMiles below are mirrored from packages/shared/src/fees.ts.
// Deno's strict module resolution (no extensionless relative imports) makes a
// direct cross-package import from that Node-oriented file brittle, so the
// handful of pure functions are duplicated here -- keep them in sync if the
// pricing formulas change.
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";
import { corsHeaders } from "../_shared/cors.ts";
import { cancelDirectOrder, settleDirectOrder } from "../_shared/direct-checkout.ts";

type Cents = number;

function assertIsCents(value: number, label = "value"): void {
  if (!Number.isInteger(value)) throw new Error(`${label} must be an integer number of cents, got ${value}`);
}

function calculateSubtotalCents(lines: { unitPriceCents: Cents; quantity: number }[]): Cents {
  return lines.reduce((sum, line) => {
    assertIsCents(line.unitPriceCents, "unitPriceCents");
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
      throw new Error(`quantity must be a positive integer, got ${line.quantity}`);
    }
    return sum + line.unitPriceCents * line.quantity;
  }, 0);
}

function percentOfCents(amountCents: Cents, pct: number): Cents {
  assertIsCents(amountCents, "amountCents");
  if (pct < 0 || pct > 100) throw new Error(`pct must be between 0 and 100, got ${pct}`);
  return Math.round(amountCents * (pct / 100));
}

function calculatePlatformFeeCents(subtotalCents: Cents, platformFeePct: number): Cents {
  return percentOfCents(subtotalCents, platformFeePct);
}

function calculateDeliveryFeeCents(
  region: { baseDeliveryFeeCents: Cents; perMileFeeCents: Cents; freeDeliveryMiles: number },
  oneWayMiles: number
): Cents {
  if (oneWayMiles < 0) throw new Error(`oneWayMiles must be >= 0, got ${oneWayMiles}`);
  if (region.freeDeliveryMiles < 0) throw new Error(`region.freeDeliveryMiles must be >= 0, got ${region.freeDeliveryMiles}`);
  const billableMiles = Math.max(0, oneWayMiles - region.freeDeliveryMiles);
  return region.baseDeliveryFeeCents + Math.round(billableMiles * region.perMileFeeCents);
}

const METERS_PER_MILE = 1609.344;
function metersToMiles(oneWayDistanceMeters: number): number {
  if (oneWayDistanceMeters < 0) throw new Error(`oneWayDistanceMeters must be >= 0, got ${oneWayDistanceMeters}`);
  return oneWayDistanceMeters / METERS_PER_MILE;
}

const WEEKDAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

function chicagoParts(date: Date) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  const weekday = (parts.weekday as string).toLowerCase() as (typeof WEEKDAY_KEYS)[number];
  return { weekday, hour: Number(parts.hour), minute: Number(parts.minute) };
}

interface DeliveryAddress {
  line1: string;
  city: string;
  state: string;
  zip: string;
  lat: number;
  lng: number;
  instructions?: string;
}

interface VendorFulfillment {
  type: "pickup" | "delivery";
  pickupAt?: string;
  deliveryAddress?: DeliveryAddress;
}


// Stripe's minimum card charge in USD.
const STRIPE_MIN_CHARGE_CENTS = 50;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

    const { cartId, vendorId, fulfillment } = (await req.json()) as {
      cartId?: string;
      vendorId?: string;
      fulfillment?: VendorFulfillment;
      checkoutVersion?: number;
    };
    if (!vendorId) {
      // App builds before Direct charges send { cartId, fulfillments } for the
      // whole cart. Checkout is per kitchen now.
      return json({ error: "Please update the Cotto app to check out.", code: "update_required" }, 426);
    }
    if (!cartId || !fulfillment) return json({ error: "cartId, vendorId and fulfillment are required" }, 400);

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const mapboxToken = Deno.env.get("MAPBOX_TOKEN");
    if (!stripeKey) return json({ error: "Stripe isn't configured yet -- set STRIPE_SECRET_KEY." }, 503);
    if (!mapboxToken) return json({ error: "Mapbox isn't configured yet -- set MAPBOX_TOKEN." }, 503);
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Scoped to the caller's JWT so RLS (own cart) enforces they can only check out their own cart.
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return json({ error: "Not signed in" }, 401);

    const { data: callerProfile } = await service
      .from("profiles")
      .select("status, stripe_customer_id, full_name")
      .eq("id", user.id)
      .maybeSingle();
    if (callerProfile?.status === "suspended") {
      return json({ error: "Your account has been suspended. Contact support if you believe this is a mistake." }, 403);
    }
    if (callerProfile?.status === "deleted") {
      return json({ error: "This account has been deleted." }, 403);
    }

    const { data: cart, error: cartError } = await supabase
      .from("carts")
      .select("id, profile_id, status")
      .eq("id", cartId)
      .maybeSingle();
    if (cartError || !cart) return json({ error: "Cart not found or not yours" }, 404);
    if (cart.profile_id !== user.id) return json({ error: "Cart not found or not yours" }, 404);
    if (cart.status !== "open") return json({ error: "This cart has already been checked out." }, 400);

    // Idempotency: a cart can have at most one in-flight (pending_payment)
    // order at a time (partial unique index, migration 0027). A double-tap,
    // a retry, or starting another kitchen's checkout cancels the stale one
    // before creating a fresh order. Reusing it blindly would risk charging
    // an amount that no longer matches the cart.
    const { data: stalePendingOrder } = await service
      .from("orders")
      .select("id, payment_intent_id, vendor_suborders(charge_model)")
      .eq("cart_id", cartId)
      .eq("status", "pending_payment")
      .maybeSingle();
    if (stalePendingOrder) {
      const staleSuborders = (stalePendingOrder.vendor_suborders ?? []) as { charge_model: string }[];
      if (staleSuborders.some((s) => s.charge_model === "direct")) {
        try {
          await cancelDirectOrder(service, stripe, stalePendingOrder.id, "superseded by a new checkout");
        } catch {
          // Its food charge already succeeded: settle it rather than cancel.
          const settled = await settleDirectOrder(service, stripe, stalePendingOrder.id, { allowCharge: false });
          if (settled.status === "paid") {
            return json({ error: "Your previous order just went through. Check your orders before paying again." }, 409);
          }
          return json({ error: "A checkout is already in progress for this cart. Please try again in a moment." }, 409);
        }
      } else {
        if (stalePendingOrder.payment_intent_id) {
          try {
            await stripe.paymentIntents.cancel(stalePendingOrder.payment_intent_id);
          } catch {
            // Already canceled/succeeded/failed on Stripe's side -- it's being superseded regardless.
          }
        }
        await service.from("orders").update({ status: "cancelled" }).eq("id", stalePendingOrder.id);
        await service.from("vendor_suborders").update({ status: "cancelled" }).eq("order_id", stalePendingOrder.id);
      }
    }

    // Price and vendor are never taken from cart_items -- a client can submit
    // arbitrary values for both via a direct API call (migration 0022 also
    // closes this at the DB layer). menu_items is the only source of truth.
    const { data: rawCartItems, error: itemsError } = await supabase
      .from("cart_items")
      .select("id, menu_item_id, quantity, menu_items(name, price_cents, vendor_id, is_available, is_sold_out, deleted_at)")
      .eq("cart_id", cartId);
    if (itemsError) throw itemsError;

    const kitchenItems = (rawCartItems ?? []).filter(
      (item) => (item.menu_items as unknown as { vendor_id: string } | null)?.vendor_id === vendorId
    );
    if (kitchenItems.length === 0) return json({ error: "There's nothing from this kitchen in your cart." }, 400);

    for (const item of kitchenItems) {
      const mi = item.menu_items as unknown as { is_available: boolean; is_sold_out: boolean; deleted_at: string | null } | null;
      if (!mi || mi.deleted_at || !mi.is_available || mi.is_sold_out) {
        return json({ error: "One of the items in your cart is no longer available. Please remove it and try again." }, 409);
      }
    }

    const items = kitchenItems.map((item) => {
      const mi = item.menu_items as unknown as { name: string; price_cents: number };
      return { menu_item_id: item.menu_item_id, quantity: item.quantity, unit_price_cents: mi.price_cents, name: mi.name };
    });

    const { data: region, error: regionError } = await service
      .from("regions")
      .select("*")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    if (regionError || !region) throw regionError ?? new Error("No active region configured");

    const { data: settings, error: settingsError } = await service
      .from("system_settings")
      .select("default_platform_fee_pct")
      .eq("id", 1)
      .single();
    if (settingsError || !settings) throw settingsError ?? new Error("system_settings not found");

    // The cook's Stripe account is always read server-side, never from the
    // client, and snapshotted onto the suborder for every later call.
    const { data: vendor, error: vendorError } = await service
      .from("vendors")
      .select(
        "id, storefront_name, status, platform_fee_pct, stripe_account_id, stripe_account_model, stripe_charges_enabled, stripe_tax_ready_at, address_line1, city, state, zip, lat, lng, hours"
      )
      .eq("id", vendorId)
      .maybeSingle();
    if (vendorError) throw vendorError;
    if (!vendor || vendor.status !== "active") {
      return json({ error: `${vendor?.storefront_name ?? "This kitchen"} is no longer available.` }, 409);
    }

    const notReady = { error: `${vendor.storefront_name} isn't set up to take payments yet. Please try again later.`, code: "kitchen_not_ready" };
    if (!vendor.stripe_account_id || vendor.stripe_account_model !== "full" || !vendor.stripe_tax_ready_at) {
      return json(notReady, 409);
    }
    const stripeAccount = vendor.stripe_account_id;
    // Re-read from Stripe: it can hold card payments at any time.
    const account = await stripe.accounts.retrieve(stripeAccount);
    if (account.charges_enabled !== vendor.stripe_charges_enabled) {
      await service.from("vendors").update({ stripe_charges_enabled: account.charges_enabled }).eq("id", vendor.id);
    }
    if (!account.charges_enabled) return json(notReady, 409);

    const subtotalCents = calculateSubtotalCents(
      items.map((i) => ({ unitPriceCents: i.unit_price_cents, quantity: i.quantity }))
    );
    const effectivePlatformFeePct = vendor.platform_fee_pct ?? settings.default_platform_fee_pct;
    const platformFeeCents = calculatePlatformFeeCents(subtotalCents, effectivePlatformFeePct);

    let deliveryFeeCents = 0;
    let deliveryMiles: number | null = null;
    let pickupAt: string | null = null;
    let deliveryAddress: DeliveryAddress | null = null;
    let taxAddress: { line1: string; city: string; state: string; zip: string };

    if (fulfillment.type === "pickup") {
      if (!fulfillment.pickupAt) return json({ error: `Pickup time is required for ${vendor.storefront_name}` }, 400);
      const requested = new Date(fulfillment.pickupAt);
      if (Number.isNaN(requested.getTime())) return json({ error: "Invalid pickup time" }, 400);
      const { weekday, hour, minute } = chicagoParts(requested);
      if (minute % 15 !== 0) return json({ error: "Pickup time must be on a 15-minute slot" }, 400);
      const dayHours = (vendor.hours as Record<string, { closed: boolean; open: string; close: string }>)[weekday];
      if (!dayHours || dayHours.closed) {
        return json({ error: `${vendor.storefront_name} is closed that day` }, 400);
      }
      const [openH, openM] = dayHours.open.split(":").map(Number);
      const [closeH, closeM] = dayHours.close.split(":").map(Number);
      const requestedMinutes = hour * 60 + minute;
      if (requestedMinutes < openH * 60 + openM || requestedMinutes > closeH * 60 + closeM) {
        return json({ error: `That pickup time is outside ${vendor.storefront_name}'s hours` }, 400);
      }
      pickupAt = requested.toISOString();
      taxAddress = { line1: vendor.address_line1 ?? "", city: vendor.city ?? "", state: vendor.state ?? "", zip: vendor.zip ?? "" };
    } else if (fulfillment.type === "delivery") {
      const addr = fulfillment.deliveryAddress;
      if (!addr || !addr.line1 || !addr.city || !addr.state || !addr.zip || addr.lat == null || addr.lng == null) {
        return json({ error: `Delivery address is required for ${vendor.storefront_name}` }, 400);
      }
      deliveryAddress = addr;
      taxAddress = { line1: addr.line1, city: addr.city, state: addr.state, zip: addr.zip };

      const directionsUrl =
        `https://api.mapbox.com/directions/v5/mapbox/driving/` +
        `${vendor.lng},${vendor.lat};${addr.lng},${addr.lat}` +
        `?access_token=${mapboxToken}&overview=false`;
      const directionsRes = await fetch(directionsUrl);
      if (!directionsRes.ok) throw new Error(`Mapbox Directions error (${directionsRes.status})`);
      const directions = await directionsRes.json();
      const distanceMeters = directions.routes?.[0]?.distance;
      if (typeof distanceMeters !== "number") throw new Error("Mapbox Directions returned no route");
      const oneWayMiles = metersToMiles(distanceMeters);
      deliveryMiles = oneWayMiles;
      deliveryFeeCents = calculateDeliveryFeeCents(
        {
          baseDeliveryFeeCents: region.base_delivery_fee_cents,
          perMileFeeCents: region.per_mile_fee_cents,
          freeDeliveryMiles: region.free_delivery_miles,
        },
        oneWayMiles
      );
      if (deliveryFeeCents < STRIPE_MIN_CHARGE_CENTS) {
        // The delivery charge is what saves the customer's card, so it can't
        // be skipped. Only possible if a region's base fee is set below 50c.
        throw new Error(`Delivery fee ${deliveryFeeCents}c is below Stripe's minimum charge; check the region's base delivery fee.`);
      }
    } else {
      return json({ error: "Choose pickup or delivery" }, 400);
    }

    // Stripe Tax on food only, on the cook's own account (they're merchant
    // of record under Direct charges) -- delivery is Cotto's separate,
    // untaxed charge (§3, §39).
    const taxCalc = await stripe.tax.calculations.create(
      {
        currency: "usd",
        line_items: [{ amount: subtotalCents, reference: vendorId, tax_code: "txcd_40060003" }],
        customer_details: {
          address: {
            line1: taxAddress.line1,
            city: taxAddress.city,
            state: taxAddress.state,
            postal_code: taxAddress.zip,
            country: "US",
          },
          address_source: fulfillment.type === "delivery" ? "shipping" : "billing",
        },
      },
      { stripeAccount }
    );
    const taxCents = taxCalc.tax_amount_exclusive;
    const foodAmountCents = subtotalCents + taxCents;
    if (foodAmountCents < STRIPE_MIN_CHARGE_CENTS) {
      return json({ error: `The minimum order from ${vendor.storefront_name} is $0.50.` }, 400);
    }
    const totalCents = foodAmountCents + deliveryFeeCents;

    const { data: order, error: orderError } = await service
      .from("orders")
      .insert({
        customer_profile_id: user.id,
        region_id: region.id,
        subtotal_cents: subtotalCents,
        delivery_fee_cents: deliveryFeeCents,
        tax_cents: taxCents,
        platform_fee_cents: platformFeeCents,
        total_cents: totalCents,
        cart_id: cartId,
        status: "pending_payment",
      })
      .select()
      .single();
    if (orderError) {
      // 23505 = orders_cart_id_pending_unique (0027): a true concurrent
      // duplicate that slipped past the stale-order cancellation above.
      if (orderError.code === "23505") {
        return json({ error: "A checkout is already in progress for this cart. Please try again in a moment." }, 409);
      }
      throw orderError;
    }
    if (!order) throw new Error("Failed to create order");

    const { data: suborder, error: suborderError } = await service
      .from("vendor_suborders")
      .insert({
        order_id: order.id,
        vendor_id: vendorId,
        fulfillment: fulfillment.type,
        pickup_at: pickupAt,
        delivery_address: deliveryAddress,
        delivery_lat: deliveryAddress?.lat ?? null,
        delivery_lng: deliveryAddress?.lng ?? null,
        delivery_instructions: deliveryAddress?.instructions ?? null,
        subtotal_cents: subtotalCents,
        delivery_fee_cents: deliveryFeeCents,
        platform_fee_cents: platformFeeCents,
        vendor_payout_cents: subtotalCents - platformFeeCents,
        tax_cents: taxCents,
        // Turned into a Stripe Tax transaction on the cook's account once paid.
        stripe_tax_calculation_id: taxCalc.id ?? null,
        charge_model: "direct",
        stripe_account_id: stripeAccount,
        status: "received",
      })
      .select()
      .single();
    if (suborderError || !suborder) throw suborderError ?? new Error("Failed to create suborder");

    const { error: orderItemsError } = await service.from("order_items").insert(
      items.map((i) => ({
        vendor_suborder_id: suborder.id,
        menu_item_id: i.menu_item_id,
        name_snapshot: i.name,
        unit_price_cents: i.unit_price_cents,
        quantity: i.quantity,
      }))
    );
    if (orderItemsError) throw orderItemsError;

    const metadata = { order_id: order.id, vendor_suborder_id: suborder.id, charge_model: "direct" };

    const breakdown = {
      vendors: [
        {
          vendorId,
          vendorName: vendor.storefront_name,
          fulfillment: fulfillment.type,
          subtotalCents,
          deliveryFeeCents,
          // One-way kitchen-to-customer driving distance, rounded to 0.1 mi for display.
          deliveryMiles: deliveryMiles === null ? null : Math.round(deliveryMiles * 10) / 10,
          taxCents,
        },
      ],
      subtotalCents,
      deliveryFeeCents,
      taxCents,
      totalCents,
    };

    if (fulfillment.type === "pickup") {
      const foodPi = await stripe.paymentIntents.create(
        {
          amount: foodAmountCents,
          currency: "usd",
          application_fee_amount: platformFeeCents,
          automatic_payment_methods: { enabled: true },
          metadata: { ...metadata, kind: "food" },
          description: `Cotto order ${order.id}`,
        },
        { stripeAccount }
      );
      await service.from("vendor_suborders").update({ stripe_payment_intent_id: foodPi.id }).eq("id", suborder.id);
      return json({
        mode: "pickup",
        clientSecret: foodPi.client_secret,
        stripeAccountId: stripeAccount,
        orderId: order.id,
        vendorName: vendor.storefront_name,
        breakdown,
      });
    }

    // Delivery: platform Customer holds the saved card that gets cloned to the
    // cook's account for the food charge.
    let customerId = callerProfile?.stripe_customer_id ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create(
        { email: user.email ?? undefined, name: callerProfile?.full_name ?? undefined, metadata: { profile_id: user.id } },
        { idempotencyKey: `customer-${user.id}` }
      );
      const { data: claimed } = await service
        .from("profiles")
        .update({ stripe_customer_id: customer.id })
        .eq("id", user.id)
        .is("stripe_customer_id", null)
        .select("stripe_customer_id");
      if (claimed && claimed.length > 0) {
        customerId = customer.id;
      } else {
        // A concurrent checkout set it first; use theirs.
        const { data: again } = await service.from("profiles").select("stripe_customer_id").eq("id", user.id).single();
        customerId = again?.stripe_customer_id ?? customer.id;
      }
    }

    const deliveryPi = await stripe.paymentIntents.create({
      amount: deliveryFeeCents,
      currency: "usd",
      customer: customerId,
      capture_method: "manual",
      setup_future_usage: "on_session",
      // Cards only: the saved method is cloned to the cook's account.
      payment_method_types: ["card"],
      metadata: { ...metadata, kind: "delivery" },
      description: `Cotto delivery, order ${order.id}`,
    });
    await service.from("vendor_suborders").update({ delivery_payment_intent_id: deliveryPi.id }).eq("id", suborder.id);

    return json({
      mode: "delivery",
      clientSecret: deliveryPi.client_secret,
      orderId: order.id,
      vendorName: vendor.storefront_name,
      breakdown,
    });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
