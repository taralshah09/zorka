// Progress stack (Flow C): S35 check-in, S36–S39 phases, S40 streak. S33 is the Progress tab; S34 is the root
// log-weight sheet.
import { Stack } from "expo-router";

import { useTheme } from "@/core/theme";

export default function ProgressLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
        animation: "slide_from_right",
      }}
    />
  );
}
