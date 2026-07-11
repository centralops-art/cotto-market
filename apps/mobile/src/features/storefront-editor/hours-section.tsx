import { defaultWeekHours, WEEKDAYS, weekHoursSchema, type WeekHours } from "@cotto/shared";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";

interface Props {
  title: string;
  value: unknown;
  onSave: (hours: WeekHours) => Promise<void>;
}

function coerce(value: unknown): WeekHours {
  const parsed = weekHoursSchema.safeParse(value);
  return parsed.success ? parsed.data : defaultWeekHours();
}

const DAY_LABELS: Record<string, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
};

export function HoursSection({ title, value, onSave }: Props) {
  const [hours, setHours] = useState<WeekHours>(coerce(value));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateDay(day: keyof WeekHours, patch: Partial<WeekHours[keyof WeekHours]>) {
    setHours((prev) => ({ ...prev, [day]: { ...prev[day], ...patch } }));
  }

  async function onSubmit() {
    const parsed = weekHoursSchema.safeParse(hours);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check your times are in HH:MM format.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(parsed.data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <View className="gap-3 border-b border-white/10 pb-6">
      <Text className="text-lg font-bold text-white">{title}</Text>

      {WEEKDAYS.map((day) => (
        <View key={day} className="flex-row items-center gap-2">
          <Text className="w-10 text-white/80">{DAY_LABELS[day]}</Text>
          <Pressable
            className={`rounded-md border px-2 py-1 ${hours[day].closed ? "border-cotto-accent bg-cotto-accent/20" : "border-white/20"}`}
            onPress={() => updateDay(day, { closed: !hours[day].closed })}
          >
            <Text className={hours[day].closed ? "text-cotto-accent" : "text-white/70"}>Closed</Text>
          </Pressable>
          {!hours[day].closed && (
            <>
              <TextInput
                className="w-16 rounded-md bg-white/10 px-2 py-1 text-center text-white"
                placeholder="09:00"
                placeholderTextColor="#9CA3AF"
                maxLength={5}
                value={hours[day].open}
                onChangeText={(t) => updateDay(day, { open: t })}
              />
              <Text className="text-white/50">-</Text>
              <TextInput
                className="w-16 rounded-md bg-white/10 px-2 py-1 text-center text-white"
                placeholder="17:00"
                placeholderTextColor="#9CA3AF"
                maxLength={5}
                value={hours[day].close}
                onChangeText={(t) => updateDay(day, { close: t })}
              />
            </>
          )}
        </View>
      ))}

      {error && <Text className="text-red-400">{error}</Text>}

      <Pressable
        className="items-center rounded-lg bg-cotto-accent py-3 disabled:opacity-50"
        disabled={saving}
        onPress={onSubmit}
      >
        {saving ? <ActivityIndicator color="#fff" /> : <Text className="font-semibold text-white">Save {title.toLowerCase()}</Text>}
      </Pressable>
    </View>
  );
}
