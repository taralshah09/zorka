// S11 · Quick-log sheet (P10 shell). No export yet (D27): built from DESIGN.md §6.3. The big mic is
// the hero; Camera · Type · Search under it; Workout · Run · Weight at the bottom. Every entry routes
// to "coming soon" until its phase (P12–P27). The "Repeat yesterday's" row arrives with P13.
import { router } from "expo-router";
import { StyleSheet, View } from "react-native";

import { Icon, type IconName } from "@/core/icons/Icon";
import { useTheme } from "@/core/theme";
import { BottomSheet, PressableScale, Text } from "@/core/ui";

type Entry = { icon: IconName; label: string; feature: string };

const CAPTURE: readonly Entry[] = [
  { icon: "photo_camera", label: "Camera", feature: "Photo logging" },
  { icon: "keyboard", label: "Type", feature: "Typed meal logging" },
  { icon: "search", label: "Search", feature: "Food search" },
];
const OTHER: readonly Entry[] = [
  { icon: "fitness_center", label: "Workout", feature: "Workout logging" },
  { icon: "directions_run", label: "Run", feature: "Run recording" },
  { icon: "monitor_weight", label: "Weight", feature: "Weight logging" },
];

const comingSoon = (feature: string) => router.replace({ pathname: "/coming-soon", params: { feature } });

export default function QuickLog() {
  const { colors, radius, elevation, isDark } = useTheme();

  return (
    <BottomSheet visible onClose={() => router.back()} title="Quick log">
      <View style={styles.micWrap}>
        <PressableScale
          onPress={() => comingSoon("Voice logging")}
          accessibilityRole="button"
          accessibilityLabel="Talk to log a meal"
          accessibilityHint="Coming soon"
          style={[
            styles.mic,
            { backgroundColor: colors.primary, borderRadius: radius.full },
            isDark ? { boxShadow: elevation.glow } : null,
          ]}
        >
          <Icon name="mic" size={28} color={colors.ink} filled />
        </PressableScale>
        <Text variant="label" color="textSecondary">
          Hold to talk
        </Text>
      </View>

      <EntryRow entries={CAPTURE} />
      <View style={[styles.divider, { backgroundColor: colors.outline }]} />
      <EntryRow entries={OTHER} />
    </BottomSheet>
  );
}

function EntryRow({ entries }: { entries: readonly Entry[] }) {
  const { colors, radius } = useTheme();
  return (
    <View style={styles.row}>
      {entries.map((e) => (
        <PressableScale
          key={e.label}
          onPress={() => comingSoon(e.feature)}
          accessibilityRole="button"
          accessibilityLabel={e.label}
          accessibilityHint="Coming soon"
          style={[styles.entry, { backgroundColor: colors.surfaceHigh, borderRadius: radius.lg }]}
        >
          <Icon name={e.icon} color={colors.textPrimary} />
          <Text variant="label">{e.label}</Text>
        </PressableScale>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  micWrap: { alignItems: "center", gap: 8, marginVertical: 8 },
  mic: { width: 88, height: 88, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", gap: 8, marginTop: 12 },
  entry: { flex: 1, minHeight: 72, alignItems: "center", justifyContent: "center", gap: 6 },
  divider: { height: StyleSheet.hairlineWidth, marginTop: 12 },
});
