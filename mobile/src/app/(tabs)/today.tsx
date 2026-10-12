// S10 Today Home. Targets come from the profile (P08/P09); food consumed comes from today's logged meals
// (P12, local-first). States: loading skeleton, error (offline with no cached profile), not set up yet,
// and the empty day. Since P28–P30: the real streak flame, the weekly check-in card while it's unanswered, and
// targets from the active phase or the last accepted check-in. Since P31–P37 (Flow B): the coach line in the coach's voice,
// the next-best-action card in every state (morning, under, over, done, on track, streak at risk, low steps), Welcome back
// (S48) after 5 days away, and "Turn on nudges". P39: a streak milestone or all goals hit opens the celebration (S47)
// once. Layout follows the S10 export (D11); no bell in the header (brand §8).
// Past days: tapping the date strip or the goal calendar shows that day's meals, steps and water, and new meals and
// water are logged to it; the today-only cards (check-in, coach, next action, nudges, voice queue) are hidden.
// The water glass and the goal calendar (four goals a day, graded) sit under the macro balance and the meals.
import { router, useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { StyleSheet, View } from "react-native";

import { describeError } from "@/core/api/client";
import { NetworkBanner } from "@/core/network/NetworkBanner";
import { Button, EmptyState, ErrorState, Screen, Skeleton, Text, useToast } from "@/core/ui";
import { useCelebrateOnFocus } from "@/features/celebrate/celebrations";
import { useTodayReactions } from "@/features/celebrate/todayReactions";
import { CoachLine } from "@/features/coach/CoachLine";
import { coachLine } from "@/features/coach/lines";
import { useEatOptions } from "@/features/gap/eat";
import { useDayGap } from "@/features/gap/gap";
import { nextAction } from "@/features/gap/nextAction";
import { lineFacts, situationFor } from "@/features/gap/situation";
import { useWelcomeBack } from "@/features/gap/welcomeBack";
import { consumePendingRoute } from "@/features/nudges/NudgePlanner";
import { NudgePromptCard, WelcomeBackCard } from "@/features/today/FlowBCards";
import { AppHeader } from "@/features/shell/AppHeader";
import { formatDayLong, greeting } from "@/features/targets/format";
import { useVoiceQueue } from "@/features/log/voiceQueue";
import { useDayMeals } from "@/features/meals/store";
import { DateStrip } from "@/features/today/DateStrip";
import { GoalCalendar } from "@/features/today/GoalCalendar";
import { dateOf, selectDay, useViewedDay } from "@/features/today/selectedDay";
import {
  consumedFrom,
  MacroBalance,
  MealSlots,
  MetricTiles,
  NextActionCard,
  RemainingHero,
} from "@/features/today/TodayCards";
import { checkinCopy } from "@/features/progress/copy";
import { CheckinReadyCard, StreakChip } from "@/features/progress/components";
import { useProgress } from "@/features/progress/hooks";
import { VoiceQueueCard } from "@/features/today/VoiceQueueCard";
import { useActiveUser } from "@/features/users/activeUser";
import { localDate } from "@shared/domain/food";
import { clampWaterGoal } from "@shared/domain/water";
import { WaterCard } from "@/features/water/WaterCard";
import { logGlass, undoGlass, useGlasses } from "@/features/water/store";
import { ActivityStrip } from "@/features/activity/components";
import { cachedSteps, useHealthSteps } from "@/features/activity/health";
import { dayCredit, useActivityClock } from "@/features/activity/store";

export default function Today() {
  const clock = useActivityClock();
  const { profile, targets, streak, pending, latest } = useProgress(clock);
  const userId = useActiveUser((s) => s.userId);
  const toast = useToast();
  const now = new Date(clock);
  const today = localDate(now);
  // The day on show: today, or a past day picked on the date strip or the goal calendar.
  const { day, isToday } = useViewedDay(now);
  const viewDate = isToday ? now : dateOf(day);
  const health = useHealthSteps(userId, day);
  const credit = dayCredit(userId, day);
  const dailyTargets = targets ? { ...targets, kcal: targets.kcal + credit.kcal } : null;
  const meals = useDayMeals(userId, day);
  const voiceNotes = useVoiceQueue(userId);
  const consumed = { ...consumedFrom(meals), steps: cachedSteps(userId, day)?.steps ?? null };
  const glasses = useGlasses(userId, day);
  const waterGoal = clampWaterGoal(profile.data?.waterGoalGlasses);
  const name = profile.data?.displayName;
  const dg = useDayGap(clock);
  const welcome = useWelcomeBack(userId, today, streak);
  const eatOptions = useEatOptions({
    userId,
    today,
    now: clock,
    gap: dg?.gap ?? null,
    diet: profile.data?.diet ?? "non_veg",
    profileDiet: profile.data?.diet ?? "non_veg",
    nearby: [],
  });
  const situation = dg ? situationFor(dg, streak, welcome.show) : null;
  const facts = dg ? lineFacts(dg, streak) : null;
  const action = isToday && situation && facts ? nextAction(situation, facts, eatOptions.length, meals.length) : null;
  // A notification tap that cold-started the app is routed once Today is showing (P36).
  useFocusEffect(useCallback(() => consumePendingRoute(), []));
  // P39: celebrate a streak milestone reached today, else all goals hit, once each (re-checked on focus, so it fires
  // when the user comes back from the log that did it).
  const milestone = streak?.milestoneToday ?? null;
  useCelebrateOnFocus(
    userId,
    milestone
      ? { key: `streak:${today}:${milestone}`, kind: "streak", value: String(milestone) }
      : dg?.gap.state === "done"
        ? { key: `day:${today}`, kind: "day" }
        : null,
  );
  // Confetti once per single goal reached today, and a mascot eye-roll when over target or the streak is at risk.
  useTodayReactions(isToday ? userId : null, today, dg, targets?.steps ?? null, situation);

  return (
    <Screen withDock header={<AppHeader eyebrow="Today" />}>
      <NetworkBanner />

      <View style={styles.titleRow}>
        <View style={styles.flex}>
          <Text variant="headline-lg" accessibilityRole="header">
            Your activity
          </Text>
          <Text variant="body" color="textSecondary">
            {isToday ? `${formatDayLong(now)} · ${greeting(now)}${name ? `, ${name}` : ""}` : formatDayLong(viewDate)}
          </Text>
        </View>
        {!targets ? null : isToday ? (
          <StreakChip streak={streak} />
        ) : (
          <Button label="Today" size="sm" variant="ghost" onPress={() => selectDay(null)} />
        )}
      </View>

      {profile.isPending ? (
        <>
          <Skeleton variant="card" height={72} />
          <Skeleton variant="card" height={200} />
          <Skeleton variant="card" height={140} />
        </>
      ) : profile.isError && !profile.data ? (
        <ErrorState
          {...describeError(profile.error)}
          onRetry={() => profile.refetch()}
          retrying={profile.isRefetching}
        />
      ) : !targets ? (
        <EmptyState
          icon="tune"
          title="Set up your plan"
          body="Answer a few questions and get your daily calories, protein and steps."
          actionLabel="Set up my plan"
          onAction={() => router.push("/onboarding")}
        />
      ) : (
        <>
          <DateStrip today={now} selected={day} onSelect={(d) => selectDay(d, now)} />
          {isToday && pending ? (
            <CheckinReadyCard
              title={checkinCopy(pending, !!profile.data?.checkinDetailed).title}
              onPress={() => router.push("/progress/checkin")}
            />
          ) : null}
          <RemainingHero
            targets={dailyTargets!}
            consumed={consumed}
            title={isToday ? "Remaining today" : `Remaining on ${formatDayLong(viewDate)}`}
            onCloseGap={isToday ? () => router.push("/gap") : undefined}
          />
          {credit.kcal > 0 ? (
            <Text
              variant="caption"
              color="primaryText"
            >{`Budget includes +${credit.kcal} estimated activity kcal`}</Text>
          ) : null}
          <MetricTiles targets={targets} consumed={consumed} />
          <ActivityStrip userId={userId} day={day} stepGoal={targets.steps} healthState={health.state} />
          <MacroBalance targets={dailyTargets!} consumed={consumed} />
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
          {isToday && welcome.show ? (
            <WelcomeBackCard freezeUsed={welcome.freezeUsed} hasTrend={!!latest} onDismiss={welcome.dismiss} />
          ) : null}
          {isToday && profile.data?.coach && situation && facts ? (
            <CoachLine coach={profile.data.coach} line={coachLine(profile.data.coach, situation, facts)} />
          ) : null}
          {isToday ? <VoiceQueueCard notes={voiceNotes} /> : null}
          {action ? (
            <NextActionCard
              eyebrow={action.eyebrow}
              title={action.title}
              icon={action.icon}
              tone={action.tone}
              onPress={() => router.push(action.href)}
            />
          ) : null}
          {isToday && userId ? <NudgePromptCard userId={userId} /> : null}
          <MealSlots targets={targets} consumed={consumed} meals={meals} />
          <GoalCalendar
            userId={userId}
            today={today}
            selected={day}
            targets={targets}
            waterGoal={waterGoal}
            onSelect={(d) => selectDay(d, now)}
          />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  flex: { flex: 1 },
});
