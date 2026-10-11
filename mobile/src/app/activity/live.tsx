import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { useTheme } from "@/core/theme";
import { Button, Card, EmptyState, Header, PressableScale, Screen, Text } from "@/core/ui";
import { RouteMap } from "@/features/activity/components";
import {
  liveStats,
  pauseRecorder,
  reconcileRecorder,
  resumeRecorder,
  stopRecorder,
} from "@/features/activity/recorder";
import { getActivity, useActivityClock } from "@/features/activity/store";
import { useActiveUser } from "@/features/users/activeUser";
import { ACTIVITY_LABEL, clockLabel, paceLabel } from "@shared/domain/activity";

export default function LiveActivity() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = useActiveUser((s) => s.userId);
  const now = useActivityClock();
  const a = getActivity(id);
  const { colors, radius } = useTheme();
  const [locked, setLocked] = useState(false);
  const [map, setMap] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void reconcileRecorder().catch(() => setError("Couldn't check the recording service."));
  }, []);
  if (!a || a.userId !== userId)
    return (
      <Screen header={<Header title="Recorder" onBack={() => router.back()} />}>
        <EmptyState
          icon="directions_run"
          title="Recording not found"
          body="It belongs to another profile or was deleted."
          actionLabel="Back to Train"
          onAction={() => router.replace("/(tabs)/train")}
        />
      </Screen>
    );
  if (a.status === "done")
    return (
      <Screen header={<Header title="Recorder" onBack={() => router.back()} />}>
        <Button
          label="View saved summary"
          onPress={() => router.replace({ pathname: "/activity/summary/[id]", params: { id } })}
        />
      </Screen>
    );
  const stats = liveStats(a, now);
  const act = async (action: "pause" | "resume" | "stop") => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (action === "pause") await pauseRecorder(id);
      else if (action === "resume") await resumeRecorder(id);
      else {
        await stopRecorder(id);
        router.replace({ pathname: "/activity/summary/[id]", params: { id } });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't change recording state.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen
      header={
        <Header
          title={`${ACTIVITY_LABEL[a.kind]} · ${a.status === "paused" ? "Paused" : "Recording"}`}
          onBack={() => router.back()}
        />
      }
    >
      <Card variant="highlighted" glow>
        <Text variant="eyebrow" color="ink">
          Distance
        </Text>
        <Text variant="display-xl" color="ink" tabular>{`${(stats.distanceM / 1000).toFixed(2)} km`}</Text>
        <Text variant="headline-lg" color="ink" tabular>
          {clockLabel(stats.seconds)}
        </Text>
      </Card>
      <View style={styles.row}>
        <Card>
          <Text variant="caption" color="textSecondary">
            Current pace
          </Text>
          <Text variant="title" tabular>
            {a.status === "paused" || stats.weak ? "—" : paceLabel(stats.currentSeconds, stats.currentDistance)}
          </Text>
        </Card>
        <Card>
          <Text variant="caption" color="textSecondary">
            Average pace
          </Text>
          <Text variant="title" tabular>
            {paceLabel(stats.seconds, stats.distanceM)}
          </Text>
        </Card>
      </View>
      <Text variant="body" color={stats.weak && a.status === "recording" ? "warn" : "textSecondary"}>
        {a.error ??
          (a.status === "paused"
            ? "Paused. Time, distance and points are on hold."
            : stats.weak
              ? "GPS weak. Distance may be incomplete; move into open sky."
              : "GPS recording · saved on this phone")}
      </Text>
      <Text variant="caption" color="textSecondary">
        {a.background
          ? "You can lock your phone. Keep the recording notification active."
          : "Foreground only: leaving Zorka or locking your phone pauses this activity."}
      </Text>
      <Button label={map ? "Hide route" : "Show route"} variant="ghost" onPress={() => setMap(!map)} />
      {map ? <RouteMap points={stats.points} mode="live" /> : null}
      {locked ? (
        <Card>
          <Text variant="title">Controls locked</Text>
          <Text variant="body" color="textSecondary">
            Recording continues. Hold to unlock.
          </Text>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Unlock controls"
            accessibilityHint="Hold for one second"
            delayLongPress={1000}
            onLongPress={() => setLocked(false)}
            onAccessibilityAction={() => setLocked(false)}
            accessibilityActions={[{ name: "activate", label: "Unlock controls" }]}
            style={[styles.hold, { borderRadius: radius.full, backgroundColor: colors.secondary }]}
          >
            <Text variant="label" color="ink">
              Hold to unlock
            </Text>
          </PressableScale>
        </Card>
      ) : (
        <>
          <Button
            label={a.status === "paused" ? "Resume" : "Pause"}
            loading={busy}
            onPress={() => void act(a.status === "paused" ? "resume" : "pause")}
            fullWidth
          />
          <Button label="Lock controls" variant="ghost" onPress={() => setLocked(true)} fullWidth />
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Stop and save activity"
            accessibilityHint="Hold for one second to stop and save"
            accessibilityActions={[{ name: "activate", label: "Stop and save" }]}
            onAccessibilityAction={() =>
              Alert.alert("Stop activity?", "Your route and summary will be saved.", [
                { text: "Keep recording", style: "cancel" },
                { text: "Stop and save", onPress: () => void act("stop") },
              ])
            }
            disabled={busy}
            delayLongPress={1000}
            onLongPress={() => void act("stop")}
            style={[
              styles.hold,
              {
                backgroundColor: colors.surfaceHigh,
                borderRadius: radius.full,
                borderColor: colors.outline,
                borderWidth: 1,
              },
            ]}
          >
            <Text variant="label" color="warn">
              Hold to stop & save
            </Text>
          </PressableScale>
        </>
      )}
      {error ? (
        <Text variant="body" color="warn">
          {error}
        </Text>
      ) : null}
      <Button label="Battery & screen-off help" variant="ghost" onPress={() => router.push("/activity/battery")} />
    </Screen>
  );
}
const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  hold: { minHeight: 56, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
});
