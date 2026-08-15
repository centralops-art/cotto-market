import { zodResolver } from "@hookform/resolvers/zod";
import { serviceAddressSchema, type ServiceAddressInput } from "@cotto/shared";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { ActivityIndicator, Image, Pressable, Text, TextInput, View } from "react-native";

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;

interface Props {
  defaultValues: ServiceAddressInput;
  defaultCoords: { lat: number; lng: number } | null;
  onSaveAddress: (values: ServiceAddressInput & { lat: number; lng: number }) => Promise<void>;
}

export function AddressSection({ defaultValues, defaultCoords, onSaveAddress }: Props) {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(defaultCoords);
  const [geocoding, setGeocoding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const {
    control,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<ServiceAddressInput>({ resolver: zodResolver(serviceAddressSchema), defaultValues });

  function onAddressFieldChanged() {
    // Any edit to the address text invalidates the last-geocoded pin -- force
    // a fresh "Locate on map" confirmation before this can be saved. Same
    // rule as the onboarding step (service-address-step.tsx); worth keeping
    // strict here since a bad pin silently skews delivery-fee distance and
    // driver navigation, not just cosmetic.
    setCoords(null);
    setSaved(false);
  }

  async function locateOnMap() {
    setError(null);
    const { addressLine1, city, state, zip } = getValues();
    const parsed = serviceAddressSchema.safeParse({ addressLine1, city, state, zip });
    if (!parsed.success) {
      setError("Fill in the address fields first.");
      return;
    }
    if (!MAPBOX_TOKEN) {
      setError("Mapbox isn't configured.");
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
        setError("Couldn't find that address. Double check it and try again.");
        return;
      }
      const [lng, lat] = feature.center as [number, number];
      setCoords({ lat, lng });
    } catch {
      setError("Couldn't reach Mapbox. Check your connection and try again.");
    } finally {
      setGeocoding(false);
    }
  }

  async function onSubmit(values: ServiceAddressInput) {
    if (!coords) {
      setError('Tap "Locate on map" to confirm your address first.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onSaveAddress({ ...values, ...coords });
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const staticMapUrl =
    coords && MAPBOX_TOKEN
      ? `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-s+D96A3E(${coords.lng},${coords.lat})/${coords.lng},${coords.lat},14,0/400x240@2x?access_token=${MAPBOX_TOKEN}`
      : null;

  return (
    <View className="gap-3 border-b border-white/10 pb-6">
      <Text className="text-lg font-bold text-white">Address</Text>
      <Text className="text-sm text-white/60">
        Where you cook or serve from. Update this any time you relocate -- food trucks especially. Orders already
        placed keep the delivery price they were charged; this only affects new orders and where drivers are sent to
        pick up.
      </Text>

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
              onAddressFieldChanged();
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
                onAddressFieldChanged();
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
                onAddressFieldChanged();
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
                onAddressFieldChanged();
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

      {staticMapUrl && <Image source={{ uri: staticMapUrl }} className="h-48 w-full rounded-lg" resizeMode="cover" />}

      {error && <Text className="text-red-400">{error}</Text>}
      {saved && !error && <Text className="text-green-400">Address updated.</Text>}

      <Pressable
        className="items-center rounded-lg bg-cotto-accent py-3 disabled:opacity-50"
        disabled={saving || !coords}
        onPress={handleSubmit(onSubmit)}
      >
        {saving ? <ActivityIndicator color="#fff" /> : <Text className="font-semibold text-white">Save address</Text>}
      </Pressable>
    </View>
  );
}
