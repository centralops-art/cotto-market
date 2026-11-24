import { parseSocialLinks, SOCIAL_PLATFORM_LABELS, SOCIAL_PLATFORMS } from "@cotto/shared";
import { Alert, Linking, Pressable, Text, View } from "react-native";

/** A kitchen's social media links on its storefront. Takes the raw
 * vendors.social_links value and shows only links that pass the platform
 * rules (opens the platform's app if installed, otherwise the browser). */
export function SocialLinksRow({ value, accent }: { value: unknown; accent: string }) {
  const links = parseSocialLinks(value);
  const platforms = SOCIAL_PLATFORMS.filter((p) => links[p]);
  if (platforms.length === 0) return null;

  async function open(url: string) {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert("Couldn't open that link", url);
    }
  }

  return (
    <View className="mt-3 flex-row flex-wrap gap-2">
      {platforms.map((platform) => (
        <Pressable
          key={platform}
          accessibilityRole="link"
          className="rounded-full border border-white/20 px-3 py-1.5"
          onPress={() => void open(links[platform]!)}
        >
          <Text style={{ color: accent }}>{SOCIAL_PLATFORM_LABELS[platform]}</Text>
        </Pressable>
      ))}
    </View>
  );
}
