// S36 · Phases list (P29). No export yet (D53): built from DESIGN.md §6.7 — like a project list: the active phase at
// the top with its progress, then past phases with their summaries, and "+ New phase".
import { router } from "expo-router";

import { Button, EmptyState, Header, Screen, Text } from "@/core/ui";
import { useActivityClock } from "@/features/activity/store";
import { PhaseCard } from "@/features/progress/components";
import { useProgress } from "@/features/progress/hooks";

export default function PhasesScreen() {
  const p = useProgress(useActivityClock());
  const past = p.phases.filter((ph) => ph.closedDate);
  const open = (id: string) => router.push(`/progress/phase/${id}`);

  return (
    <Screen header={<Header title="Phases" onBack={() => router.back()} />}>
      {p.active ? (
        <PhaseCard phase={p.active} series={p.series} today={p.today} onPress={() => open(p.active!.id)} />
      ) : (
        <EmptyState
          icon="history"
          title="No active phase"
          body="A phase is a block of weeks with one goal, like a summer cut. Your weekly check-ins happen inside it."
        />
      )}
      <Button
        label="New phase"
        icon="add"
        variant={p.active ? "secondary" : "primary"}
        onPress={() => router.push("/progress/phase-edit")}
      />

      {past.length ? (
        <>
          <Text variant="title" accessibilityRole="header">
            Past phases
          </Text>
          {past.map((ph) => (
            <PhaseCard key={ph.id} phase={ph} series={p.series} today={p.today} onPress={() => open(ph.id)} />
          ))}
        </>
      ) : null}
    </Screen>
  );
}
