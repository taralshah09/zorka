// Life plan screens (LA2–LA3): brief a day and see its plan.
import { Stack } from "expo-router";

import { useTheme } from "@/core/theme";

export default function PlanLayout() {
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
