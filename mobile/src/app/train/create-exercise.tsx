// Create (or edit) your own exercise (P19). Name, muscle group, what a set records, and an optional
// MuscleWiki link so the how-to is one tap away (D38). Saved on the phone at once (usable offline) and
// synced as "custom_exercise". The set type can't change once created: past sets were logged with it.
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Linking, StyleSheet, View } from "react-native";

import { Button, Card, Chip, Header, ListItem, Screen, Text, TextField, useToast } from "@/core/ui";
import { getExercise, localExercises, saveExercise } from "@/features/gym/catalog";
import { routineDraft } from "@/features/gym/routines";
import { activeWorkout, addExercises, startWorkout } from "@/features/gym/store";
import { useActiveUser } from "@/features/users/activeUser";
import { normalize } from "@shared/domain/foodMatch";
import {
  CATEGORY_LABEL,
  cleanMusclewikiUrl,
  EXERCISE_CATEGORIES,
  EXERCISE_TYPES,
  MUSCLEWIKI_BROWSE_URL,
  TYPE_LABEL,
  type ExerciseCategory,
  type ExerciseType,
} from "@shared/domain/gym";

const TYPE_HINT: Record<ExerciseType, string> = {
  weight_reps: "Bench press, curls, rows",
  reps: "Push-ups, crunches",
  time: "Plank, wall sit",
  distance_time: "Treadmill, rowing machine",
};

export default function CreateExercise() {
  const toast = useToast();
  const params = useLocalSearchParams<{ mode?: string; name?: string; id?: string }>();
  const userId = useActiveUser((s) => s.userId);
  const editing = userId && params.id ? getExercise(userId, params.id) : null;

  const [name, setName] = useState(editing?.name ?? params.name ?? "");
  const [category, setCategory] = useState<ExerciseCategory>(editing?.category ?? "chest");
  const [type, setType] = useState<ExerciseType>(editing?.type ?? "weight_reps");
  const [link, setLink] = useState(editing?.referenceUrl ?? "");
  const [tried, setTried] = useState(false);

  if (!userId) return null;

  const clean = name.trim();
  const duplicate = localExercises(userId).some((e) => e.id !== editing?.id && normalize(e.name) === normalize(clean));
  const linkOk = !link.trim() || cleanMusclewikiUrl(link) !== null;
  const errors = {
    name: !clean
      ? "Give it a name"
      : clean.length > 80
        ? "Keep it under 80 characters"
        : duplicate
          ? `"${clean}" is already in the list`
          : undefined,
    link: linkOk ? undefined : "Paste a link from musclewiki.com",
  };

  const save = () => {
    setTried(true);
    if (errors.name || errors.link) return;
    const exercise = saveExercise(
      userId,
      { name: clean, category, type: editing?.type ?? type, referenceUrl: link.trim() || null },
      editing?.id,
    );
    if (editing) {
      toast({ kind: "success", message: "Exercise updated" });
      router.back();
      return;
    }
    if (params.mode === "workout") {
      addExercises(activeWorkout(userId) ?? startWorkout(userId), [{ exercise }]);
    } else if (params.mode === "routine") {
      routineDraft.add([exercise]);
    }
    toast({ kind: "success", message: `${exercise.name} added to your exercises` });
    // Back past the picker to the workout / routine; in browse mode, back to the list.
    if (params.mode === "workout" || params.mode === "routine") router.dismiss(2);
    else router.back();
  };

  return (
    <Screen header={<Header title={editing ? "Edit exercise" : "Create an exercise"} onBack={() => router.back()} />}>
      <TextField
        label="Name"
        value={name}
        onChangeText={setName}
        placeholder="Landmine press"
        error={tried ? errors.name : undefined}
      />

      <Text variant="eyebrow" color="textSecondary">
        Muscle group
      </Text>
      <View style={styles.wrap}>
        {EXERCISE_CATEGORIES.map((c) => (
          <Chip
            key={c}
            kind="choice"
            label={CATEGORY_LABEL[c]}
            selected={category === c}
            onPress={() => setCategory(c)}
          />
        ))}
      </View>

      <Text variant="eyebrow" color="textSecondary">
        Each set records
      </Text>
      {editing ? (
        <Text variant="body" color="textSecondary">
          {`${TYPE_LABEL[editing.type]}. This can't change once sets are logged.`}
        </Text>
      ) : (
        <View style={styles.wrap}>
          {EXERCISE_TYPES.map((t) => (
            <Chip key={t} kind="choice" label={TYPE_LABEL[t]} selected={type === t} onPress={() => setType(t)} />
          ))}
        </View>
      )}
      {!editing ? (
        <Text variant="caption" color="textSecondary">
          {`For example: ${TYPE_HINT[type]}.`}
        </Text>
      ) : null}

      <TextField
        label="MuscleWiki link (optional)"
        value={link}
        onChangeText={setLink}
        placeholder="https://musclewiki.com/exercise/…"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        error={tried ? errors.link : undefined}
      />
      <Card flush>
        <ListItem
          icon="open_in_new"
          title="Find it on MuscleWiki"
          subtitle="Open the exercise there, copy the link, paste it above"
          onPress={() => void Linking.openURL(MUSCLEWIKI_BROWSE_URL)}
        />
      </Card>

      <Button label={editing ? "Save changes" : "Create exercise"} icon="check" fullWidth glow onPress={save} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
