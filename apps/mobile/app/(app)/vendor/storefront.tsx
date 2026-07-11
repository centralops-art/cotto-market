import type { StorefrontBasicsInput, ThemePalette, LayoutStyle } from "@cotto/shared";
import { useRouter } from "expo-router";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useVendor } from "../../../src/lib/use-vendor";
import { HeaderBasicsSection } from "../../../src/features/storefront-editor/header-basics-section";
import { HoursSection } from "../../../src/features/storefront-editor/hours-section";
import { TeamMembersSection } from "../../../src/features/storefront-editor/team-members-section";
import { ThemeLayoutSection } from "../../../src/features/storefront-editor/theme-layout-section";

export default function StorefrontEditor() {
  const router = useRouter();
  const { data: vendor, isLoading, patchVendor } = useVendor();

  if (isLoading || !vendor) {
    return (
      <View className="flex-1 items-center justify-center bg-cotto-dark">
        <ActivityIndicator color="#D96A3E" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView className="flex-1 bg-cotto-dark" behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 56, gap: 24 }}>
        <Pressable onPress={() => router.back()}>
          <Text className="text-white/60">&larr; Back</Text>
        </Pressable>
        <Text className="text-2xl font-bold text-white">Edit Storefront</Text>

        <HeaderBasicsSection
          vendorId={vendor.id}
          headerImageUrl={vendor.header_image_url}
          defaultValues={{ storefrontName: vendor.storefront_name, tagline: vendor.tagline ?? "" }}
          onSaveBasics={async (values: StorefrontBasicsInput) =>
            patchVendor({ storefront_name: values.storefrontName, tagline: values.tagline || null })
          }
          onHeaderImageUploaded={async (url: string) => patchVendor({ header_image_url: url })}
        />

        <HoursSection title="Hours" value={vendor.hours} onSave={async (hours) => patchVendor({ hours })} />
        <HoursSection
          title="Preorder hours"
          value={vendor.preorder_hours}
          onSave={async (hours) => patchVendor({ preorder_hours: hours })}
        />

        <TeamMembersSection vendorId={vendor.id} />

        <ThemeLayoutSection
          themePalette={vendor.theme_palette}
          layoutStyle={vendor.layout_style}
          onSaveTheme={async (palette: ThemePalette) => patchVendor({ theme_palette: palette })}
          onSaveLayout={async (layout: LayoutStyle) => patchVendor({ layout_style: layout })}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
