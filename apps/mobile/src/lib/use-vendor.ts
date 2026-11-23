import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Database } from "@cotto/shared";
import { supabase } from "./supabase";
import { useAuth } from "./auth-context";

type VendorUpdate = Database["public"]["Tables"]["vendors"]["Update"];

export function useVendor() {
  const { session } = useAuth();
  const queryClient = useQueryClient();

  const vendorQuery = useQuery({
    queryKey: ["vendor", session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      // my_vendor() returns the caller's own full row, including the
      // street address that plain vendors reads don't expose (§44).
      const { data, error } = await supabase.rpc("my_vendor").maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  async function patchVendor(patch: VendorUpdate) {
    if (!vendorQuery.data) return;
    const { error } = await supabase.from("vendors").update(patch).eq("id", vendorQuery.data.id);
    if (error) throw error;
    await queryClient.invalidateQueries({ queryKey: ["vendor", session?.user.id] });
  }

  return { ...vendorQuery, patchVendor };
}
