import { redirect } from "next/navigation";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

/** Every /dashboard/** route renders sensitive data (customer PII, vendor
 * financials, CFPM certs) via the service-role client, which bypasses RLS.
 * This is the single enforcement point: without it, "signed in" alone (to
 * any Supabase user in the shared project, not just an admin-allow-listed
 * one) was being treated as sufficient to reach that data.
 *
 * Also enforces MFA (AAL2) -- role/allow-list alone isn't enough once MFA is
 * required, since a magic-link sign-in only ever grants AAL1. This layout
 * does the checks inline (rather than just calling requireAdmin(), which
 * only returns admin-or-null) because it needs to route to the *right*
 * place on failure: /mfa/enroll if no factor exists yet, /mfa/verify if one
 * does but this session hasn't stepped up. requireAdmin() itself still
 * enforces the same AAL2 requirement for every /api/admin/** mutation route --
 * this layout alone would only cover page loads, not API calls. */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const service = createServiceRoleClient();
  const { data: profile } = await service.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || (profile.role !== "ops_admin" && profile.role !== "ops_owner")) redirect("/login");

  const { data: factors } = await supabase.auth.mfa.listFactors();
  const hasVerifiedFactor = (factors?.totp ?? []).some((f) => f.status === "verified");
  if (!hasVerifiedFactor) redirect("/mfa/enroll");

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== "aal2") redirect("/mfa/verify");

  return <>{children}</>;
}
