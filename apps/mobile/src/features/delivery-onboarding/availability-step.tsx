import { DAY_OF_WEEK_LABELS, type Availability, type AvailabilityWindow, type DayOfWeek } from "@cotto/shared";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";

interface Props {
  defaultValue: Availability;
  onBack: () => void;
  onSubmit: (values: { availability: Availability }) => Promise<void>;
}

const DAYS: DayOfWeek[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DEFAULT_WINDOW: AvailabilityWindow = { start: "09:00", end: "17:00" };

export function AvailabilityStep({ defaultValue, onBack, onSubmit }: Props) {
  const [availability, setAvailability] = useState<Availability>(defaultValue ?? {});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function toggleDay(day: DayOfWeek) {
    setAvailability((prev) => {
      const next = { ...prev };
      if (next[day]) {
        delete next[day];
      } else {
        next[day] = [{ ...DEFAULT_WINDOW }];
      }
      return next;
    });
  }

  function updateWindow(day: DayOfWeek, field: "start" | "end", value: string) {
    setAvailability((prev) => {
      const window = prev[day]?.[0] ?? { ...DEFAULT_WINDOW };
      return { ...prev, [day]: [{ ...window, [field]: value }] };
    });
  }

  async function handleSubmit() {
    for (const day of DAYS) {
      const window = availability[day]?.[0];
      if (!window) continue;
      if (!TIME_PATTERN.test(window.start) || !TIME_PATTERN.test(window.end)) {
        setFormError(`Enter valid times (HH:mm) for ${DAY_OF_WEEK_LABELS[day]}.`);
        return;
      }
      if (window.start >= window.end) {
        setFormError(`${DAY_OF_WEEK_LABELS[day]}'s start time must be before its end time.`);
        return;
      }
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await onSubmit({ availability });
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View className="gap-4">
      <Text className="text-2xl font-bold text-white">When are you usually available?</Text>
      <Text className="text-white/70">
        This is a default schedule to help dispatch reach you -- you can still go on/off duty any time from the Deliveries tab.
      </Text>

      <View className="gap-3">
        {DAYS.map((day) => {
          const window = availability[day]?.[0];
          const enabled = !!window;
          return (
            <View key={day} className="gap-2 rounded-lg bg-white/5 p-3">
              <Pressable className="flex-row items-center gap-3" onPress={() => toggleDay(day)}>
                <View
                  className={`h-6 w-6 items-center justify-center rounded border ${enabled ? "border-cotto-accent bg-cotto-accent" : "border-white/40"}`}
                >
                  {enabled && <Text className="text-xs text-white">✓</Text>}
                </View>
                <Text className="flex-1 text-white/80">{DAY_OF_WEEK_LABELS[day]}</Text>
              </Pressable>
              {enabled && (
                <View className="flex-row items-center gap-2 pl-9">
                  <TextInput
                    className="w-20 rounded-lg bg-white/10 px-3 py-2 text-center text-white"
                    placeholder="09:00"
                    placeholderTextColor="#9CA3AF"
                    maxLength={5}
                    value={window.start}
                    onChangeText={(v) => updateWindow(day, "start", v)}
                  />
                  <Text className="text-white/60">to</Text>
                  <TextInput
                    className="w-20 rounded-lg bg-white/10 px-3 py-2 text-center text-white"
                    placeholder="17:00"
                    placeholderTextColor="#9CA3AF"
                    maxLength={5}
                    value={window.end}
                    onChangeText={(v) => updateWindow(day, "end", v)}
                  />
                </View>
              )}
            </View>
          );
        })}
      </View>

      {formError && <Text className="text-red-400">{formError}</Text>}

      <View className="flex-row gap-3">
        <Pressable className="flex-1 items-center rounded-lg border border-white/20 py-3" onPress={onBack}>
          <Text className="text-white">Back</Text>
        </Pressable>
        <Pressable
          className="flex-1 items-center rounded-lg bg-cotto-accent py-3 disabled:opacity-50"
          disabled={submitting}
          onPress={handleSubmit}
        >
          {submitting ? <ActivityIndicator color="#fff" /> : <Text className="font-semibold text-white">Submit Application</Text>}
        </Pressable>
      </View>
    </View>
  );
}
