// S10 Today Home. Targets come from the profile (P08/P09); food consumed comes from today's logged meals
// (P12, local-first). States: loading skeleton, error (offline with no cached profile), not set up yet,
// and the empty day. Layout follows the S10 export (D11); no bell in the header (brand §8).
import { router } from "expo-router";
import { StyleSheet, View } from "react-native";

import { describeError } from "@/core/api/client";
import { NetworkBanner } from "@/core/network/NetworkBanner";
import { EmptyState, ErrorState, Screen, Skeleton, Text } from "@/core/ui";
import { CoachLine } from "@/features/coach/CoachLine";
import { AppHeader } from "@/features/shell/AppHeader";
import { useTargets } from "@/features/targets/targets";
import { formatDayLong, greeting } from "@/features/targets/format";
import { useVoiceQueue } from "@/features/log/voiceQueue";
import { useDayMeals } from "@/features/meals/store";
import { DateStrip } from "@/features/today/DateStrip";
import {
  consumedFrom,
  MacroBalance,
  MealSlots,
  MetricTiles,
  NextActionCard,
  RemainingHero,
  StreakChip,
} from "@/features/today/TodayCards";
import { VoiceQueueCard } from "@/features/today/VoiceQueueCard";
import { useActiveUser } from "@/features/users/activeUser";
import { localDate } from "@shared/domain/food";
import { ActivityStrip } from "@/features/activity/components";
import { cachedSteps, useHealthSteps } from "@/features/activity/health";
import { dayCredit, useActivityClock } from "@/features/activity/store";

export default function Today() {
  const { profile, targets } = useTargets();
  const userId = useActiveUser((s) => s.userId);
  const now = new Date(useActivityClock());
  const day = localDate(now);
  const health = useHealthSteps(userId, day);
  const credit = dayCredit(userId, day);
  const dailyTargets = targets ? { ...targets, kcal: targets.kcal + credit.kcal } : null;
  const meals = useDayMeals(userId, localDate(now));
  const voiceNotes = useVoiceQueue(userId);
  const consumed = { ...consumedFrom(meals), steps: cachedSteps(userId, day)?.steps ?? null };
  const name = profile.data?.displayName;

  return (
    <Screen withDock header={<AppHeader eyebrow="Today" />}>
      <NetworkBanner />

      <View style={styles.titleRow}>
        <View style={styles.flex}>
          <Text variant="headline-lg" accessibilityRole="header">
            Your activity
          </Text>
          <Text variant="body" color="textSecondary">
            {`${formatDayLong(now)} · ${greeting(now)}${name ? `, ${name}` : ""}`}
          </Text>
        </View>
        {targets ? <StreakChip /> : null}
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
          <DateStrip today={now} />
          <RemainingHero targets={dailyTargets!} consumed={consumed} />
          {credit.kcal > 0 ? (
            <Text
              variant="caption"
              color="primaryText"
            >{`Budget includes +${credit.kcal} estimated activity kcal`}</Text>
          ) : null}
          <MetricTiles targets={targets} consumed={consumed} />
          <ActivityStrip userId={userId} day={day} stepGoal={targets.steps} healthState={health.state} />
          <MacroBalance targets={dailyTargets!} consumed={consumed} />
          {profile.data?.coach ? (
            <CoachLine coach={profile.data.coach} line="Your coach speaks up here once you start logging." muted />
          ) : null}
          <VoiceQueueCard notes={voiceNotes} />
          <NextActionCard
            title={meals.length ? "Log your next meal" : "Log your first meal of the day"}
            onPress={() => router.push("/quick-log")}
          />
          <MealSlots targets={targets} consumed={consumed} meals={meals} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  flex: { flex: 1 },
});
