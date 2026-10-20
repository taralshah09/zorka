// Train analytics · How one exercise has moved: a line of one value per session (top set, est. 1RM or volume for
// weight + reps; reps, time or distance otherwise) over the last 3, 6 or 12 months, and "now vs 3, 6 and 12 months
// ago" underneath (shared/domain/gym.ts compareMonthsAgo). Record sessions are the larger, filled dots. Used on each
// exercise's page and on the Analytics screen.
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { useTheme } from "@/core/theme";
import { Card, SegmentedControl, Text } from "@/core/ui";
import { formatDay, formatVolume } from "@/features/gym/format";
import { LineChart, type ChartPoint } from "@/features/gym/LineChart";
import type { ExerciseSession } from "@/features/gym/store";
import { localDate } from "@shared/domain/food";
import {
  compareMonthsAgo,
  e1rm,
  formatClock,
  formatKg,
  formatSet,
  setVolume,
  topSet,
  TREND_MONTHS,
  withinMonths,
  type ExerciseType,
  type PrKind,
  type TrendMonths,
} from "@shared/domain/gym";

export type Metric = "top" | "e1rm" | "volume";

/** What each chart shows, in plain words. */
const METRIC_HELP: Record<Metric, string> = {
  top: "Your heaviest set in each session.",
  e1rm: "The most you could lift once, estimated from weight × reps of your best set.",
  volume: "Weight × reps of every set, added up per session.",
};

/** The record kinds that count as a record on this chart (volume has none). */
function prKindsFor(type: ExerciseType, metric: Metric): readonly PrKind[] {
  switch (type) {
    case "weight_reps":
      return metric === "top" ? ["weight", "reps"] : metric === "e1rm" ? ["e1rm"] : [];
    case "reps":
      return ["reps"];
    case "time":
      return ["time"];
    case "distance_time":
      return ["distance"];
  }
}

/** One number per session for the chart. */
export function sessionValue(type: ExerciseType, metric: Metric, s: ExerciseSession): number | null {
  const top = topSet(type, s.sets);
  if (!top) return null;
  switch (type) {
    case "weight_reps":
      if (metric === "volume") return s.sets.reduce((sum, x) => sum + setVolume(type, x), 0);
      if (metric === "e1rm") return Math.max(0, ...s.sets.map((x) => e1rm(x.weightKg, x.reps) ?? 0)) || null;
      return top.weightKg;
    case "reps":
      return top.reps;
    case "time":
      return top.durationS;
    case "distance_time":
      return top.distanceM === null ? null : top.distanceM / 1000;
  }
}

/** A value in this chart's unit ("62.5 kg", "1:30", "12"). */
export function formatValue(type: ExerciseType, metric: Metric, v: number): string {
  if (type === "time") return formatClock(v);
  if (type === "distance_time") return `${formatKg(Math.round(v * 10) / 10)} km`;
  if (type === "reps") return `${Math.round(v)} reps`;
  if (metric === "volume") return formatVolume(v);
  return `${formatKg(Math.round(v * 10) / 10)} kg`;
}

const RANGE_LABEL: Record<TrendMonths, string> = { 3: "3M", 6: "6M", 12: "12M" };

export function StrengthTrend({
  type,
  sessions,
  now,
}: {
  type: ExerciseType;
  /** Newest first, as useExerciseSessions gives them. */
  sessions: readonly ExerciseSession[];
  /** When the ranges end (the screen's opening time). */
  now: number;
}) {
  const { colors } = useTheme();
  const [metric, setMetric] = useState<Metric>("top");
  const [months, setMonths] = useState<TrendMonths>(3);
  const today = localDate(new Date(now));
  const recordKinds = prKindsFor(type, metric);

  // One workout per day, so one point per day; oldest first.
  const all = sessions
    .map((s) => ({ s, date: localDate(new Date(s.startedAt)), value: sessionValue(type, metric, s) }))
    .filter((p): p is { s: ExerciseSession; date: string; value: number } => p.value !== null)
    .reverse();
  const inRange = new Set(withinMonths(all, today, months).map((p) => p.date));
  const shown = all.filter((p) => inRange.has(p.date));
  const points: ChartPoint[] = shown.map((p) => ({
    at: new Date(p.s.startedAt).getTime(),
    value: p.value,
    highlight: p.s.sets.some((x) => x.prKinds.some((k) => recordKinds.includes(k))),
  }));
  const fmt = (v: number) => formatValue(type, metric, v);
  const comparisons = TREND_MONTHS.map((m) => compareMonthsAgo(all, today, m));

  const describe = (_: ChartPoint, i: number) => {
    const p = shown[i]!;
    const day = formatDay(p.s.startedAt);
    if (type === "weight_reps" && metric === "volume") return `${day} · ${formatVolume(p.value)} over ${p.s.sets.length} sets`;
    const top = topSet(type, p.s.sets);
    return `${day} · ${metric === "e1rm" ? fmt(p.value) : top ? formatSet(type, top) : fmt(p.value)}`;
  };

  return (
    <Card eyebrow="Progress">
      {type === "weight_reps" ? (
        <SegmentedControl
          accessibilityLabel="Chart shows"
          value={metric}
          onChange={setMetric}
          segments={[
            { value: "top", label: "Top set" },
            { value: "e1rm", label: "Est. 1RM" },
            { value: "volume", label: "Volume" },
          ]}
        />
      ) : null}
      <Text variant="caption" color="textSecondary" style={styles.help}>
        {type === "weight_reps"
          ? METRIC_HELP[metric]
          : type === "reps"
            ? "Your most reps in a set, each session."
            : "Your best set in each session."}
      </Text>
      <View style={styles.chart}>
        {points.length >= 2 ? (
          <LineChart
            points={points}
            color={metric === "e1rm" ? colors.dataProtein : colors.primary}
            highlightColor={metric === "e1rm" ? colors.primary : colors.secondary}
            format={fmt}
            describe={describe}
            accessibilityLabel={`Progress over the last ${months} months, ${points.length} sessions, from ${fmt(points[0]!.value)} to ${fmt(points[points.length - 1]!.value)}`}
          />
        ) : (
          <Text variant="body" color="textSecondary">
            {all.length >= 2
              ? `Fewer than 2 sessions in the last ${months} months. Try a longer range.`
              : "Log this exercise on 2 days to see a trend."}
          </Text>
        )}
      </View>
      <SegmentedControl
        accessibilityLabel="Chart range"
        value={String(months) as "3" | "6" | "12"}
        onChange={(v) => setMonths(Number(v) as TrendMonths)}
        segments={TREND_MONTHS.map((m) => ({ value: String(m) as "3" | "6" | "12", label: RANGE_LABEL[m] }))}
      />

      <View style={styles.compare}>
        <Text variant="label" color="textSecondary">
          {`Now${comparisons[0]!.now ? ` · ${fmt(comparisons[0]!.now.value)} (${formatDay(`${comparisons[0]!.now.date}T12:00:00`)})` : ""}`}
        </Text>
        {comparisons.map((c) => (
          <View key={c.months} style={styles.compareRow} accessible accessibilityLabel={compareText(c, fmt)}>
            <Text variant="body" style={styles.flex}>
              {`vs ${c.months} months ago`}
            </Text>
            <Text
              variant="title"
              tabular
              style={{ color: c.change === null ? colors.textTertiary : c.change > 0 ? colors.primaryText : c.change < 0 ? colors.warn : colors.textSecondary }}
            >
              {c.change === null ? "—" : `${c.change > 0 ? "+" : c.change < 0 ? "−" : "±"}${fmt(Math.abs(c.change))}`}
            </Text>
            <Text variant="caption" color="textSecondary" tabular style={styles.then}>
              {c.then ? `from ${fmt(c.then.value)}` : "no session then"}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

function compareText(c: ReturnType<typeof compareMonthsAgo>, fmt: (v: number) => string): string {
  if (c.change === null || !c.then || !c.now) return `${c.months} months ago: no session to compare`;
  return `${c.months} months ago ${fmt(c.then.value)}, now ${fmt(c.now.value)}`;
}

const styles = StyleSheet.create({
  help: { marginTop: 10 },
  chart: { marginVertical: 12, minHeight: 60, justifyContent: "center" },
  compare: { marginTop: 14, gap: 8 },
  compareRow: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  flex: { flex: 1 },
  then: { minWidth: 96, textAlign: "right" },
});
