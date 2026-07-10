import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

/** Confirms the current session belongs to an ops_admin/ops_owner. Returns
 * the user + a service-role client (bypasses RLS) for the privileged write
 * that follows, or null if the caller isn't an admin. */
export async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const service = createServiceRoleClient();
  const { data: profile } = await service.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || (profile.role !== "ops_admin" && profile.role !== "ops_owner")) return null;

  return { user, service };
}
