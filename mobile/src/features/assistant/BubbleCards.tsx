// AB4 · The bubble's controls in Zorka: a row in Settings, and a one-time card on Today that offers it. Both run the same
// flow (bubble.ts): microphone, notifications, then Android's "Display over other apps" page.
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { kv } from "@/core/storage/kv";
import { Button, Card, IconButton, ListItem, Text, Toggle, useToast } from "@/core/ui";
import { disableBubble, enableBubble, useBubble, type EnableResult } from "./bubble";

const RESULT: Record<Exclude<EnableResult, "on">, string> = {
  needs_overlay: 'Turn on "Allow display over other apps" for Zorka, then come back.',
  mic_denied: "The bubble needs the microphone to hear you. Allow it in Settings → Apps → Zorka.",
  unavailable: "The bubble needs an updated Zorka build.",
};

function useEnable() {
  const toast = useToast();
  return async () => {
    const r = await enableBubble();
    if (r === "on") toast({ kind: "success", message: "Zorka bubble is on. Tap it in any app to talk." });
    else toast({ kind: "info", message: RESULT[r] });
  };
}

export function BubbleSettingsRow() {
  const bubble = useBubble();
  const enable = useEnable();
  if (!bubble.available) return null;
  const on = bubble.enabled && bubble.canDraw;
  const subtitle = !bubble.enabled
    ? "Talk to Zorka from any app. Tap the tiger to talk, hold it to type."
    : !bubble.canDraw
      ? 'Waiting for "Display over other apps". Tap to allow it.'
      : !bubble.mic
        ? "The microphone is off for Zorka, so the bubble can only take typing."
        : "On. The tiger sits on the edge of your screen in every app.";
  return (
    <Card flush>
      <ListItem
        icon="mic"
        title="Zorka bubble"
        subtitle={subtitle}
        onPress={bubble.enabled && !bubble.canDraw ? () => void enable().then(bubble.refresh) : undefined}
        trailing={
          <Toggle
            value={on}
            onValueChange={(next) => {
              if (next) void enable().then(bubble.refresh);
              else {
                disableBubble();
                bubble.refresh();
              }
            }}
            accessibilityLabel="Zorka bubble over other apps"
          />
        }
      />
    </Card>
  );
}

const SEEN = "zorka.bubbleOffered";

/** Today: offered once until it's on or dismissed. */
export function BubbleOfferCard() {
  const bubble = useBubble();
  const enable = useEnable();
  const [dismissed, setDismissed] = useState(() => kv.get(SEEN) === "1");
  if (!bubble.available || dismissed || (bubble.enabled && bubble.canDraw)) return null;
  return (
    <Card>
      <View style={styles.row}>
        <View style={styles.flex}>
          <Text variant="title">Talk to Zorka from any app</Text>
          <Text variant="body" color="textSecondary">
            A small tiger on the edge of your screen. Say what you ate, ask how your week is going, start a walk, without
            opening Zorka.
          </Text>
        </View>
        <IconButton
          icon="close"
          accessibilityLabel="Not now"
          onPress={() => {
            kv.set(SEEN, "1");
            setDismissed(true);
          }}
        />
      </View>
      <Button label={bubble.enabled ? "Allow display over other apps" : "Turn on the bubble"} icon="mic" onPress={() => void enable().then(bubble.refresh)} />
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  flex: { flex: 1, gap: 4 },
});
