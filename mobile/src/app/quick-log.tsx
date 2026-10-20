// S11 · Quick-log sheet. No export yet (D27): built from DESIGN.md §6.3. AB7 (D89): talking now goes through the
// Zorka bubble that floats over every app, so the big mic is gone; a line points to the bubble instead. Camera · Type · Search come first; Workout · Run · Weight below that (Workout opens S24 since P19, Run S28 since
// P25, Weight S34 since P27); then "Log again" (UX L1): the user's saved usuals, the last meal of this type in
// the past week, then recent distinct meals, up to 3 one-tap rows (so the sheet fits), each with Undo.
// With a past day picked on Today, meals log to that day and Workout · Run · Weight are hidden (they stay on today).
import { router, useLocalSearchParams } from "expo-router";
import { StyleSheet, View } from "react-native";

import { Icon, type IconName } from "@/core/icons/Icon";
import { useTheme } from "@/core/theme";
import { BottomSheet, Button, PressableScale, reactMascot, Text, useToast } from "@/core/ui";
import { formatKcal, formatPortion, MEAL_LABEL } from "@/features/food/format";
import { draftActions } from "@/features/log/draft";
import { getFood } from "@/features/food/catalog";
import { preferencesFor, usePreferencesVersion } from "@/features/meals/preferences";
import { mealTypeParam } from "@/features/log/nav";
import {
  deleteMeal,
  mealKey,
  mealTotals,
  repeatMeal,
  useLastMealOfType,
  useRecentMeals,
  type Meal,
} from "@/features/meals/store";
import { logUsual, rankedUsuals, useUsualMeals, type UsualMeal } from "@/features/meals/usual";
import { formatDayLong } from "@/features/targets/format";
import { dateOf, logTime, useLogDay } from "@/features/today/selectedDay";
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
  const { colors, radius, layout } = useTheme();
  const toast = useToast();
  const params = useLocalSearchParams<{ mealType?: string }>();
  const userId = useActiveUser((s) => s.userId);
  usePreferencesVersion((s) => s.v);
  const preferred = preferencesFor(userId).capture;
  // Opened from a meal slot ("Log lunch"): everything logs as that meal. Otherwise a repeat keeps its own type.
  const slot = mealTypeParam(params);
  const mealType = slot ?? mealTypeForTime(new Date());
  // On a past day (picked on Today), meals are logged to that day and "the past week" counts back from it.
  const { day, isToday } = useLogDay(new Date());
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
  rankedUsuals(usuals, mealType).forEach((u) =>
    push({ key: mealKey(u), items: u.items, mealType: u.mealType, when: "Your usual", usual: u, meal: null }),
  );
  // On a past day, skip meals logged after it.
  [last, ...recent.filter((m) => m.mealType === mealType), ...recent].forEach((m) => {
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
        // Today's workout: everything logged today goes into it.
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
      {preferred && preferred !== "voice" ? <Button label={`Use preferred ${preferred}`} variant="secondary" onPress={() => router.replace({ pathname: preferred === "type" ? "/log/type" : preferred === "photo" ? "/log/photo" : "/log/search", params: { mealType } })} /> : null}
      <View style={[styles.barHint, { backgroundColor: colors.surfaceHigh, borderRadius: radius.md }]}>
        <Icon name="mic" size={20} color={colors.textSecondary} />
        <Text variant="caption" color="textSecondary" style={styles.flex}>
          To talk, tap the Zorka bubble on the edge of your screen, in any app. Turn it on in Settings.
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
            <Text variant="caption" color="textSecondary">{a.items.map((i) => `${formatPortion(i.quantity, i.unit)} ${i.name}`).join(" + ")}</Text>
            <Button label="Change portion" variant="ghost" size="sm" onPress={() => {
              if (!userId) return;
              draftActions.startFromMeal({ ...(a.meal ?? { id: "", userId, source: "repeat", oilLevel: null, photoUri: null, synced: false, localDate: day }), items: a.items, mealType: slot ?? a.mealType, loggedAt: logTime().toISOString() } as Meal, (id) => getFood(userId, id));
              draftActions.makeNew();
              router.replace("/log/confirm");
            }} />
          </View>
          <Button
            label="Log"
            size="sm"
            onPress={() => logAgain(a)}
            accessibilityHint={`Logs ${a.items.map((i) => i.name).join(", ")} as ${MEAL_LABEL[slot ?? a.mealType].toLowerCase()}`}
          />
        </View>
      ))}
      <Button label="More meals · manage usuals" variant="ghost" onPress={() => router.push("/log/usuals")} />
      <Button label="Eating out? Scan the menu" variant="ghost" icon="menu_book" onPress={() => router.push("/menu/scan")} />
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
  barHint: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, marginBottom: 8 },
  row: { flexDirection: "row", gap: 8, marginTop: 12 },
  entrySlot: { flex: 1 },
  entry: { minHeight: 72, alignItems: "center", justifyContent: "center", gap: 6 },
  againHead: { marginTop: 16 },
  repeat: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 8 },
  flex: { flex: 1 },
  divider: { height: StyleSheet.hairlineWidth, marginTop: 12 },
});
