// S35 · Weekly check-in (P28). No export yet (D53): built from DESIGN.md §6.7. Variants (D50): Simple ("On track ✓",
// one sentence) or Detailed (estimated-burn chart, the change explained) by the profile setting, and Not enough data
// ("Log 5 of 7 days…"). "Accept new target" / "Keep current" store the answer as the week's target history.
// UX F1: confetti only for an accepted on-track week, and then the toast stays silent (one haptic, not two).
import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { useTheme } from "@/core/theme";
import { Button, Card, EmptyState, Header, Screen, StatTile, Text, useToast } from "@/core/ui";
import { burstConfetti } from "@/features/celebrate/ConfettiBurst";
import { useActivityClock } from "@/features/activity/store";
import { LineChart } from "@/features/gym/LineChart";
import { answerCheckin, type CheckinStatus } from "@/features/progress/checkins";
import { checkinCopy } from "@/features/progress/copy";
import { useProgress } from "@/features/progress/hooks";
import { formatInt, formatShortDate } from "@/features/targets/format";
import { addDays, dayNumber, weekday } from "@shared/domain/progress";

const BURN_WEEKS = 6;

export default function CheckinScreen() {
  const { colors } = useTheme();
  const toast = useToast();
  const p = useProgress(useActivityClock());
  const [showBurn, setShowBurn] = useState(false);
  const detailed = !!p.profile.data?.checkinDetailed;
  const back = () => router.back();

  if (!p.pending || !p.userId) {
    const next = addDays(p.today, 7 - weekday(p.today));
    return (
      <Screen header={<Header title="Weekly check-in" onBack={back} />}>
        <EmptyState
          icon="check_circle"
          title="You're all caught up"
          body={`Your next check-in is on Sunday, ${formatShortDate(next)}.`}
          actionLabel="Back"
          onAction={back}
        />
      </Screen>
    );
  }

  const pending = p.pending;
  const r = pending.result;
  const copy = checkinCopy(pending, detailed);
  const answer = (status: CheckinStatus) => {
    answerCheckin(p.userId!, pending, status);
    const party = status === "accepted" && r.status === "ready" && r.onTrack;
    if (party) burstConfetti();
    toast({
      haptic: party ? "none" : undefined,
      kind: "success",
      message:
        r.status === "ready" && status === "accepted" && r.changeKcal !== 0
          ? `New target: ${formatInt(r.newKcal)} kcal`
          : "Check-in saved",
    });
    back();
  };

  const burn = [
    ...p.checkins
      .filter((c) => c.estimatedBurnKcal != null)
      .slice(-(BURN_WEEKS - 1))
      .map((c) => ({ at: dayNumber(c.checkinDate) * 86_400_000, value: c.estimatedBurnKcal! })),
    ...(r.status === "ready"
      ? [{ at: dayNumber(pending.window.checkinDate) * 86_400_000, value: r.estimatedBurnKcal }]
      : []),
  ];

  return (
    <Screen
      header={
        <Header title="Weekly check-in" eyebrow={`Week of ${formatShortDate(pending.window.start)}`} onBack={back} />
      }
    >
      <Card variant={r.status === "ready" && r.onTrack ? "highlighted" : "default"}>
        <Text
          variant="headline-md"
          color={r.status === "ready" && r.onTrack ? "ink" : "textPrimary"}
          accessibilityRole="header"
        >
          {copy.title}
        </Text>
        <Text variant="body-lg" color={r.status === "ready" && r.onTrack ? "ink" : "textSecondary"}>
          {copy.body}
        </Text>
        {copy.notes.map((n) => (
          <Text key={n} variant="caption" color={r.status === "ready" && r.onTrack ? "ink" : "warn"}>
            {n}
          </Text>
        ))}
      </Card>

      {r.status === "ready" ? (
        <>
          <View style={styles.tiles}>
            <StatTile value={formatInt(r.newKcal)} unit="kcal" label="Calories" color={colors.dataKcal} />
            <StatTile value={formatInt(r.proteinG)} unit="g" label="Protein" color={colors.dataProtein} />
          </View>
          <View style={styles.tiles}>
            <StatTile value={formatInt(r.carbsG)} unit="g" label="Carbs" color={colors.dataCarbs} />
            <StatTile value={formatInt(r.fatG)} unit="g" label="Fat" color={colors.dataFat} />
          </View>
          <Text variant="caption" color="textSecondary">
            {`Based on ${r.loggedDays} of 7 days logged · was ${formatInt(pending.previousKcal)} kcal`}
          </Text>

          {detailed && burn.length ? (
            <Card>
              <Button
                label={showBurn ? "Hide estimated burn" : "Show estimated burn"}
                variant="ghost"
                icon="show_chart"
                onPress={() => setShowBurn((v) => !v)}
              />
              {showBurn ? (
                <LineChart
                  points={burn}
                  color={colors.dataKcal}
                  format={(v) => formatInt(Math.round(v / 10) * 10)}
                  accessibilityLabel={`Estimated daily burn over ${burn.length} weeks, latest ${formatInt(burn[burn.length - 1]!.value)} kcal`}
                />
              ) : null}
            </Card>
          ) : null}

          {r.changeKcal !== 0 ? (
            <>
              <Button label="Accept new target" onPress={() => answer("accepted")} fullWidth glow />
              <Button label="Keep current" variant="ghost" onPress={() => answer("kept")} fullWidth />
            </>
          ) : (
            <Button label="Got it" onPress={() => answer("accepted")} fullWidth />
          )}
        </>
      ) : (
        <Button label="Got it" onPress={() => answer("skipped")} fullWidth />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: "row", gap: 8 },
});
