import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { requireAdmin } from "@/lib/require-admin";
import { RegionForm } from "./region-form";

export default async function RegionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) redirect("/login");

  const { id } = await params;
  const { data: region } = await admin.service.from("regions").select("*").eq("id", id).single();
  if (!region) notFound();

  return (
    <main className="mx-auto max-w-2xl p-8">
      <Link href="/dashboard/regions" className="text-sm text-muted-foreground hover:underline">
        &larr; Back to regions
      </Link>
      <h1 className="mb-2 mt-4 text-2xl font-bold">{region.name}</h1>
      <p className="mb-6 text-sm text-muted-foreground">{region.zip_codes.join(", ")}</p>

      <RegionForm region={region} />
    </main>
  );
}
