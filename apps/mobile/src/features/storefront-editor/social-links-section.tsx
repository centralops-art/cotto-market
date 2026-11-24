import {
  normalizeSocialLinks,
  parseSocialLinks,
  SOCIAL_PLATFORM_LABELS,
  SOCIAL_PLATFORMS,
  type SocialLinks,
  type SocialPlatform,
} from "@cotto/shared";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";

interface Props {
  value: unknown;
  onSave: (links: SocialLinks) => Promise<void>;
}

export function SocialLinksSection({ value, onSave }: Props) {
  const [inputs, setInputs] = useState<Partial<Record<SocialPlatform, string>>>(() => parseSocialLinks(value));
  const [errors, setErrors] = useState<Partial<Record<SocialPlatform, string>>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(platform: SocialPlatform, text: string) {
    setSaved(false);
    setInputs((prev) => ({ ...prev, [platform]: text }));
    setErrors((prev) => ({ ...prev, [platform]: undefined }));
  }

  async function onSubmit() {
    const result = normalizeSocialLinks(inputs);
    setErrors(result.errors);
    setError(null);
    setSaved(false);
    if (Object.keys(result.errors).length > 0) return;
    setSaving(true);
    try {
      await onSave(result.links);
      setInputs(result.links); // show the exact links customers will open
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <View className="gap-3 border-b border-white/10 pb-6">
      <Text className="text-lg font-bold text-white">Social media</Text>
      <Text className="text-sm text-white/60">
        Add a username or profile link. These show on your storefront for everyone to see. Leave one blank to hide it.
      </Text>

      {SOCIAL_PLATFORMS.map((platform) => (
        <View key={platform} className="gap-1">
          <Text className="text-sm text-white/70">{SOCIAL_PLATFORM_LABELS[platform]}</Text>
          <TextInput
            className="rounded-lg bg-white/10 px-4 py-3 text-white"
            placeholder="Username or link"
            placeholderTextColor="#9CA3AF"
            accessibilityLabel={`${SOCIAL_PLATFORM_LABELS[platform]} username or link`}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={300}
            editable={!saving}
            value={inputs[platform] ?? ""}
            onChangeText={(t) => update(platform, t)}
          />
          {errors[platform] && <Text className="text-sm text-red-400">{errors[platform]}</Text>}
        </View>
      ))}

      {error && <Text className="text-red-400">{error}</Text>}

      <Pressable
        className="items-center rounded-lg bg-cotto-accent py-3 disabled:opacity-50"
        disabled={saving}
        onPress={onSubmit}
      >
        {saving ? <ActivityIndicator color="#fff" /> : <Text className="font-semibold text-white">Save social media</Text>}
      </Pressable>
      {saved && <Text className="text-center text-white/60">Saved.</Text>}
    </View>
  );
}
