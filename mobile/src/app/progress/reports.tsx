// D87 · Weekly reports: every stored report card, newest first. Tap one for the full card.
import { router } from "expo-router";

import { Card, EmptyState, Header, ListItem, Screen } from "@/core/ui";
import { useStoredReports } from "@/features/progress/report";
import { formatShortDate } from "@/features/targets/format";
import { useActiveUser } from "@/features/users/activeUser";

export default function ReportsScreen() {
  const userId = useActiveUser((s) => s.userId);
  const reports = useStoredReports(userId);
  const back = () => router.back();

  return (
    <Screen header={<Header title="Weekly reports" onBack={back} />}>
      {reports.length ? (
        <Card>
          {reports.map(({ checkinDate, report: r }, i) => (
            <ListItem
              key={checkinDate}
              title={`${formatShortDate(r.start)} – ${formatShortDate(r.end)}`}
              subtitle={[
                r.protein.avg != null ? `${r.protein.avg} g protein` : null,
                r.steps.avg != null ? `${r.steps.avg.toLocaleString("en-IN")} steps` : null,
                `${r.workouts.done}/${r.workouts.planned} workouts`,
              ]
                .filter(Boolean)
                .join(" · ")}
              value={`${r.grade} · ${r.score}`}
              chevron
              divider={i < reports.length - 1}
              onPress={() => router.push({ pathname: "/progress/report", params: { date: checkinDate } })}
            />
          ))}
        </Card>
      ) : (
        <EmptyState
          icon="check_circle"
          title="No reports yet"
          body="Your first report card arrives with your Sunday check-in."
          actionLabel="Back"
          onAction={back}
        />
      )}
    </Screen>
  );
}
