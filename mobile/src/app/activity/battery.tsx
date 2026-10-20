import * as Device from "expo-device";
import * as IntentLauncher from "expo-intent-launcher";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { AppState, Linking, Platform } from "react-native";
import { Button, Card, Header, Screen, Text } from "@/core/ui";
import { batteryOptimization, type BatteryOptimization } from "@/features/activity/battery";

export default function BatteryGuide() {
  const brand = (Device.manufacturer ?? Device.brand ?? "Android").toLowerCase();
  const [error, setError] = useState<string | null>(null);
  const [optimization, setOptimization] = useState<BatteryOptimization | "checking">("checking");
  useEffect(() => {
    let mounted = true;
    const refresh = () => { void batteryOptimization().then((result) => { if (mounted) setOptimization(result); }); };
    refresh();
    const sub = AppState.addEventListener("change", (state) => { if (state === "active") refresh(); });
    return () => { mounted = false; sub.remove(); };
  }, []);
  const advice = /xiaomi|redmi|poco/.test(brand)
    ? [
        "Settings → Apps → Zorka → Battery saver → No restrictions.",
        "Enable Background autostart for Zorka if your phone offers it.",
        "Lock Zorka in Recent apps so the system doesn't clear the recorder.",
      ]
    : /oppo|realme|oneplus|vivo/.test(brand)
      ? [
          "Settings → Apps → Zorka → Battery usage → Allow background activity.",
          "Allow auto-launch / autostart for Zorka if available.",
          "Lock Zorka in Recent apps; avoid clearing it during a run.",
        ]
      : /samsung/.test(brand)
        ? [
            "Settings → Apps → Zorka → Battery → Unrestricted.",
            "Remove Zorka from Sleeping / Deep sleeping apps.",
            "Keep Zorka in Recent apps while an activity is recording.",
          ]
        : [
            "Settings → Apps → Zorka → Battery → Unrestricted (or Don't optimise).",
            "Allow background activity / autostart if your phone offers it.",
            "Keep Zorka in Recent apps during your activity.",
          ];
  const open = async () => {
    try {
      if (Platform.OS === "android")
        await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
      else await Linking.openSettings();
    } catch {
      try {
        await Linking.openSettings();
      } catch {
        setError("Open your phone's Settings and find Zorka under Apps.");
      }
    }
  };
  return (
    <Screen header={<Header title="Keep runs recording" onBack={() => router.back()} />}>
      <Text variant="headline-lg">Record with your screen off</Text>
      <Card><Text variant="title">{optimization === "checking" ? "Checking battery settings…" : optimization === "restricted" ? "Battery optimization is enabled for Zorka" : optimization === "exempt" ? "Zorka is exempt from battery optimization" : "Battery optimization status is unknown"}</Text>
        <Text variant="body">{optimization === "exempt" ? "Manufacturer restrictions can still interrupt recording. Test a short locked-screen walk." : "Open settings if you want screen-off recording, then return here to check again."}</Text></Card>
      <Text variant="body" color="textSecondary">
        Some phones stop background apps to save power. Give Zorka permission to keep your activity recording, then test
        a short walk with the screen locked.
      </Text>
      <Card eyebrow={Device.manufacturer ?? "This phone"}>
        {advice.map((s, i) => (
          <Text key={s} variant="body">{`${i + 1}. ${s}`}</Text>
        ))}
      </Card>
      <Text variant="caption" color="textSecondary">
        Menu names vary by Android version. Enable screen-off recording in Record setup and choose Allow all the time
        for location. Keep precise location on. Swiping away or force-stopping Zorka can stop recording. No internet is
        needed; GPS still needs a clear view of the sky.
      </Text>
      <Button label="Open battery settings" fullWidth onPress={() => void open()} />
      <Button
        label="Open Zorka settings"
        variant="ghost"
        fullWidth
        onPress={() => void Linking.openSettings().catch(() => setError("Open Settings → Apps → Zorka."))}
      />
      {error ? (
        <Text variant="body" color="warn">
          {error}
        </Text>
      ) : null}
    </Screen>
  );
}
