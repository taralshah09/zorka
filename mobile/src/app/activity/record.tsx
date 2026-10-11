import * as Location from "expo-location";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { AppState, Linking, PermissionsAndroid, Platform } from "react-native";
import { BottomSheet, Button, Card, Header, Screen, SegmentedControl, Text } from "@/core/ui";
import { RouteMap } from "@/features/activity/components";
import { resumeRecorder } from "@/features/activity/recorder";
import { activeActivity, createActivity, useActivityClock } from "@/features/activity/store";
import { useTargets } from "@/features/targets/targets";
import { useActiveUser } from "@/features/users/activeUser";
import { ACTIVITY_LABEL, MET, type ActivityKind, type RoutePoint } from "@shared/domain/activity";

export default function RecordSetup() {
  const params = useLocalSearchParams<{ kind?: string }>();
  const [kind, setKind] = useState<ActivityKind>(
    params.kind === "walk" || params.kind === "ride" ? params.kind : "run",
  );
  const userId = useActiveUser((s) => s.userId);
  const { profile } = useTargets();
  const now = useActivityClock();
  const active = activeActivity();
  const activeId = active?.id;
  const [permission, setPermission] = useState(false);
  const [background, setBackground] = useState(false);
  const [sheet, setSheet] = useState<"location" | "background" | null>(null);
  const [fix, setFix] = useState<RoutePoint | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const refreshPermission = () =>
      void Location.getForegroundPermissionsAsync()
        .then((p) => setPermission(p.granted))
        .catch(() => {});
    refreshPermission();
    if (Platform.OS !== "web")
      void Location.getBackgroundPermissionsAsync()
        .then((p) => setBackground(p.granted))
        .catch(() => {});
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") refreshPermission();
    });
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (!permission || activeId) return;
    let disposed = false;
    let watch: Location.LocationSubscription | undefined;
    void Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 0 },
      (l) => {
        if (!disposed)
          setFix({
            latitude: l.coords.latitude,
            longitude: l.coords.longitude,
            accuracy: l.coords.accuracy ?? Infinity,
            timestamp: l.timestamp,
            activeMs: 0,
            segment: 0,
          });
      },
      () => setError("Couldn't acquire GPS. Check location settings and move outdoors."),
    )
      .then((w) => {
        if (disposed) w.remove();
        else watch = w;
      })
      .catch(() => setError("Turn on Location and allow precise location for Zorka."));
    return () => {
      disposed = true;
      watch?.remove();
    };
  }, [permission, activeId]);
  const ready = fix && fix.accuracy <= 35 && now - fix.timestamp < 20000;
  const allow = async () => {
    setBusy(true);
    setError(null);
    try {
      const p =
        sheet === "background"
          ? await Location.requestBackgroundPermissionsAsync()
          : await Location.requestForegroundPermissionsAsync();
      if (sheet === "background") setBackground(p.granted);
      else setPermission(p.granted);
      if (sheet === "background" && p.granted && Platform.OS === "android" && Number(Platform.Version) >= 33) {
        const notification = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
        if (notification !== PermissionsAndroid.RESULTS.GRANTED)
          setError(
            "Recording notifications are off. Enable notifications in Settings to see progress on your lock screen.",
          );
      }
      if (!p.granted)
        setError(
          p.canAskAgain
            ? "Location wasn't allowed. You can try again when ready."
            : "Enable location in Settings to record. Choose precise location.",
        );
      setSheet(null);
    } catch {
      setError("This build couldn't request location. Install a development build and try again.");
    } finally {
      setBusy(false);
    }
  };
  const start = async () => {
    if (!userId || !ready) return;
    setBusy(true);
    setError(null);
    try {
      const a = createActivity(userId, kind, profile.data?.weightKg ?? 0, background);
      await resumeRecorder(a.id);
      router.replace({ pathname: "/activity/live", params: { id: a.id } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start recording.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen header={<Header title="Record activity" onBack={() => router.back()} />}>
      {active ? (
        <Card>
          <Text variant="title">
            {active.userId === userId
              ? `${ACTIVITY_LABEL[active.kind]} in progress`
              : "Another profile has an activity open"}
          </Text>
          <Text variant="body" color="textSecondary">
            One recorder can run on this phone at a time.
          </Text>
          {active.userId === userId ? (
            <Button
              label="Open recorder"
              onPress={() => router.replace({ pathname: "/activity/live", params: { id: active.id } })}
            />
          ) : (
            <Button label="Switch profile" onPress={() => router.push("/profiles")} />
          )}
        </Card>
      ) : (
        <>
          <SegmentedControl
            segments={[
              { value: "run", label: "Run" },
              { value: "walk", label: "Walk" },
              { value: "ride", label: "Ride" },
            ]}
            value={kind}
            onChange={setKind}
            accessibilityLabel="Activity type"
          />
          <RouteMap points={fix ? [fix] : []} mode="preview" />
          <Text variant="title" color={ready ? "primaryText" : "warn"}>
            {!permission
              ? "Location permission needed"
              : ready
                ? `GPS ready · ±${Math.round(fix!.accuracy)} m`
                : "Locating… move outdoors"}
          </Text>
          {!permission ? <Button label="Enable location" onPress={() => setSheet("location")} /> : null}
          <Card>
            <Text variant="title">{background ? "Screen-off recording enabled" : "Foreground recording only"}</Text>
            <Text variant="body" color="textSecondary">
              {background
                ? "Your route keeps recording when you lock the phone. Keep Zorka in recent apps."
                : "Leaving Zorka or locking the screen pauses the recorder. Enable screen-off recording for a full run."}
            </Text>
            {Platform.OS !== "web" ? (
              <Button
                label={background ? "Use foreground only" : "Enable screen-off recording"}
                variant="ghost"
                onPress={() => (background ? setBackground(false) : setSheet("background"))}
              />
            ) : null}
            <Button
              label="Keep runs recording · battery guide"
              variant="ghost"
              onPress={() => router.push("/activity/battery")}
            />
          </Card>
          <Text
            variant="caption"
            color="textSecondary"
          >{`Estimated intensity: ${MET[kind]} MET. Calories use your profile weight (${profile.data?.weightKg ?? "not set"} kg) × MET × active hours. Pause when resting.`}</Text>
          <Button
            label={`Start ${ACTIVITY_LABEL[kind].toLowerCase()}`}
            size="lg"
            fullWidth
            glow
            loading={busy}
            disabled={!ready || !userId || !profile.data?.weightKg}
            onPress={() => void start()}
          />
        </>
      )}
      {error ? (
        <>
          <Text variant="body" color="warn">
            {error}
          </Text>
          <Button
            label="Open location settings"
            variant="ghost"
            onPress={() => void Linking.openSettings().catch(() => setError("Couldn't open Settings."))}
          />
        </>
      ) : null}
      <BottomSheet
        visible={sheet !== null}
        onClose={() => setSheet(null)}
        title={sheet === "background" ? "Record with your screen off" : "Record your route"}
      >
        <Text variant="body">
          {sheet === "background"
            ? "Allow location all the time so Zorka can record an activity you start, even while the screen is locked. Android may open Settings; choose Allow all the time."
            : "Zorka uses precise location while you record to calculate distance and pace and save your route."}
        </Text>
        <Text variant="caption" color="textSecondary">
          Routes stay on this phone and work offline. Location is used only while recording an activity. Pause or stop
          to turn tracking off.
        </Text>
        {sheet === "background" ? (
          <Text variant="caption" color="textSecondary">
            Zorka also asks to show a recording notification with distance and time so you can return to your recorder
            from the lock screen.
          </Text>
        ) : null}
        <Button label="Continue" fullWidth loading={busy} onPress={() => void allow()} />
        <Button label="Not now" variant="ghost" fullWidth onPress={() => setSheet(null)} />
      </BottomSheet>
    </Screen>
  );
}
