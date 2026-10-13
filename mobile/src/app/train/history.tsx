// UX T5 · "See all" from Train → Recent: every gym session and run/walk/ride on this profile, newest first.
import { router } from "expo-router";

import { EmptyState, Header, Screen } from "@/core/ui";
import { RecentCard, useRecentTraining } from "@/features/gym/recent";
import { useActiveUser } from "@/features/users/activeUser";

const LIMIT = 60;

export default function TrainingHistory() {
  const userId = useActiveUser((s) => s.userId);
  const items = useRecentTraining(userId, LIMIT);
  return (
    <Screen header={<Header title="Recent training" onBack={() => router.back()} />}>
      {items.length ? (
        items.map((item) => (
          <RecentCard key={item.kind === "workout" ? item.workout.id : item.activity.id} item={item} />
        ))
      ) : (
        <EmptyState icon="fitness_center" title="Nothing yet" body="Workouts, runs, walks and rides show up here." />
      )}
    </Screen>
  );
}
