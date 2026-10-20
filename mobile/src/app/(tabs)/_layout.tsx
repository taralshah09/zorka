// Main tabs — DESIGN.md §4, AB7 (D89): Today · Train · Progress · (+) in the floating dock. Talking to Zorka happens
// in the bubble that floats over every app (features/assistant/bubble.ts), not inside these screens. The Zorka thread
// (the old Coach tab) is a hidden tab: the bubble's card, Home's brief and the "done for you" line open it.
import { Redirect, router } from "expo-router";
import { Tabs } from "expo-router/tabs";

import { useTheme } from "@/core/theme";
import { Dock, type DockTab } from "@/core/ui";
import { useActiveUser } from "@/features/users/activeUser";

const TABS: readonly DockTab[] = [
  { route: "today", icon: "home", label: "Today" },
  { route: "train", icon: "fitness_center", label: "Train" },
  { route: "progress", icon: "bar_chart", label: "Progress" },
];

export default function TabsLayout() {
  const { colors } = useTheme();
  const userId = useActiveUser((s) => s.userId);
  if (!userId) return <Redirect href="/profiles" />;

  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}
      tabBar={(props) => <Dock {...props} tabs={TABS} fabAfter={TABS.length} onFabPress={() => router.push("/quick-log")} />}
    >
      {TABS.map((t) => (
        <Tabs.Screen key={t.route} name={t.route} options={{ title: t.label }} />
      ))}
      <Tabs.Screen name="coach" options={{ title: "Zorka", href: null }} />
    </Tabs>
  );
}
