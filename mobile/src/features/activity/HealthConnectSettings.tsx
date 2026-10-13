import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { AppState } from "react-native";
import { BottomSheet, Button, Card, Text } from "@/core/ui";
import { healthStatus, installHealth, openHealthSettings, requestSteps, type HealthState } from "./health";

const STATUS: Record<HealthState, string> = {
  loading: "Checking availability…",
  ready: "Connected · Steps read access enabled",
  permission: "Not connected · Allow Steps access to show your daily ring",
  missing: "Install or update Health Connect to connect your steps",
  unsupported: "Health Connect is unavailable on this device",
  build: __DEV__
    ? "Open the installed Zorka app. Health Connect is unavailable in Expo Go."
    : "This version of the app can't read steps. Update it to connect.",
  error: "Could not check Health Connect. Try again.",
};

export function HealthConnectSettings({
  showStepsLink = true,
  onStatusChange,
  onBusyChange,
}: {
  showStepsLink?: boolean;
  onStatusChange?: (status: HealthState) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [status, setStatus] = useState<HealthState>("loading");
  const [explainer, setExplainer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      const refresh = () =>
        void healthStatus().then((next) => {
          if (active) {
            setStatus(next);
            onStatusChange?.(next);
          }
        });
      refresh();
      const sub = AppState.addEventListener("change", (state) => {
        if (state === "active") refresh();
      });
      return () => {
        active = false;
        sub.remove();
      };
    }, [onStatusChange]),
  );

  const connect = async () => {
    setBusy(true);
    onBusyChange?.(true);
    setError(null);
    try {
      const next = await requestSteps();
      setStatus(next);
      onStatusChange?.(next);
      setExplainer(false);
      if (next === "permission")
        setError("Steps access was not granted. You can connect again whenever you are ready.");
    } catch {
      setError("Could not open Health Connect. Try again.");
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  };

  return (
    <>
      <Card>
        <Text variant="title">Health Connect</Text>
        <Text variant="body" color="textSecondary">
          {STATUS[status]}
        </Text>
        <Text variant="caption" color="textSecondary">
          Zorka reads Steps shared by Google Fit or another compatible app. No Google account sign-in is needed here.
        </Text>
        {status === "permission" ? (
          <Button
            label="Connect Health Connect"
            onPress={() => {
              setError(null);
              setExplainer(true);
            }}
          />
        ) : null}
        {status === "ready" ? (
          <Button
            label="Manage Health Connect access"
            variant="ghost"
            onPress={() => void openHealthSettings().catch(() => setError("Could not open Health Connect settings."))}
          />
        ) : null}
        {status === "missing" ? (
          <Button
            label="Install or update Health Connect"
            onPress={() => void installHealth().catch(() => setError("Could not open the Play Store."))}
          />
        ) : null}
        {status === "error" ? (
          <Button
            label="Retry Health Connect"
            variant="ghost"
            onPress={() =>
              void healthStatus().then((next) => {
                setStatus(next);
                onStatusChange?.(next);
              })
            }
          />
        ) : null}
        <Text variant="caption" color="textSecondary">
          Using Google Fit? In Fit, open Profile → Settings → turn on Sync Fit with Health Connect, and allow it to
          share Steps.
        </Text>
        {showStepsLink ? (
          <Button label="View steps & Move points" variant="ghost" onPress={() => router.push("/activity/steps")} />
        ) : null}
        {error ? (
          <Text variant="body" color="warn">
            {error}
          </Text>
        ) : null}
      </Card>
      <BottomSheet
        visible={explainer}
        onClose={() => {
          if (!busy) setExplainer(false);
        }}
        title="Read your steps"
      >
        <Text variant="body">
          Zorka reads only Steps from Health Connect to show your daily ring and seven-day history. It never writes
          health data. Step totals stay on this phone.
        </Text>
        <Text variant="caption" color="textSecondary">
          You choose access in Android and can remove it at any time in Health Connect settings.
        </Text>
        <Button label="Continue" loading={busy} onPress={() => void connect()} fullWidth />
        <Button label="Not now" variant="ghost" disabled={busy} onPress={() => setExplainer(false)} fullWidth />
      </BottomSheet>
    </>
  );
}
