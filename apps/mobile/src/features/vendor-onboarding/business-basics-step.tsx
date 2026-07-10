import { zodResolver } from "@hookform/resolvers/zod";
import {
  businessBasicsSchema,
  VENDOR_TYPES,
  VENDOR_TYPE_LABELS,
  type BusinessBasicsInput,
  type VendorType,
} from "@cotto/shared";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";

interface Props {
  defaultValues: BusinessBasicsInput;
  onNext: (values: BusinessBasicsInput) => Promise<void>;
}

export function BusinessBasicsStep({ defaultValues, onNext }: Props) {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<BusinessBasicsInput>({ resolver: zodResolver(businessBasicsSchema), defaultValues });

  async function onSubmit(values: BusinessBasicsInput) {
    setFormError(null);
    try {
      await onNext(values);
    } catch (err) {
      setFormError((err as Error).message);
    }
  }

  return (
    <View className="gap-4">
      <Text className="text-2xl font-bold text-white">Tell us about your business</Text>

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
            placeholder="Tagline (optional)"
            placeholderTextColor="#9CA3AF"
            onBlur={onBlur}
            onChangeText={onChange}
            value={value}
          />
        )}
      />

      <Text className="text-white/80">Vendor type (choose at least one)</Text>
      <Controller
        control={control}
        name="vendorTypes"
        render={({ field: { onChange, value } }) => (
          <View className="flex-row flex-wrap gap-2">
            {VENDOR_TYPES.map((type: VendorType) => {
              const selected = value?.includes(type);
              return (
                <Pressable
                  key={type}
                  className={`rounded-full border px-3 py-2 ${selected ? "border-cotto-accent bg-cotto-accent/20" : "border-white/20"}`}
                  onPress={() =>
                    onChange(selected ? value.filter((t) => t !== type) : [...(value ?? []), type])
                  }
                >
                  <Text className={selected ? "text-cotto-accent" : "text-white/70"}>{VENDOR_TYPE_LABELS[type]}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
      />
      {errors.vendorTypes && <Text className="text-red-400">{errors.vendorTypes.message}</Text>}

      <Controller
        control={control}
        name="phone"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextInput
            className="rounded-lg bg-white/10 px-4 py-3 text-white"
            placeholder="Business phone"
            placeholderTextColor="#9CA3AF"
            keyboardType="phone-pad"
            onBlur={onBlur}
            onChangeText={onChange}
            value={value}
          />
        )}
      />
      {errors.phone && <Text className="text-red-400">{errors.phone.message}</Text>}

      <Controller
        control={control}
        name="email"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextInput
            className="rounded-lg bg-white/10 px-4 py-3 text-white"
            placeholder="Business email"
            placeholderTextColor="#9CA3AF"
            autoCapitalize="none"
            keyboardType="email-address"
            onBlur={onBlur}
            onChangeText={onChange}
            value={value}
          />
        )}
      />
      {errors.email && <Text className="text-red-400">{errors.email.message}</Text>}
      {formError && <Text className="text-red-400">{formError}</Text>}

      <Pressable
        className="mt-2 items-center rounded-lg bg-cotto-accent py-3 disabled:opacity-50"
        disabled={isSubmitting}
        onPress={handleSubmit(onSubmit)}
      >
        {isSubmitting ? <ActivityIndicator color="#fff" /> : <Text className="font-semibold text-white">Next</Text>}
      </Pressable>
    </View>
  );
}
