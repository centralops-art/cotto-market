// Best-effort Mapbox ETA computation (Phase 8), called by the mobile client
// right after a successful claim_delivery() RPC call (fire-and-forget --
// keeps the claim's critical race-safe path free of an external HTTP call).
// Mirrors checkout-create-payment-intent's Mapbox Directions call shape
// exactly, reading duration (seconds) instead of distance (meters).
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

    const { suborderId } = (await req.json()) as { suborderId?: string };
    if (!suborderId) return json({ error: "suborderId is required" }, 400);

    const mapboxToken = Deno.env.get("MAPBOX_TOKEN");
    if (!mapboxToken) return json({ error: "Mapbox isn't configured yet -- set MAPBOX_TOKEN." }, 503);

    // Ownership check via the caller's own JWT -- this select only succeeds
    // if is_active_driver_for_suborder (or another vendor_suborders_select
    // clause) permits it, same pattern as update-delivery-status.
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: so } = await supabase
      .from("vendor_suborders")
      .select("id, delivery_lat, delivery_lng, vendors(lat, lng)")
      .eq("id", suborderId)
      .maybeSingle();
    if (!so) return json({ error: "Order not found or you don't have an active claim on it" }, 404);

    const vendor = so.vendors as unknown as { lat: number | null; lng: number | null } | null;
    if (vendor?.lat == null || vendor?.lng == null || so.delivery_lat == null || so.delivery_lng == null) {
      return json({ error: "Missing pickup or delivery coordinates" }, 400);
    }

    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const directionsUrl =
      `https://api.mapbox.com/directions/v5/mapbox/driving/` +
      `${vendor.lng},${vendor.lat};${so.delivery_lng},${so.delivery_lat}` +
      `?access_token=${mapboxToken}&overview=false`;
    const res = await fetch(directionsUrl);
    if (!res.ok) throw new Error(`Mapbox Directions error (${res.status})`);
    const directions = await res.json();
    const durationSeconds = directions.routes?.[0]?.duration;
    if (typeof durationSeconds !== "number") throw new Error("Mapbox Directions returned no route");

    const etaMinutes = Math.round(durationSeconds / 60);
    // Service-role write: no client-facing UPDATE grant for drivers on
    // vendor_suborders (same gap as update-delivery-status).
    await service.from("vendor_suborders").update({ mapbox_eta_minutes: etaMinutes }).eq("id", suborderId);

    return json({ ok: true, etaMinutes });
  } catch (err) {
    try {
      const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      await service.from("audit_log").insert({ action: "delivery_eta_fetch_failed", reason: (err as Error).message });
    } catch {
      // Swallow -- this is already the error path, and the caller treats
      // this whole function as best-effort (.catch(() => {})).
    }
    return json({ error: (err as Error).message }, 500);
  }
});
