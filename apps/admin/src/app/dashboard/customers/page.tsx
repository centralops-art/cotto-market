import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/require-admin";
import { StatusBadge } from "@/components/ui/badge";

export default async function CustomersPage() {
  const admin = await requireAdmin();
  if (!admin) redirect("/login");

  const { data: profiles } = await admin.service
    .from("profiles")
    .select("id, full_name, role, status, created_at")
    .order("created_at", { ascending: false });

  // No bulk email column on profiles (email lives on auth.users) -- one
  // listUsers call covers the whole page instead of N getUserById calls,
  // same identity source the order-detail page already reads from.
  const { data: usersPage } = await admin.service.auth.admin.listUsers({ perPage: 1000 });
  const emailById = new Map((usersPage?.users ?? []).map((u) => [u.id, u.email]));

  return (
    <main className="mx-auto max-w-4xl p-8">
      <Link href="/dashboard" className="text-sm text-muted-foreground hover:underline">
        &larr; Back to dashboard
      </Link>
      <h1 className="mb-6 mt-4 text-2xl font-bold">Customers</h1>

      <div className="flex flex-col gap-2">
        {profiles?.length ? (
          profiles.map((profile) => (
            <Link
              key={profile.id}
              href={`/dashboard/customers/${profile.id}`}
              className="flex items-center justify-between rounded-lg border border-border p-4 hover:bg-muted"
            >
              <div>
                <p className="font-medium">{profile.full_name || "(no name set)"}</p>
                <p className="text-sm text-muted-foreground">{emailById.get(profile.id) ?? "--"}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{profile.role}</span>
                <StatusBadge status={profile.status} />
              </div>
            </Link>
          ))
        ) : (
          <p className="text-muted-foreground">No customers yet.</p>
        )}
      </div>
    </main>
  );
}
