// S11 · Quick-log sheet. No export yet (D27): built from DESIGN.md §6.3. The big mic is the hero;
// Camera · Type · Search under it; Workout · Run · Weight below that (Workout opens S24 since P19, Run S28 since
// P25, Weight S34 since P27); then "Log again" (UX L1): the user's saved usuals, the last meal of this type in
// the past week, then recent distinct meals, up to 3 one-tap rows (so the sheet fits), each with Undo.
// With a past day picked on Today, meals log to that day and Workout · Run · Weight are hidden (they stay on today).
import { router, useLocalSearchParams } from "expo-router";
import { StyleSheet, View } from "react-native";

import { Icon, type IconName } from "@/core/icons/Icon";
import { useTheme } from "@/core/theme";
import { BottomSheet, Button, PressableScale, reactMascot, Text, useToast } from "@/core/ui";
import { formatKcal, MEAL_LABEL } from "@/features/food/format";
import { mealTypeParam } from "@/features/log/nav";
import { startWorkout } from "@/features/gym/store";
import {
  deleteMeal,
  mealKey,
  mealTotals,
  repeatMeal,
  useLastMealOfType,
  useRecentMeals,
  type Meal,
} from "@/features/meals/store";
import { logUsual, useUsualMeals, type UsualMeal } from "@/features/meals/usual";
import { formatDayLong } from "@/features/targets/format";
import { dateOf, logTime, useViewedDay } from "@/features/today/selectedDay";
import { useActiveUser } from "@/features/users/activeUser";
import { mealTypeForTime, type MealType } from "@shared/domain/food";

type Entry = { icon: IconName; label: string; go: () => void; hint?: string };
type Again = {
  key: string;
  items: Meal["items"];
  mealType: MealType;
  when: string;
  usual: UsualMeal | null;
  meal: Meal | null;
};

const MAX_AGAIN = 3;

/** "yesterday", "3 days ago" — counted back from `day`, the day being logged to. */
function ago(date: string, day: string): string {
  const days = Math.round((dateOf(day).getTime() - dateOf(date).getTime()) / 86_400_000);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
}

export default function QuickLog() {
  const { colors, radius, elevation, isDark, layout } = useTheme();
  const toast = useToast();
  const params = useLocalSearchParams<{ mealType?: string }>();
  const userId = useActiveUser((s) => s.userId);
  // Opened from a meal slot ("Log lunch"): everything logs as that meal. Otherwise a repeat keeps its own type.
  const slot = mealTypeParam(params);
  const mealType = slot ?? mealTypeForTime(new Date());
  // On a past day (picked on Today), meals are logged to that day and "the past week" counts back from it.
  const { day, isToday } = useViewedDay(new Date());
  const last = useLastMealOfType(userId, mealType, day);
  const usuals = useUsualMeals(userId);
  const recent = useRecentMeals(userId, 6);

  const again: Again[] = [];
  const seen = new Set<string>();
  const push = (a: Again) => {
    if (again.length >= MAX_AGAIN || seen.has(a.key)) return;
    seen.add(a.key);
    again.push(a);
  };
  usuals.forEach((u) =>
    push({ key: mealKey(u), items: u.items, mealType: u.mealType, when: "Your usual", usual: u, meal: null }),
  );
  // On a past day, skip meals logged after it.
  [last, ...recent].forEach((m) => {
    if (m && m.localDate <= day)
      push({
        key: mealKey(m),
        items: m.items,
        mealType: m.mealType,
        when: ago(m.localDate, day),
        usual: null,
        meal: m,
      });
  });

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

  const logAgain = (a: Again) => {
    if (!userId) return;
    const type = slot ?? a.mealType;
    const copy = a.usual ? logUsual(userId, a.usual, type, logTime()) : repeatMeal(a.meal!, type, logTime());
    reactMascot("happy");
    toast({
      kind: "success",
      message: `${MEAL_LABEL[type]} logged · ${formatKcal(mealTotals(copy).kcal)}`,
      onUndo: () => deleteMeal(copy),
    });
    router.back();
  };

  return (
    <BottomSheet
      visible
      onClose={() => router.back()}
      title={isToday ? "Quick log" : `Log to ${formatDayLong(dateOf(day))}`}
    >
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

      {/* Workouts, runs and weigh-ins are recorded as they happen, so they stay on today. */}
      {isToday ? (
        <>
          <View style={[styles.divider, { backgroundColor: colors.outline }]} />
          <EntryRow entries={other} />
        </>
      ) : null}

      {again.length ? (
        <Text variant="eyebrow" color="textSecondary" style={styles.againHead}>
          Log again
        </Text>
      ) : null}
      {again.map((a) => (
        <View
          key={a.key}
          style={[
            styles.repeat,
            { backgroundColor: colors.surfaceHigh, borderRadius: radius.lg, padding: layout.cardPadding },
          ]}
        >
          <Icon name={a.usual ? "check_circle" : "replay"} color={colors.secondaryText} />
          <View style={styles.flex}>
            <Text variant="title" numberOfLines={1}>
              {a.items.map((i) => i.name).join(" + ")}
            </Text>
            <Text variant="caption" color="textSecondary" numberOfLines={1}>
              {`${MEAL_LABEL[slot ?? a.mealType]} · ${a.when} · ${formatKcal(mealTotals(a).kcal)}`}
            </Text>
          </View>
          <Button
            label="Log"
            size="sm"
            onPress={() => logAgain(a)}
            accessibilityHint={`Logs ${a.items.map((i) => i.name).join(", ")} as ${MEAL_LABEL[slot ?? a.mealType].toLowerCase()}`}
          />
        </View>
      ))}
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
  againHead: { marginTop: 16 },
  repeat: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 8 },
  flex: { flex: 1 },
  divider: { height: StyleSheet.hairlineWidth, marginTop: 12 },
});
