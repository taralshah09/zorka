// Dev-only routes. Release builds redirect away.
import { Redirect, Stack } from "expo-router";

import { useTheme } from "@/core/theme";

export default function DevLayout() {
  const { colors } = useTheme();
  if (!__DEV__) return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />;
}
