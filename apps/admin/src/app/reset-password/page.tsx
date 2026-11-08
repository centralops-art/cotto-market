"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

// Public page for the Cotto mobile app's "forgot password" email link --
// nothing to do with Cotto Admin itself (same reasoning as
// app/email-confirmed/page.tsx). Deliberately web-based rather than a
// cotto:// deep link: a bare custom URL scheme has no fallback if the link
// is opened anywhere other than a device with the app already installed
// (checking email on a computer, an email client that won't hand off a
// custom scheme, etc.) -- confirmed broken in practice, same class of
// cross-device problem Phase 6 hit with the admin's own magic link. This
// page works from any device/browser; the mobile app's own
// (auth)/reset-password.tsx screen and its cotto://reset-password route
// still exist for a future proper Universal Links setup, but are not the
// active path right now.
//
// Supabase's recovery redirect appends tokens as a URL fragment
// (#access_token=...&refresh_token=...&type=recovery) -- the mobile client
// uses the implicit flow (no flowType set), not PKCE, so there's no ?code=
// param to exchange. Same parsing as the mobile screen, ported to web.
function parseRecoveryTokens(hash: string) {
  const fragment = hash.startsWith("#") ? hash.slice(1) : hash;
  const params = new URLSearchParams(fragment);
  const access_token = params.get("access_token");
  const refresh_token = params.get("refresh_token");
  if (!access_token || !refresh_token) return null;
  return { access_token, refresh_token };
}

export default function ResetPasswordPage() {
  const supabase = createClient();
  const [sessionReady, setSessionReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  // A handful of accounts (currently just admins) have a verified MFA
  // factor. Supabase's recovery link only ever grants an AAL1 session, and
  // the server refuses to let AAL1 update the password/email on such an
  // account ("AAL2 session is required..."). Step the session up to AAL2
  // with the existing factor before showing the password form.
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaChallengeId, setMfaChallengeId] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [mfaSubmitting, setMfaSubmitting] = useState(false);

  useEffect(() => {
    const tokens = parseRecoveryTokens(window.location.hash);
    if (!tokens) {
      setError("This reset link is invalid or has expired. Request a new one from the Cotto app.");
      return;
    }
    supabase.auth.setSession(tokens).then(async ({ error: sessionError }) => {
      if (sessionError) {
        setError(sessionError.message);
        return;
      }
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal && aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
        const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors();
        const verified = factorsData?.totp.find((f) => f.status === "verified");
        if (factorsError || !verified) {
          setError(factorsError?.message ?? "This account has MFA enabled but no verified factor was found.");
          return;
        }
        const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
          factorId: verified.id,
        });
        if (challengeError) {
          setError(challengeError.message);
          return;
        }
        setMfaFactorId(verified.id);
        setMfaChallengeId(challengeData.id);
      }
      setSessionReady(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onMfaSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!mfaFactorId || !mfaChallengeId) return;
    setMfaSubmitting(true);
    setMfaError(null);
    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId: mfaFactorId,
      challengeId: mfaChallengeId,
      code: mfaCode,
    });
    setMfaSubmitting(false);
    if (verifyError) {
      setMfaError(verifyError.message);
      return;
    }
    setMfaFactorId(null);
    setMfaChallengeId(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    await supabase.auth.signOut();
    setSubmitting(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background p-8 text-center">
        <h1 className="text-2xl font-bold">Password updated</h1>
        <p className="max-w-sm text-muted-foreground">Head back to the Cotto app and sign in with your new password.</p>
      </main>
    );
  }

  if (!sessionReady) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background p-8 text-center">
        <h1 className="text-2xl font-bold">Reset your password</h1>
        {error ? <p className="max-w-sm text-sm text-destructive">{error}</p> : <p className="text-muted-foreground">Opening your reset link...</p>}
      </main>
    );
  }

  if (mfaFactorId && mfaChallengeId) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-8">
        <h1 className="text-2xl font-bold">Enter your authenticator code</h1>
        <p className="max-w-sm text-center text-sm text-muted-foreground">
          This account has an authenticator app set up. Enter the current 6-digit code to continue resetting your password.
        </p>
        <form onSubmit={onMfaSubmit} className="flex w-full max-w-sm flex-col gap-3">
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="6-digit code"
            maxLength={6}
            className="rounded-md border border-input bg-transparent px-3 py-2 text-center text-lg tracking-widest"
            value={mfaCode}
            onChange={(e) => setMfaCode(e.target.value)}
          />
          {mfaError && <p className="text-sm text-destructive">{mfaError}</p>}
          <Button type="submit" disabled={mfaSubmitting || mfaCode.length !== 6}>
            {mfaSubmitting ? "Verifying..." : "Verify"}
          </Button>
        </form>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-8">
      <h1 className="text-2xl font-bold">Set a new password</h1>
      <form onSubmit={onSubmit} className="flex w-full max-w-sm flex-col gap-3">
        <input
          type="password"
          placeholder="New password (min. 8 characters)"
          className="rounded-md border border-input bg-transparent px-3 py-2"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <input
          type="password"
          placeholder="Confirm new password"
          className="rounded-md border border-input bg-transparent px-3 py-2"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={submitting}>
          Update password
        </Button>
      </form>
    </main>
  );
}
