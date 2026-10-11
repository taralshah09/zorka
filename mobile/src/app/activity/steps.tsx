import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { BottomSheet, Button, Card, Header, Screen, Text } from "@/core/ui";
import { ActivityRings, HourlyBars } from "@/features/activity/components";
import {
  cachedSteps,
  installHealth,
  openHealthSettings,
  requestSteps,
  useHealthSteps,
} from "@/features/activity/health";
import { dayCredit, useActivityClock } from "@/features/activity/store";
import { useActiveUser } from "@/features/users/activeUser";
import { useTargets } from "@/features/targets/targets";
import { localDate } from "@shared/domain/food";

export default function StepsScreen() {
  const userId = useActiveUser((s) => s.userId);
  const now = useActivityClock();
  const day = localDate(new Date(now));
  const { targets } = useTargets();
  const health = useHealthSteps(userId, day, true);
  const cache = cachedSteps(userId, day);
  const credit = dayCredit(userId, day);
  const [explainer, setExplainer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      await requestSteps();
      setExplainer(false);
      await health.refresh();
    } catch {
      setError("Couldn't open Health Connect. Try again or open its settings.");
    } finally {
      setBusy(false);
    }
  };
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (6 - i));
    return {
      day: localDate(d),
      label: d.toLocaleDateString(undefined, { weekday: "short" }),
      cache: cachedSteps(userId, localDate(d)),
    };
  });
  return (
    <Screen header={<Header title="Steps & Move points" onBack={() => router.back()} />}>
      <Card>
        <ActivityRings steps={cache?.steps ?? null} stepGoal={targets?.steps ?? 8000} points={credit.points} />
        <Text variant="caption" color="textSecondary">
          Health Connect belongs to this phone. Its steps are the same for all demo profiles; recorded activities belong
          to the selected profile.
        </Text>
        {cache ? (
          <Text
            variant="caption"
            color="textSecondary"
          >{`Last read ${new Date(cache.readAt).toLocaleTimeString()}${health.state !== "ready" ? " · cached" : ""}`}</Text>
        ) : null}
      </Card>
      {health.state === "permission" ? (
        <Card>
          <Text variant="title">Connect your steps</Text>
          <Text variant="body" color="textSecondary">
            Kimbo reads your step count. You choose access in Health Connect.
          </Text>
          <Button label="Connect Health Connect" onPress={() => setExplainer(true)} />
          <Button
            label="Health Connect settings"
            variant="ghost"
            onPress={() => void openHealthSettings().catch(() => setError("Couldn't open settings."))}
          />
        </Card>
      ) : null}
      {health.state === "missing" ? (
        <Card>
          <Text variant="title">Install or update Health Connect</Text>
          <Text variant="body" color="textSecondary">
            Connect a step-tracking app to Health Connect, then return here. GPS recording still works.
          </Text>
          <Button
            label="Get Health Connect"
            onPress={() => void installHealth().catch(() => setError("Couldn't open the Play Store."))}
          />
        </Card>
      ) : null}
      {health.state === "unsupported" || health.state === "build" ? (
        <Card>
          <Text variant="title">
            {health.state === "build" ? "Android development build needed" : "Health Connect isn't supported here"}
          </Text>
          <Text variant="body" color="textSecondary">
            Steps require a supported Android phone and a Kimbo build with Health Connect. Move points from your
            recorded activities still appear here.
          </Text>
        </Card>
      ) : null}
      {health.state === "error" || error ? (
        <Text variant="body" color="warn">
          {error ?? "Couldn't refresh steps. Your last saved reading is shown."}
        </Text>
      ) : null}
      <Button label="Refresh steps" variant="ghost" loading={health.refreshing} onPress={() => void health.refresh()} />
      <Card eyebrow="Today">
        <Text variant="title">Steps by hour</Text>
        {cache?.hourly.length ? (
          <HourlyBars values={cache.hourly} />
        ) : (
          <Text variant="body" color="textSecondary">
            Connect and refresh to see hourly steps.
          </Text>
        )}
      </Card>
      <Card eyebrow="Last seven days">
        {week.map((d) => (
          <View key={d.day} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 }}>
            <Text variant="body">{d.label}</Text>
            <Text variant="label" tabular>
              {d.cache?.steps.toLocaleString() ?? "—"}
            </Text>
          </View>
        ))}
      </Card>
      <Card eyebrow="Move points">
        <Text variant="title">A 20-minute brisk walk earns 20 points</Text>
        <Text variant="body" color="textSecondary">
          Moderate activity (3–5.9 MET): 1 point per minute. Vigorous activity (6+ MET): 2. We use estimates for your
          selected activity: Walk 3.8, Run 8.3, Ride 6.8 MET. Paused time earns nothing. Steps alone cannot tell us
          intensity.
        </Text>
        <Button
          label="Start walk"
          onPress={() => router.push({ pathname: "/activity/record", params: { kind: "walk" } })}
        />
      </Card>
      <BottomSheet visible={explainer} onClose={() => setExplainer(false)} title="Read your steps">
        <Text variant="body">
          Kimbo reads only Steps from Health Connect to show your daily ring and seven-day history. It never writes
          health data. Step totals stay on this phone.
        </Text>
        <Text variant="caption" color="textSecondary">
          You can remove access at any time in Health Connect settings. Kimbo asks only when you connect your steps.
        </Text>
        <Button label="Continue" onPress={() => void connect()} loading={busy} fullWidth />
        <Button label="Not now" variant="ghost" onPress={() => setExplainer(false)} fullWidth />
      </BottomSheet>
    </Screen>
  );
}
