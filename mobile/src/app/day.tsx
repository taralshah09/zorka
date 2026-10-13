// Full day: the detailed dashboards that used to stack on Today (S10), one tap from Home's glance card.
// Remaining kcal, steps and protein tiles, steps & Move points, macro balance, water, meals per slot and the goal
// calendar. The date strip and the goal calendar pick a past day; new meals and water are logged to it. Leaving this
// screen goes back to following today, so a log started from Home never lands on a past day.
import { router } from "expo-router";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";

import { Button, Header, Screen, Text, useToast } from "@/core/ui";
import { ActivityStrip } from "@/features/activity/components";
import { cachedSteps, useHealthSteps } from "@/features/activity/health";
import { dayCredit, useActivityClock } from "@/features/activity/store";
import { useDayMeals } from "@/features/meals/store";
import { useProgress } from "@/features/progress/hooks";
import { formatDayLong } from "@/features/targets/format";
import { DateStrip } from "@/features/today/DateStrip";
import { GoalCalendar } from "@/features/today/GoalCalendar";
import { dateOf, selectDay, useViewedDay } from "@/features/today/selectedDay";
import { consumedFrom, MacroBalance, MealSlots, MetricTiles, RemainingHero } from "@/features/today/TodayCards";
import { useActiveUser } from "@/features/users/activeUser";
import { WaterCard } from "@/features/water/WaterCard";
import { logGlass, undoGlass, useGlasses } from "@/features/water/store";
import { localDate } from "@shared/domain/food";
import { clampWaterGoal } from "@shared/domain/water";

export default function FullDay() {
  const clock = useActivityClock();
  const { profile, targets } = useProgress(clock);
  const userId = useActiveUser((s) => s.userId);
  const toast = useToast();
  const now = new Date(clock);
  const today = localDate(now);
  const { day, isToday } = useViewedDay(now);
  const viewDate = isToday ? now : dateOf(day);
  const health = useHealthSteps(userId, day);
  const credit = dayCredit(userId, day);
  const meals = useDayMeals(userId, day);
  const glasses = useGlasses(userId, day);
  const waterGoal = clampWaterGoal(profile.data?.waterGoalGlasses);
  const consumed = { ...consumedFrom(meals), steps: cachedSteps(userId, day)?.steps ?? null };
  useEffect(() => () => selectDay(null), []);

  if (!targets) {
    return (
      <Screen header={<Header title="Full day" onBack={() => router.back()} />}>
        <Text variant="body" color="textSecondary">
          Set up your plan to see your day.
        </Text>
      </Screen>
    );
  }
  const dailyTargets = { ...targets, kcal: targets.kcal + credit.kcal };

  return (
    <Screen header={<Header title="Full day" onBack={() => router.back()} />}>
      <View style={styles.titleRow}>
        <Text variant="body" color="textSecondary" style={styles.flex}>
          {formatDayLong(viewDate)}
        </Text>
        {isToday ? null : <Button label="Today" size="sm" variant="ghost" onPress={() => selectDay(null)} />}
      </View>
      <DateStrip today={now} selected={day} onSelect={(d) => selectDay(d, now)} />
      <RemainingHero
        targets={dailyTargets}
        consumed={consumed}
        title={isToday ? "Remaining today" : `Remaining on ${formatDayLong(viewDate)}`}
        onCloseGap={isToday ? () => router.push("/gap") : undefined}
      />
      {credit.kcal > 0 ? (
        <Text variant="caption" color="primaryText">{`Budget includes +${credit.kcal} estimated activity kcal`}</Text>
      ) : null}
      <MetricTiles targets={targets} consumed={consumed} />
      <ActivityStrip userId={userId} day={day} stepGoal={targets.steps} healthState={health.state} />
      <MacroBalance targets={dailyTargets} consumed={consumed} />
      <WaterCard
        glasses={glasses}
        goal={waterGoal}
        onAdd={() => {
          if (userId) logGlass(userId, day);
        }}
        onUndo={() => {
          if (userId && undoGlass(userId, day)) toast({ kind: "info", message: "Removed a glass" });
        }}
      />
      <MealSlots targets={targets} consumed={consumed} meals={meals} />
      <GoalCalendar
        userId={userId}
        today={today}
        selected={day}
        targets={targets}
        waterGoal={waterGoal}
        onSelect={(d) => selectDay(d, now)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  flex: { flex: 1 },
});
