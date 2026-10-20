// Train analytics · Strength over time, per exercise. Pick one of the exercises you've logged (most recent first, or
// search) and see its progress line over 3, 6 or 12 months and how it compares with 3, 6 and 12 months ago
// (StrengthTrend, the same card as on each exercise's page). Read from this phone's workouts, so it works offline.
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { Button, Chip, EmptyState, Header, Screen, Text, TextField } from "@/core/ui";
import { useExercises } from "@/features/gym/catalog";
import { relativeDay } from "@/features/gym/format";
import { useExerciseSessions, useExerciseStats } from "@/features/gym/store";
import { StrengthTrend } from "@/features/gym/StrengthTrend";
import { useActiveUser } from "@/features/users/activeUser";
import { normalize } from "@shared/domain/foodMatch";
import { CATEGORY_LABEL } from "@shared/domain/gym";

export default function StrengthAnalytics() {
  const userId = useActiveUser((s) => s.userId);
  const { exerciseId } = useLocalSearchParams<{ exerciseId?: string }>();
  const exercises = useExercises(userId);
  const stats = useExerciseStats(userId, exercises);
  const [query, setQuery] = useState("");
  const [openedAt] = useState(() => Date.now());
  const logged = useMemo(
    () => exercises.filter((e) => stats.has(e.id)).sort((a, b) => stats.get(b.id)!.lastAt.localeCompare(stats.get(a.id)!.lastAt)),
    [exercises, stats],
  );
  const [picked, setPicked] = useState<string | null>(exerciseId ?? null);
  const selected = logged.find((e) => e.id === picked) ?? logged[0] ?? null;
  const sessions = useExerciseSessions(userId, selected?.id);
  const q = normalize(query);
  const shown = q ? logged.filter((e) => normalize(e.name).includes(q)) : logged;

  if (!userId) return null;
  return (
    <Screen header={<Header title="Strength analytics" onBack={() => router.back()} />}>
      {!logged.length ? (
        <EmptyState
          icon="show_chart"
          title="Nothing to compare yet"
          body="Log an exercise on a few days and see how your weights move over 3, 6 and 12 months."
          actionLabel="Log today's workout"
          onAction={() => router.replace("/train/workout")}
        />
      ) : (
        <>
          {logged.length > 8 ? <TextField label="Find an exercise" value={query} onChangeText={setQuery} /> : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {shown.map((e) => (
              <Chip key={e.id} label={e.name} kind="choice" selected={e.id === selected?.id} onPress={() => setPicked(e.id)} />
            ))}
          </ScrollView>
          {selected ? (
            <>
              <View>
                <Text variant="headline-md" accessibilityRole="header">
                  {selected.name}
                </Text>
                <Text variant="caption" color="textSecondary">
                  {`${CATEGORY_LABEL[selected.category]} · last logged ${relativeDay(stats.get(selected.id)!.lastAt).toLowerCase()}`}
                </Text>
              </View>
              <StrengthTrend key={selected.id} type={selected.type} sessions={sessions} now={openedAt} />
              <Button
                label="All sessions and records"
                variant="ghost"
                icon="chevron_right"
                onPress={() => router.push({ pathname: "/train/exercise/[id]", params: { id: selected.id } })}
              />
            </>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { gap: 8, paddingVertical: 4 },
});
