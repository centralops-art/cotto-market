import { decode } from "base64-arraybuffer";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { licenseSchema } from "@cotto/shared";
import { useState } from "react";
import { ActivityIndicator, Image, Pressable, Text, TextInput, View } from "react-native";
import { supabase } from "../../lib/supabase";

interface Props {
  userId: string;
  defaultFrontUrl: string | null;
  defaultBackUrl: string | null;
  defaultExpiresOn: string | null;
  onNext: (values: { driversLicenseFrontUrl: string; driversLicenseBackUrl: string; driversLicenseExpiresOn: string }) => Promise<void>;
}

type Side = "front" | "back";

export function LicenseStep({ userId, defaultFrontUrl, defaultBackUrl, defaultExpiresOn, onNext }: Props) {
  const [frontPath, setFrontPath] = useState<string | null>(defaultFrontUrl);
  const [backPath, setBackPath] = useState<string | null>(defaultBackUrl);
  const [frontPreviewUri, setFrontPreviewUri] = useState<string | null>(null);
  const [backPreviewUri, setBackPreviewUri] = useState<string | null>(null);
  const [expiresOn, setExpiresOn] = useState(defaultExpiresOn ?? "");
  const [uploadingSide, setUploadingSide] = useState<Side | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function pickAndUpload(side: Side) {
    setFormError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setFormError("Photo library permission is required to upload your driver's license.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    setUploadingSide(side);
    try {
      // Same pattern as cfpm-cert-step.tsx: RN's Blob shim can't handle the
      // ArrayBuffer path fetch(uri).blob() produces, so read as base64 and
      // decode() to a plain ArrayBuffer instead.
      const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: "base64" });
      const arrayBuffer = decode(base64);
      const ext = asset.uri.split(".").pop() ?? "jpg";
      const path = `${userId}/license-${side}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("drivers-licenses")
        .upload(path, arrayBuffer, { contentType: asset.mimeType ?? "image/jpeg", upsert: true });
      if (error) throw error;
      if (side === "front") {
        setFrontPath(path);
        setFrontPreviewUri(asset.uri);
      } else {
        setBackPath(path);
        setBackPreviewUri(asset.uri);
      }
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setUploadingSide(null);
    }
  }

  async function onSubmit() {
    if (!frontPath || !backPath) {
      setFormError("Upload both the front and back of your driver's license.");
      return;
    }
    const parsed = licenseSchema.safeParse({ driversLicenseExpiresOn: expiresOn });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Enter a valid expiration date.");
      return;
    }
    if (new Date(expiresOn) < new Date(new Date().toDateString())) {
      setFormError("Expiration date can't be in the past.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await onNext({ driversLicenseFrontUrl: frontPath, driversLicenseBackUrl: backPath, driversLicenseExpiresOn: expiresOn });
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View className="gap-4">
      <Text className="text-2xl font-bold text-white">Upload your driver's license</Text>
      <Text className="text-white/70">Only visible to Central Ops, used to review your delivery partner application.</Text>

      <View className="gap-2">
        <Text className="text-white/80">Front</Text>
        {frontPreviewUri && <Image source={{ uri: frontPreviewUri }} className="h-40 w-full rounded-lg" resizeMode="contain" />}
        {!frontPreviewUri && frontPath && <Text className="text-white/70">A front photo is already on file.</Text>}
        <Pressable
          className="items-center rounded-lg border border-white/20 py-3 disabled:opacity-50"
          disabled={uploadingSide !== null}
          onPress={() => pickAndUpload("front")}
        >
          {uploadingSide === "front" ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-white">{frontPath ? "Replace photo" : "Choose photo"}</Text>
          )}
        </Pressable>
      </View>

      <View className="gap-2">
        <Text className="text-white/80">Back</Text>
        {backPreviewUri && <Image source={{ uri: backPreviewUri }} className="h-40 w-full rounded-lg" resizeMode="contain" />}
        {!backPreviewUri && backPath && <Text className="text-white/70">A back photo is already on file.</Text>}
        <Pressable
          className="items-center rounded-lg border border-white/20 py-3 disabled:opacity-50"
          disabled={uploadingSide !== null}
          onPress={() => pickAndUpload("back")}
        >
          {uploadingSide === "back" ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-white">{backPath ? "Replace photo" : "Choose photo"}</Text>
          )}
        </Pressable>
      </View>

      <Text className="text-white/80">Expiration date</Text>
      <TextInput
        className="rounded-lg bg-white/10 px-4 py-3 text-white"
        placeholder="YYYY-MM-DD"
        placeholderTextColor="#9CA3AF"
        keyboardType="numbers-and-punctuation"
        maxLength={10}
        value={expiresOn}
        onChangeText={setExpiresOn}
      />

      {formError && <Text className="text-red-400">{formError}</Text>}

      <Pressable
        className="items-center rounded-lg bg-cotto-accent py-3 disabled:opacity-50"
        disabled={submitting}
        onPress={onSubmit}
      >
        {submitting ? <ActivityIndicator color="#fff" /> : <Text className="font-semibold text-white">Next</Text>}
      </Pressable>
    </View>
  );
}
