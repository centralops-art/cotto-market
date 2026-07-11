import { ALLERGENS, ALLERGEN_LABELS, type Allergen, type Database } from "@cotto/shared";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { uploadVendorImage } from "../../lib/upload-image";

type MenuItem = Database["public"]["Tables"]["menu_items"]["Row"];

const MAX_IMAGES = 5;

export interface ItemFormValues {
  name: string;
  description: string;
  ingredients: string;
  priceDollars: string;
  allergens: Allergen[];
  imageUrls: string[];
}

interface Props {
  vendorId: string;
  existing?: MenuItem;
  onCancel: () => void;
  onSave: (values: ItemFormValues) => Promise<void>;
}

export function ItemForm({ vendorId, existing, onCancel, onSave }: Props) {
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [ingredients, setIngredients] = useState(existing?.ingredients ?? "");
  const [priceDollars, setPriceDollars] = useState(existing ? (existing.price_cents / 100).toFixed(2) : "");
  const [allergens, setAllergens] = useState<Allergen[]>((existing?.allergens as Allergen[]) ?? []);
  const [imageUrls, setImageUrls] = useState<string[]>(existing?.image_urls ?? []);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addImage() {
    if (imageUrls.length >= MAX_IMAGES) return;
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
      const url = await uploadVendorImage(vendorId, asset.uri, asset.mimeType, "menu-items");
      setImageUrls((prev) => [...prev, url]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  function toggleAllergen(allergen: Allergen) {
    setAllergens((prev) => (prev.includes(allergen) ? prev.filter((a) => a !== allergen) : [...prev, allergen]));
  }

  async function onSubmit() {
    setError(null);
    if (!name.trim()) {
      setError("Item name is required.");
      return;
    }
    const priceNumber = Number(priceDollars);
    if (!priceDollars || Number.isNaN(priceNumber) || priceNumber < 0) {
      setError("Enter a valid price.");
      return;
    }
    setSaving(true);
    try {
      await onSave({ name, description, ingredients, priceDollars, allergens, imageUrls });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <View className="gap-3 rounded-lg bg-white/5 p-4">
      <Text className="text-lg font-bold text-white">{existing ? "Edit item" : "New item"}</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row gap-2">
        {imageUrls.map((url) => (
          <View key={url} className="relative">
            <Image source={{ uri: url }} className="h-20 w-20 rounded-lg" />
            <Pressable
              className="absolute -right-1 -top-1 h-5 w-5 items-center justify-center rounded-full bg-red-500"
              onPress={() => setImageUrls((prev) => prev.filter((u) => u !== url))}
            >
              <Text className="text-xs text-white">x</Text>
            </Pressable>
          </View>
        ))}
        {imageUrls.length < MAX_IMAGES && (
          <Pressable
            className="h-20 w-20 items-center justify-center rounded-lg border border-white/20"
            disabled={uploading}
            onPress={addImage}
          >
            {uploading ? <ActivityIndicator color="#fff" /> : <Text className="text-white/60">+ Photo</Text>}
          </Pressable>
        )}
      </ScrollView>

      <TextInput
        className="rounded-md bg-white/10 px-3 py-2 text-white"
        placeholder="Item name"
        placeholderTextColor="#9CA3AF"
        value={name}
        onChangeText={setName}
      />
      <TextInput
        className="rounded-md bg-white/10 px-3 py-2 text-white"
        placeholder="Description"
        placeholderTextColor="#9CA3AF"
        multiline
        value={description}
        onChangeText={setDescription}
      />
      <TextInput
        className="rounded-md bg-white/10 px-3 py-2 text-white"
        placeholder="Ingredients"
        placeholderTextColor="#9CA3AF"
        multiline
        value={ingredients}
        onChangeText={setIngredients}
      />
      <TextInput
        className="rounded-md bg-white/10 px-3 py-2 text-white"
        placeholder="Price (e.g. 12.50)"
        placeholderTextColor="#9CA3AF"
        keyboardType="decimal-pad"
        value={priceDollars}
        onChangeText={setPriceDollars}
      />

      <Text className="text-white/70">Allergens</Text>
      <View className="flex-row flex-wrap gap-2">
        {ALLERGENS.map((allergen) => {
          const selected = allergens.includes(allergen);
          return (
            <Pressable
              key={allergen}
              className={`rounded-full border px-3 py-1 ${selected ? "border-cotto-accent bg-cotto-accent/20" : "border-white/20"}`}
              onPress={() => toggleAllergen(allergen)}
            >
              <Text className={selected ? "text-cotto-accent" : "text-white/70"}>{ALLERGEN_LABELS[allergen]}</Text>
            </Pressable>
          );
        })}
      </View>

      {error && <Text className="text-red-400">{error}</Text>}

      <View className="flex-row gap-3">
        <Pressable className="flex-1 items-center rounded-lg border border-white/20 py-2" onPress={onCancel}>
          <Text className="text-white">Cancel</Text>
        </Pressable>
        <Pressable
          className="flex-1 items-center rounded-lg bg-cotto-accent py-2 disabled:opacity-50"
          disabled={saving}
          onPress={onSubmit}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text className="font-semibold text-white">Save item</Text>}
        </Pressable>
      </View>
    </View>
  );
}
