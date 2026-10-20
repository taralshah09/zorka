// Main tabs — DESIGN.md §4: Today · Train · (+) · Progress · Zorka, in the floating dock. Zorka is the chat: the same
// thread the bubble over other apps writes to (features/assistant/bubble.ts), so a turn said there can be read and
// carried on here.
import { Redirect, router } from "expo-router";
import { Tabs } from "expo-router/tabs";

import { useTheme } from "@/core/theme";
import { Dock, type DockTab } from "@/core/ui";
import { useActiveUser } from "@/features/users/activeUser";

const TABS: readonly DockTab[] = [
  { route: "today", icon: "home", label: "Today" },
  { route: "train", icon: "fitness_center", label: "Train" },
  { route: "progress", icon: "bar_chart", label: "Progress" },
  { route: "coach", icon: "forum", label: "Zorka" },
];

export default function TabsLayout() {
  const { colors } = useTheme();
  const userId = useActiveUser((s) => s.userId);
  if (!userId) return <Redirect href="/profiles" />;

  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}
      tabBar={(props) => <Dock {...props} tabs={TABS} fabAfter={2} onFabPress={() => router.push("/quick-log")} />}
    >
      {TABS.map((t) => (
        <Tabs.Screen key={t.route} name={t.route} options={{ title: t.label }} />
      ))}
    </Tabs>
  );
}
