import { Pressable, Text, View } from "react-native";
import { Sentry } from "../lib/sentry";

function Fallback({ resetError }: { resetError: () => void }) {
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-cotto-dark px-6">
      <Text className="text-center text-lg font-semibold text-white">Something went wrong.</Text>
      <Text className="text-center text-white/70">
        Cotto hit an unexpected error. Try again, and if it keeps happening, let us know.
      </Text>
      <Pressable className="items-center rounded-lg bg-cotto-accent px-4 py-2" onPress={resetError}>
        <Text className="font-semibold text-white">Try again</Text>
      </Pressable>
    </View>
  );
}

export function AppErrorBoundary({ children }: { children: React.ReactNode }) {
  return <Sentry.ErrorBoundary fallback={Fallback}>{children}</Sentry.ErrorBoundary>;
}
