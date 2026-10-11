// S10 Today Home — P10 shell. Targets come from the profile (P08/P09); consumed values are 0 until
// logging lands. States: loading skeleton, error (offline with no cached profile), not set up yet,
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
import { DateStrip } from "@/features/today/DateStrip";
import {
  MacroBalance,
  MealSlots,
  MetricTiles,
  NextActionCard,
  NOTHING_CONSUMED,
  RemainingHero,
  StreakChip,
} from "@/features/today/TodayCards";

export default function Today() {
  const { profile, targets } = useTargets();
  const now = new Date();
  const consumed = NOTHING_CONSUMED;
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
          <RemainingHero targets={targets} consumed={consumed} />
          <MetricTiles targets={targets} consumed={consumed} />
          <MacroBalance targets={targets} consumed={consumed} />
          {profile.data?.coach ? (
            <CoachLine coach={profile.data.coach} line="Your coach speaks up here once you start logging." muted />
          ) : null}
          <NextActionCard title="Log your first meal of the day" onPress={() => router.push("/quick-log")} />
          <MealSlots targets={targets} consumed={consumed} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  flex: { flex: 1 },
});
