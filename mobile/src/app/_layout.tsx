// Root layout: providers, font loading, native splash, app-wide error boundary, root stack.
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/plus-jakarta-sans";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, type ErrorBoundaryProps } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { startNetworkMonitoring } from "@/core/network/network";
import { getDb } from "@/core/storage/db";
import { startSyncEngine } from "@/core/sync/engine";
import { ThemeProvider, useTheme } from "@/core/theme";
import { ErrorState, Screen, ToastProvider } from "@/core/ui";
// Registers the dev sync-probe entity with the sync engine (P07).
import "@/features/dev/syncProbes";

SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

function bootstrap() {
  startNetworkMonitoring();
  getDb();
  startSyncEngine();
}

function RootStack() {
  const { colors, isDark } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: "fade" }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="profiles" />
        <Stack.Screen name="onboarding" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="settings" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="quick-log" options={{ presentation: "transparentModal", animation: "fade" }} />
        <Stack.Screen name="coming-soon" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="dev" options={{ animation: "slide_from_right" }} />
      </Stack>
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  useEffect(bootstrap, []);

  const ready = fontsLoaded || !!fontError;
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <RootStack />
          </ToastProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

/** App-wide error boundary (P02): any render error in a route lands here instead of a red screen. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <Screen>
          <ErrorState
            title="Something broke on this screen"
            body={__DEV__ ? error.message : "Try again. Your logs are saved on the phone."}
            onRetry={retry}
          />
        </Screen>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
