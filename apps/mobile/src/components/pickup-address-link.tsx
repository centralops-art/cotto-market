import { useQuery } from "@tanstack/react-query";
import { Linking, Pressable, Text } from "react-native";
import { supabase } from "../lib/supabase";
import { formatPickupAddress, mapsUrlForAddress } from "../lib/pickup-address";

// Kitchen pickup address for one suborder, tappable to open maps. Read
// through suborder_pickup_location() (0067), which returns it only to the
// customer on a paid order, the claimed driver, the cook or an admin; the
// street address isn't readable from vendors directly (§44).
export function PickupAddressLink({ suborderId, className }: { suborderId: string; className?: string }) {
  const locationQuery = useQuery({
    queryKey: ["suborder_pickup_location", suborderId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("suborder_pickup_location", { so_id: suborderId }).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const address = formatPickupAddress(locationQuery.data);
  if (!address) return null;

  return (
    <Pressable onPress={() => void Linking.openURL(mapsUrlForAddress(address))}>
      <Text className={className ?? "text-white/60"}>
        Pickup address: <Text className="text-cotto-accent underline">{address}</Text>
      </Text>
    </Pressable>
  );
}
