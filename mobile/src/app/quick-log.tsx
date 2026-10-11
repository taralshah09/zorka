// S11 · Quick-log sheet. No export yet (D27): built from DESIGN.md §6.3. The big mic is the hero;
// Camera · Type · Search under it; the "Repeat yesterday's …" row (P13, matches the time of day);
// Workout · Run · Weight at the bottom (Workout opens S24 since P19, Run S28 since P25, Weight S34 since P27).
import { router, useLocalSearchParams } from "expo-router";
import { StyleSheet, View } from "react-native";

import { Icon, type IconName } from "@/core/icons/Icon";
import { useTheme } from "@/core/theme";
import { BottomSheet, Button, PressableScale, Text, useToast } from "@/core/ui";
import { formatKcal, MEAL_LABEL } from "@/features/food/format";
import { mealTypeParam } from "@/features/log/nav";
import { startWorkout } from "@/features/gym/store";
import { mealTotals, repeatMeal, useYesterdaysMeal } from "@/features/meals/store";
import { useActiveUser } from "@/features/users/activeUser";
import { mealTypeForTime } from "@shared/domain/food";

type Entry = { icon: IconName; label: string; go: () => void; hint?: string };

export default function QuickLog() {
  const { colors, radius, elevation, isDark, layout } = useTheme();
  const toast = useToast();
  const params = useLocalSearchParams<{ mealType?: string }>();
  const userId = useActiveUser((s) => s.userId);
  const mealType = mealTypeParam(params) ?? mealTypeForTime(new Date());
  const yesterday = useYesterdaysMeal(userId, mealType);

  const capture: Entry[] = [
    {
      icon: "photo_camera",
      label: "Camera",
      go: () => router.replace({ pathname: "/log/photo", params: { mealType } }),
    },
    { icon: "keyboard", label: "Type", go: () => router.replace({ pathname: "/log/type", params: { mealType } }) },
    {
      icon: "search",
      label: "Search",
      go: () => router.replace({ pathname: "/log/search", params: { mode: "new", mealType } }),
    },
  ];
  const other: Entry[] = [
    {
      icon: "fitness_center",
      label: "Workout",
      go: () => {
        // Resumes the open workout, or starts an empty one.
        if (userId) startWorkout(userId);
        router.replace("/train/workout");
      },
    },
    {
      icon: "directions_run",
      label: "Run",
      go: () => router.replace({ pathname: "/activity/record", params: { kind: "run" } }),
    },
    { icon: "monitor_weight", label: "Weight", go: () => router.replace("/log-weight") },
  ];

  const repeat = () => {
    if (!yesterday) return;
    repeatMeal(yesterday, mealType);
    toast({ kind: "success", message: `${MEAL_LABEL[mealType]} logged · ${formatKcal(mealTotals(yesterday).kcal)}` });
    router.back();
  };

  return (
    <BottomSheet visible onClose={() => router.back()} title="Quick log">
      <View style={styles.micWrap}>
        <PressableScale
          onPress={() => router.replace({ pathname: "/log/voice", params: { mealType } })}
          accessibilityRole="button"
          accessibilityLabel="Talk to log a meal"
          style={[
            styles.mic,
            { backgroundColor: colors.primary, borderRadius: radius.full },
            isDark ? { boxShadow: elevation.glow } : null,
          ]}
        >
          <Icon name="mic" size={28} color={colors.ink} filled />
        </PressableScale>
        <Text variant="label" color="textSecondary">
          Talk to log
        </Text>
      </View>

      <EntryRow entries={capture} />

      {yesterday ? (
        <View
          style={[
            styles.repeat,
            { backgroundColor: colors.surfaceHigh, borderRadius: radius.lg, padding: layout.cardPadding },
          ]}
        >
          <Icon name="replay" color={colors.secondaryText} />
          <View style={styles.flex}>
            <Text variant="title">{`Repeat yesterday's ${MEAL_LABEL[mealType].toLowerCase()}`}</Text>
            <Text variant="caption" color="textSecondary" numberOfLines={1}>
              {`${yesterday.items.map((i) => i.name).join(" + ")} · ${formatKcal(mealTotals(yesterday).kcal)}`}
            </Text>
          </View>
          <Button label="Log" size="sm" onPress={repeat} />
        </View>
      ) : null}

      <View style={[styles.divider, { backgroundColor: colors.outline }]} />
      <EntryRow entries={other} />
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
          onPress={e.go}
          accessibilityRole="button"
          accessibilityLabel={e.label}
          accessibilityHint={e.hint}
          containerStyle={styles.entrySlot}
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
  entrySlot: { flex: 1 },
  entry: { minHeight: 72, alignItems: "center", justifyContent: "center", gap: 6 },
  repeat: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 12 },
  flex: { flex: 1 },
  divider: { height: StyleSheet.hairlineWidth, marginTop: 12 },
});
