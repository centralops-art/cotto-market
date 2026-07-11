// Computes the authoritative checkout total (subtotal, delivery fee via Mapbox
// Directions, platform fee, Stripe Tax) for every vendor in the caller's cart,
// writes `orders` / `vendor_suborders` / `order_items` as `pending_payment`,
// and returns a client secret for a single platform-account PaymentIntent
// (Separate Charges and Transfers -- no application_fee_amount; per-vendor
// Transfers fire from stripe-webhook once payment_intent.succeeded arrives).
//
// Requires STRIPE_SECRET_KEY and MAPBOX_TOKEN secrets.
//
// NOTE: calculateSubtotalCents/calculatePlatformFeeCents/calculateDeliveryFeeCents/
// metersToRoundTripMiles below are mirrored from packages/shared/src/fees.ts.
// Deno's strict module resolution (no extensionless relative imports) makes a
// direct cross-package import from that Node-oriented file brittle, so the
// handful of pure functions are duplicated here -- keep them in sync if the
// pricing formulas change.
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";
import { corsHeaders } from "../_shared/cors.ts";

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
  region: { baseDeliveryFeeCents: Cents; perMileFeeCents: Cents },
  roundTripMiles: number
): Cents {
  if (roundTripMiles < 0) throw new Error(`roundTripMiles must be >= 0, got ${roundTripMiles}`);
  return region.baseDeliveryFeeCents + Math.round(roundTripMiles * region.perMileFeeCents);
}

const METERS_PER_MILE = 1609.344;
function metersToRoundTripMiles(oneWayDistanceMeters: number): number {
  if (oneWayDistanceMeters < 0) throw new Error(`oneWayDistanceMeters must be >= 0, got ${oneWayDistanceMeters}`);
  return (2 * oneWayDistanceMeters) / METERS_PER_MILE;
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

    const { cartId, fulfillments } = (await req.json()) as {
      cartId?: string;
      fulfillments?: Record<string, VendorFulfillment>;
    };
    if (!cartId || !fulfillments) return json({ error: "cartId and fulfillments are required" }, 400);

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

    const { data: cart, error: cartError } = await supabase
      .from("carts")
      .select("id, profile_id, status")
      .eq("id", cartId)
      .maybeSingle();
    if (cartError || !cart) return json({ error: "Cart not found or not yours" }, 404);
    if (cart.profile_id !== user.id) return json({ error: "Cart not found or not yours" }, 404);
    if (cart.status !== "open") return json({ error: "This cart has already been checked out." }, 400);

    const { data: cartItems, error: itemsError } = await supabase
      .from("cart_items")
      .select("id, vendor_id, menu_item_id, quantity, unit_price_cents, menu_items(name, is_available, is_sold_out, deleted_at)")
      .eq("cart_id", cartId);
    if (itemsError) throw itemsError;
    if (!cartItems || cartItems.length === 0) return json({ error: "Cart is empty" }, 400);

    for (const item of cartItems) {
      const mi = item.menu_items as unknown as { is_available: boolean; is_sold_out: boolean; deleted_at: string | null };
      if (!mi || mi.deleted_at || !mi.is_available || mi.is_sold_out) {
        return json({ error: "One of the items in your cart is no longer available. Please remove it and try again." }, 409);
      }
    }

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

    const vendorIds = [...new Set(cartItems.map((i) => i.vendor_id))];
    for (const vendorId of vendorIds) {
      if (!fulfillments[vendorId]) return json({ error: `Missing fulfillment choice for vendor ${vendorId}` }, 400);
    }

    const { data: vendors, error: vendorsError } = await service
      .from("vendors")
      .select("id, storefront_name, status, platform_fee_pct, stripe_account_id, address_line1, city, state, zip, lat, lng, hours")
      .in("id", vendorIds);
    if (vendorsError) throw vendorsError;
    const vendorsById = new Map((vendors ?? []).map((v) => [v.id, v]));

    for (const vendorId of vendorIds) {
      const vendor = vendorsById.get(vendorId);
      if (!vendor || vendor.status !== "active") {
        return json({ error: `${vendor?.storefront_name ?? "A vendor"} in your cart is no longer available.` }, 409);
      }
    }

    let totalSubtotalCents = 0;
    let totalDeliveryFeeCents = 0;
    let totalPlatformFeeCents = 0;
    let totalTaxCents = 0;

    const suborderPlans: {
      vendorId: string;
      fulfillment: "pickup" | "delivery";
      pickupAt: string | null;
      deliveryAddress: DeliveryAddress | null;
      subtotalCents: number;
      deliveryFeeCents: number;
      platformFeeCents: number;
      vendorPayoutCents: number;
      items: { menuItemId: string; name: string; unitPriceCents: number; quantity: number }[];
    }[] = [];

    for (const vendorId of vendorIds) {
      const vendor = vendorsById.get(vendorId)!;
      const items = cartItems.filter((i) => i.vendor_id === vendorId);
      const subtotalCents = calculateSubtotalCents(
        items.map((i) => ({ unitPriceCents: i.unit_price_cents, quantity: i.quantity }))
      );
      const effectivePlatformFeePct = vendor.platform_fee_pct ?? settings.default_platform_fee_pct;
      const platformFeeCents = calculatePlatformFeeCents(subtotalCents, effectivePlatformFeePct);

      const fulfillment = fulfillments[vendorId];
      let deliveryFeeCents = 0;
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
      } else {
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
        const roundTripMiles = metersToRoundTripMiles(distanceMeters);
        deliveryFeeCents = calculateDeliveryFeeCents(
          { baseDeliveryFeeCents: region.base_delivery_fee_cents, perMileFeeCents: region.per_mile_fee_cents },
          roundTripMiles
        );
      }

      // Stripe Tax on food only (amendments) -- delivery fee is not a taxable line item here.
      const taxCalc = await stripe.tax.calculations.create({
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
      });
      const vendorTaxCents = taxCalc.tax_amount_exclusive;

      totalSubtotalCents += subtotalCents;
      totalDeliveryFeeCents += deliveryFeeCents;
      totalPlatformFeeCents += platformFeeCents;
      totalTaxCents += vendorTaxCents;

      suborderPlans.push({
        vendorId,
        fulfillment: fulfillment.type,
        pickupAt,
        deliveryAddress,
        subtotalCents,
        deliveryFeeCents,
        platformFeeCents,
        vendorPayoutCents: subtotalCents - platformFeeCents,
        items: items.map((i) => ({
          menuItemId: i.menu_item_id,
          name: (i.menu_items as unknown as { name: string }).name,
          unitPriceCents: i.unit_price_cents,
          quantity: i.quantity,
        })),
      });
    }

    const totalCents = totalSubtotalCents + totalDeliveryFeeCents + totalTaxCents;

    const { data: order, error: orderError } = await service
      .from("orders")
      .insert({
        customer_profile_id: user.id,
        region_id: region.id,
        subtotal_cents: totalSubtotalCents,
        delivery_fee_cents: totalDeliveryFeeCents,
        tax_cents: totalTaxCents,
        platform_fee_cents: totalPlatformFeeCents,
        total_cents: totalCents,
        cart_id: cartId,
        status: "pending_payment",
      })
      .select()
      .single();
    if (orderError || !order) throw orderError ?? new Error("Failed to create order");

    for (const plan of suborderPlans) {
      const { data: suborder, error: suborderError } = await service
        .from("vendor_suborders")
        .insert({
          order_id: order.id,
          vendor_id: plan.vendorId,
          fulfillment: plan.fulfillment,
          pickup_at: plan.pickupAt,
          delivery_address: plan.deliveryAddress,
          delivery_lat: plan.deliveryAddress?.lat ?? null,
          delivery_lng: plan.deliveryAddress?.lng ?? null,
          delivery_instructions: plan.deliveryAddress?.instructions ?? null,
          subtotal_cents: plan.subtotalCents,
          delivery_fee_cents: plan.deliveryFeeCents,
          platform_fee_cents: plan.platformFeeCents,
          vendor_payout_cents: plan.vendorPayoutCents,
          status: "received",
        })
        .select()
        .single();
      if (suborderError || !suborder) throw suborderError ?? new Error("Failed to create suborder");

      const { error: orderItemsError } = await service.from("order_items").insert(
        plan.items.map((i) => ({
          vendor_suborder_id: suborder.id,
          menu_item_id: i.menuItemId,
          name_snapshot: i.name,
          unit_price_cents: i.unitPriceCents,
          quantity: i.quantity,
        }))
      );
      if (orderItemsError) throw orderItemsError;
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalCents,
      currency: "usd",
      metadata: { order_id: order.id },
      description: `Cotto order ${order.id}`,
    });

    const { error: updateError } = await service
      .from("orders")
      .update({ payment_intent_id: paymentIntent.id })
      .eq("id", order.id);
    if (updateError) throw updateError;

    return json({ clientSecret: paymentIntent.client_secret, orderId: order.id });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
