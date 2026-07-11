import { decode } from "base64-arraybuffer";
import * as FileSystem from "expo-file-system/legacy";
import { supabase } from "./supabase";

/** Uploads to the public vendor-media bucket and returns a public URL (unlike
 * the private cfpm-certs bucket, no signed URL needed). */
export async function uploadVendorImage(
  vendorId: string,
  uri: string,
  mimeType: string | undefined,
  subfolder?: string
): Promise<string> {
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: "base64" });
  const arrayBuffer = decode(base64);
  const ext = uri.split(".").pop() ?? "jpg";
  const path = `${vendorId}/${subfolder ? `${subfolder}/` : ""}${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage
    .from("vendor-media")
    .upload(path, arrayBuffer, { contentType: mimeType ?? "image/jpeg", upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from("vendor-media").getPublicUrl(path);
  return data.publicUrl;
}
