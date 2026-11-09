import { useQuery } from "@tanstack/react-query";
import type { Database } from "@cotto/shared";
import { supabase } from "./supabase";

export type TeamDriver = Database["public"]["Tables"]["vendor_team_drivers"]["Row"];

// Every family/team-member driver record for a storefront, any status
// (migration 0060). Owner + admin only via RLS.
export function useTeamDriverRecords(vendorId: string | undefined) {
  return useQuery({
    queryKey: ["vendor_team_drivers", vendorId],
    enabled: !!vendorId,
    queryFn: async () => {
      const { data, error } = await supabase.from("vendor_team_drivers").select("*").eq("vendor_id", vendorId!);
      if (error) throw error;
      return data;
    },
  });
}

export interface ApprovedTeamDriver {
  teamMemberId: string;
  displayName: string;
}

// Team members who can be picked as "who's delivering" right now: approved
// and license not expired. Mirrors approved_team_driver_name() in 0060, which
// is the real check -- this list only drives the picker.
export function useApprovedTeamDrivers(vendorId: string | undefined) {
  return useQuery({
    queryKey: ["approved_team_drivers", vendorId],
    enabled: !!vendorId,
    queryFn: async (): Promise<ApprovedTeamDriver[]> => {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("vendor_team_drivers")
        .select("team_member_id, vendor_team_members(display_name)")
        .eq("vendor_id", vendorId!)
        .eq("status", "active")
        .gte("drivers_license_expires_on", today);
      if (error) throw error;
      return (data ?? [])
        .map((row) => ({
          teamMemberId: row.team_member_id,
          displayName: (row.vendor_team_members as unknown as { display_name: string } | null)?.display_name ?? "Team member",
        }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName));
    },
  });
}
