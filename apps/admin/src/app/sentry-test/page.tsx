"use client";

export default function SentryTestPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <button
        onClick={() => {
          throw new Error("Sentry wiring test -- safe to ignore, thrown on purpose");
        }}
        className="rounded-full bg-black px-4 py-2 text-white"
      >
        Throw test error
      </button>
    </main>
  );
}
