import { zodResolver } from "@hookform/resolvers/zod";
import { serviceAddressSchema, type ServiceAddressInput } from "@cotto/shared";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { ActivityIndicator, Image, Pressable, Text, TextInput, View } from "react-native";

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;

export interface GeocodedAddress extends ServiceAddressInput {
  lat: number;
  lng: number;
}

interface Props {
  defaultValues: ServiceAddressInput;
  defaultCoords?: { lat: number; lng: number } | null;
  onNext: (values: GeocodedAddress) => Promise<void>;
  onBack: () => void;
}

export function ServiceAddressStep({ defaultValues, defaultCoords, onNext, onBack }: Props) {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(defaultCoords ?? null);
  const [geocoding, setGeocoding] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<ServiceAddressInput>({ resolver: zodResolver(serviceAddressSchema), defaultValues });

  async function locateOnMap() {
    setFormError(null);
    const { addressLine1, city, state, zip } = getValues();
    const parsed = serviceAddressSchema.safeParse({ addressLine1, city, state, zip });
    if (!parsed.success) {
      setFormError("Fill in the address fields first.");
      return;
    }
    if (!MAPBOX_TOKEN) {
      setFormError("Mapbox isn't configured yet -- ask the founder to add EXPO_PUBLIC_MAPBOX_TOKEN.");
      return;
    }
    setGeocoding(true);
    try {
      const query = encodeURIComponent(`${addressLine1}, ${city}, ${state} ${zip}`);
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json?access_token=${MAPBOX_TOKEN}&limit=1&country=us`
      );
      const json = await res.json();
      const feature = json.features?.[0];
      if (!feature) {
        setFormError("Couldn't find that address. Double check it and try again.");
        return;
      }
      const [lng, lat] = feature.center as [number, number];
      setCoords({ lat, lng });
    } catch {
      setFormError("Couldn't reach Mapbox. Check your connection and try again.");
    } finally {
      setGeocoding(false);
    }
  }

  async function onSubmit(values: ServiceAddressInput) {
    if (!coords) {
      setFormError("Tap \"Locate on map\" to confirm your address first.");
      return;
    }
    setFormError(null);
    try {
      await onNext({ ...values, ...coords });
    } catch (err) {
      setFormError((err as Error).message);
    }
  }

  const staticMapUrl =
    coords && MAPBOX_TOKEN
      ? `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-s+D96A3E(${coords.lng},${coords.lat})/${coords.lng},${coords.lat},14,0/400x240@2x?access_token=${MAPBOX_TOKEN}`
      : null;

  return (
    <View className="gap-4">
      <Text className="text-2xl font-bold text-white">Where do you cook or serve from?</Text>

      <Controller
        control={control}
        name="addressLine1"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextInput
            className="rounded-lg bg-white/10 px-4 py-3 text-white"
            placeholder="Street address"
            placeholderTextColor="#9CA3AF"
            onBlur={onBlur}
            onChangeText={(t) => {
              onChange(t);
              setCoords(null);
            }}
            value={value}
          />
        )}
      />
      {errors.addressLine1 && <Text className="text-red-400">{errors.addressLine1.message}</Text>}

      <View className="flex-row gap-2">
        <Controller
          control={control}
          name="city"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextInput
              className="flex-1 rounded-lg bg-white/10 px-4 py-3 text-white"
              placeholder="City"
              placeholderTextColor="#9CA3AF"
              onBlur={onBlur}
              onChangeText={(t) => {
                onChange(t);
                setCoords(null);
              }}
              value={value}
            />
          )}
        />
        <Controller
          control={control}
          name="state"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextInput
              className="w-16 rounded-lg bg-white/10 px-4 py-3 text-white"
              placeholder="IL"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="characters"
              maxLength={2}
              onBlur={onBlur}
              onChangeText={(t) => {
                onChange(t);
                setCoords(null);
              }}
              value={value}
            />
          )}
        />
        <Controller
          control={control}
          name="zip"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextInput
              className="w-24 rounded-lg bg-white/10 px-4 py-3 text-white"
              placeholder="ZIP"
              placeholderTextColor="#9CA3AF"
              keyboardType="number-pad"
              maxLength={5}
              onBlur={onBlur}
              onChangeText={(t) => {
                onChange(t);
                setCoords(null);
              }}
              value={value}
            />
          )}
        />
      </View>
      {(errors.city || errors.state || errors.zip) && (
        <Text className="text-red-400">{errors.city?.message ?? errors.state?.message ?? errors.zip?.message}</Text>
      )}

      <Pressable
        className="items-center rounded-lg border border-white/20 py-3 disabled:opacity-50"
        disabled={geocoding}
        onPress={locateOnMap}
      >
        {geocoding ? <ActivityIndicator color="#fff" /> : <Text className="text-white">Locate on map</Text>}
      </Pressable>

      {staticMapUrl && (
        <Image source={{ uri: staticMapUrl }} className="h-48 w-full rounded-lg" resizeMode="cover" />
      )}

      {formError && <Text className="text-red-400">{formError}</Text>}

      <View className="flex-row gap-3">
        <Pressable className="flex-1 items-center rounded-lg border border-white/20 py-3" onPress={onBack}>
          <Text className="text-white">Back</Text>
        </Pressable>
        <Pressable
          className="flex-1 items-center rounded-lg bg-cotto-accent py-3 disabled:opacity-50"
          disabled={isSubmitting}
          onPress={handleSubmit(onSubmit)}
        >
          {isSubmitting ? <ActivityIndicator color="#fff" /> : <Text className="font-semibold text-white">Next</Text>}
        </Pressable>
      </View>
    </View>
  );
}
