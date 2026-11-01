import { Component, type ErrorInfo, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { Sentry } from "../lib/sentry";

function Fallback({ onReset }: { onReset: () => void }) {
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-cotto-dark px-6">
      <Text className="text-center text-lg font-semibold text-white">Something went wrong.</Text>
      <Text className="text-center text-white/70">
        Cotto hit an unexpected error. Try again, and if it keeps happening, let us know.
      </Text>
      <Pressable className="items-center rounded-lg bg-cotto-accent px-4 py-2" onPress={onReset}>
        <Text className="font-semibold text-white">Try again</Text>
      </Pressable>
    </View>
  );
}

export class AppErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    Sentry.captureException(error, { contexts: { react: { componentStack: info.componentStack } } });
  }

  render() {
    if (this.state.hasError) {
      return <Fallback onReset={() => this.setState({ hasError: false })} />;
    }
    return this.props.children;
  }
}
