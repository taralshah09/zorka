// S45 Notification settings (P36, D61): nudges per day (default 4), each type on/off, quiet hours. Permission is asked
// through the S49 explainer on first need; a denied permission offers "Open settings". Built from the spec (no export).
import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { BottomSheet, Button, Card, Header, ListItem, NumberStepper, Screen, Text, Toggle } from "@/core/ui";
import { PermissionExplainer } from "@/features/permissions/PermissionExplainer";
import {
  requestNotifAccess,
  saveNudgeSettings,
  useNotifAccess,
  useNudgeSettings,
  type StoredNudgeSettings,
} from "@/features/nudges/settings";
import { useActiveUser } from "@/features/users/activeUser";
import { MAX_PER_DAY, MIN_PER_DAY, NUDGE_MINUTE, type NudgeKind } from "@shared/domain/nudges";

const KIND_COPY: { kind: NudgeKind; title: string; subtitle: string }[] = [
  { kind: "morning", title: "Morning plan", subtitle: "Today's calories and protein at 8:00" },
  { kind: "protein", title: "Protein warning", subtitle: "At 16:00 if a lot of protein is left" },
  { kind: "workout", title: "Workout reminder", subtitle: "At 18:00 if you have a routine and haven't trained" },
  { kind: "slipping", title: "Evening check", subtitle: "At 19:30 if you're behind for the day" },
  { kind: "streak", title: "Streak at risk", subtitle: "At 20:30 if nothing is logged yet" },
  { kind: "praise", title: "Praise", subtitle: "When every goal is hit" },
];

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const DAY = 24 * 60;

export default function NotificationSettings() {
  const userId = useActiveUser((s) => s.userId);
  const settings = useNudgeSettings(userId);
  const { access, setAccess } = useNotifAccess();
  const [explainer, setExplainer] = useState(false);
  const save = (next: Partial<StoredNudgeSettings>) => userId && saveNudgeSettings(userId, { ...settings, ...next });
  // UX W8: nothing until the permission is known, so the "off" card doesn't flash on load.
  const off = access !== null && access !== "granted";

  return (
    <Screen header={<Header title="Notifications" onBack={() => router.back()} />}>
      {off ? (
        <Card variant="raised">
          <Text variant="title">{access === "denied" ? "Notifications are off" : "Nudges are off"}</Text>
          <Text variant="body" color="textSecondary">
            {access === "unsupported"
              ? "Notifications aren't available in this build of the app."
              : `Your coach can remind you about protein, workouts and your streak. Up to ${settings.perDay} a day.`}
          </Text>
          {access !== "unsupported" ? (
            <View style={styles.cta}>
              <Button
                label={access === "denied" ? "Open settings" : "Turn on nudges"}
                onPress={() => setExplainer(true)}
              />
            </View>
          ) : null}
        </Card>
      ) : null}

      <Card flush>
        <ListItem
          title="Coach nudges"
          subtitle={settings.enabled ? `Up to ${settings.perDay} a day` : "Off"}
          icon="notifications"
          trailing={
            <Toggle
              value={settings.enabled}
              onValueChange={(v) => save({ enabled: v })}
              accessibilityLabel="Coach nudges"
            />
          }
        />
      </Card>

      {settings.enabled ? (
        <>
          <Card>
            <NumberStepper
              label="Nudges per day"
              value={settings.perDay}
              min={MIN_PER_DAY}
              max={MAX_PER_DAY}
              onChange={(perDay) => save({ perDay })}
            />
          </Card>

          <Text variant="eyebrow" color="textSecondary">
            Types
          </Text>
          <Card flush>
            {KIND_COPY.map((k, i) => (
              <ListItem
                key={k.kind}
                title={k.title}
                subtitle={k.subtitle}
                divider={i < KIND_COPY.length - 1}
                trailing={
                  <Toggle
                    value={settings.kinds[k.kind]}
                    onValueChange={(v) => save({ kinds: { ...settings.kinds, [k.kind]: v } })}
                    accessibilityLabel={k.title}
                  />
                }
              />
            ))}
          </Card>

          <Text variant="eyebrow" color="textSecondary">
            Quiet hours
          </Text>
          <Card>
            <View style={styles.quiet}>
              <NumberStepper
                label="From"
                value={settings.quietStart}
                min={0}
                max={DAY - 30}
                step={30}
                format={hhmm}
                clock
                onChange={(quietStart) => save({ quietStart })}
              />
              <NumberStepper
                label="To"
                value={settings.quietEnd}
                min={0}
                max={DAY - 30}
                step={30}
                format={hhmm}
                clock
                onChange={(quietEnd) => save({ quietEnd })}
              />
            </View>
            <Text variant="caption" color="textSecondary">
              {`No nudges from ${hhmm(settings.quietStart)} to ${hhmm(settings.quietEnd)}. A nudge whose time falls inside is skipped (the streak check is at ${hhmm(NUDGE_MINUTE.streak)}).`}
            </Text>
          </Card>
        </>
      ) : null}

      <BottomSheet visible={explainer} onClose={() => setExplainer(false)} size="medium">
        <PermissionExplainer
          kind="notifications"
          denied={access === "denied"}
          perDay={settings.perDay}
          onContinue={async () => {
            setAccess(await requestNotifAccess());
            setExplainer(false);
          }}
          onNotNow={() => setExplainer(false)}
        />
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  cta: { marginTop: 12, alignItems: "flex-start" },
  quiet: { gap: 12, marginBottom: 8 },
});
