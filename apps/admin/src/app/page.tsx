import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-8">
      <h1 className="text-4xl font-bold tracking-tight">Cotto Admin</h1>
      <p className="text-muted-foreground">Central Ops console for the North Shore Chicago region.</p>
      <Link href="/login" className={cn(buttonVariants())}>
        Sign in
      </Link>
    </main>
  );
}
