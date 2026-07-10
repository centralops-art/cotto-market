import { Text, View } from "react-native";

export default function SplashScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-cotto-dark">
      <Text className="text-4xl font-bold text-cotto-accent">Cotto</Text>
      <Text className="mt-2 text-base text-white/70">North Shore Chicago</Text>
    </View>
  );
}
