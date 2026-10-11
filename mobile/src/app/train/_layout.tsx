// Gym flow (P19–P22): active workout (S24), exercise picker (S23), create exercise, exercise history (S27),
// workout summary (S25), routine editor (S26).
import { Stack } from "expo-router";

import { useTheme } from "@/core/theme";

export default function TrainLayout() {
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
