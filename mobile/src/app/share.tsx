// S46 · Share preview (P38). No export yet: built from DESIGN.md §6.9 and brand §14 (D64). A swipeable 9:16 preview of
// every card that fits the moment (the one asked for first, then today's streak milestone or perfect day), a "Show my
// name" toggle (off by default, brand §14), and one Share button that opens the system share sheet (Instagram,
// WhatsApp and the rest appear there). The PNG is 1080 × 1920 and only leaves the phone if the user picks a target.
// expo-sharing and view-shot are native and loaded on tap, so an older dev build shows a message instead of crashing.
//
// Params: card = run | pr | day | phase | streak, plus id (activity, workout or phase id) for run, pr and phase.
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useRef, useState } from "react";
import { FlatList, StyleSheet, useWindowDimensions, View, type ViewToken } from "react-native";

import { useTheme } from "@/core/theme";
import { Button, EmptyState, Header, ListItem, Screen, Text, Toggle, useToast } from "@/core/ui";
import { getActivity, routePoints, useActivityClock } from "@/features/activity/store";
import { useDayGap } from "@/features/gap/gap";
import { useWorkout } from "@/features/gym/store";
import { useProgress } from "@/features/progress/hooks";
import { computeSummary } from "@/features/progress/phases";
import {
  dayCard,
  phaseCard,
  prCard,
  runCard,
  streakCard,
  type ShareCardSpec,
  type ShareKind,
} from "@/features/share/cards";
import { CARD_PX, CARD_RATIO, ShareCard } from "@/features/share/ShareCard";
import { useUsers } from "@/features/users/api";
import { STREAK_MILESTONES } from "@shared/domain/streak";

export default function ShareScreen() {
  const { colors, radius, layout } = useTheme();
  const toast = useToast();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const { card, id } = useLocalSearchParams<{ card?: ShareKind; id?: string }>();
  const clock = useActivityClock();
  const p = useProgress(clock);
  const dg = useDayGap(clock);
  const workout = useWorkout(card === "pr" ? id : undefined);
  const users = useUsers();
  const [showName, setShowName] = useState(false);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const refs = useRef(new Map<string, View | null>());

  const cards = useMemo<ShareCardSpec[]>(() => {
    const out: ShareCardSpec[] = [];
    if (card === "run" && id) {
      const a = getActivity(id);
      if (a && a.status === "done" && a.userId === p.userId) out.push(runCard(a, routePoints(id)));
    }
    if (card === "pr" && workout) {
      for (const e of workout.exercises)
        for (const s of e.sets)
          if (s.done && s.prKinds.length)
            out.push(
              prCard({
                setId: s.id,
                exerciseName: e.name,
                type: e.type,
                set: s,
                workoutName: workout.name,
                date: workout.localDate,
              }),
            );
    }
    if (card === "phase" && id) {
      const phase = p.phases.find((ph) => ph.id === id);
      if (phase) {
        const end = phase.closedDate ?? p.today;
        out.push(phaseCard(phase, phase.summary ?? computeSummary(phase, end, p.series), p.today));
      }
    }
    // The moment's other cards, after the one asked for.
    const s = p.streak;
    const streakWorthIt = !!s && (s.milestoneToday != null || s.current >= STREAK_MILESTONES[0]);
    if (s && (card === "streak" || streakWorthIt)) out.push(streakCard(s, p.today));
    if (dg && dg.gap.state === "done") out.push(dayCard(dg.gap, dg.day, dg.steps));
    if (card === "day" || card === "streak") {
      // Put the requested template first when both exist.
      out.sort((a, b) => Number(b.kind === card) - Number(a.kind === card));
    }
    return out;
  }, [card, id, workout, p.userId, p.phases, p.today, p.series, p.streak, dg]);

  const name = showName ? (users.data?.find((u) => u.id === p.userId)?.displayName ?? null) : null;
  // Leave room for the header, toggle and button; never wider than the screen margins.
  const cardW = Math.min(screenW - layout.screenMargin * 2 - 32, (screenH - 330) / CARD_RATIO);
  const current = cards[Math.min(index, cards.length - 1)];

  // FlatList needs the same function for its whole life.
  const [onViewable] = useState(() => ({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems[0];
    if (first?.index != null) setIndex(first.index);
  });

  const share = async () => {
    const view = current ? refs.current.get(current.key) : null;
    if (!current || !view) return;
    setBusy(true);
    try {
      const [Sharing, { captureRef }] = await Promise.all([
        import("expo-sharing").catch(() => null),
        import("react-native-view-shot").catch(() => ({ captureRef: null })),
      ]);
      if (!Sharing || !captureRef || !(await Sharing.isAvailableAsync())) {
        toast({ kind: "error", message: "Sharing needs the latest app build" });
        return;
      }
      const uri = await captureRef(view, { format: "png", quality: 1, result: "tmpfile", ...CARD_PX });
      await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: "Share your card" });
    } catch {
      toast({ kind: "error", message: "Couldn't make the image. Try again" });
    } finally {
      setBusy(false);
    }
  };

  if (!cards.length) {
    return (
      <Screen header={<Header title="Share" onBack={() => router.back()} />}>
        <EmptyState
          icon="ios_share"
          title="Nothing to share yet"
          body="Cards appear for a finished run, a PR, a perfect day, a closed phase or a streak of 7 days or more."
          actionLabel="Back"
          onAction={() => router.back()}
        />
      </Screen>
    );
  }

  return (
    <Screen header={<Header title="Share" onBack={() => router.back()} />} scroll={false}>
      <FlatList
        data={cards}
        keyExtractor={(c) => c.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        style={{ marginHorizontal: -layout.screenMargin, flexGrow: 0 }}
        renderItem={({ item }) => (
          <View style={[styles.page, { width: screenW }]}>
            <View style={[styles.frame, { borderRadius: radius.md, borderColor: colors.outline }]}>
              <ShareCard
                ref={(v) => {
                  refs.current.set(item.key, v);
                }}
                spec={item}
                width={cardW}
                name={name}
              />
            </View>
          </View>
        )}
      />

      {cards.length > 1 ? (
        <View style={styles.dots} accessibilityLabel={`Card ${index + 1} of ${cards.length}. Swipe for more.`}>
          {cards.map((c, i) => (
            <View
              key={c.key}
              style={[
                styles.dot,
                { borderRadius: radius.full, backgroundColor: i === index ? colors.primary : colors.surfaceHighest },
              ]}
            />
          ))}
        </View>
      ) : null}

      <ListItem
        title="Show my name"
        subtitle="Off by default. Cards never show photos."
        trailing={<Toggle value={showName} onValueChange={setShowName} accessibilityLabel="Show my name on the card" />}
      />
      <Button label="Share" icon="ios_share" fullWidth loading={busy} onPress={share} />
      <Text variant="caption" color="textSecondary" align="center">
        The image is made on your phone and only goes where you send it.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { alignItems: "center", paddingVertical: 8 },
  frame: { borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  dots: { flexDirection: "row", justifyContent: "center", gap: 6 },
  dot: { width: 8, height: 8 },
});
