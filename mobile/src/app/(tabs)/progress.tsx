// S33 · Progress hub (P27, with P28–P30 cards). No export yet (D53): built from DESIGN.md §6.7 — the trend vs scale
// chart (7d / 30d / phase), the active phase card, the streak card, this week's stats and "Log weight". The weekly
// check-in card shows on top while this week's check-in is unanswered.
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import { useTheme } from "@/core/theme";
import { Button, Card, EmptyState, IconButton, Screen, SegmentedControl, Skeleton, Text, useToast } from "@/core/ui";
import { NetworkBanner } from "@/core/network/NetworkBanner";
import { useActivityClock } from "@/features/activity/store";
import { formatKg, formatShortDate } from "@/features/targets/format";
import { checkinCopy } from "@/features/progress/copy";
import { CheckinReadyCard, PhaseCard, StreakCard, trendHeadline, WeekStats } from "@/features/progress/components";
import { useProgress, useWeekStats } from "@/features/progress/hooks";
import { TrendChart } from "@/features/progress/TrendChart";
import { deleteWeight, restoreWeight } from "@/features/progress/weights";
import { AppHeader } from "@/features/shell/AppHeader";
import { addDays } from "@shared/domain/progress";

type Range = "7d" | "30d" | "phase";

const RECENT_WEIGH_INS = 5;

export default function Progress() {
  const { colors } = useTheme();
  const toast = useToast();
  const now = useActivityClock();
  const p = useProgress(now);
  const week = useWeekStats(p.userId, p.today);
  const [range, setRange] = useState<Range>("30d");

  const from =
    range === "7d"
      ? addDays(p.today, -6)
      : range === "30d"
        ? addDays(p.today, -29)
        : (p.active?.startDate ?? addDays(p.today, -29));
  const points = useMemo(() => p.series.filter((s) => s.date >= from && s.date <= p.today), [p.series, from, p.today]);
  const recent = p.weights.slice(-RECENT_WEIGH_INS).reverse();
  const detailed = !!p.profile.data?.checkinDetailed;

  const remove = (w: (typeof p.weights)[number]) => {
    deleteWeight(w);
    toast({ kind: "info", message: `${formatKg(w.kg)} kg removed`, onUndo: () => restoreWeight(w) });
  };

  return (
    <Screen withDock header={<AppHeader eyebrow="Progress" />}>
      <NetworkBanner />
      <Text variant="headline-lg" accessibilityRole="header">
        Progress
      </Text>

      {p.profile.isPending ? (
        <>
          <Skeleton variant="card" height={240} />
          <Skeleton variant="card" height={96} />
        </>
      ) : !p.plan ? (
        <EmptyState
          icon="tune"
          title="Set up your plan"
          body="Your trend, phases and weekly check-ins start once you have a plan."
          actionLabel="Set up my plan"
          onAction={() => router.push("/onboarding")}
        />
      ) : (
        <>
          {p.pending ? (
            <CheckinReadyCard
              title={checkinCopy(p.pending, detailed).title}
              onPress={() => router.push("/progress/checkin")}
            />
          ) : null}

          <Card accessibilityLabel="Weight trend">
            <Text variant="title">{trendHeadline(p.latest, p.weekChange)}</Text>
            {p.latest ? (
              <Text variant="caption" color="textSecondary">
                {`Scale ${formatKg(p.latest.scaleKg)} kg on ${formatShortDate(p.latest.date)}`}
              </Text>
            ) : null}
            <View style={styles.segment}>
              <SegmentedControl<Range>
                accessibilityLabel="Chart range"
                value={range}
                onChange={setRange}
                segments={[
                  { value: "7d", label: "7 days" },
                  { value: "30d", label: "30 days" },
                  { value: "phase", label: "Phase" },
                ]}
              />
            </View>
            {points.length ? (
              <TrendChart
                points={points}
                from={from}
                to={p.today}
                targetKg={p.active?.targetWeightKg}
                accessibilityLabel={`${trendHeadline(p.latest, p.weekChange)}. ${points.length} weigh-ins in this range.`}
              />
            ) : (
              <Text variant="body" color="textSecondary" style={styles.empty}>
                {p.series.length ? "No weigh-ins in this range." : "Log your weight to start your trend."}
              </Text>
            )}
            <View style={styles.legend}>
              <View style={[styles.dot, { backgroundColor: colors.textTertiary }]} />
              <Text variant="caption" color="textSecondary">
                Scale
              </Text>
              <View style={[styles.line, { backgroundColor: colors.primary }]} />
              <Text variant="caption" color="textSecondary">
                Trend
              </Text>
            </View>
            <Button label="Log weight" icon="monitor_weight" onPress={() => router.push("/log-weight")} fullWidth />
          </Card>

          {p.active ? (
            <PhaseCard
              phase={p.active}
              series={p.series}
              today={p.today}
              onPress={() => router.push(`/progress/phase/${p.active!.id}`)}
            />
          ) : null}
          <Button label="All phases" variant="ghost" icon="history" onPress={() => router.push("/progress/phases")} />

          {p.streak ? <StreakCard streak={p.streak} onPress={() => router.push("/progress/streak")} /> : null}

          <Text variant="title" accessibilityRole="header">
            This week
          </Text>
          <WeekStats {...week} />

          {recent.length ? (
            <Card eyebrow="Weigh-ins">
              {recent.map((w) => (
                <View key={w.id} style={styles.row}>
                  <Text variant="body" tabular style={styles.flex}>
                    {`${formatKg(w.kg)} kg`}
                  </Text>
                  <Text variant="caption" color="textSecondary">
                    {formatShortDate(w.localDate)}
                  </Text>
                  <IconButton
                    icon="delete"
                    accessibilityLabel={`Delete ${formatKg(w.kg)} kg`}
                    onPress={() => remove(w)}
                  />
                </View>
              ))}
            </Card>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  segment: { marginVertical: 12 },
  empty: { paddingVertical: 24, textAlign: "center" },
  legend: { flexDirection: "row", alignItems: "center", gap: 6, marginVertical: 12 },
  dot: { width: 8, height: 8, borderRadius: 4, opacity: 0.6 },
  line: { width: 16, height: 3, borderRadius: 2, marginLeft: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  flex: { flex: 1 },
});
