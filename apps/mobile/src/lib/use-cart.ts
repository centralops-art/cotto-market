import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { useAuth } from "./auth-context";

/** Finds (or lazily creates) the customer's single open cart. */
export function useOpenCart() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ["cart", profile?.id],
    enabled: !!profile,
    queryFn: async () => {
      const { data: existing, error } = await supabase
        .from("carts")
        .select("*")
        .eq("profile_id", profile!.id)
        .eq("status", "open")
        .maybeSingle();
      if (error) throw error;
      if (existing) return existing;

      const { data: created, error: createError } = await supabase
        .from("carts")
        .insert({ profile_id: profile!.id, status: "open" })
        .select()
        .single();
      if (createError) throw createError;
      return created;
    },
  });
}

export function useCartItems(cartId: string | undefined) {
  return useQuery({
    queryKey: ["cart_items", cartId],
    enabled: !!cartId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cart_items")
        .select("*, menu_items(name, image_urls, vendor_id, vendors(storefront_name, address_line1, city, state, zip, lat, lng, hours))")
        .eq("cart_id", cartId!)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });
}

export function useCartItemCount(cartId: string | undefined) {
  return useQuery({
    queryKey: ["cart_item_count", cartId],
    enabled: !!cartId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("cart_items")
        .select("id", { count: "exact", head: true })
        .eq("cart_id", cartId!);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

/** Adds a menu item to the cart, incrementing quantity if it's already there. */
export async function addToCart(
  cartId: string,
  vendorId: string,
  menuItemId: string,
  unitPriceCents: number,
  quantity: number
) {
  const { data: existing, error: findError } = await supabase
    .from("cart_items")
    .select("id, quantity")
    .eq("cart_id", cartId)
    .eq("menu_item_id", menuItemId)
    .maybeSingle();
  if (findError) throw findError;

  if (existing) {
    const { error } = await supabase
      .from("cart_items")
      .update({ quantity: existing.quantity + quantity })
      .eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("cart_items").insert({
      cart_id: cartId,
      vendor_id: vendorId,
      menu_item_id: menuItemId,
      unit_price_cents: unitPriceCents,
      quantity,
    });
    if (error) throw error;
  }
}

export function useInvalidateCart(cartId: string | undefined) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["cart_items", cartId] });
    queryClient.invalidateQueries({ queryKey: ["cart_item_count", cartId] });
  };
}
