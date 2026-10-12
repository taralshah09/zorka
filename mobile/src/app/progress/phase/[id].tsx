// S38 · Phase detail (active) and S39 · Phase summary (closed) (P29). No exports yet (D53): built from DESIGN.md §6.7.
// Active: progress to goal, week-by-week targets (the phase's check-ins), weight chart, key stats, and the "Goal
// reached! Close this phase?" banner once the trend crosses the target. Closed: the frozen summary line, its chart and
// stats, Share (P38 phase card) and "Start next phase".
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import { useTheme } from "@/core/theme";
import { Button, Card, Dialog, EmptyState, Header, ProgressBar, Screen, StatTile, Text, useToast } from "@/core/ui";
import { useActivityClock } from "@/features/activity/store";
import { celebrate } from "@/features/celebrate/celebrations";
import { phaseProgress, phaseWeek, summaryLine } from "@/features/progress/components";
import { GOAL_LABEL } from "@/features/onboarding/copy";
import { useProgress } from "@/features/progress/hooks";
import { closePhase, computeSummary } from "@/features/progress/phases";
import { TrendChart } from "@/features/progress/TrendChart";
import { formatInt, formatKg, formatShortDate } from "@/features/targets/format";
import { goalReached, trendOn } from "@shared/domain/progress";

const CHECKIN_LABEL = { accepted: "Adjusted", kept: "Kept", skipped: "Not enough data" } as const;

export default function PhaseDetail() {
  const { colors } = useTheme();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const p = useProgress(useActivityClock());
  const phase = p.phases.find((ph) => ph.id === id) ?? null;
  const [confirmClose, setConfirmClose] = useState(false);

  const end = phase?.closedDate ?? p.today;
  const stats = useMemo(
    () => (phase ? (phase.summary ?? computeSummary(phase, end, p.series)) : null),
    [phase, end, p.series],
  );
  if (!phase || !stats) {
    return (
      <Screen header={<Header title="Phase" onBack={() => router.back()} />}>
        <EmptyState
          icon="history"
          title="Phase not found"
          actionLabel="All phases"
          onAction={() => router.replace("/progress/phases")}
        />
      </Screen>
    );
  }

  const closed = !!phase.closedDate;
  const points = p.series.filter((s) => s.date >= phase.startDate && s.date <= end);
  const trendNow = trendOn(p.series, end);
  const reached = !closed && goalReached(phase.goal, phase.targetWeightKg, trendNow);
  const progress = phaseProgress(phase, p.series, end);
  const weekly = p.checkins.filter((c) => c.phaseId === phase.id);
  const close = () => {
    closePhase(phase, p.series);
    setConfirmClose(false);
    toast({ kind: "success", message: `${phase.name} closed` });
    celebrate(phase.userId, `phase:${phase.id}`, { kind: "phase", id: phase.id, detail: phase.name });
  };

  return (
    <Screen
      header={
        <Header
          title={phase.name}
          eyebrow={closed ? "Phase summary" : phaseWeek(phase, p.today)}
          onBack={() => router.back()}
        />
      }
    >
      {reached ? (
        <Card variant="highlighted" accessibilityLabel="Goal reached">
          <Text variant="title" color="ink">
            Goal reached! Close this phase?
          </Text>
          <Text variant="body" color="ink">
            {`Your trend is ${formatKg(trendNow!)} kg against a goal of ${formatKg(phase.targetWeightKg!)} kg.`}
          </Text>
          <Button label="Close phase" variant="secondary" size="sm" onPress={() => setConfirmClose(true)} />
        </Card>
      ) : null}

      <Card>
        {closed ? (
          <Text variant="headline-sm">{summaryLine(stats)}</Text>
        ) : (
          <Text variant="title">
            {[GOAL_LABEL[phase.goal], phase.targetWeightKg != null ? `goal ${formatKg(phase.targetWeightKg)} kg` : null]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        )}
        <Text variant="caption" color="textSecondary">
          {`${formatShortDate(phase.startDate)} – ${closed ? formatShortDate(phase.closedDate!) : phase.endDate ? `${formatShortDate(phase.endDate)} (planned)` : "open-ended"}`}
        </Text>
        {!closed && progress != null ? (
          <View style={styles.bar}>
            <ProgressBar
              progress={progress}
              color={colors.primary}
              accessibilityLabel={`${Math.round(progress * 100)}% of the way`}
            />
            {phase.targetWeightKg != null && trendNow != null ? (
              <Text variant="caption" color="textSecondary">
                {`${formatKg(Math.abs(trendNow - phase.targetWeightKg))} kg to go`}
              </Text>
            ) : null}
          </View>
        ) : null}
      </Card>

      <Card eyebrow="Weight">
        {points.length ? (
          <TrendChart
            points={points}
            from={phase.startDate}
            to={end}
            targetKg={phase.targetWeightKg}
            accessibilityLabel={`Weight during ${phase.name}, ${points.length} weigh-ins`}
          />
        ) : (
          <Text variant="body" color="textSecondary">
            No weigh-ins in this phase yet.
          </Text>
        )}
      </Card>

      <View style={styles.tiles}>
        <StatTile
          value={
            stats.changeKg != null
              ? `${stats.changeKg < 0 ? "−" : stats.changeKg > 0 ? "+" : ""}${formatKg(Math.abs(stats.changeKg))}`
              : "–"
          }
          unit="kg"
          label="Trend change"
          color={colors.primary}
        />
        <StatTile
          value={stats.avgProteinG != null ? formatInt(stats.avgProteinG) : "–"}
          unit="g / day"
          label="Avg protein"
          color={colors.dataProtein}
        />
      </View>
      <View style={styles.tiles}>
        <StatTile
          value={String(stats.workouts)}
          unit={`workouts · ${stats.prs} PRs`}
          label="Gym"
          color={colors.secondary}
        />
        <StatTile value={String(+stats.distanceKm.toFixed(1))} unit="km" label="Distance" color={colors.dataActivity} />
      </View>
      <Text variant="caption" color="textSecondary">
        {`${stats.loggedDays} of ${stats.days} days with food logged${stats.avgKcal != null ? ` · avg ${formatInt(stats.avgKcal)} kcal` : ""}`}
      </Text>

      <Card eyebrow="Week by week">
        {weekly.length ? (
          weekly.map((c) => (
            <View key={c.id} style={styles.row}>
              <Text variant="body" style={styles.flex}>
                {formatShortDate(c.checkinDate)}
              </Text>
              <Text variant="caption" color="textSecondary">
                {CHECKIN_LABEL[c.status]}
              </Text>
              <Text variant="body" tabular>
                {`${formatInt(c.status === "accepted" && c.newKcal != null ? c.newKcal : c.previousKcal)} kcal`}
              </Text>
            </View>
          ))
        ) : (
          <Text variant="body" color="textSecondary">
            Weekly check-ins in this phase show up here.
          </Text>
        )}
      </Card>

      {closed ? (
        <>
          <Button
            label="Share"
            icon="ios_share"
            variant="secondary"
            onPress={() => router.push({ pathname: "/share", params: { card: "phase", id: phase.id } })}
          />
          <Button label="Start next phase" icon="add" onPress={() => router.push("/progress/phase-edit")} fullWidth />
        </>
      ) : (
        <>
          <Button
            label="Edit phase"
            icon="edit"
            variant="secondary"
            onPress={() => router.push({ pathname: "/progress/phase-edit", params: { id: phase.id } })}
          />
          {!reached ? <Button label="Close phase" variant="ghost" onPress={() => setConfirmClose(true)} /> : null}
        </>
      )}

      <Dialog
        visible={confirmClose}
        title={`Close ${phase.name}?`}
        body="Its summary is saved and you can start the next phase. Logs after today won't count toward it."
        confirmLabel="Close phase"
        onConfirm={close}
        onCancel={() => setConfirmClose(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  bar: { marginTop: 12, gap: 6 },
  tiles: { flexDirection: "row", gap: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 },
  flex: { flex: 1 },
});
