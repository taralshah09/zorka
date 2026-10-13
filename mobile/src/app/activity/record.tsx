// S28 · Record setup (P25/P26). UX T1: screen-off recording is the main path. Tapping Start asks for "Allow all the
// time" in place when it isn't granted; "Start without it" says plainly that the run pauses when the phone locks.
// UX T2: with no weight on the profile, an inline field fills it in instead of a Start button disabled with no reason.
import * as Location from "expo-location";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { AppState, Linking, PermissionsAndroid, Platform } from "react-native";
import { kv, KV_KEYS } from "@/core/storage/kv";
import { BottomSheet, Button, Card, Header, NumberStepper, Screen, SegmentedControl, Text } from "@/core/ui";
import { RouteMap } from "@/features/activity/components";
import { resumeRecorder } from "@/features/activity/recorder";
import { activeActivity, createActivity, useActivityClock } from "@/features/activity/store";
import { useTargets } from "@/features/targets/targets";
import { BOUNDS } from "@/features/onboarding/draft";
import { useActiveUser } from "@/features/users/activeUser";
import { useUpdateProfile } from "@/features/users/api";
import { ACTIVITY_LABEL, type ActivityKind, type RoutePoint } from "@shared/domain/activity";

/** Starting value for the inline weight field (UX T2); the user types or steps to their own. */
const WEIGHT_START_KG = 70;

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
  // "start": the screen-off ask shown when Start is tapped; "background": the same ask from the inline link.
  const [sheet, setSheet] = useState<"location" | "background" | "start" | null>(null);
  const [declined, setDeclined] = useState(() => kv.get(KV_KEYS.screenOffDeclined) === "1");
  const [typedWeight, setTypedWeight] = useState(WEIGHT_START_KG);
  const updateProfile = useUpdateProfile(userId);
  const profileWeight = profile.data?.weightKg ?? 0;
  const needsWeight = !profile.isLoading && !profileWeight;
  const canBackground = Platform.OS !== "web";
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
    const asked = sheet;
    const wantsBackground = asked === "background" || asked === "start";
    setBusy(true);
    setError(null);
    try {
      const p = wantsBackground
        ? await Location.requestBackgroundPermissionsAsync()
        : await Location.requestForegroundPermissionsAsync();
      if (wantsBackground) setBackground(p.granted);
      else setPermission(p.granted);
      if (wantsBackground && p.granted) {
        kv.remove(KV_KEYS.screenOffDeclined);
        setDeclined(false);
      }
      if (wantsBackground && p.granted && Platform.OS === "android" && Number(Platform.Version) >= 33) {
        const notification = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
        if (notification !== PermissionsAndroid.RESULTS.GRANTED)
          setError(
            "Recording notifications are off. Enable notifications in Settings to see progress on your lock screen.",
          );
      }
      if (!p.granted && wantsBackground) {
        // Not allowed: don't start yet. The warning above Start says what happens; the next tap starts anyway.
        kv.set(KV_KEYS.screenOffDeclined, "1");
        setDeclined(true);
        if (!p.canAskAgain)
          setError("To record with the screen off, open Settings → Location and choose Allow all the time.");
      } else if (!p.granted)
        setError(
          p.canAskAgain
            ? "Location wasn't allowed. You can try again when ready."
            : "Enable location in Settings to record. Choose precise location.",
        );
      setSheet(null);
      if (asked === "start" && p.granted) {
        setBusy(false);
        await begin(true);
      }
    } catch {
      setError("This build couldn't request location. Install a development build and try again.");
    } finally {
      setBusy(false);
    }
  };
  const start = () => {
    if (!userId || !ready) return;
    if (canBackground && !background && !declined) setSheet("start");
    else void begin(background);
  };
  const skipBackground = () => {
    kv.set(KV_KEYS.screenOffDeclined, "1");
    setDeclined(true);
    setSheet(null);
    void begin(false);
  };
  async function begin(screenOff: boolean) {
    if (!userId || !ready) return;
    setBusy(true);
    setError(null);
    try {
      const weightKg = profileWeight || typedWeight;
      // Best effort: the activity keeps this weight either way; the profile gets it when the network allows.
      if (!profileWeight) updateProfile.mutate({ weightKg });
      const a = createActivity(userId, kind, weightKg, screenOff);
      await resumeRecorder(a.id);
      router.replace({ pathname: "/activity/live", params: { id: a.id } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start recording.");
    } finally {
      setBusy(false);
    }
  }
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
          {needsWeight ? (
            <Card variant="warning">
              <Text variant="title">Add your weight</Text>
              <Text variant="body" color="textSecondary">
                {"Calories are worked out from your weight. It's saved to your profile too."}
              </Text>
              <NumberStepper
                label="Weight"
                value={typedWeight}
                onChange={setTypedWeight}
                min={BOUNDS.weightKg.min}
                max={BOUNDS.weightKg.max}
                step={0.5}
                unit="kg"
              />
            </Card>
          ) : null}
          {canBackground && background ? (
            <Text variant="body" color="textSecondary">
              Keeps recording when you lock the phone. Keep Zorka in recent apps.
            </Text>
          ) : null}
          {canBackground && !background && declined ? (
            <Card variant="warning">
              <Text variant="title">Your run pauses if you lock the phone</Text>
              <Text variant="body" color="textSecondary">
                Keep Zorka open on screen, or allow location all the time.
              </Text>
              <Button label="Keep recording when locked" variant="ghost" onPress={() => setSheet("background")} />
            </Card>
          ) : null}
          <Text variant="caption" color="textSecondary">
            {"Calories are estimated from your weight, the activity and the time you're moving. Pause when resting."}
          </Text>
          <Button
            label={`Start ${ACTIVITY_LABEL[kind].toLowerCase()}`}
            size="lg"
            fullWidth
            glow
            loading={busy}
            disabled={!ready || !userId || profile.isLoading}
            onPress={start}
          />
          {canBackground ? (
            <Button
              label="Keep runs recording · battery guide"
              variant="ghost"
              onPress={() => router.push("/activity/battery")}
            />
          ) : null}
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
        title={sheet === "location" ? "Record your route" : "Keep recording with the screen off"}
      >
        <Text variant="body">
          {sheet !== "location"
            ? "Allow location all the time so Zorka can record an activity you start, even while the screen is locked. Android may open Settings; choose Allow all the time."
            : "Zorka uses precise location while you record to calculate distance and pace and save your route."}
        </Text>
        <Text variant="caption" color="textSecondary">
          Routes stay on this phone and work offline. Location is used only while recording an activity. Pause or stop
          to turn tracking off.
        </Text>
        {sheet !== "location" ? (
          <Text variant="caption" color="textSecondary">
            Zorka also asks to show a recording notification with distance and time so you can return to your recorder
            from the lock screen.
          </Text>
        ) : null}
        {sheet === "start" ? (
          <>
            <Text variant="body" color="warn">
              Without it, your run pauses when you lock the phone.
            </Text>
            <Button label="Allow and start" fullWidth loading={busy} onPress={() => void allow()} />
            <Button label="Start without it" variant="ghost" fullWidth disabled={busy} onPress={skipBackground} />
          </>
        ) : (
          <>
            <Button label="Continue" fullWidth loading={busy} onPress={() => void allow()} />
            <Button label="Not now" variant="ghost" fullWidth onPress={() => setSheet(null)} />
          </>
        )}
      </BottomSheet>
    </Screen>
  );
}
