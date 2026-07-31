import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

/** Confirms the current session belongs to an ops_admin/ops_owner AND has
 * completed MFA (AAL2) -- role alone isn't enough once MFA is required,
 * since a magic-link sign-in only ever grants AAL1. Returns the user + a
 * service-role client (bypasses RLS) for the privileged write that follows,
 * or null if either check fails. Used by every /api/admin/** route, so this
 * is what actually enforces MFA for mutations -- the /mfa/enroll and
 * /mfa/verify redirect flow in dashboard/layout.tsx only covers page loads,
 * not API calls, on its own. */
export async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const service = createServiceRoleClient();
  const { data: profile } = await service.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || (profile.role !== "ops_admin" && profile.role !== "ops_owner")) return null;

  const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aalError || aal?.currentLevel !== "aal2") return null;

  return { user, service };
}
