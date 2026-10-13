// UX T5 · One "Recent" list for the Train tab: gym sessions and GPS activities merged, newest first.
// Train shows 3 with "See all"; /train/history shows the rest.
import { router } from "expo-router";
import { StyleSheet, View } from "react-native";

import { Icon } from "@/core/icons/Icon";
import { useTheme } from "@/core/theme";
import { Badge, Card, Text } from "@/core/ui";
import { recentActivities, routePoints, useActivityVersion } from "@/features/activity/store";
import { ACTIVITY_LABEL, clockLabel, routeStats, type Activity, type ActivityKind } from "@shared/domain/activity";
import { ExerciseTile } from "./components";
import { formatDuration, formatVolume, relativeDay } from "./format";
import { useRecentWorkouts, workoutStats, type Workout } from "./store";

export type RecentItem =
  { kind: "workout"; at: number; workout: Workout } | { kind: "activity"; at: number; activity: Activity };

export function useRecentTraining(userId: string | null, limit: number): RecentItem[] {
  useActivityVersion();
  const workouts = useRecentWorkouts(userId, limit);
  const items: RecentItem[] = [
    ...workouts.map((w) => ({ kind: "workout" as const, at: Date.parse(w.startedAt), workout: w })),
    ...recentActivities(userId, limit).map((a) => ({ kind: "activity" as const, at: a.startedAt, activity: a })),
  ];
  return items.sort((x, y) => y.at - x.at).slice(0, limit);
}

const ACTIVITY_ICON = {
  run: "directions_run",
  walk: "directions_walk",
  ride: "directions_bike",
} as const satisfies Record<ActivityKind, string>;

export function RecentCard({ item }: { item: RecentItem }) {
  return item.kind === "workout" ? <SessionCard workout={item.workout} /> : <ActivityCard activity={item.activity} />;
}

function SessionCard({ workout }: { workout: Workout }) {
  const { colors } = useTheme();
  const stats = workoutStats(workout);
  const category = workout.exercises[0]?.category ?? null;
  return (
    <Card
      onPress={() => router.push({ pathname: "/train/summary/[id]", params: { id: workout.id } })}
      accessibilityLabel={`${workout.name}, ${relativeDay(workout.startedAt)}, ${formatVolume(stats.volumeKg)}, ${stats.prs.length} PRs`}
    >
      <View style={styles.inline}>
        <ExerciseTile category={category} />
        <View style={styles.flex}>
          <Text variant="title" numberOfLines={1}>
            {workout.name}
          </Text>
          <Text variant="caption" color="textSecondary">
            {`${relativeDay(workout.startedAt)} · ${formatDuration(stats.durationS)} · ${formatVolume(stats.volumeKg)}`}
          </Text>
        </View>
        {stats.prs.length ? (
          <Badge label={`${stats.prs.length} PR${stats.prs.length > 1 ? "s" : ""}`} tone="lime" icon="trophy" />
        ) : null}
        {!workout.synced ? <Icon name="cloud_off" size={16} color={colors.textTertiary} /> : null}
      </View>
    </Card>
  );
}

function ActivityCard({ activity: a }: { activity: Activity }) {
  const { colors, radius } = useTheme();
  const km = (routeStats(routePoints(a.id)).distanceM / 1000).toFixed(2);
  const when = relativeDay(new Date(a.startedAt).toISOString());
  return (
    <Card
      onPress={() => router.push({ pathname: "/activity/summary/[id]", params: { id: a.id } })}
      accessibilityLabel={`${ACTIVITY_LABEL[a.kind]}, ${when}, ${km} km`}
    >
      <View style={styles.inline}>
        <View style={[styles.tile, { backgroundColor: colors.surfaceHigh, borderRadius: radius.md }]}>
          <Icon name={ACTIVITY_ICON[a.kind]} size={20} color={colors.primaryText} />
        </View>
        <View style={styles.flex}>
          <Text variant="title" numberOfLines={1}>
            {ACTIVITY_LABEL[a.kind]}
          </Text>
          <Text variant="caption" color="textSecondary" tabular>
            {`${when} · ${km} km · ${clockLabel(a.elapsedMs / 1000)}`}
          </Text>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  inline: { flexDirection: "row", alignItems: "center", gap: 12 },
  flex: { flex: 1, gap: 2 },
  tile: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
});
