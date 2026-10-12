// S24 · Active workout (P19–P22). No export yet: built from DESIGN.md §6.5 (D41). Top: name, live clock,
// Finish. Exercise cards with the set table (Set · grey Previous · kg · Reps · ✓), "+ Add set", a rest timer
// bar pinned to the bottom after each ticked set (P20), trophy PR rows + toast (P20), and "Say a set" (P22).
// Works the same offline: everything is saved on the phone; only voice needs a connection (typed instead).
import { File } from "expo-file-system";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Linking, ScrollView, StyleSheet, View } from "react-native";

import { ApiError, describeError } from "@/core/api/client";
import { Icon } from "@/core/icons/Icon";
import { haptics } from "@/core/haptics";
import { useTheme } from "@/core/theme";
import {
  BottomSheet,
  Button,
  Card,
  Chip,
  Dialog,
  EmptyState,
  Header,
  IconButton,
  ListItem,
  NumberStepper,
  reactMascot,
  Screen,
  Text,
  TextField,
  useToast,
} from "@/core/ui";
import { getExercise } from "@/features/gym/catalog";
import { ExerciseTile, RestTimerBar, SetTable } from "@/features/gym/components";
import { formatElapsed, formatVolume, SET_COLUMNS } from "@/features/gym/format";
import { restFor, restTimer, setRestFor } from "@/features/gym/rest";
import {
  addSet,
  completeSet,
  discardWorkout,
  finishCheck,
  finishWorkout,
  previousSets,
  removeExercise,
  startWorkout,
  useActiveWorkout,
  workoutStats,
  type Workout,
  type WorkoutExercise,
} from "@/features/gym/store";
import { applyVoiceSets, parseGymVoice } from "@/features/gym/voice";
import { VoiceSetButton } from "@/features/gym/VoiceSetButton";
import { useActiveUser } from "@/features/users/activeUser";
import {
  formatClock,
  formatSet,
  MAX_REST_S,
  MIN_REST_S,
  REST_STEP_S,
  type PrKind,
  type SetValues,
} from "@shared/domain/gym";

const deleteFile = (uri: string) => {
  try {
    new File(uri).delete();
  } catch {
    // Already gone.
  }
};

export default function ActiveWorkout() {
  const { colors, layout } = useTheme();
  const toast = useToast();
  const userId = useActiveUser((s) => s.userId);
  const workout = useActiveWorkout(userId);
  const [now, setNow] = useState(() => Date.now());
  const [confirm, setConfirm] = useState<"finish" | "discard" | null>(null);
  const [menu, setMenu] = useState(false);
  const [typed, setTyped] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!userId) return null;
  if (!workout) {
    return (
      <Screen header={<Header title="Workout" onBack={() => router.back()} />}>
        <EmptyState
          icon="fitness_center"
          title="No workout open"
          body="Start one and log your sets as you go."
          actionLabel="Start empty workout"
          onAction={() => startWorkout(userId)}
        />
      </Screen>
    );
  }

  const stats = workoutStats(workout, now);
  const check = finishCheck(workout);

  const onCompleted = (we: WorkoutExercise) => (values: SetValues, kinds: PrKind[]) => {
    restTimer.start(restFor(userId, we.exerciseId), we.name);
    if (kinds.length)
      toast({ kind: "success", message: `New PR · ${we.name} ${formatSet(we.type, values)}`, haptic: "success" });
    else haptics.tap();
  };

  const finish = () => {
    setConfirm(null);
    restTimer.skip();
    const done = finishWorkout(workout.id);
    if (done) router.replace({ pathname: "/train/summary/[id]", params: { id: done.id } });
    else router.back();
  };

  const askFinish = () => {
    if (check.done === 0) setConfirm("discard");
    else if (check.unticked > 0) setConfirm("finish");
    else finish();
  };

  const onVoice = async (uri: string) => {
    setVoiceBusy(true);
    try {
      const ids = workout.exercises.flatMap((e) => (e.exerciseId ? [e.exerciseId] : []));
      const { result } = await parseGymVoice(userId, uri, ids);
      if (!result.sets.length) {
        toast({ kind: "info", message: "Didn't catch that. Hold the button and try again." });
        return;
      }
      const { added, unmatched } = applyVoiceSets(userId, workout.id, result.sets, (id) => getExercise(userId, id));
      const ticked = added.filter((a) => a.ticked);
      const last = ticked[ticked.length - 1];
      if (last) {
        const we = workout.exercises.find((e) => e.id === last.workoutExerciseId);
        restTimer.start(restFor(userId, we?.exerciseId ?? null), last.exerciseName);
      }
      const first = added[0];
      if (unmatched.length) {
        toast({ kind: "error", message: `Couldn't find "${unmatched[0]}". Add it from the list.` });
      } else if (first && !first.ticked) {
        toast({ kind: "info", message: `Check the new ${first.exerciseName} set, then tick it.` });
      } else if (added.length === 1 && first) {
        const type = workout.exercises.find((e) => e.id === first.workoutExerciseId)?.type ?? "weight_reps";
        const said = `${first.exerciseName} ${formatSet(type, first.values)}${first.count > 1 ? ` × ${first.count} sets` : ""}`;
        const pr = first.prKinds.length ? " · New PR!" : "";
        toast({ kind: "success", message: `${said}${first.previous ? ` · last ${first.previous}` : ""}${pr}` });
      } else {
        const n = added.reduce((s, a) => s + a.count, 0);
        toast({
          kind: "success",
          message: `Added ${n} sets${added.some((a) => a.prKinds.length) ? " · New PR!" : ""}`,
        });
      }
    } catch (e) {
      // No connection mid-way, or AI down: type it instead (D41).
      if (e instanceof ApiError && (e.kind === "network" || e.kind === "timeout")) {
        toast({ kind: "info", message: "No connection. Type the set instead." });
      } else {
        toast({ kind: "error", message: describeError(e).body });
      }
      setTyped(true);
    } finally {
      deleteFile(uri);
      setVoiceBusy(false);
    }
  };

  return (
    <Screen
      scroll={false}
      header={
        <Header
          title={workout.name}
          onBack={() => router.back()}
          right={
            <>
              <IconButton icon="more_vert" accessibilityLabel="Workout options" onPress={() => setMenu(true)} />
              <Button label="Finish" size="sm" onPress={askFinish} />
            </>
          }
        />
      }
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={{ gap: layout.cardGap, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.clockRow}>
          <Icon name="timer" size={20} color={colors.primaryText} />
          <Text
            variant="headline-md"
            tabular
            accessibilityLabel={`Workout time ${formatElapsed(workout.startedAt, now)}`}
          >
            {formatElapsed(workout.startedAt, now)}
          </Text>
          <Text variant="label" color="textSecondary" tabular style={styles.flex} align="right">
            {`${formatVolume(stats.volumeKg)} · ${stats.sets} sets${stats.prs.length ? ` · ${stats.prs.length} PR` : ""}`}
          </Text>
        </View>

        {workout.exercises.length ? (
          workout.exercises.map((we) => (
            <ExerciseCard key={we.id} userId={userId} workout={workout} we={we} onCompleted={onCompleted(we)} />
          ))
        ) : (
          <EmptyState
            icon="fitness_center"
            title="Add your first exercise"
            body='Pick from the list, or hold "Say a set" and say it, like "bench 80 kilos, 8 reps".'
            actionLabel="Add exercise"
            onAction={() => router.push({ pathname: "/train/exercises", params: { mode: "workout" } })}
          />
        )}
      </ScrollView>

      <View style={styles.footer}>
        <RestTimerBar />
        <View style={styles.actions}>
          <View style={styles.flex}>
            <Button
              label="Add exercise"
              icon="add"
              variant="secondary"
              fullWidth
              onPress={() => router.push({ pathname: "/train/exercises", params: { mode: "workout" } })}
            />
          </View>
          <VoiceSetButton busy={voiceBusy} onRecorded={(uri) => void onVoice(uri)} onOffline={() => setTyped(true)} />
        </View>
      </View>

      <BottomSheet visible={menu} onClose={() => setMenu(false)} title="Workout">
        <ListItem
          icon="keyboard"
          title="Type a set"
          subtitle="Quick entry without the table"
          onPress={() => {
            setMenu(false);
            setTyped(true);
          }}
        />
        <ListItem
          icon="delete"
          title="Discard workout"
          subtitle="Nothing from this session is saved"
          onPress={() => {
            setMenu(false);
            setConfirm("discard");
          }}
        />
      </BottomSheet>

      <TypedSetSheet
        userId={userId}
        workout={workout}
        visible={typed}
        onClose={() => setTyped(false)}
        onCompleted={onCompleted}
      />

      <Dialog
        visible={confirm === "finish"}
        title="Finish workout?"
        body={`${check.unticked} unticked ${check.unticked === 1 ? "set isn't" : "sets aren't"} saved. Tick them first if you did them.`}
        confirmLabel="Finish"
        cancelLabel="Keep going"
        onConfirm={finish}
        onCancel={() => setConfirm(null)}
      />
      <Dialog
        visible={confirm === "discard"}
        title="Discard this workout?"
        body={
          check.done
            ? "Every set you logged in this session is removed."
            : "Nothing is ticked yet, so there's nothing to save."
        }
        confirmLabel="Discard"
        cancelLabel="Keep going"
        destructive
        onConfirm={() => {
          setConfirm(null);
          restTimer.skip();
          discardWorkout(workout.id);
          reactMascot("eyeroll");
          router.back();
        }}
        onCancel={() => setConfirm(null)}
      />
    </Screen>
  );
}

function ExerciseCard({
  userId,
  workout,
  we,
  onCompleted,
}: {
  userId: string;
  workout: Workout;
  we: WorkoutExercise;
  onCompleted: (values: SetValues, kinds: PrKind[]) => void;
}) {
  const { colors, radius } = useTheme();
  const [menu, setMenu] = useState(false);
  const [restSheet, setRestSheet] = useState(false);
  const [rest, setRest] = useState(() => restFor(userId, we.exerciseId));
  // Last session's sets, fixed for this workout (they don't change while you lift).
  const previous = useMemo(() => previousSets(userId, we.exerciseId, workout.id), [userId, we.exerciseId, workout.id]);
  const exercise = getExercise(userId, we.exerciseId);

  return (
    <Card>
      <View style={styles.cardHead}>
        <ExerciseTile category={we.category} size={40} />
        <View style={styles.flex}>
          <Text
            variant="title"
            numberOfLines={2}
            onPress={
              we.exerciseId
                ? () => router.push({ pathname: "/train/exercise/[id]", params: { id: we.exerciseId! } })
                : undefined
            }
          >
            {we.name}
          </Text>
          <Text variant="caption" color="textSecondary">
            {previous.length
              ? `Last time: ${previous.map((s) => formatSet(we.type, s)).join(", ")}`
              : "First time logging this"}
          </Text>
        </View>
        <Chip label={formatClock(rest)} icon="timer" onPress={() => setRestSheet(true)} />
        <IconButton icon="more_vert" accessibilityLabel={`${we.name} options`} onPress={() => setMenu(true)} />
      </View>

      <SetTable userId={userId} we={we} previous={previous} onCompleted={onCompleted} />
      <View style={styles.addSet}>
        <Button label="Add set" icon="add" variant="ghost" size="sm" onPress={() => addSet(we)} />
      </View>

      <BottomSheet visible={menu} onClose={() => setMenu(false)} title={we.name}>
        {exercise?.referenceUrl ? (
          <ListItem
            icon="open_in_new"
            title="How to do it"
            subtitle="Opens MuscleWiki"
            onPress={() => {
              setMenu(false);
              void Linking.openURL(exercise.referenceUrl!);
            }}
          />
        ) : null}
        {we.exerciseId ? (
          <ListItem
            icon="show_chart"
            title="History and PRs"
            onPress={() => {
              setMenu(false);
              router.push({ pathname: "/train/exercise/[id]", params: { id: we.exerciseId! } });
            }}
          />
        ) : null}
        <ListItem
          icon="delete"
          title="Remove from workout"
          subtitle={we.sets.some((s) => s.done) ? "Its ticked sets are removed too" : undefined}
          onPress={() => {
            setMenu(false);
            removeExercise(we);
          }}
        />
      </BottomSheet>

      <BottomSheet
        visible={restSheet}
        onClose={() => {
          // Closed without saving: back to the saved value.
          setRest(restFor(userId, we.exerciseId));
          setRestSheet(false);
        }}
        title="Rest timer"
      >
        <Text variant="body" color="textSecondary">
          {`Starts after each ticked set of ${we.name}.`}
        </Text>
        <View style={[styles.restPicker, { borderRadius: radius.lg, backgroundColor: colors.surfaceLow }]}>
          <NumberStepper
            label="Rest"
            value={rest}
            onChange={setRest}
            min={MIN_REST_S}
            max={MAX_REST_S}
            step={REST_STEP_S}
            format={formatClock}
          />
        </View>
        <Button
          label="Save"
          fullWidth
          onPress={() => {
            if (we.exerciseId) setRestFor(userId, we.exerciseId, rest);
            setRestSheet(false);
          }}
        />
      </BottomSheet>
    </Card>
  );
}

/** Quick typed entry: the offline fallback for "Say a set" (D41), also reachable from the menu. */
function TypedSetSheet({
  userId,
  workout,
  visible,
  onClose,
  onCompleted,
}: {
  userId: string;
  workout: Workout;
  visible: boolean;
  onClose: () => void;
  onCompleted: (we: WorkoutExercise) => (values: SetValues, kinds: PrKind[]) => void;
}) {
  const toast = useToast();
  const [weId, setWeId] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const we = workout.exercises.find((e) => e.id === weId) ?? workout.exercises[workout.exercises.length - 1] ?? null;

  const num = (t: string | undefined) => {
    const n = Number((t ?? "").replace(",", "."));
    return t && t.trim() && Number.isFinite(n) && n >= 0 ? n : null;
  };

  const add = () => {
    if (!we) return;
    const km = num(fields.distanceM);
    const time = num(fields.durationS);
    const values: SetValues = {
      weightKg: num(fields.weightKg) ?? (we.type === "weight_reps" ? 0 : null),
      reps: num(fields.reps) === null ? null : Math.round(num(fields.reps)!),
      durationS: time === null ? null : Math.round(we.type === "distance_time" ? time * 60 : time),
      distanceM: km === null ? null : Math.round(km * 1000),
    };
    const empty = we.sets.find((s) => !s.done && s.weightKg === null && s.reps === null && s.durationS === null);
    const setId = empty?.id ?? addSet(we);
    const kinds = completeSet(userId, we, setId, values);
    if (kinds === null) {
      toast({ kind: "info", message: "Fill in the numbers first" });
      return;
    }
    onCompleted(we)(values, kinds);
    setFields({});
    onClose();
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Add a set" size="medium">
      {we ? (
        <View style={styles.typed}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {workout.exercises.map((e) => (
              <Chip key={e.id} label={e.name} kind="choice" selected={e.id === we.id} onPress={() => setWeId(e.id)} />
            ))}
          </ScrollView>
          <View style={styles.typedFields}>
            {SET_COLUMNS[we.type].map((c) => (
              <View key={c.field} style={styles.flex}>
                <TextField
                  label={c.label}
                  value={fields[c.field] ?? ""}
                  onChangeText={(t) => setFields((f) => ({ ...f, [c.field]: t }))}
                  keyboardType={c.field === "reps" ? "number-pad" : "decimal-pad"}
                />
              </View>
            ))}
          </View>
          <Button label="Add set" icon="check" fullWidth onPress={add} />
        </View>
      ) : (
        <EmptyState
          icon="fitness_center"
          title="Add an exercise first"
          actionLabel="Add exercise"
          onAction={() => {
            onClose();
            router.push({ pathname: "/train/exercises", params: { mode: "workout" } });
          }}
        />
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  clockRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  addSet: { alignItems: "flex-start", marginTop: 4 },
  footer: { gap: 8, paddingTop: 8 },
  actions: { flexDirection: "row", alignItems: "center", gap: 8 },
  restPicker: { padding: 12, alignItems: "center", marginVertical: 12 },
  typed: { gap: 16 },
  chips: { gap: 8 },
  typedFields: { flexDirection: "row", gap: 12 },
});
