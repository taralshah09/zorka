// S27 · Exercise history (P21). No export yet: built from DESIGN.md §6.5 (D41). Best set, estimated max,
// a progress chart (top set / est. 1RM / volume, 12 weeks or all time) and the session list, plus the
// MuscleWiki how-to link (D38). Your own exercises can be edited or deleted here.
// The chart is one bar per workout day with the value written on it (weight over "× reps" for the top set); record
// days are highlighted. It says what it shows (one line per metric), how much it moved over the range, and reads out
// the set behind any bar you tap.
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Linking, StyleSheet, View } from "react-native";

import { useTheme } from "@/core/theme";
import {
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  Header,
  IconButton,
  SegmentedControl,
  StatTile,
  Text,
  Screen,
  useToast,
} from "@/core/ui";
import { deleteExercise, useExercise } from "@/features/gym/catalog";
import { ExerciseTile, PRBadge } from "@/features/gym/components";
import { formatDay, formatVolume } from "@/features/gym/format";
import { BarChart, type Bar } from "@/features/gym/BarChart";
import { useExerciseSessions, type ExerciseSession } from "@/features/gym/store";
import { useActiveUser } from "@/features/users/activeUser";
import {
  bestsOf,
  CATEGORY_LABEL,
  e1rm,
  formatClock,
  formatKg,
  formatSet,
  setVolume,
  topSet,
  TYPE_LABEL,
  type ExerciseType,
  type PrKind,
} from "@shared/domain/gym";

type Metric = "top" | "e1rm" | "volume";
type Range = "12w" | "all";

const TWELVE_WEEKS_MS = 84 * 86_400_000;

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

/** The set behind a session's e1RM point. */
const bestE1rmSet = (s: ExerciseSession) =>
  s.sets.reduce<ExerciseSession["sets"][number] | null>(
    (b, x) => ((e1rm(x.weightKg, x.reps) ?? 0) > (b ? (e1rm(b.weightKg, b.reps) ?? 0) : 0) ? x : b),
    null,
  );

/** One number per session for the chart. */
function sessionValue(type: ExerciseType, metric: Metric, s: ExerciseSession): number | null {
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

export default function ExerciseHistory() {
  const { colors } = useTheme();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = useActiveUser((s) => s.userId);
  const exercise = useExercise(userId, id);
  const sessions = useExerciseSessions(userId, id);
  const [metric, setMetric] = useState<Metric>("top");
  const [range, setRange] = useState<Range>("12w");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [openedAt] = useState(() => Date.now());

  if (!userId) return null;
  if (!exercise) {
    return (
      <Screen header={<Header title="Exercise" onBack={() => router.back()} />}>
        <EmptyState icon="search" title="This exercise isn't in your list" body="It may have been deleted." />
      </Screen>
    );
  }

  const type = exercise.type;
  const allSets = sessions.flatMap((s) => s.sets);
  const bests = bestsOf(type, allSets);
  const best = topSet(type, allSets);
  const since = openedAt - TWELVE_WEEKS_MS;
  const recordKinds = prKindsFor(type, metric);
  const charted = sessions
    .filter((s) => range === "all" || new Date(s.startedAt).getTime() >= since)
    .map((s) => ({ session: s, value: sessionValue(type, metric, s) }))
    .filter((c): c is { session: ExerciseSession; value: number } => c.value !== null)
    .reverse();
  /** What's written on a bar: the number, and a second line (reps for a top set, else the unit). */
  const barText = (session: ExerciseSession, value: number): { label: string; sub?: string } => {
    switch (type) {
      case "weight_reps": {
        if (metric === "volume") {
          return { label: value >= 1000 ? `${(value / 1000).toFixed(1)}k` : `${Math.round(value)}`, sub: "kg" };
        }
        if (metric === "e1rm") return { label: formatKg(Math.round(value * 10) / 10), sub: "kg" };
        const top = topSet(type, session.sets);
        return { label: formatKg(value), sub: top?.reps ? `× ${top.reps}` : undefined };
      }
      case "reps":
        return { label: String(Math.round(value)), sub: "reps" };
      case "time":
        return { label: formatClock(value) };
      case "distance_time":
        return { label: formatKg(Math.round(value * 10) / 10), sub: "km" };
    }
  };
  const points: Bar[] = charted.map(({ session, value }) => ({
    at: new Date(session.startedAt).getTime(),
    value,
    highlight: session.sets.some((x) => x.prKinds.some((k) => recordKinds.includes(k))),
    ...barText(session, value),
  }));
  const fmt = (v: number) =>
    type === "time"
      ? formatClock(v)
      : type === "distance_time"
        ? `${formatKg(Math.round(v * 10) / 10)} km`
        : type === "reps"
          ? `${Math.round(v)}`
          : metric === "volume"
            ? formatVolume(v)
            : `${formatKg(Math.round(v * 10) / 10)} kg`;

  const describe = (_: Bar, i: number) => {
    const c = charted[i]!;
    const day = formatDay(c.session.startedAt);
    if (type === "weight_reps" && metric === "volume") {
      return `${day} · ${formatVolume(c.value)} over ${c.session.sets.length} sets`;
    }
    if (type === "weight_reps" && metric === "e1rm") {
      const from = bestE1rmSet(c.session);
      return `${day} · ${fmt(c.value)}${from ? ` (from ${formatSet(type, from)})` : ""}`;
    }
    const top = topSet(type, c.session.sets);
    return `${day} · ${top ? formatSet(type, top) : fmt(c.value)}`;
  };
  const first = points[0];
  const last = points[points.length - 1];
  const delta = first && last ? last.value - first.value : 0;
  const change =
    first && last && points.length >= 2
      ? Math.abs(delta) < 1e-9
        ? `No change since ${formatDay(charted[0]!.session.startedAt)}`
        : `${delta > 0 ? "+" : "−"}${fmt(Math.abs(delta))} since ${formatDay(charted[0]!.session.startedAt)}`
      : null;

  const tiles =
    type === "weight_reps"
      ? [
          {
            value: bests.weightKg ? formatKg(bests.weightKg) : "—",
            unit: "kg",
            label: "Heaviest",
            color: colors.dataKcal,
          },
          { value: bests.e1rm ? formatKg(bests.e1rm) : "—", unit: "kg", label: "Est. 1RM", color: colors.dataProtein },
        ]
      : type === "reps"
        ? [{ value: bests.reps ? String(bests.reps) : "—", unit: "reps", label: "Most reps", color: colors.dataKcal }]
        : type === "time"
          ? [
              {
                value: bests.durationS ? formatClock(bests.durationS) : "—",
                unit: "m:ss",
                label: "Longest",
                color: colors.dataKcal,
              },
            ]
          : [
              {
                value: bests.distanceM ? formatKg(Math.round(bests.distanceM / 100) / 10) : "—",
                unit: "km",
                label: "Longest",
                color: colors.dataKcal,
              },
            ];

  return (
    <Screen
      header={
        <Header
          title={exercise.name}
          onBack={() => router.back()}
          right={
            exercise.custom ? (
              <>
                <IconButton
                  icon="edit"
                  accessibilityLabel="Edit exercise"
                  onPress={() => router.push({ pathname: "/train/create-exercise", params: { id: exercise.id } })}
                />
                <IconButton icon="delete" accessibilityLabel="Delete exercise" onPress={() => setConfirmDelete(true)} />
              </>
            ) : undefined
          }
        />
      }
    >
      <View style={styles.head}>
        <ExerciseTile category={exercise.category} size={52} />
        <View style={styles.flex}>
          <Text variant="headline-md" accessibilityRole="header">
            {exercise.name}
          </Text>
          <View style={styles.badges}>
            <Badge label={CATEGORY_LABEL[exercise.category]} tone="lilac" />
            <Badge label={TYPE_LABEL[type]} />
            {exercise.custom ? <Badge label="Yours" tone="orchid" /> : null}
          </View>
        </View>
      </View>

      {exercise.referenceUrl ? (
        <Button
          label="How to do it · MuscleWiki"
          icon="open_in_new"
          variant="secondary"
          fullWidth
          onPress={() => void Linking.openURL(exercise.referenceUrl!)}
          accessibilityHint="Opens musclewiki.com in your browser"
        />
      ) : null}

      {sessions.length ? (
        <>
          <Card eyebrow="Personal records">
            <View style={styles.tiles}>
              {tiles.map((t) => (
                <StatTile key={t.label} {...t} />
              ))}
            </View>
            {best ? (
              <Text variant="body" color="textSecondary" style={styles.bestLine}>
                {`Best set: ${formatSet(type, best)}`}
              </Text>
            ) : null}
          </Card>

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
            {change ? (
              <Text variant="title" tabular>
                {change}
              </Text>
            ) : null}
            <View style={styles.chart}>
              {points.length >= 2 ? (
                <BarChart
                  bars={points}
                  color={metric === "e1rm" ? colors.dataProtein : colors.primary}
                  highlightColor={metric === "e1rm" ? colors.primary : colors.secondary}
                  describe={describe}
                  accessibilityLabel={`Progress over ${points.length} sessions, from ${fmt(points[0]!.value)} to ${fmt(points[points.length - 1]!.value)}`}
                />
              ) : (
                <Text variant="body" color="textSecondary">
                  {range === "12w" && sessions.length >= 2
                    ? "Fewer than 2 sessions in the last 12 weeks. Try All time."
                    : "Log this exercise in 2 sessions to see a trend."}
                </Text>
              )}
            </View>
            <SegmentedControl
              accessibilityLabel="Chart range"
              value={range}
              onChange={setRange}
              segments={[
                { value: "12w", label: "12 weeks" },
                { value: "all", label: "All time" },
              ]}
            />
          </Card>

          <Text variant="headline-sm" accessibilityRole="header">
            Sessions
          </Text>
          {sessions.map((s) => {
            const prKinds = [...new Set(s.sets.flatMap((x) => x.prKinds))];
            return (
              <Card
                key={s.workoutId}
                onPress={() => router.push({ pathname: "/train/summary/[id]", params: { id: s.workoutId } })}
                accessibilityLabel={`${formatDay(s.startedAt)}, ${s.sets.length} sets`}
              >
                <View style={styles.sessionHead}>
                  <View style={styles.flex}>
                    <Text variant="title">{formatDay(s.startedAt)}</Text>
                    <Text variant="caption" color="textSecondary" numberOfLines={1}>
                      {s.workoutName}
                    </Text>
                  </View>
                  <PRBadge kinds={prKinds} />
                </View>
                <Text variant="body" tabular style={styles.sets}>
                  {s.sets.map((x) => formatSet(type, x)).join("  ·  ")}
                </Text>
              </Card>
            );
          })}
        </>
      ) : (
        <EmptyState
          icon="show_chart"
          title="No sessions yet"
          body="Log this exercise in a workout and its records and chart show up here."
        />
      )}

      <Dialog
        visible={confirmDelete}
        title={`Delete ${exercise.name}?`}
        body="It leaves your list. Past workouts keep their sets."
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          setConfirmDelete(false);
          deleteExercise(userId, exercise);
          toast({ kind: "info", message: `${exercise.name} deleted` });
          router.back();
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  flex: { flex: 1, gap: 4 },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tiles: { flexDirection: "row", gap: 12 },
  bestLine: { marginTop: 12 },
  help: { marginTop: 10 },
  chart: { marginVertical: 12, minHeight: 60, justifyContent: "center" },
  sessionHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  sets: { marginTop: 8 },
});
