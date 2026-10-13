// S10 Today Home, as a personal assistant. The coach has already read the day (targets, meals, steps, streak, time of
// day; situation.ts decides the one situation that matters), so Home leads with a brief: the coach's line and the one
// action that follows. Below it, only what needs the user ("Needs you": the weekly check-in, voice notes waiting), one
// glance card with kcal, protein, steps and water, and today's meals. The full dashboards and past days live on /day.
// States: loading skeleton, error (offline with no cached profile), not set up yet. P36: a notification tap that
// cold-started the app is routed here. P39: a streak milestone or all goals hit opens the celebration (S47) once.
// Welcome back (S48) after 5 days away is the brief's own situation; its action dismisses it. No bell (brand §8).
import { router, useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { StyleSheet, View } from "react-native";

import { describeError } from "@/core/api/client";
import { useNetwork } from "@/core/network/network";
import { NetworkBanner } from "@/core/network/NetworkBanner";
import { EmptyState, ErrorState, IconButton, Screen, Skeleton, Text, useToast } from "@/core/ui";
import { cachedSteps, useHealthSteps } from "@/features/activity/health";
import { dayCredit, useActivityClock } from "@/features/activity/store";
import { useCelebrateOnFocus } from "@/features/celebrate/celebrations";
import { useTodayReactions } from "@/features/celebrate/todayReactions";
import { coachLine } from "@/features/coach/lines";
import { MEAL_LABEL } from "@/features/food/format";
import { useEatOptions } from "@/features/gap/eat";
import { useDayGap } from "@/features/gap/gap";
import { nextAction } from "@/features/gap/nextAction";
import { lineFacts, situationFor } from "@/features/gap/situation";
import { useWelcomeBack } from "@/features/gap/welcomeBack";
import { removeVoice, useVoiceQueue } from "@/features/log/voiceQueue";
import { useDayMeals } from "@/features/meals/store";
import { consumePendingRoute } from "@/features/nudges/NudgePlanner";
import { checkinCopy } from "@/features/progress/copy";
import { StreakChip } from "@/features/progress/components";
import { useProgress } from "@/features/progress/hooks";
import { AppHeader } from "@/features/shell/AppHeader";
import { formatDayLong, greeting } from "@/features/targets/format";
import { BriefCard, GlanceCard, NeedsYouRow, TodayMeals } from "@/features/today/Brief";
import { NudgePromptCard } from "@/features/today/FlowBCards";
import { consumedFrom } from "@/features/today/TodayCards";
import { useActiveUser } from "@/features/users/activeUser";
import { logGlass, useGlasses } from "@/features/water/store";
import { localDate } from "@shared/domain/food";
import { clampWaterGoal } from "@shared/domain/water";

export default function Today() {
  const clock = useActivityClock();
  const { profile, targets, streak, pending } = useProgress(clock);
  const userId = useActiveUser((s) => s.userId);
  const online = useNetwork((s) => s.online);
  const toast = useToast();
  const now = new Date(clock);
  const today = localDate(now);
  useHealthSteps(userId, today);
  const credit = dayCredit(userId, today);
  const meals = useDayMeals(userId, today);
  const voiceNotes = useVoiceQueue(userId);
  const consumed = { ...consumedFrom(meals), steps: cachedSteps(userId, today)?.steps ?? null };
  const glasses = useGlasses(userId, today);
  const waterGoal = clampWaterGoal(profile.data?.waterGoalGlasses);
  const name = profile.data?.displayName;
  const coach = profile.data?.coach ?? null;
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
  const action = situation && facts ? nextAction(situation, facts, eatOptions.length, meals.length) : null;
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
  useTodayReactions(userId, today, dg, targets?.steps ?? null, situation);

  const voice = voiceNotes[0];
  const needsYou = !!pending || !!voice;

  return (
    <Screen withDock header={<AppHeader eyebrow="Today" />}>
      <NetworkBanner />

      <View style={styles.titleRow}>
        <View style={styles.flex}>
          <Text variant="headline-lg" accessibilityRole="header">
            {`${greeting(now)}${name ? `, ${name}` : ""}`}
          </Text>
          <Text variant="body" color="textSecondary">
            {formatDayLong(now)}
          </Text>
        </View>
        {targets ? <StreakChip streak={streak} /> : null}
      </View>

      {profile.isPending ? (
        <>
          <Skeleton variant="card" height={200} />
          <Skeleton variant="card" height={120} />
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
          {action && situation && facts ? (
            <BriefCard
              coach={coach}
              line={coach ? coachLine(coach, situation, facts) : null}
              action={action}
              note={welcome.show && welcome.freezeUsed ? "A freeze protected your streak." : undefined}
              onAction={() => {
                if (welcome.show) welcome.dismiss();
                router.push(action.href);
              }}
              onAsk={() =>
                router.navigate({
                  pathname: "/coach",
                  params: { about: coach ? coachLine(coach, situation, facts) : action.title },
                })
              }
            />
          ) : null}

          {needsYou ? (
            <View style={styles.section}>
              <Text variant="eyebrow" color="textSecondary">
                Needs you
              </Text>
              {pending ? (
                <NeedsYouRow
                  icon="calendar_month"
                  title="Weekly check-in is ready"
                  subtitle={checkinCopy(pending, !!profile.data?.checkinDetailed).title}
                  onPress={() => router.push("/progress/checkin")}
                />
              ) : null}
              {voice ? (
                <NeedsYouRow
                  icon={online ? "mic" : "cloud_off"}
                  title={
                    voiceNotes.length === 1 ? "A voice note to check" : `${voiceNotes.length} voice notes to check`
                  }
                  subtitle={
                    online
                      ? `${MEAL_LABEL[voice.mealType]} · ready to read and check`
                      : "We'll read it when you're back online."
                  }
                  onPress={
                    online ? () => router.push({ pathname: "/log/voice", params: { queued: voice.id } }) : undefined
                  }
                  trailing={
                    <IconButton
                      icon="close"
                      accessibilityLabel="Discard voice note"
                      onPress={() => removeVoice(voice)}
                    />
                  }
                />
              ) : null}
            </View>
          ) : null}

          <GlanceCard
            targets={{ ...targets, kcal: targets.kcal + credit.kcal }}
            consumed={consumed}
            glasses={glasses}
            waterGoal={waterGoal}
            onAddGlass={() => {
              if (!userId) return;
              logGlass(userId, today);
              toast({ kind: "info", message: `Glass logged · ${glasses + 1} of ${waterGoal}` });
            }}
          />

          <TodayMeals meals={meals} now={now} />

          {userId ? <NudgePromptCard userId={userId} /> : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  flex: { flex: 1 },
  section: { gap: 8 },
});
