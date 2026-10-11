// S25 · Workout summary (P19, PRs P20). No export yet: built from DESIGN.md §6.5 (D41). Stat tiles (duration,
// volume, sets, PRs), the PR list with trophies, every exercise's sets, Share (share cards arrive in P38)
// and Done. Also where a finished workout is deleted.
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { Icon } from "@/core/icons/Icon";
import { useTheme } from "@/core/theme";
import { Button, Card, Dialog, EmptyState, Header, Screen, StatTile, Text, useToast } from "@/core/ui";
import { ExerciseTile, PRBadge } from "@/features/gym/components";
import { formatDay } from "@/features/gym/format";
import { deleteWorkout, useWorkout, workoutStats } from "@/features/gym/store";
import { formatSet } from "@shared/domain/gym";

export default function WorkoutSummary() {
  const { colors, radius } = useTheme();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const workout = useWorkout(id);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [openedAt] = useState(() => Date.now());

  if (!workout) {
    return (
      <Screen header={<Header title="Workout" onBack={() => router.back()} />}>
        <EmptyState icon="fitness_center" title="Workout not found" body="It may have been deleted." />
      </Screen>
    );
  }

  const stats = workoutStats(workout);
  const justFinished = !!workout.endedAt && openedAt - new Date(workout.endedAt).getTime() < 10 * 60_000;

  return (
    <Screen header={<Header title={justFinished ? "Workout complete" : workout.name} onBack={() => router.back()} />}>
      <View>
        <Text variant="headline-lg" accessibilityRole="header">
          {justFinished ? "Nice work." : workout.name}
        </Text>
        <Text variant="body" color="textSecondary">
          {`${justFinished ? `${workout.name} · ` : ""}${formatDay(workout.startedAt)}${workout.synced ? "" : " · saved on this phone"}`}
        </Text>
      </View>

      <View style={styles.tiles}>
        <StatTile
          value={String(Math.round(stats.durationS / 60))}
          unit="min"
          label="Duration"
          color={colors.dataActivity}
        />
        <StatTile
          value={Math.round(stats.volumeKg).toLocaleString("en-IN")}
          unit="kg"
          label="Volume"
          color={colors.dataKcal}
        />
      </View>
      <View style={styles.tiles}>
        <StatTile value={String(stats.sets)} unit="sets" label="Sets" color={colors.dataFat} />
        <StatTile
          value={String(stats.prs.length)}
          unit={stats.prs.length === 1 ? "PR" : "PRs"}
          label="Records"
          color={colors.dataProtein}
        />
      </View>

      {stats.prs.length ? (
        <Card eyebrow="Personal records">
          {stats.prs.map((p) => (
            <View key={p.set.id} style={styles.prRow}>
              <View style={[styles.trophy, { backgroundColor: colors.primary, borderRadius: radius.full }]}>
                <Icon name="trophy" size={20} color={colors.ink} filled />
              </View>
              <View style={styles.flex}>
                <Text variant="title">{p.exerciseName}</Text>
                <Text variant="body" color="textSecondary" tabular>
                  {formatSet(p.type, p.set)}
                </Text>
              </View>
              <PRBadge kinds={p.set.prKinds} long />
            </View>
          ))}
        </Card>
      ) : null}

      {workout.exercises.map((e) => (
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
          {e.sets.map((s, i) => (
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
        <View style={styles.flex}>
          <Button
            label="Share"
            icon="ios_share"
            variant="secondary"
            fullWidth
            onPress={() => router.push({ pathname: "/coming-soon", params: { feature: "Share cards" } })}
          />
        </View>
        <View style={styles.flex}>
          <Button label="Done" icon="check" fullWidth onPress={() => router.back()} />
        </View>
      </View>
      <Button label="Delete workout" variant="ghost" icon="delete" onPress={() => setConfirmDelete(true)} />

      <Dialog
        visible={confirmDelete}
        title="Delete this workout?"
        body="Its sets and PRs are removed from your history."
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
  prRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 6 },
  trophy: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  exHead: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
  setRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  setNo: { width: 24, textAlign: "center" },
  actions: { flexDirection: "row", gap: 12, marginTop: 8 },
});
