import { router, useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { Button, Card, EmptyState, Header, Screen, Text } from "@/core/ui";
import { RouteMap } from "@/features/activity/components";
import { getActivity, routePoints, useActivityClock } from "@/features/activity/store";
import { useActiveUser } from "@/features/users/activeUser";
import { ACTIVITY_LABEL, calories, clockLabel, MET, movePoints, paceLabel, routeStats } from "@shared/domain/activity";

export default function ActivitySummary() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = useActiveUser((s) => s.userId);
  useActivityClock();
  const a = getActivity(id);
  if (!a || a.userId !== userId || a.status !== "done")
    return (
      <Screen header={<Header title="Activity summary" onBack={() => router.back()} />}>
        <EmptyState
          icon="directions_run"
          title="Activity not found"
          body="No saved activity with this id for this profile."
          actionLabel="Back to Train"
          onAction={() => router.replace("/(tabs)/train")}
        />
      </Screen>
    );
  const points = routePoints(id);
  const stats = routeStats(points);
  const seconds = a.elapsedMs / 1000;
  const kcal = Math.round(calories(MET[a.kind], a.weightKg, seconds));
  return (
    <Screen
      header={<Header title={`${ACTIVITY_LABEL[a.kind]} summary`} onBack={() => router.replace("/(tabs)/train")} />}
    >
      <RouteMap points={points} />
      <Card variant="highlighted" glow>
        <Text variant="eyebrow" color="ink">
          Saved on this phone
        </Text>
        <Text variant="display-xl" color="ink" tabular>{`${(stats.distanceM / 1000).toFixed(2)} km`}</Text>
        <Text
          variant="title"
          color="ink"
          tabular
        >{`${clockLabel(seconds)} · ${paceLabel(seconds, stats.distanceM)}`}</Text>
      </Card>
      <Card>
        <Text
          variant="headline-sm"
          color="primaryText"
        >{`+${kcal} estimated kcal added to ${a.localDate}'s budget`}</Text>
        <Text variant="body">{`${Math.floor(movePoints(MET[a.kind], seconds))} Move points`}</Text>
        <Text
          variant="caption"
          color="textSecondary"
        >{`${MET[a.kind]} MET × ${a.weightKg} kg × ${(seconds / 3600).toFixed(2)} active hours. Paused time excluded. Calories are a gross estimate; your base target already includes usual activity.`}</Text>
        <Text variant="caption" color="textSecondary">
          Opening this summary again adds no extra calories.
        </Text>
      </Card>
      <Card eyebrow="Splits per km">
        {stats.splits.length ? (
          stats.splits.map((s) => (
            <View
              key={s.km}
              style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 10, gap: 12 }}
            >
              <Text variant="body">{s.complete ? `Km ${s.km}` : `Last ${(s.distanceM / 1000).toFixed(2)} km`}</Text>
              <Text variant="label" tabular>{`${clockLabel(s.seconds)} · ${paceLabel(s.seconds, s.distanceM)}`}</Text>
            </View>
          ))
        ) : (
          <Text variant="body" color="textSecondary">
            Not enough GPS distance for splits.
          </Text>
        )}
        <Text variant="caption" color="textSecondary">
          Splits interpolate kilometre crossings. GPS gaps stay disconnected; average pace includes all unpaused time.
        </Text>
      </Card>
      <Button
        label="Share"
        icon="ios_share"
        variant="secondary"
        fullWidth
        onPress={() => router.push({ pathname: "/share", params: { card: "run", id: a.id } })}
      />
      <Button label="Done" fullWidth onPress={() => router.replace("/(tabs)/train")} />
    </Screen>
  );
}
