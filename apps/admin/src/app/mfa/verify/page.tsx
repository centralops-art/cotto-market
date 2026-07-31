"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

/** Step-up challenge for a returning admin who already has a verified TOTP
 * factor -- a fresh magic-link sign-in only ever grants AAL1, so this runs
 * every session. See dashboard/layout.tsx for the routing logic that sends
 * users here vs. /mfa/enroll. */
export default function MfaVerifyPage() {
  const router = useRouter();
  const supabase = createClient();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }

      const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors();
      if (factorsError) {
        setError(factorsError.message);
        return;
      }
      const verified = factorsData.totp.find((f) => f.status === "verified");
      if (!verified) {
        router.replace("/mfa/enroll");
        return;
      }
      setFactorId(verified.id);

      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: verified.id });
      if (challengeError) {
        setError(challengeError.message);
        return;
      }
      setChallengeId(challengeData.id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId || !challengeId) return;
    setSubmitting(true);
    setError(null);
    const { error: verifyError } = await supabase.auth.mfa.verify({ factorId, challengeId, code });
    setSubmitting(false);
    if (verifyError) {
      setError(verifyError.message);
      return;
    }
    router.replace("/dashboard");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-8">
      <h1 className="text-2xl font-bold">Enter your authenticator code</h1>
      <p className="max-w-sm text-center text-sm text-muted-foreground">
        Open your authenticator app and enter the current 6-digit code for Cotto Admin.
      </p>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <form onSubmit={onSubmit} className="flex w-full max-w-sm flex-col gap-3">
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="6-digit code"
          maxLength={6}
          className="rounded-md border border-input bg-transparent px-3 py-2 text-center text-lg tracking-widest"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <Button type="submit" disabled={submitting || !challengeId || code.length !== 6}>
          {submitting ? "Verifying..." : "Verify"}
        </Button>
      </form>
    </main>
  );
}
