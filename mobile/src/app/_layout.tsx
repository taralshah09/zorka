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

import { warmUpApi } from "@/core/api/client";
import { startNetworkMonitoring } from "@/core/network/network";
import { getDb } from "@/core/storage/db";
import { startSyncEngine } from "@/core/sync/engine";
import { usePullSync } from "@/core/sync/pull";
import { ThemeProvider, useTheme } from "@/core/theme";
import { ErrorState, Screen, ToastProvider } from "@/core/ui";
// Registers the dev sync-probe entity with the sync engine (P07).
import "@/features/dev/syncProbes";
// Register the meal_log (P12) and custom_food (P13) entities with the sync engine at boot.
import { useCatalogSync } from "@/features/food/catalog";
import "@/features/meals/store";
// Register custom_exercise, workout (P19) and routine (P21) with the sync engine at boot.
import { useExerciseCatalogSync } from "@/features/gym/catalog";
import "@/features/gym/routines";
import "@/features/gym/store";
// Registers the activity entity (GPS sessions) for push and pull.
import "@/features/activity/store";
// Register weight_log (P27), checkin (P28) and phase (P29) for push and pull.
import "@/features/progress/checkins";
import "@/features/progress/phases";
import "@/features/progress/weights";
// Registers water_log (Today water taps) for push and pull.
import "@/features/water/store";
// Register day_brief, day_plan and memory_fact (the life plan, LA1–LA5) for push and pull.
import "@/features/life/briefs";
import "@/features/life/plans";
import "@/features/life/memory";
import { startRecorderLifecycle } from "@/features/activity/recorder";
import { startBubbleIfEnabled } from "@/features/assistant/bubble";
import { markUiMounted } from "@/features/assistant/navigate";
import { ConfettiBurstHost } from "@/features/celebrate/ConfettiBurst";
import { OrderedItPrompt } from "@/features/gap/sheets";
import { NudgePlanner } from "@/features/nudges/NudgePlanner";
import { useActiveUser } from "@/features/users/activeUser";
import { startPendingProfileSync } from "@/features/users/api";

SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

function bootstrap() {
  warmUpApi();
  startNetworkMonitoring();
  getDb();
  startSyncEngine();
  // UX O4: an onboarding plan saved offline goes to the server once the network is back.
  const stopProfileSync = startPendingProfileSync(queryClient);
  const stopRecorder = startRecorderLifecycle();
  // AB4: the router exists from here on (the bubble's actions push routes instead of opening deep links), and the
  // bubble comes back on at launch if the user turned it on.
  markUiMounted(true);
  startBubbleIfEnabled();
  return () => {
    stopProfileSync();
    stopRecorder();
    markUiMounted(false);
  };
}

function RootStack() {
  const { colors, isDark } = useTheme();
  useCatalogSync();
  useExerciseCatalogSync();
  // Restores the user's meals, workouts, routines, activities, weigh-ins, check-ins and phases from the server (new phone, reinstall).
  usePullSync(useActiveUser((s) => s.userId));
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
        <Stack.Screen name="log-weight" options={{ presentation: "transparentModal", animation: "fade" }} />
        <Stack.Screen name="coming-soon" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="log" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="train" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="activity" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="progress" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="dev" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="gap" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="day" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="notifications" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="share" options={{ animation: "slide_from_bottom" }} />
        <Stack.Screen name="celebrate" options={{ presentation: "transparentModal", animation: "fade" }} />
        <Stack.Screen name="plan" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="menu" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="knows" options={{ animation: "slide_from_right" }} />
      </Stack>
      {/* P34 "Ordered it?" on return from Zomato/Blinkit, and P36's on-device nudge planner. Both render nothing until needed. */}
      <OrderedItPrompt />
      <NudgePlanner />
      {/* Confetti bursts for single goals, finished workouts/runs, onboarding and check-ins. Above every screen. */}
      <ConfettiBurstHost />
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
