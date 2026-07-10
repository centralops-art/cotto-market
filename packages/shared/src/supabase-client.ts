import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types/database";

export type CottoSupabaseClient = SupabaseClient<Database>;

export function createSupabaseClient(url: string, anonKey: string): CottoSupabaseClient {
  if (!url || !anonKey) {
    throw new Error("createSupabaseClient requires both a url and an anonKey");
  }
  return createClient<Database>(url, anonKey);
}
