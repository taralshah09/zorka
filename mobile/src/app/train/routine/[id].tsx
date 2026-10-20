// S26 · Routine editor (P21). No export yet: built from DESIGN.md §6.5 (D41). Name, an ordered exercise list
// with target sets × reps (reordered with up/down buttons: no drag library, and it works with TalkBack),
// add exercise (S23 in routine mode), save, start, delete. `id` is "new" for a new routine.
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { useTheme } from "@/core/theme";
import { Button, Card, Dialog, EmptyState, Header, IconButton, Screen, Text, TextField, useToast } from "@/core/ui";
import { getExercise } from "@/features/gym/catalog";
import { ExerciseTile } from "@/features/gym/components";
import {
  deleteRoutine,
  getRoutine,
  routineDraft,
  saveRoutine,
  startRoutine,
  useRoutineDraft,
  type RoutineExercise,
} from "@/features/gym/routines";
import { useActiveUser } from "@/features/users/activeUser";
import { TYPE_LABEL } from "@shared/domain/gym";

export default function RoutineEditor() {
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = useActiveUser((s) => s.userId);
  const draft = useRoutineDraft();
  const existing = id && id !== "new" ? getRoutine(id) : null;
  const [tried, setTried] = useState(false);
  const [confirm, setConfirm] = useState<"delete" | "leave" | null>(null);

  // Load once per visit; coming back from the exercise picker keeps the draft.
  useEffect(() => {
    routineDraft.load(id && id !== "new" ? getRoutine(id) : null);
  }, [id]);

  if (!userId) return null;

  const nameError = !draft.name.trim()
    ? "Give it a name, like Push day"
    : draft.name.trim().length > 60
      ? "Keep it under 60 characters"
      : undefined;
  const listError = draft.exercises.length ? undefined : "Add at least one exercise";

  const save = (): boolean => {
    setTried(true);
    if (nameError || listError) return false;
    const saved = saveRoutine(userId, { id: draft.id, name: draft.name, exercises: draft.exercises });
    routineDraft.load(saved);
    return true;
  };

  // The routine's exercises join today's workout, whatever's already logged today.
  const start = () => {
    if (draft.dirty && !save()) return;
    const r = getRoutine(useRoutineDraft.getState().id ?? "");
    if (!r) return;
    startRoutine(userId, r, (exerciseId) => getExercise(userId, exerciseId));
    router.replace("/train/workout");
  };

  const back = () => (draft.dirty ? setConfirm("leave") : router.back());

  return (
    <Screen
      header={
        <Header
          title={existing ? "Edit routine" : "New routine"}
          onBack={back}
          right={
            existing ? (
              <IconButton icon="delete" accessibilityLabel="Delete routine" onPress={() => setConfirm("delete")} />
            ) : undefined
          }
        />
      }
    >
      <TextField
        label="Routine name"
        value={draft.name}
        onChangeText={routineDraft.setName}
        placeholder="Push day"
        error={tried ? nameError : undefined}
      />

      <View style={styles.listHead}>
        <Text variant="headline-sm" accessibilityRole="header">
          Exercises
        </Text>
        <Text variant="caption" color="textSecondary">
          Target sets × reps
        </Text>
      </View>

      {draft.exercises.length ? (
        draft.exercises.map((e, i) => (
          <RoutineRow key={e.id} item={e} first={i === 0} last={i === draft.exercises.length - 1} />
        ))
      ) : (
        <EmptyState
          icon="fitness_center"
          title="No exercises yet"
          body={tried && listError ? listError : "Add the exercises you do on this day, in order."}
        />
      )}

      <Button
        label="Add exercise"
        icon="add"
        variant="secondary"
        fullWidth
        onPress={() => router.push({ pathname: "/train/exercises", params: { mode: "routine" } })}
      />
      <Button
        label="Save routine"
        icon="check"
        fullWidth
        onPress={() => {
          if (save()) {
            toast({ kind: "success", message: "Routine saved" });
            router.back();
          }
        }}
      />
      <Button label="Start workout" icon="play_arrow" variant="ghost" fullWidth onPress={start} />

      <Dialog
        visible={confirm === "delete"}
        title={`Delete ${existing?.name ?? "routine"}?`}
        body="Workouts you did with it stay in your history."
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          setConfirm(null);
          if (existing) deleteRoutine(existing);
          router.back();
        }}
        onCancel={() => setConfirm(null)}
      />
      <Dialog
        visible={confirm === "leave"}
        title="Leave without saving?"
        body="Your changes to this routine are lost."
        confirmLabel="Leave"
        cancelLabel="Keep editing"
        destructive
        onConfirm={() => {
          setConfirm(null);
          router.back();
        }}
        onCancel={() => setConfirm(null)}
      />
    </Screen>
  );
}

function RoutineRow({ item, first, last }: { item: RoutineExercise; first: boolean; last: boolean }) {
  return (
    <Card>
      <View style={styles.rowHead}>
        <ExerciseTile category={item.category} size={36} />
        <View style={styles.flex}>
          <Text variant="title" numberOfLines={2}>
            {item.name}
          </Text>
          <Text variant="caption" color="textSecondary">
            {TYPE_LABEL[item.type]}
          </Text>
        </View>
        <IconButton
          icon="arrow_upward"
          accessibilityLabel={`Move ${item.name} up`}
          disabled={first}
          onPress={() => routineDraft.move(item.id, -1)}
        />
        <IconButton
          icon="arrow_downward"
          accessibilityLabel={`Move ${item.name} down`}
          disabled={last}
          onPress={() => routineDraft.move(item.id, 1)}
        />
        <IconButton
          icon="close"
          accessibilityLabel={`Remove ${item.name}`}
          onPress={() => routineDraft.remove(item.id)}
        />
      </View>
      <View style={styles.targets}>
        <MiniStepper
          label="Sets"
          value={item.targetSets}
          min={1}
          max={10}
          onChange={(targetSets) => routineDraft.setTarget(item.id, { targetSets })}
        />
        {item.targetReps !== null ? (
          <MiniStepper
            label="Reps"
            value={item.targetReps}
            min={1}
            max={50}
            onChange={(targetReps) => routineDraft.setTarget(item.id, { targetReps })}
          />
        ) : null}
      </View>
    </Card>
  );
}

function MiniStepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const { colors, radius } = useTheme();
  return (
    <View style={[styles.stepper, { backgroundColor: colors.surfaceHigh, borderRadius: radius.full }]}>
      <IconButton
        icon="remove"
        accessibilityLabel={`Fewer ${label.toLowerCase()}`}
        disabled={value <= min}
        onPress={() => onChange(value - 1)}
      />
      <View style={styles.stepperValue} accessible accessibilityLabel={`${value} ${label.toLowerCase()}`}>
        <Text variant="title" tabular>
          {String(value)}
        </Text>
        <Text variant="unit" color="textSecondary">
          {label}
        </Text>
      </View>
      <IconButton
        icon="add"
        accessibilityLabel={`More ${label.toLowerCase()}`}
        disabled={value >= max}
        onPress={() => onChange(value + 1)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  listHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: 8 },
  rowHead: { flexDirection: "row", alignItems: "center", gap: 4 },
  flex: { flex: 1, gap: 2, marginLeft: 6 },
  targets: { flexDirection: "row", gap: 12, marginTop: 10 },
  stepper: { flexDirection: "row", alignItems: "center", paddingHorizontal: 2 },
  stepperValue: { alignItems: "center", minWidth: 44 },
});
