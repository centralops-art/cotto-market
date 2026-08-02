import { createServiceRoleClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

/** Shared post-authentication gate for both admin sign-in paths (magic-link
 * click via /auth/callback, and the 6-digit code entry on /login). Re-checks
 * the allow-list even though requestMagicLink already gated sending the
 * email/code, and elevates role to ops_admin via the service role (bypasses
 * the profiles.role self-escalation guard trigger, which only allows
 * service_role / existing ops_admin to change role). Caller is responsible
 * for signing the session out if this returns an error. */
export async function gateAdminUser(user: User): Promise<{ error: string | null }> {
  if (!user.email) return { error: "no_user" };

  const service = createServiceRoleClient();
  const { data: settings } = await service.from("system_settings").select("admin_allow_list").eq("id", 1).single();
  const allowList = (settings?.admin_allow_list ?? []).map((e) => e.toLowerCase());

  if (!allowList.includes(user.email.toLowerCase())) {
    return { error: "not_authorized" };
  }

  const { data: profile } = await service.from("profiles").select("role").eq("id", user.id).single();
  if (profile && profile.role !== "ops_admin" && profile.role !== "ops_owner") {
    await service.from("profiles").update({ role: "ops_admin" }).eq("id", user.id);
  }

  return { error: null };
}
