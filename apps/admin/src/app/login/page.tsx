"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { magicLinkRequestSchema, type MagicLinkRequestInput } from "@cotto/shared";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
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
    if (result.error) setFormError(result.error);
    else setSent(true);
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-8">
      <h1 className="text-2xl font-bold">Cotto Admin</h1>

      {sent ? (
        <p className="text-muted-foreground">Check your email for a sign-in link.</p>
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
