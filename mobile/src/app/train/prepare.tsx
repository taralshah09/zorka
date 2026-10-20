// The routine that's up next, as it'll go into today's workout (one workout per day): its exercises and targets, a
// shorter version, "prefer this next time", or rest. With no routine yet there's no made-up starter: the user builds
// one, or adds exercises to today straight away and says the equipment in the exercise they pick.
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Button, Card, Header, Screen, Text, useToast } from "@/core/ui";
import { useActiveUser } from "@/features/users/activeUser";
import { getExercise } from "@/features/gym/catalog";
import { nextRoutine, startRoutine, useRoutines } from "@/features/gym/routines";
import { useActiveWorkout } from "@/features/gym/store";
import { shorterRoutine, chooseRest } from "@/features/gym/prepared";
import { preferencesFor, savePreferences } from "@/features/meals/preferences";
import { completeAction, actionResult } from "@/features/coach/actionState";
import { localDate } from "@shared/domain/food";
export default function PreparedWorkout() {
  const userId = useActiveUser((s) => s.userId);
  const today = useActiveWorkout(userId);
  const { routines, lastDone } = useRoutines(userId);
  const { routineId, actionKey } = useLocalSearchParams<{ routineId?: string; actionKey?: string }>();
  const [short, setShort] = useState(false);
  const toast = useToast();
  const preferred = preferencesFor(userId).routineId;
  const chosen = routines.find((r) => r.id === (routineId ?? preferred)) ?? nextRoutine(routines, lastDone);
  const preview = chosen ? (short ? shorterRoutine(chosen) : chosen) : null;
  const start = () => {
    if (!userId || !chosen || !preview) return;
    const completed = actionKey ? actionResult(userId, actionKey) : null;
    if (completed?.kind === "workout") { router.replace({ pathname: "/train/summary/[id]", params: { id: completed.id } }); return; }
    // Start the preview exactly as shown. Missing cached exercises cannot silently disappear.
    if (preview.exercises.some((e) => !getExercise(userId, e.exerciseId))) { toast({ kind: "info", message: "Some exercises need to be loaded or replaced before starting." }); return; }
    const workout = startRoutine(userId, preview, (id) => getExercise(userId, id));
    chooseRest(userId, localDate(new Date()), false);
    if (actionKey) completeAction(userId, actionKey, { kind: "workout", id: workout.id });
    router.replace("/train/workout");
  };
  const addToToday = () => router.replace({ pathname: "/train/exercises", params: { mode: "workout" } });
  return <Screen header={<Header title={chosen ? "Your prepared session" : "Today's training"} onBack={() => router.back()} />}>
    {today?.exercises.length ? <Button label="Open today's workout" variant="secondary" onPress={() => router.replace("/train/workout")} /> : null}
    {preview ? <>
      <Card><Text variant="headline-sm">{preview.name}</Text>
        <Text variant="body">Choose a manageable amount. Use the exercise library for technique and adjust or skip any exercise that does not fit you.</Text>
        {preview.exercises.map((e) => <Text key={e.id} variant="body">{e.name} · {e.targetSets} sets{e.targetReps ? ` · ${e.targetReps} reps to start` : " · choose a comfortable hold"}</Text>)}
        <Text variant="caption">It goes into today&apos;s workout, with anything else you log today. Unticked sets are not counted as performed.</Text>
      </Card>
      <Button label={short ? "See full session" : "See shorter version · fewer sets"} variant="secondary" onPress={() => setShort(!short)} />
      <Button label="Prefer this routine next time" variant="ghost" onPress={() => { if (userId) { savePreferences(userId, { routineId: chosen!.id }); toast({ kind: "info", message: "Routine preference saved" }); } }} />
      <Button label={`Add ${preview.name} to today`} onPress={start} />
    </> : <Card>
      <Text variant="headline-sm">No routine yet</Text>
      <Text variant="body">Build one once and add it to any day in a tap, or pick exercises for today now. Name the equipment by choosing the exercise, like Dumbbell Bench Press or Push-Up.</Text>
      <Button label="Build a routine" variant="secondary" onPress={() => router.replace("/train/routine/new")} />
    </Card>}
    <Button label="Add exercises to today" variant="ghost" onPress={addToToday} />
    <Button label="Rest today" variant="ghost" onPress={() => { if (userId) chooseRest(userId, localDate(new Date()), true); router.dismissTo("/(tabs)/train"); }} />
  </Screen>;
}
