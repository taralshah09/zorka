// Placeholder target for quick-log entries whose phase hasn't landed yet (P10).
import { router, useLocalSearchParams } from "expo-router";

import { EmptyState, Header, Screen } from "@/core/ui";

export default function ComingSoon() {
  const { feature } = useLocalSearchParams<{ feature?: string }>();
  return (
    <Screen header={<Header title={feature ?? "Coming soon"} onBack={() => router.back()} />}>
      <EmptyState
        icon="schedule"
        title="Coming soon"
        body={`${feature ?? "This"} arrives in a later update.`}
        actionLabel="Back to Today"
        onAction={() => router.back()}
      />
    </Screen>
  );
}
