// Onboarding stack (S02–S09, P09). Reached from the entry route when the profile isn't set up, from
// the profile picker for a new profile, and from Settings → "Redo setup".
import { Redirect, Stack } from "expo-router";

import { useTheme } from "@/core/theme";
import { useActiveUser } from "@/features/users/activeUser";

export default function OnboardingLayout() {
  const { colors } = useTheme();
  const userId = useActiveUser((s) => s.userId);
  if (!userId) return <Redirect href="/profiles" />;

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
