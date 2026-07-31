// Public landing page for the mobile app's signup confirmation email link
// (see signUpWithPassword's emailRedirectTo in packages/shared/src/auth.ts).
// Deliberately generic and not the admin login page -- a customer confirming
// their Cotto account has nothing to do with Cotto Admin, and confirming in
// a browser tab doesn't establish a session in the mobile app anyway (the
// user still needs to go back and sign in there normally).
export default function EmailConfirmedPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background p-8 text-center">
      <h1 className="text-2xl font-bold">You&apos;re confirmed!</h1>
      <p className="max-w-sm text-muted-foreground">
        Your Cotto account is confirmed. Head back to the Cotto app and sign in.
      </p>
    </main>
  );
}
