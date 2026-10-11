import * as Device from "expo-device";
import * as IntentLauncher from "expo-intent-launcher";
import { router } from "expo-router";
import { useState } from "react";
import { Linking, Platform } from "react-native";
import { Button, Card, Header, Screen, Text } from "@/core/ui";

export default function BatteryGuide() {
  const brand = (Device.manufacturer ?? Device.brand ?? "Android").toLowerCase();
  const [error, setError] = useState<string | null>(null);
  const advice = /xiaomi|redmi|poco/.test(brand)
    ? [
        "Settings → Apps → Kimbo → Battery saver → No restrictions.",
        "Enable Background autostart for Kimbo if your phone offers it.",
        "Lock Kimbo in Recent apps so the system doesn't clear the recorder.",
      ]
    : /oppo|realme|oneplus|vivo/.test(brand)
      ? [
          "Settings → Apps → Kimbo → Battery usage → Allow background activity.",
          "Allow auto-launch / autostart for Kimbo if available.",
          "Lock Kimbo in Recent apps; avoid clearing it during a run.",
        ]
      : /samsung/.test(brand)
        ? [
            "Settings → Apps → Kimbo → Battery → Unrestricted.",
            "Remove Kimbo from Sleeping / Deep sleeping apps.",
            "Keep Kimbo in Recent apps while an activity is recording.",
          ]
        : [
            "Settings → Apps → Kimbo → Battery → Unrestricted (or Don't optimise).",
            "Allow background activity / autostart if your phone offers it.",
            "Keep Kimbo in Recent apps during your activity.",
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
        setError("Open your phone's Settings and find Kimbo under Apps.");
      }
    }
  };
  return (
    <Screen header={<Header title="Keep runs recording" onBack={() => router.back()} />}>
      <Text variant="headline-lg">Record with your screen off</Text>
      <Text variant="body" color="textSecondary">
        Some phones stop background apps to save power. Give Kimbo permission to keep your activity recording, then test
        a short walk with the screen locked.
      </Text>
      <Card eyebrow={Device.manufacturer ?? "This phone"}>
        {advice.map((s, i) => (
          <Text key={s} variant="body">{`${i + 1}. ${s}`}</Text>
        ))}
      </Card>
      <Text variant="caption" color="textSecondary">
        Menu names vary by Android version. Enable screen-off recording in Record setup and choose Allow all the time
        for location. Keep precise location on. Swiping away or force-stopping Kimbo can stop recording. No internet is
        needed; GPS still needs a clear view of the sky.
      </Text>
      <Button label="Open battery settings" fullWidth onPress={() => void open()} />
      <Button
        label="Open Kimbo settings"
        variant="ghost"
        fullWidth
        onPress={() => void Linking.openSettings().catch(() => setError("Open Settings → Apps → Kimbo."))}
      />
      {error ? (
        <Text variant="body" color="warn">
          {error}
        </Text>
      ) : null}
    </Screen>
  );
}
