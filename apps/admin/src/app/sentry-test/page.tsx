"use client";

import * as Sentry from "@sentry/nextjs";
import { useState } from "react";

export default function SentryTestPage() {
  const [sent, setSent] = useState(false);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <button
        onClick={() => {
          Sentry.captureException(new Error("Sentry wiring test -- safe to ignore, sent on purpose"));
          setSent(true);
        }}
        className="rounded-full bg-black px-4 py-2 text-white"
      >
        Send test error
      </button>
      {sent && <p>Sent. Check the cotto-admin Sentry project&apos;s Issues feed.</p>}
    </main>
  );
}
