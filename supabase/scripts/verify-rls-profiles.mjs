/**
 * Verifies RLS actually blocks cross-profile reads: signs up two throwaway
 * customers against the local Supabase instance and asserts customer A's
 * anon-key session cannot read customer B's `profiles` row (and vice versa),
 * while each can read their own. Run with `pnpm verify:rls`.
 *
 * Requires local Supabase running (`pnpm db:start`). Reads connection info
 * from SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY env vars,
 * falling back to the well-known local dev defaults `supabase start` prints.
 */
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

function assert(condition, message) {
  if (!condition) throw new Error(`FAILED: ${message}`);
  console.log(`  ok: ${message}`);
}

async function signUpTestUser(label) {
  const client = createClient(URL, ANON_KEY);
  const email = `rls-test-${label}-${Date.now()}@example.com`;
  const { data, error } = await client.auth.signUp({ email, password: "test-password-123" });
  if (error) throw error;
  return { client, userId: data.user.id, email };
}

async function main() {
  console.log("Signing up two throwaway customers...");
  const a = await signUpTestUser("a");
  const b = await signUpTestUser("b");
  console.log(`  A = ${a.userId}`);
  console.log(`  B = ${b.userId}`);

  console.log("\nChecking each customer can read their own profile...");
  const { data: ownA } = await a.client.from("profiles").select("id").eq("id", a.userId).maybeSingle();
  assert(ownA?.id === a.userId, "A can read A's own profile");
  const { data: ownB } = await b.client.from("profiles").select("id").eq("id", b.userId).maybeSingle();
  assert(ownB?.id === b.userId, "B can read B's own profile");

  console.log("\nChecking cross-profile reads are blocked by RLS...");
  const { data: aReadsB, error: aReadsBError } = await a.client
    .from("profiles")
    .select("id")
    .eq("id", b.userId)
    .maybeSingle();
  assert(!aReadsBError && aReadsB === null, "A reading B's profile returns no row (not an error -- RLS filters silently)");

  const { data: bReadsA, error: bReadsAError } = await b.client
    .from("profiles")
    .select("id")
    .eq("id", a.userId)
    .maybeSingle();
  assert(!bReadsAError && bReadsA === null, "B reading A's profile returns no row");

  console.log("\nChecking an unbounded select only ever returns the caller's own row...");
  const { data: aAll } = await a.client.from("profiles").select("id");
  assert(Array.isArray(aAll) && aAll.length === 1 && aAll[0].id === a.userId, "A's unfiltered SELECT * returns exactly A's row");

  console.log("\nCleaning up test users...");
  const admin = createClient(URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  await admin.auth.admin.deleteUser(a.userId);
  await admin.auth.admin.deleteUser(b.userId);

  console.log("\nAll RLS profile-isolation checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
