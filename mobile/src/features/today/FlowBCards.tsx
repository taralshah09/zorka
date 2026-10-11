// P36/P37 Home cards: S48 Welcome back, and "Turn on nudges" (asks for the notification permission through the S49
// explainer on first need, D61). Both are dismissible.
import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { useTheme } from "@/core/theme";
import { BottomSheet, Button, Card, IconButton, Text } from "@/core/ui";
import { PermissionExplainer } from "@/features/permissions/PermissionExplainer";
import {
  nudgeSettings,
  requestNotifAccess,
  saveNudgeSettings,
  useNotifAccess,
  useNudgeSettings,
} from "@/features/nudges/settings";

/** S48: "Welcome back. Your trend held steady." No guilt. */
/** `hasTrend`: only claim the trend held when there's a weigh-in to have one (P41). */
export function WelcomeBackCard({
  freezeUsed,
  hasTrend,
  onDismiss,
}: {
  freezeUsed: boolean;
  hasTrend: boolean;
  onDismiss: () => void;
}) {
  const body = hasTrend
    ? "Your trend held steady. Gaps in your logs don't break it."
    : "No catching up needed. Start again with today.";
  return (
    <Card variant="raised" accessibilityLabel={`Welcome back. ${body}`}>
      <View style={styles.row}>
        <View style={styles.flex}>
          <Text variant="headline-sm">Welcome back.</Text>
          <Text variant="body" color="textSecondary">
            {body}
          </Text>
          {freezeUsed ? (
            <Text variant="caption" color="secondaryText">
              A freeze protected your streak.
            </Text>
          ) : null}
        </View>
        <IconButton icon="close" accessibilityLabel="Dismiss" onPress={onDismiss} />
      </View>
      <View style={styles.cta}>
        <Button
          label="Log today's first meal"
          icon="add"
          onPress={() => {
            onDismiss();
            router.push("/quick-log");
          }}
        />
      </View>
    </Card>
  );
}

/** Shown while the permission hasn't been asked yet and nudges are on; "Not now" hides it for this profile. */
export function NudgePromptCard({ userId }: { userId: string }) {
  const { colors } = useTheme();
  const { access, setAccess } = useNotifAccess();
  const settings = useNudgeSettings(userId);
  const [sheet, setSheet] = useState(false);
  if (access !== "ask" || !settings.enabled || settings.promptDismissed) return null;
  const dismiss = () => saveNudgeSettings(userId, { ...nudgeSettings(userId), promptDismissed: true });
  return (
    <>
      <Card accessibilityLabel="Turn on nudges from your coach">
        <View style={styles.row}>
          <View style={[styles.flex, styles.gap]}>
            <Text variant="eyebrow" color="secondaryText">
              Coach nudges
            </Text>
            <Text variant="title">Get a heads-up before protein or your streak slips</Text>
            <Text variant="caption" color="textSecondary">
              Up to 4 a day, never in quiet hours.
            </Text>
          </View>
        </View>
        <View style={[styles.cta, styles.ctaRow]}>
          <Button label="Not now" size="sm" variant="ghost" onPress={dismiss} />
          <Button label="Turn on nudges" size="sm" onPress={() => setSheet(true)} />
        </View>
      </Card>
      <BottomSheet visible={sheet} onClose={() => setSheet(false)} size="medium">
        <View style={{ backgroundColor: colors.surfaceLow }}>
          <PermissionExplainer
            kind="notifications"
            denied={false}
            onContinue={async () => {
              setAccess(await requestNotifAccess());
              setSheet(false);
            }}
            onNotNow={() => {
              setSheet(false);
              dismiss();
            }}
          />
        </View>
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  flex: { flex: 1 },
  gap: { gap: 4 },
  cta: { marginTop: 12, alignItems: "flex-start" },
  ctaRow: { flexDirection: "row", justifyContent: "flex-end", alignSelf: "stretch", gap: 8 },
});
