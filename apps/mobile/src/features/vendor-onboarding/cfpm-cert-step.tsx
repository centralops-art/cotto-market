import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { ActivityIndicator, Image, Pressable, Text, TextInput, View } from "react-native";
import { supabase } from "../../lib/supabase";

interface Props {
  userId: string;
  defaultCertUrl: string | null;
  defaultExpiresOn: string | null;
  onNext: (values: { cfpmCertUrl: string; cfpmCertExpiresOn: string }) => Promise<void>;
  onBack: () => void;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function CfpmCertStep({ userId, defaultCertUrl, defaultExpiresOn, onNext, onBack }: Props) {
  const [certPath, setCertPath] = useState<string | null>(defaultCertUrl);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [expiresOn, setExpiresOn] = useState(defaultExpiresOn ?? "");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function pickAndUpload() {
    setFormError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setFormError("Photo library permission is required to upload your CFPM cert.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    setUploading(true);
    try {
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      const ext = asset.uri.split(".").pop() ?? "jpg";
      const path = `${userId}/cfpm-cert-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("cfpm-certs")
        .upload(path, blob, { contentType: asset.mimeType ?? "image/jpeg", upsert: true });
      if (error) throw error;
      setCertPath(path);
      setPreviewUri(asset.uri);
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function onSubmit() {
    if (!certPath) {
      setFormError("Upload your CFPM certificate first.");
      return;
    }
    if (!DATE_PATTERN.test(expiresOn)) {
      setFormError("Enter the expiration date as YYYY-MM-DD.");
      return;
    }
    if (new Date(expiresOn) < new Date(new Date().toDateString())) {
      setFormError("Expiration date can't be in the past.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await onNext({ cfpmCertUrl: certPath, cfpmCertExpiresOn: expiresOn });
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View className="gap-4">
      <Text className="text-2xl font-bold text-white">Upload your CFPM certificate</Text>
      <Text className="text-white/70">
        Your Certified Food Protection Manager certificate is only ever visible to Central Ops.
      </Text>

      {previewUri && <Image source={{ uri: previewUri }} className="h-48 w-full rounded-lg" resizeMode="contain" />}
      {!previewUri && certPath && <Text className="text-white/70">A certificate is already on file.</Text>}

      <Pressable
        className="items-center rounded-lg border border-white/20 py-3 disabled:opacity-50"
        disabled={uploading}
        onPress={pickAndUpload}
      >
        {uploading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text className="text-white">{certPath ? "Replace photo" : "Choose photo"}</Text>
        )}
      </Pressable>

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

      <View className="flex-row gap-3">
        <Pressable className="flex-1 items-center rounded-lg border border-white/20 py-3" onPress={onBack}>
          <Text className="text-white">Back</Text>
        </Pressable>
        <Pressable
          className="flex-1 items-center rounded-lg bg-cotto-accent py-3 disabled:opacity-50"
          disabled={submitting}
          onPress={onSubmit}
        >
          {submitting ? <ActivityIndicator color="#fff" /> : <Text className="font-semibold text-white">Next</Text>}
        </Pressable>
      </View>
    </View>
  );
}
