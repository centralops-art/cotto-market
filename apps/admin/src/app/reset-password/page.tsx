"use client";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

// This page deliberately does NOT use @/lib/supabase/client. That client
// stores its session in cookies shared with the whole admin.cottomarket.com
// origin -- the same cookies the Cotto Admin dashboard uses. If the person
// resetting a password is also signed in to the dashboard in the same
// browser (exactly what happens when an admin uses "Send password reset
// email" and then opens the link), the two sessions collide: the dashboard
// tab can wipe the recovery session ("Auth session missing" on submit), and
// this page's sign-out would sign the admin out of the dashboard. An
// in-memory client with no persistence and no cross-tab broadcast keeps the
// recovery session private to this one page load.
function createIsolatedClient() {
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

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

// Supabase redirects here with #error=...&error_code=otp_expired when a
// link was already used or has expired (also common when an email
// scanner opened the link first).
const LINK_USED_MESSAGE =
  "This reset link has already been used or has expired. Request a new one from the Cotto app (Sign in → Forgot password).";

export default function ResetPasswordPage() {
  const supabase = useMemo(createIsolatedClient, []);
  const handledLink = useRef(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Run once per page load (React dev mode runs effects twice, and the
    // hash is cleared below).
    if (handledLink.current) return;
    handledLink.current = true;
    const tokens = parseRecoveryTokens(window.location.hash);
    // Don't leave live tokens sitting in the address bar / history.
    window.history.replaceState(null, "", window.location.pathname);
    if (!tokens) {
      setError(LINK_USED_MESSAGE);
      return;
    }
    supabase.auth.setSession(tokens).then(({ error: sessionError }) => {
      if (sessionError) setError(LINK_USED_MESSAGE);
      else setSessionReady(true);
    });
  }, [supabase]);

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
    // Global on purpose: after a password reset, every existing session for
    // this account (e.g. on a lost or shared phone) should end. With the
    // isolated client this no longer touches the admin dashboard's cookies.
    if (!updateError) await supabase.auth.signOut({ scope: "global" });
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
