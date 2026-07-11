import {
  HEX_COLOR_PATTERN,
  LAYOUT_STYLES,
  LAYOUT_STYLE_LABELS,
  THEME_PRESETS,
  themePaletteSchema,
  type LayoutStyle,
  type ThemePalette,
} from "@cotto/shared";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";

interface Props {
  themePalette: unknown;
  layoutStyle: LayoutStyle;
  onSaveTheme: (palette: ThemePalette) => Promise<void>;
  onSaveLayout: (layout: LayoutStyle) => Promise<void>;
}

function coercePalette(value: unknown): ThemePalette {
  const parsed = themePaletteSchema.safeParse(value);
  return parsed.success ? parsed.data : { primary: THEME_PRESETS[0].primary, accent: THEME_PRESETS[0].accent };
}

export function ThemeLayoutSection({ themePalette, layoutStyle, onSaveTheme, onSaveLayout }: Props) {
  const [palette, setPalette] = useState<ThemePalette>(coercePalette(themePalette));
  const [customAccent, setCustomAccent] = useState(palette.accent);
  const [savingTheme, setSavingTheme] = useState(false);
  const [themeError, setThemeError] = useState<string | null>(null);
  const [layout, setLayout] = useState<LayoutStyle>(layoutStyle);
  const [savingLayout, setSavingLayout] = useState(false);

  async function applyPreset(preset: (typeof THEME_PRESETS)[number]) {
    const next = { primary: preset.primary, accent: preset.accent };
    setPalette(next);
    setCustomAccent(next.accent);
    setThemeError(null);
    setSavingTheme(true);
    try {
      await onSaveTheme(next);
    } catch (err) {
      setThemeError((err as Error).message);
    } finally {
      setSavingTheme(false);
    }
  }

  async function applyCustomAccent() {
    const next = { ...palette, accent: customAccent };
    const parsed = themePaletteSchema.safeParse(next);
    if (!parsed.success) {
      setThemeError(parsed.error.issues[0]?.message ?? "Invalid color");
      return;
    }
    setSavingTheme(true);
    setThemeError(null);
    try {
      await onSaveTheme(parsed.data);
      setPalette(parsed.data);
    } catch (err) {
      setThemeError((err as Error).message);
    } finally {
      setSavingTheme(false);
    }
  }

  async function selectLayout(next: LayoutStyle) {
    setLayout(next);
    setSavingLayout(true);
    try {
      await onSaveLayout(next);
    } finally {
      setSavingLayout(false);
    }
  }

  return (
    <View className="gap-3 border-b border-white/10 pb-6">
      <Text className="text-lg font-bold text-white">Theme</Text>
      <View className="flex-row flex-wrap gap-2">
        {THEME_PRESETS.map((preset) => (
          <Pressable
            key={preset.name}
            className={`flex-row items-center gap-2 rounded-full border px-3 py-2 ${palette.accent === preset.accent ? "border-cotto-accent" : "border-white/20"}`}
            onPress={() => applyPreset(preset)}
          >
            <View style={{ backgroundColor: preset.accent }} className="h-4 w-4 rounded-full" />
            <Text className="text-white/80">{preset.name}</Text>
          </Pressable>
        ))}
      </View>
      <View className="flex-row items-center gap-2">
        <Text className="text-white/70">Custom accent</Text>
        <TextInput
          className="w-28 rounded-md bg-white/10 px-2 py-1 text-white"
          placeholder="#D96A3E"
          placeholderTextColor="#9CA3AF"
          maxLength={7}
          autoCapitalize="none"
          value={customAccent}
          onChangeText={setCustomAccent}
        />
        <Pressable
          className="rounded-md border border-white/20 px-3 py-1 disabled:opacity-50"
          disabled={savingTheme || !HEX_COLOR_PATTERN.test(customAccent)}
          onPress={applyCustomAccent}
        >
          {savingTheme ? <ActivityIndicator color="#fff" /> : <Text className="text-white">Apply</Text>}
        </Pressable>
      </View>
      {themeError && <Text className="text-red-400">{themeError}</Text>}

      <Text className="mt-4 text-lg font-bold text-white">Layout</Text>
      <View className="flex-row flex-wrap gap-2">
        {LAYOUT_STYLES.map((style) => (
          <Pressable
            key={style}
            className={`rounded-full border px-3 py-2 ${layout === style ? "border-cotto-accent bg-cotto-accent/20" : "border-white/20"}`}
            disabled={savingLayout}
            onPress={() => selectLayout(style)}
          >
            <Text className={layout === style ? "text-cotto-accent" : "text-white/70"}>{LAYOUT_STYLE_LABELS[style]}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
