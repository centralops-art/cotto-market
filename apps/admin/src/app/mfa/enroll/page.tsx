"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

/** First-time TOTP enrollment, mandatory before reaching /dashboard once a
 * profile has no verified MFA factor -- see dashboard/layout.tsx. */
export default function MfaEnrollPage() {
  const router = useRouter();
  const supabase = createClient();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
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

      const { data, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: "totp" });
      if (enrollError) {
        setError(enrollError.message);
        return;
      }
      setFactorId(data.id);
      setQrCode(data.totp.qr_code);
      setSecret(data.totp.secret);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setSubmitting(true);
    setError(null);
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    setSubmitting(false);
    if (verifyError) {
      setError(verifyError.message);
      return;
    }
    router.replace("/dashboard");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-8">
      <h1 className="text-2xl font-bold">Set up two-factor authentication</h1>
      <p className="max-w-sm text-center text-sm text-muted-foreground">
        Cotto Admin requires an authenticator app (e.g. Google Authenticator, 1Password, Authy). Scan the QR code
        below, then enter the 6-digit code it shows.
      </p>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {qrCode && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qrCode} alt="Scan this QR code with your authenticator app" className="h-48 w-48 rounded-lg border border-border" />
      )}
      {secret && (
        <p className="text-xs text-muted-foreground">
          Can&apos;t scan? Enter this code manually: <span className="font-mono">{secret}</span>
        </p>
      )}

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
        <Button type="submit" disabled={submitting || !factorId || code.length !== 6}>
          {submitting ? "Verifying..." : "Verify and continue"}
        </Button>
      </form>
    </main>
  );
}
