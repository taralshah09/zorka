import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { randomUUID } from "expo-crypto";
import { Button, Card, Header, Screen, Text, useToast } from "@/core/ui";
import { useActiveUser } from "@/features/users/activeUser";
import { getExercise, useExercises } from "@/features/gym/catalog";
import { nextRoutine, startRoutine, useRoutines, saveRoutine, type Routine } from "@/features/gym/routines";
import { addExercises, startWorkout, useActiveWorkout } from "@/features/gym/store";
import { shorterRoutine, chooseRest } from "@/features/gym/prepared";
import { preferencesFor, savePreferences } from "@/features/meals/preferences";
import { completeAction, actionResult } from "@/features/coach/actionState";
import { localDate } from "@shared/domain/food";
export default function PreparedWorkout() {
  const userId = useActiveUser((s) => s.userId);
  const active = useActiveWorkout(userId);
  const { routines, lastDone } = useRoutines(userId);
  const catalog = useExercises(userId);
  const { routineId, actionKey } = useLocalSearchParams<{ routineId?: string; actionKey?: string }>();
  const [equipment, setEquipment] = useState<"bodyweight" | "dumbbells">("bodyweight");
  const [short, setShort] = useState(false);
  const toast = useToast();
  const preferred = preferencesFor(userId).routineId;
  const chosen = routines.find((r) => r.id === (routineId ?? preferred)) ?? nextRoutine(routines, lastDone);
  const names = equipment === "bodyweight" ? ["Bodyweight Squat", "Push-Up", "Plank"] : ["Goblet Squat", "One-Arm Dumbbell Row", "Standing Dumbbell Overhead Press"];
  const starterExercises = names.map((name) => catalog.find((e) => e.name === name)).filter((e) => !!e);
  const starter: Routine = { id: "starter", userId: userId ?? "", name: `${equipment === "bodyweight" ? "Bodyweight" : "Dumbbell"} starter session`, synced: false,
    exercises: starterExercises.map((e) => ({ id: e.id, exerciseId: e.id, name: e.name, type: e.type, category: e.category, targetSets: 2, targetReps: e.type === "time" ? null : 5 })) };
  const full = chosen ?? starter;
  const preview = short ? shorterRoutine(full) : full;
  const start = () => {
    if (!userId) return;
    if (active) { router.replace("/train/workout"); return; }
    const completed = actionKey ? actionResult(userId, actionKey) : null;
    if (completed?.kind === "workout") { router.replace({ pathname: "/train/summary/[id]", params: { id: completed.id } }); return; }
    if (!preview.exercises.length) { toast({ kind: "info", message: "Connect once to load exercises, or start an empty workout." }); return; }
    let workout;
    if (!chosen) {
      const saved = saveRoutine(userId, { name: full.name, exercises: full.exercises.map((e) => ({ ...e, id: randomUUID() })) });
      workout = startRoutine(userId, short ? shorterRoutine(saved) : saved, (id) => getExercise(userId, id));
    } else {
      // Start the preview exactly as shown. Missing cached exercises cannot silently disappear.
      if (preview.exercises.some((e) => !getExercise(userId, e.exerciseId))) { toast({ kind: "info", message: "Some exercises need to be loaded or replaced before starting." }); return; }
      workout = startWorkout(userId, { name: preview.name, routineId: chosen.id });
      addExercises(workout, preview.exercises.map((e) => ({ exercise: getExercise(userId, e.exerciseId)!, targetSets: e.targetSets, targetReps: e.targetReps })));
    }
    chooseRest(userId, localDate(new Date()), false);
    if (actionKey && workout) completeAction(userId, actionKey, { kind: "workout", id: workout.id });
    router.replace("/train/workout");
  };
  return <Screen header={<Header title="Your prepared session" onBack={() => router.back()} />}>
    {active ? <Button label={`Resume ${active.name}`} onPress={() => router.replace("/train/workout")} /> : null}
    {!chosen ? <Card><Text variant="title">What equipment do you have?</Text><Button label="Bodyweight" variant="secondary" onPress={() => setEquipment("bodyweight")} /><Button label="Dumbbells" variant="secondary" onPress={() => setEquipment("dumbbells")} /></Card> : null}
    <Card><Text variant="headline-sm">{preview.name}</Text>
      <Text variant="body">Choose a manageable amount. Use the exercise library for technique and adjust or skip any exercise that does not fit you.</Text>
      {preview.exercises.map((e) => <Text key={e.id} variant="body">{e.name} · {e.targetSets} sets{e.targetReps ? ` · ${e.targetReps} reps to start` : " · choose a comfortable hold"}</Text>)}
      <Text variant="caption">Previous numbers are available in the workout. Unticked sets are not counted as performed.</Text>
    </Card>
    <Button label={short ? "See full session" : "See shorter version · fewer sets"} variant="secondary" onPress={() => setShort(!short)} />
    {chosen ? <Button label="Prefer this routine next time" variant="ghost" onPress={() => { if (userId) { savePreferences(userId, { routineId: chosen.id }); toast({ kind: "info", message: "Routine preference saved" }); } }} /> : null}
    <Button label={active ? "Resume workout" : `Start ${preview.name}`} onPress={start} />
    <Button label="Start empty workout" variant="ghost" onPress={() => { if (userId) { startWorkout(userId); router.replace("/train/workout"); } }} />
    <Button label="Rest today" variant="ghost" onPress={() => { if (userId) chooseRest(userId, localDate(new Date()), true); router.dismissTo("/(tabs)/train"); }} />
  </Screen>;
}
