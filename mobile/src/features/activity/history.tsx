import { router } from "expo-router";
import { getDb } from "@/core/storage/db";
import { Button, Card, Text } from "@/core/ui";
import { ACTIVITY_LABEL, clockLabel, routeStats, type Activity } from "@shared/domain/activity";
import { activeActivity, routePoints, useActivityClock } from "./store";

export function ActivityHistory({ userId }: { userId: string | null }) {
  useActivityClock();
  const active = activeActivity();
  const sessions = userId
    ? getDb()
        .getAllSync<{ data: string }>(
          "SELECT data FROM activities WHERE user_id = ? AND status = 'done' ORDER BY json_extract(data, '$.startedAt') DESC LIMIT 10",
          userId,
        )
        .map((r) => JSON.parse(r.data) as Activity)
    : [];
  return (
    <>
      {active?.userId === userId ? (
        <Card>
          <Text variant="title">{`${ACTIVITY_LABEL[active.kind]} ${active.status === "paused" ? "paused" : "recording"}`}</Text>
          <Button
            label="Open activity recorder"
            onPress={() => router.push({ pathname: "/activity/live", params: { id: active.id } })}
          />
        </Card>
      ) : null}
      {sessions.length ? <Text variant="headline-sm">Recent activities</Text> : null}
      {sessions.map((a) => (
        <Card
          key={a.id}
          onPress={() => router.push({ pathname: "/activity/summary/[id]", params: { id: a.id } })}
          accessibilityLabel={`View ${ACTIVITY_LABEL[a.kind]} summary from ${a.localDate}`}
        >
          <Text variant="title">{`${ACTIVITY_LABEL[a.kind]} · ${a.localDate}`}</Text>
          <Text
            variant="body"
            tabular
          >{`${(routeStats(routePoints(a.id)).distanceM / 1000).toFixed(2)} km · ${clockLabel(a.elapsedMs / 1000)}`}</Text>
          <Text variant="caption" color="textSecondary">
            Saved on this phone
          </Text>
        </Card>
      ))}
    </>
  );
}
