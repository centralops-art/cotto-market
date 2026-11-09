import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export const SIGNED_OUT_MESSAGE = "You've been signed out. Please sign in again.";

/**
 * Asks the auth server whether this phone's sign-in is still valid. A session
 * can be cancelled server-side while the app still holds it locally (for
 * example, the account signed out "everywhere" from another device) -- the
 * app then looks signed in and shows cached data, but every edge function
 * call fails with a 401. When that's the case, drop the local session so the
 * root layout sends the user back to sign-in.
 *
 * Network failures are NOT treated as a revoked session (status 0 / no
 * status), so a flaky connection never signs anyone out.
 */
export async function signOutIfSessionRevoked(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return false;
  const { error } = await supabase.auth.getUser();
  if (!error) return false;
  const status = (error as { status?: number }).status;
  if (status === 401 || status === 403 || error.name === "AuthSessionMissingError") {
    await supabase.auth.signOut({ scope: "local" });
    return true;
  }
  return false;
}

/**
 * The human-readable reason an edge function call failed. supabase-js's own
 * FunctionsHttpError.message is always the generic "Edge Function returned a
 * non-2xx status code"; every Cotto function sends `{ error: "..." }` in the
 * response body, which is unread by default.
 */
export async function functionErrorMessage(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    const response = error.context as Response | undefined;
    const body = await response?.json().catch(() => null);
    if (response?.status === 401 && (await signOutIfSessionRevoked())) return SIGNED_OUT_MESSAGE;
    if (body && typeof body.error === "string") return body.error;
  }
  if (error instanceof Error && error.message) return error.message;
  return "Something went wrong. Please try again.";
}

/** supabase.functions.invoke, throwing an Error with the function's real message on failure. */
export async function invokeFunction<T = unknown>(name: string, body?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, body ? { body } : {});
  if (error) throw new Error(await functionErrorMessage(error));
  if (data && typeof data === "object" && "error" in data && data.error) throw new Error(String(data.error));
  return data as T;
}
