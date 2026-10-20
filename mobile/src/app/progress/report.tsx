// D87 · One stored weekly report card (?date= the check-in's Sunday).
import { router, useLocalSearchParams } from "expo-router";

import { EmptyState, Header, Screen } from "@/core/ui";
import { ReportCard } from "@/features/progress/ReportCard";
import { useStoredReports } from "@/features/progress/report";
import { formatShortDate } from "@/features/targets/format";
import { useActiveUser } from "@/features/users/activeUser";

export default function ReportScreen() {
  const { date } = useLocalSearchParams<{ date?: string }>();
  const userId = useActiveUser((s) => s.userId);
  const found = useStoredReports(userId).find((r) => r.checkinDate === date);
  const back = () => router.back();

  return (
    <Screen header={<Header title="Weekly report" eyebrow={found ? `Week of ${formatShortDate(found.report.start)}` : undefined} onBack={back} />}>
      {found ? (
        <ReportCard report={found.report} />
      ) : (
        <EmptyState icon="check_circle" title="Report not found" body="This week has no report card." actionLabel="Back" onAction={back} />
      )}
    </Screen>
  );
}
