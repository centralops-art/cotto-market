import { zodResolver } from "@hookform/resolvers/zod";
import { storefrontBasicsSchema, type StorefrontBasicsInput } from "@cotto/shared";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { ActivityIndicator, Image, Pressable, Text, TextInput, View } from "react-native";
import { uploadVendorImage } from "../../lib/upload-image";

interface Props {
  vendorId: string;
  headerImageUrl: string | null;
  defaultValues: StorefrontBasicsInput;
  onSaveBasics: (values: StorefrontBasicsInput) => Promise<void>;
  onHeaderImageUploaded: (url: string) => Promise<void>;
}

export function HeaderBasicsSection({
  vendorId,
  headerImageUrl,
  defaultValues,
  onSaveBasics,
  onHeaderImageUploaded,
}: Props) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<StorefrontBasicsInput>({ resolver: zodResolver(storefrontBasicsSchema), defaultValues });

  async function pickHeaderImage() {
    setError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("Photo library permission is required.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (result.canceled || !result.assets[0]) return;
    setUploading(true);
    try {
      const asset = result.assets[0];
      const url = await uploadVendorImage(vendorId, asset.uri, asset.mimeType, "header");
      await onHeaderImageUploaded(url);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function onSubmit(values: StorefrontBasicsInput) {
    setError(null);
    try {
      await onSaveBasics(values);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <View className="gap-3 border-b border-white/10 pb-6">
      <Text className="text-lg font-bold text-white">Header</Text>

      {headerImageUrl && <Image source={{ uri: headerImageUrl }} className="h-36 w-full rounded-lg" resizeMode="cover" />}
      <Pressable
        className="items-center rounded-lg border border-white/20 py-3 disabled:opacity-50"
        disabled={uploading}
        onPress={pickHeaderImage}
      >
        {uploading ? <ActivityIndicator color="#fff" /> : <Text className="text-white">{headerImageUrl ? "Replace header image" : "Upload header image"}</Text>}
      </Pressable>

      <Controller
        control={control}
        name="storefrontName"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextInput
            className="rounded-lg bg-white/10 px-4 py-3 text-white"
            placeholder="Storefront name"
            placeholderTextColor="#9CA3AF"
            onBlur={onBlur}
            onChangeText={onChange}
            value={value}
          />
        )}
      />
      {errors.storefrontName && <Text className="text-red-400">{errors.storefrontName.message}</Text>}

      <Controller
        control={control}
        name="tagline"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextInput
            className="rounded-lg bg-white/10 px-4 py-3 text-white"
            placeholder="Tagline"
            placeholderTextColor="#9CA3AF"
            onBlur={onBlur}
            onChangeText={onChange}
            value={value}
          />
        )}
      />

      {error && <Text className="text-red-400">{error}</Text>}

      <Pressable
        className="items-center rounded-lg bg-cotto-accent py-3 disabled:opacity-50"
        disabled={isSubmitting}
        onPress={handleSubmit(onSubmit)}
      >
        {isSubmitting ? <ActivityIndicator color="#fff" /> : <Text className="font-semibold text-white">Save header & basics</Text>}
      </Pressable>
    </View>
  );
}
