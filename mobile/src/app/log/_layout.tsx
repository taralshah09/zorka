// Food logging flow (P12–P18): search → portion → confirm, type / voice / photo → confirm, meal detail.
import { Stack } from "expo-router";

import { useTheme } from "@/core/theme";

export default function LogLayout() {
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
