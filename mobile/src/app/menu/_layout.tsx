// Menu scan screens (LA7): shoot the pages, then see what to order.
import { Stack } from "expo-router";

import { useTheme } from "@/core/theme";

export default function MenuLayout() {
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
