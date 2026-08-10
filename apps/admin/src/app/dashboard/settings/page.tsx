import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/require-admin";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const admin = await requireAdmin();
  if (!admin) redirect("/login");

  const { data: settings } = await admin.service
    .from("system_settings")
    .select("default_platform_fee_pct, free_trial_default_days")
    .eq("id", 1)
    .single();

  return (
    <main className="mx-auto max-w-2xl p-8">
      <Link href="/dashboard" className="text-sm text-muted-foreground hover:underline">
        &larr; Back to dashboard
      </Link>
      <h1 className="mb-6 mt-4 text-2xl font-bold">Platform settings</h1>

      <SettingsForm
        defaultPlatformFeePct={settings?.default_platform_fee_pct ?? 8}
        freeTrialDefaultDays={settings?.free_trial_default_days ?? 90}
      />
    </main>
  );
}
