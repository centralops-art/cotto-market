"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();
  const supabase = createClient();

  return (
    <Button
      variant="outline"
      onClick={async () => {
        await supabase.auth.signOut();
        router.replace("/login");
      }}
    >
      Sign out
    </Button>
  );
}
