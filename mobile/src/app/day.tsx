// Full day: the detailed dashboards that used to stack on Today (S10), one tap from Home's glance card.
// Remaining kcal, steps and protein tiles, steps & Move points, macro balance, water, meals per slot and the goal
// calendar. The date strip and the goal calendar pick a past day; new meals and water are logged to it. LA3: a day up
// to a week ahead shows its plan instead (targets, what moved and why, the schedule), read-only: nothing is logged to a
// future day. Leaving this screen goes back to following today, so a log started from Home never lands on another day.
import { router } from "expo-router";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";

import { Badge, Button, Card, Header, ListItem, Screen, Text, useToast } from "@/core/ui";
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
import { useDayTargets, waterFor } from "@/features/life/dayTargets";
import { useStoredPlan } from "@/features/life/plans";
import { useDayPlan } from "@/features/life/planner";
import { ADJUST_CODES, adjustLines, DAY_TYPE_LABEL, itemTime, itemTitle, whyText } from "@/features/life/copy";
import { WeekStrip } from "@/features/life/WeekStrip";

export default function FullDay() {
  const clock = useActivityClock();
  const { profile, targets } = useProgress(clock);
  const userId = useActiveUser((s) => s.userId);
  const toast = useToast();
  const now = new Date(clock);
  const today = localDate(now);
  const { day, isToday, isFuture } = useViewedDay(now);
  const future = useDayPlan(day, { save: "never" });
  const viewDate = isToday ? now : dateOf(day);
  const health = useHealthSteps(userId, day);
  const credit = dayCredit(userId, day);
  const meals = useDayMeals(userId, day);
  const glasses = useGlasses(userId, day);
  // LA3: a planned day is tracked against its plan.
  const planned = useDayTargets(userId, day, targets);
  const waterGoal = waterFor(useStoredPlan(userId, day), clampWaterGoal(profile.data?.waterGoalGlasses));
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
  const dayT = planned ?? targets;
  const dailyTargets = { ...dayT, kcal: dayT.kcal + credit.kcal };

  if (isFuture) {
    const plan = future.plan;
    const row = plan?.week.days.find((d) => d.date === day);
    const moved = row ? adjustLines(row, today) : [];
    const t = plan?.targets;
    return (
      <Screen header={<Header title="Planned day" onBack={() => router.back()} />}>
        <View style={styles.titleRow}>
          <Text variant="body" color="textSecondary" style={styles.flex}>
            {formatDayLong(viewDate)}
          </Text>
          <Button label="Today" size="sm" variant="ghost" onPress={() => selectDay(null)} />
        </View>
        <DateStrip today={now} selected={day} onSelect={(d) => selectDay(d, now)} />
        {plan && t ? (
          <>
            <Card>
              <View style={styles.titleRow}>
                <Text variant="eyebrow" color="textSecondary" style={styles.flex}>
                  {plan.assumed ? "Assumed usual day" : "Planned from your brief"}
                </Text>
                <Badge label={DAY_TYPE_LABEL[plan.dayType]} tone={plan.dayType === "normal" ? "neutral" : "lilac"} />
              </View>
              <Text variant="title">
                {`${t.kcalRange ? `${t.kcalRange[0]}–${t.kcalRange[1]}` : t.kcal.toLocaleString("en-IN")} kcal · ${t.proteinG} g protein${t.steps != null ? ` · ${t.steps.toLocaleString("en-IN")} steps` : ""} · ${t.waterGlasses} glasses`}
              </Text>
              {row?.train ? <Text variant="body">Workout day.</Text> : null}
              {moved.map((m) => (
                <Text key={m} variant="body">
                  {m}
                </Text>
              ))}
              {whyText(plan.why.filter((w) => w !== "assumed_day" && !(moved.length && ADJUST_CODES.includes(w)))).map((w) => (
                <Text key={w} variant="caption" color="textSecondary">
                  {w}
                </Text>
              ))}
              {plan.items.map((item, i) => (
                <ListItem key={`${item.kind}-${item.at}-${i}`} title={itemTitle(item)} subtitle={itemTime(item)} />
              ))}
              <Button
                label={future.brief ? "Change this day" : "Plan this day"}
                variant="secondary"
                onPress={() => router.push({ pathname: "/plan/tomorrow", params: { date: day } })}
              />
            </Card>
            <WeekStrip week={plan.week} today={today} />
            <Text variant="caption" color="textSecondary">
              Logging opens on the day itself.
            </Text>
          </>
        ) : (
          <Text variant="body" color="textSecondary">
            {"Working out this day's plan…"}
          </Text>
        )}
        <GoalCalendar
          userId={userId}
          today={today}
          selected={day}
          targets={targets}
          waterGoal={clampWaterGoal(profile.data?.waterGoalGlasses)}
          onSelect={(d) => selectDay(d, now)}
        />
      </Screen>
    );
  }

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
      <MetricTiles targets={dayT} consumed={consumed} />
      <ActivityStrip userId={userId} day={day} stepGoal={dayT.steps} healthState={health.state} />
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
      <MealSlots targets={dayT} consumed={consumed} meals={meals} />
      <GoalCalendar
        userId={userId}
        today={today}
        selected={day}
        targets={targets}
        waterGoal={clampWaterGoal(profile.data?.waterGoalGlasses)}
        onSelect={(d) => selectDay(d, now)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  flex: { flex: 1 },
});
