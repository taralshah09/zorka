// S25 · A day's workout summary (P19, PRs P20). One workout per day, saved as it's logged: stat tiles (volume,
// sets, records), every exercise's ticked sets with their PR badges, Share (P38: the PR cards, when the day set a
// record) and Done. Also where a day's workout is deleted.
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { useTheme } from "@/core/theme";
import { Button, Card, Dialog, EmptyState, Header, Screen, StatTile, Text, useToast } from "@/core/ui";
import { celebrate } from "@/features/celebrate/celebrations";
import { burstOnce } from "@/features/celebrate/ConfettiBurst";
import { ExerciseTile, PRBadge } from "@/features/gym/components";
import { formatDay } from "@/features/gym/format";
import { deleteWorkout, useWorkout, workoutStats } from "@/features/gym/store";
import { localDate } from "@shared/domain/food";
import { formatSet } from "@shared/domain/gym";

export default function WorkoutSummary() {
  const { colors } = useTheme();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const workout = useWorkout(id);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const today = !!workout && workout.localDate === localDate(new Date());
  const firstPr = workout && today ? workoutStats(workout).prs[0] : undefined;

  // P39: the first time today's summary shows a record, the PR celebration opens (once per day's workout); a day
  // without one gets a confetti burst once.
  useEffect(() => {
    if (!workout || !today || !workoutStats(workout).sets) return;
    if (!firstPr) {
      burstOnce(workout.userId, `workout:${workout.id}`);
      return;
    }
    celebrate(workout.userId, `pr:${workout.id}`, {
      kind: "pr",
      id: workout.id,
      detail: `${firstPr.exerciseName} · ${formatSet(firstPr.type, firstPr.set)}`,
    });
  }, [workout, firstPr, today]);

  if (!workout) {
    return (
      <Screen header={<Header title="Workout" onBack={() => router.back()} />}>
        <EmptyState icon="fitness_center" title="Workout not found" body="It may have been deleted." />
      </Screen>
    );
  }

  const stats = workoutStats(workout);

  return (
    <Screen header={<Header title={today ? "Today's workout" : workout.name} onBack={() => router.back()} />}>
      <View>
        <Text variant="headline-lg" accessibilityRole="header">
          {workout.name}
        </Text>
        <Text variant="body" color="textSecondary">
          {`${formatDay(workout.startedAt)}${workout.synced ? "" : " · saved on this phone"}${today ? " · anything else you log today joins it" : ""}`}
        </Text>
      </View>

      <View style={styles.tiles}>
        <StatTile
          value={Math.round(stats.volumeKg).toLocaleString("en-IN")}
          unit="kg"
          label="Volume"
          color={colors.dataKcal}
        />
        <StatTile value={String(stats.sets)} unit="sets" label="Sets" color={colors.dataFat} />
        {stats.prs.length ? (
          <StatTile
            value={String(stats.prs.length)}
            unit={stats.prs.length === 1 ? "PR" : "PRs"}
            label="Records"
            color={colors.dataProtein}
          />
        ) : null}
      </View>

      {workout.exercises.filter((e) => e.sets.some((s) => s.done)).map((e) => (
        <Card key={e.id}>
          <View style={styles.exHead}>
            <ExerciseTile category={e.category} size={36} />
            <Text
              variant="title"
              style={styles.flex}
              onPress={
                e.exerciseId
                  ? () => router.push({ pathname: "/train/exercise/[id]", params: { id: e.exerciseId! } })
                  : undefined
              }
            >
              {e.name}
            </Text>
          </View>
          {e.sets.filter((s) => s.done).map((s, i) => (
            <View key={s.id} style={styles.setRow}>
              <Text variant="label" color="textSecondary" style={styles.setNo}>
                {String(i + 1)}
              </Text>
              <Text variant="body" tabular style={styles.flex}>
                {formatSet(e.type, s)}
              </Text>
              <PRBadge kinds={s.prKinds} />
            </View>
          ))}
        </Card>
      ))}

      <View style={styles.actions}>
        {stats.prs.length ? (
          <View style={styles.flex}>
            <Button
              label="Share PR"
              icon="ios_share"
              variant="secondary"
              fullWidth
              onPress={() => router.push({ pathname: "/share", params: { card: "pr", id: workout.id } })}
            />
          </View>
        ) : null}
        <View style={styles.flex}>
          <Button label="Done" icon="check" fullWidth onPress={() => router.dismissTo("/(tabs)/train")} />
        </View>
      </View>
      <Button label="Delete workout" variant="ghost" icon="delete" onPress={() => setConfirmDelete(true)} />

      <Dialog
        visible={confirmDelete}
        title="Delete this day's workout?"
        body="Every set logged that day, and its PRs, is removed from your history."
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          setConfirmDelete(false);
          deleteWorkout(workout);
          toast({ kind: "info", message: "Workout deleted" });
          router.back();
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: "row", gap: 12 },
  flex: { flex: 1 },
  exHead: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
  setRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  setNo: { width: 24, textAlign: "center" },
  actions: { flexDirection: "row", gap: 12, marginTop: 8 },
});
