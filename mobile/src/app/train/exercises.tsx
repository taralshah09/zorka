// S23 · Exercise picker (P19). No export yet: built from DESIGN.md §6.5 (D41). Search (names + gym slang like
// "ohp", "rdl"), muscle-group chips, rows "last: 77.5 × 8 · best 80 kg". Works offline from the cached list.
// Modes: workout = add to the open workout · routine = add to the routine being edited (P21) · browse =
// open the exercise's history (S27).
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, ScrollView, StyleSheet, View } from "react-native";

import type { Exercise } from "@/core/api/types";
import { useTheme } from "@/core/theme";
import { Button, Chip, EmptyState, ErrorState, Header, ListItem, Screen, Skeleton, TextField } from "@/core/ui";
import {
  refreshExerciseCatalog,
  searchExercises,
  useExerciseCatalogStatus,
  useExercises,
} from "@/features/gym/catalog";
import { ExerciseRow } from "@/features/gym/components";
import { formatBest, relativeDay } from "@/features/gym/format";
import { routineDraft } from "@/features/gym/routines";
import { activeWorkout, addExercises, startWorkout, useExerciseStats, type ExerciseStat } from "@/features/gym/store";
import { useActiveUser } from "@/features/users/activeUser";
import { CATEGORY_LABEL, EXERCISE_CATEGORIES, formatSet, type ExerciseCategory } from "@shared/domain/gym";

type PickerMode = "workout" | "routine" | "browse";
const pickerMode = (m: string | undefined): PickerMode => (m === "workout" || m === "routine" ? m : "browse");

function rowMeta(e: Exercise, stat: ExerciseStat | undefined): string {
  if (!stat) return `${CATEGORY_LABEL[e.category]} · not logged yet`;
  const last = stat.lastTop ? `last: ${formatSet(e.type, stat.lastTop)}` : `last: ${relativeDay(stat.lastAt)}`;
  const best = formatBest(e.type, stat.bests);
  return best ? `${last} · ${best}` : last;
}

export default function ExercisePicker() {
  const { layout } = useTheme();
  const params = useLocalSearchParams<{ mode?: string }>();
  const mode = pickerMode(params.mode);
  const userId = useActiveUser((s) => s.userId);
  const all = useExercises(userId);
  const stats = useExerciseStats(userId, all);
  const status = useExerciseCatalogStatus();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<ExerciseCategory | null>(null);
  const [selected, setSelected] = useState<Exercise[]>([]);

  const list = useMemo(() => {
    if (!userId) return [];
    const found = q.trim() ? searchExercises(userId, q) : all;
    return category ? found.filter((e) => e.category === category) : found;
    // `all` changes whenever the cached list does.
  }, [userId, q, category, all]);

  if (!userId) return null;

  const toggle = (e: Exercise) =>
    setSelected((s) => (s.some((x) => x.id === e.id) ? s.filter((x) => x.id !== e.id) : [...s, e]));

  const onRow = (e: Exercise) => {
    if (mode === "browse") router.push({ pathname: "/train/exercise/[id]", params: { id: e.id } });
    else toggle(e);
  };

  const confirm = () => {
    if (mode === "routine") {
      routineDraft.add(selected);
    } else {
      const w = activeWorkout(userId) ?? startWorkout(userId);
      addExercises(
        w,
        selected.map((exercise) => ({ exercise })),
      );
    }
    router.back();
  };

  const create = () =>
    router.push({ pathname: "/train/create-exercise", params: { mode, name: q.trim() || undefined } });

  return (
    <Screen
      scroll={false}
      header={<Header title={mode === "browse" ? "Exercises" : "Add exercises"} onBack={() => router.back()} />}
    >
      <TextField
        label="Search exercises"
        value={q}
        onChangeText={setQ}
        placeholder='Try "bench", "ohp" or "plank"'
        autoCorrect={false}
        returnKeyType="search"
      />
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label="All" selected={category === null} onPress={() => setCategory(null)} />
          {EXERCISE_CATEGORIES.map((c) => (
            <Chip
              key={c}
              label={CATEGORY_LABEL[c]}
              selected={category === c}
              onPress={() => setCategory(category === c ? null : c)}
            />
          ))}
        </ScrollView>
      </View>

      {!all.length && status.loading ? (
        <>
          <Skeleton variant="card" height={72} />
          <Skeleton variant="card" height={72} />
          <Skeleton variant="card" height={72} />
        </>
      ) : !all.length && status.error ? (
        <ErrorState {...status.error} onRetry={() => void refreshExerciseCatalog(userId, true).catch(() => {})} />
      ) : (
        <FlatList
          style={styles.flex}
          data={list}
          keyExtractor={(e) => e.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: layout.cardGap, paddingBottom: 16 }}
          ListHeaderComponent={
            <ListItem
              icon="add"
              title="Create an exercise"
              subtitle="Your own, with an optional MuscleWiki link"
              chevron
              onPress={create}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="search"
              title={q.trim() ? `No match for "${q.trim()}"` : "No exercises here yet"}
              body="Create it, and it's yours from now on (works offline too)."
              actionLabel={q.trim() ? `Create "${q.trim()}"` : "Create an exercise"}
              onAction={create}
            />
          }
          renderItem={({ item }) => (
            <ExerciseRow
              exercise={item}
              meta={rowMeta(item, stats.get(item.id))}
              selected={mode === "browse" ? undefined : selected.some((x) => x.id === item.id)}
              onPress={() => onRow(item)}
            />
          )}
        />
      )}

      {mode !== "browse" && selected.length ? (
        <Button
          label={`Add ${selected.length} exercise${selected.length > 1 ? "s" : ""}`}
          icon="check"
          fullWidth
          glow
          onPress={confirm}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  chips: { gap: 8, paddingRight: 16 },
});
