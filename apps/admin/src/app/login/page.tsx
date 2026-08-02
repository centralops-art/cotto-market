"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { magicLinkRequestSchema, type MagicLinkRequestInput } from "@cotto/shared";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";

const CALLBACK_ERROR_MESSAGES: Record<string, string> = {
  missing_code: "That link is missing its sign-in code. Request a new one below.",
  exchange_failed:
    "That link only works in the same browser it was requested from. Enter the 6-digit code from the email instead.",
  no_user: "Couldn't find your account. Request a new link or code below.",
  not_authorized: "This email is not authorized for Cotto Admin.",
};

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackError = searchParams.get("error");

  const [sent, setSent] = useState(false);
  const [sentEmail, setSentEmail] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<MagicLinkRequestInput>({
    resolver: zodResolver(magicLinkRequestSchema),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: MagicLinkRequestInput) {
    setFormError(null);
    const response = await fetch("/api/admin/request-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const result = await response.json();
    if (result.error) {
      setFormError(result.error);
    } else {
      setSentEmail(values.email);
      setSent(true);
    }
  }

  async function onVerifyCode() {
    setCodeError(null);
    setVerifying(true);
    try {
      const response = await fetch("/api/admin/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: sentEmail, token: code }),
      });
      const result = await response.json();
      if (result.error) {
        setCodeError(CALLBACK_ERROR_MESSAGES[result.error] ?? result.error);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } finally {
      setVerifying(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-8">
      <h1 className="text-2xl font-bold">Cotto Admin</h1>

      {callbackError && !sent && (
        <p className="max-w-sm text-center text-sm text-destructive">
          {CALLBACK_ERROR_MESSAGES[callbackError] ?? "Something went wrong signing you in. Try again."}
        </p>
      )}

      {sent ? (
        <div className="flex w-full max-w-sm flex-col gap-4">
          <p className="text-muted-foreground">
            We sent a sign-in link and a 6-digit code to {sentEmail}. Click the link (same browser/device only), or
            enter the code below -- the code works from any device.
          </p>
          <div className="flex flex-col gap-2">
            <input
              type="text"
              inputMode="numeric"
              placeholder="6-digit code"
              maxLength={6}
              className="rounded-md border border-input bg-transparent px-3 py-2 text-sm tracking-widest"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
            {codeError && <p className="text-sm text-destructive">{codeError}</p>}
            <Button type="button" disabled={code.length !== 6 || verifying} onClick={onVerifyCode}>
              {verifying ? "Verifying..." : "Verify code"}
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="flex w-full max-w-sm flex-col gap-3">
          <input
            type="email"
            placeholder="you@cottomarket.com"
            className="rounded-md border border-input bg-transparent px-3 py-2 text-sm"
            {...register("email")}
          />
          {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
          {formError && <p className="text-sm text-destructive">{formError}</p>}
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Sending..." : "Send magic link"}
          </Button>
        </form>
      )}
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginPageInner />
    </Suspense>
  );
}

