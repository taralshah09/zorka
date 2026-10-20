// S27 · Exercise history (P21). No export yet: built from DESIGN.md §6.5 (D41). Best set, estimated max,
// the progress line (top set / est. 1RM / volume over 3, 6 or 12 months, and now vs 3, 6 and 12 months ago:
// StrengthTrend) and the session list, plus the MuscleWiki how-to link (D38). Your own exercises can be edited or
// deleted here.
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
  StatTile,
  Text,
  Screen,
  useToast,
} from "@/core/ui";
import { deleteExercise, useExercise } from "@/features/gym/catalog";
import { ExerciseTile, PRBadge } from "@/features/gym/components";
import { formatDay } from "@/features/gym/format";
import { useExerciseSessions } from "@/features/gym/store";
import { StrengthTrend } from "@/features/gym/StrengthTrend";
import { useActiveUser } from "@/features/users/activeUser";
import {
  bestsOf,
  CATEGORY_LABEL,
  formatClock,
  formatKg,
  formatSet,
  topSet,
  TYPE_LABEL,
} from "@shared/domain/gym";

export default function ExerciseHistory() {
  const { colors } = useTheme();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = useActiveUser((s) => s.userId);
  const exercise = useExercise(userId, id);
  const sessions = useExerciseSessions(userId, id);
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

          <StrengthTrend type={type} sessions={sessions} now={openedAt} />

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
