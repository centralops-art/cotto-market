import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/require-admin";

export default async function RegionsPage() {
  const admin = await requireAdmin();
  if (!admin) redirect("/login");

  const { data: regions } = await admin.service
    .from("regions")
    .select("id, name, is_active, zip_codes")
    .order("name");

  return (
    <main className="mx-auto max-w-2xl p-8">
      <Link href="/dashboard" className="text-sm text-muted-foreground hover:underline">
        &larr; Back to dashboard
      </Link>
      <h1 className="mb-6 mt-4 text-2xl font-bold">Regions</h1>

      <div className="flex flex-col gap-2">
        {regions?.length ? (
          regions.map((region) => (
            <Link
              key={region.id}
              href={`/dashboard/regions/${region.id}`}
              className="flex items-center justify-between rounded-lg border border-border p-4 hover:bg-muted"
            >
              <div>
                <p className="font-medium">{region.name}</p>
                <p className="text-sm text-muted-foreground">{region.zip_codes.length} ZIPs</p>
              </div>
              <span className="text-xs text-muted-foreground">{region.is_active ? "Active" : "Inactive"}</span>
            </Link>
          ))
        ) : (
          <p className="text-muted-foreground">No regions yet.</p>
        )}
      </div>
    </main>
  );
}
