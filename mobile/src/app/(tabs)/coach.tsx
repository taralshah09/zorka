// S44 Coach chat (P35, D60). Coach header (avatar, name, change) · a day-context strip (kcal left, protein left, streak)
// · chat bubbles in the coach's accent · suggested replies · input. States: empty (coach greeting from the persona
// templates), typing, AI unavailable (Retry; never a fake reply), offline. History stays on the phone (D58).
// Built from the spec (no Stitch export). The mic in the input is left out: chat is typed (see D63).
// UX N1: a reply can carry up to two buttons (log this meal, open a screen, start the workout) to act on it in place.
// UX N2: suggested replies come from the day's situation; Home's brief opens this tab with `about` = its line.
// AB7 (D89): this is now the Zorka thread, the one conversation with Zorka. Old coach chat stays above; every new
// message goes through the Assistant Bar's turn (it can act, not only answer), and each turn shows its receipts with
// Undo for the same day, its approvals and its questions (TurnView). The persona picker stays here.
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from "react-native";

import { describeError } from "@/core/api/client";
import { useNetwork } from "@/core/network/network";
import { NetworkBanner } from "@/core/network/NetworkBanner";
import { Icon } from "@/core/icons/Icon";
import { useTheme } from "@/core/theme";
import type { CoachAction } from "@/core/api/types";
import { Avatar, Button, Chip, EmptyState, ErrorState, IconButton, Screen, Skeleton, Text } from "@/core/ui";
import { useActivityClock } from "@/features/activity/store";
import { actionIcon, useCoachAction } from "@/features/coach/actions";
import { actionResult } from "@/features/coach/actionState";
import { getMeal, useMealsVersion } from "@/features/meals/store";
import { useChat } from "@/features/coach/chat";
import { TurnView } from "@/features/assistant/TurnView";
import { buildSnapshot } from "@/features/assistant/snapshot";
import { runTurn } from "@/features/assistant/turn";
import { CoachPickerSheet } from "@/features/coach/CoachPickerSheet";
import { coachLine } from "@/features/coach/lines";
import { PERSONAS } from "@/features/coach/personas";
import { suggestionsFor } from "@/features/coach/suggestions";
import { useDayGap } from "@/features/gap/gap";
import { lineFacts, situationFor } from "@/features/gap/situation";
import { checkinCopy } from "@/features/progress/copy";
import { useProgress } from "@/features/progress/hooks";
import { AppHeader } from "@/features/shell/AppHeader";
import { formatInt } from "@/features/targets/format";
import { useTargets } from "@/features/targets/targets";
import { useActiveUser } from "@/features/users/activeUser";
import { localDate } from "@shared/domain/food";

const ACCENT_TEXT = { lime: "primaryText", lilac: "secondaryText", orchid: "tertiaryText" } as const;

export default function Coach() {
  const { colors, radius, layout } = useTheme();
  const userId = useActiveUser((s) => s.userId);
  const clock = useActivityClock();
  const { profile } = useTargets();
  const dg = useDayGap(clock);
  const { streak, pending } = useProgress(clock);
  const params = useLocalSearchParams<{ about?: string }>();
  const about = params.about?.trim() || null;
  const today = localDate(new Date());
  const messages = useChat(userId);
  const online = useNetwork((s) => s.online);
  const [text, setText] = useState("");
  const [typing, setTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const coach = profile.data?.coach ?? null;
  const persona = coach ? PERSONAS[coach] : null;

  useEffect(() => {
    const t = setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(t);
  }, [messages.length, typing, error]);

  // One door (D89): what's typed here runs as an Assistant Bar turn, so Zorka can do it, not only answer it.
  const [lastSent, setLastSent] = useState<string | null>(null);
  const send = async (body: string, retry = false) => {
    const words = retry ? lastSent : body.trim();
    const snapshot = userId ? buildSnapshot(userId) : null;
    if (!userId || !coach || !snapshot || typing || !words) return;
    setError(null);
    setTyping(true);
    if (!retry) setText("");
    setLastSent(words);
    // The brief's context is used once; after that the chips follow the day again.
    if (about) router.setParams({ about: undefined });
    try {
      const out = await runTurn(snapshot, { text: words }, online);
      if (out.kind === "queued") setError("You're offline. Saved; I'll do it when you're back.");
      if (out.kind === "error") setError(`${out.error.title}. ${out.error.body}`);
    } finally {
      setTyping(false);
    }
  };
  const lastIsUser = !!error && !!lastSent;
  // Old coach buttons now say their meal to Zorka as a turn (AB7).
  const runAction = useCoachAction((words) => void send(words));

  if (!coach || !persona || !dg) {
    // P41: loading and "offline with no cached profile" aren't "no plan yet".
    if (profile.isPending || (profile.isError && !profile.data))
      return (
        <Screen withDock header={<AppHeader eyebrow="Zorka" />}>
          <NetworkBanner />
          {profile.isPending ? (
            <>
              <Skeleton variant="card" height={72} />
              <Skeleton variant="card" height={160} />
            </>
          ) : (
            <ErrorState
              {...describeError(profile.error)}
              onRetry={() => profile.refetch()}
              retrying={profile.isRefetching}
            />
          )}
        </Screen>
      );
    return (
      <Screen withDock header={<AppHeader eyebrow="Zorka" />}>
        <EmptyState
          icon="forum"
          title="Set up your plan first"
          body="Your coach needs your targets to know how your day is going."
          actionLabel="Set up my plan"
          onAction={() => router.push("/onboarding")}
        />
      </Screen>
    );
  }

  const situation = situationFor(dg, streak, false);
  const greeting = coachLine(coach, situation, lineFacts(dg, streak));
  const g = dg.gap;
  const checkin = pending ? checkinCopy(pending, !!profile.data?.checkinDetailed) : null;
  const suggestions = suggestionsFor({
    situation,
    about,
    checkin: checkin ? `${checkin.title}. ${checkin.body}` : null,
  });

  return (
    <Screen withDock scroll={false} header={<AppHeader eyebrow="Zorka" />}>
      <KeyboardAvoidingView style={styles.body} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <NetworkBanner />
        <View style={styles.coachRow}>
          <Avatar name={persona.name} accent={persona.accent} kind="coach" size={56} thinking={typing} />
          <View style={styles.flex}>
            <Text variant="headline-sm">{persona.name}</Text>
            <Text variant="caption" color="textSecondary">
              {persona.vibe}
            </Text>
          </View>
          <Button label="Change" size="sm" variant="ghost" onPress={() => setPicker(true)} />
        </View>

        <View
          accessible
          accessibilityLabel={`${formatInt(Math.max(0, g.remaining.kcal))} kcal left, ${formatInt(Math.max(0, g.remaining.proteinG))} grams protein left, ${streak?.current ?? 0} day streak`}
          style={[styles.strip, { backgroundColor: colors.surfaceLow, borderRadius: radius.full }]}
        >
          <Text variant="label" color="primaryText" tabular>
            {g.remaining.kcal >= 0
              ? `${formatInt(g.remaining.kcal)} kcal left`
              : `${formatInt(-g.remaining.kcal)} kcal over`}
          </Text>
          <Text variant="label" color="textTertiary">
            ·
          </Text>
          <Text variant="label" color="tertiaryText" tabular>
            {`${formatInt(Math.max(0, g.remaining.proteinG))} g protein`}
          </Text>
          <Text variant="label" color="textTertiary">
            ·
          </Text>
          <Icon name="local_fire_department" size={16} color={colors.streak} filled />
          <Text variant="label" color="streak" tabular>
            {String(streak?.current ?? 0)}
          </Text>
        </View>

        <ScrollView
          ref={scroll}
          style={styles.flex}
          contentContainerStyle={styles.messages}
          keyboardShouldPersistTaps="handled"
        >
          {!messages.length ? <Bubble role="coach" text={greeting} accent={persona.accent} /> : null}
          {messages.map((m) => (
            <View key={m.id} style={styles.message}>
              <Bubble
                role={m.role}
                text={m.text}
                accent={PERSONAS[m.coach].accent}
                actions={m.actions}
                onAction={(a, index) => runAction(a, `${m.id}:${index}`)}
                messageId={m.id}
              />
              {m.turn && m.turn.items.length ? (
                <TurnView messageId={m.id} turn={m.turn} today={today} onSay={(t) => void send(t)} />
              ) : null}
            </View>
          ))}
          {typing ? (
            <Text variant="caption" color={ACCENT_TEXT[persona.accent]} accessibilityLiveRegion="polite">
              {"Zorka is working on it…"}
            </Text>
          ) : null}
          {error ? (
            <View style={[styles.error, { backgroundColor: colors.errorContainer, borderRadius: radius.md }]}>
              <Text variant="body" style={styles.flex} accessibilityLiveRegion="polite">
                {error}
              </Text>
              {lastIsUser ? (
                <Button label="Retry" size="sm" variant="ghost" onPress={() => void send("", true)} />
              ) : null}
            </View>
          ) : null}
        </ScrollView>

        {about ? (
          <View style={[styles.about, { backgroundColor: colors.surfaceLow, borderRadius: radius.md }]}>
            <Text variant="caption" color="textSecondary" numberOfLines={2} style={styles.flex}>
              {`About: "${about}"`}
            </Text>
            <IconButton
              icon="close"
              accessibilityLabel="Clear the topic"
              onPress={() => router.setParams({ about: undefined })}
            />
          </View>
        ) : null}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.suggestedScroll}
          contentContainerStyle={styles.suggested}
          keyboardShouldPersistTaps="handled"
        >
          {suggestions.map((s) => (
            <Chip key={s.label} label={s.label} onPress={() => void send(s.text)} disabled={typing} />
          ))}
        </ScrollView>

        <View
          style={[
            styles.inputRow,
            { backgroundColor: colors.surface, borderColor: colors.outline, borderRadius: radius.full },
          ]}
        >
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={`Tell Zorka or ask ${persona.name}`}
            placeholderTextColor={colors.textTertiary}
            style={[
              styles.input,
              {
                color: colors.textPrimary,
                fontFamily: "PlusJakartaSans_400Regular",
                paddingHorizontal: layout.cardPadding / 2,
              },
            ]}
            maxLength={1000}
            multiline
            accessibilityLabel={`Message ${persona.name}`}
          />
          <IconButton
            icon="send"
            accessibilityLabel="Send"
            variant="filled"
            onPress={() => void send(text)}
            disabled={typing || !text.trim()}
          />
        </View>
      </KeyboardAvoidingView>
      <CoachPickerSheet visible={picker} onClose={() => setPicker(false)} current={coach} />
    </Screen>
  );
}

function Bubble({
  role,
  text,
  accent,
  actions = [],
  onAction,
  messageId,
}: {
  role: "user" | "coach";
  text: string;
  accent: "lime" | "lilac" | "orchid";
  actions?: CoachAction[];
  onAction?: (a: CoachAction, index: number) => void;
  messageId?: string;
}) {
  const userId = useActiveUser((s) => s.userId);
  useMealsVersion((s) => s.v);
  const { colors, radius } = useTheme();
  const coach = role === "coach";
  return (
    <View
      style={[
        styles.bubble,
        coach
          ? {
              alignSelf: "flex-start",
              backgroundColor: colors.coachBubble[accent],
              borderColor: colors[accent === "lime" ? "primary" : accent === "lilac" ? "secondary" : "tertiary"],
            }
          : { alignSelf: "flex-end", backgroundColor: colors.surfaceHigh, borderColor: colors.outline },
        // The corner nearest the speaker stays tight so each bubble reads as coming from its side.
        { borderRadius: radius.lg },
        coach ? { borderBottomLeftRadius: radius.xs } : { borderBottomRightRadius: radius.xs },
      ]}
    >
      <Text variant="body-lg" accessibilityLabel={`${coach ? "Coach" : "You"}: ${text}`}>
        {text}
      </Text>
      {coach && actions.length && onAction ? (
        <View style={styles.actions}>
          {actions.map((a, i) => {
            const result = messageId ? actionResult(userId, `${messageId}:${i}`) : null;
            const done = result?.kind === "idea" || (result?.kind === "meal" && !!getMeal(result.id));
            return (
            <Button
              key={`${a.type}-${i}`}
              label={done ? (result?.kind === "idea" ? "Idea saved · view" : "Meal saved · view") : a.type === "log_meal" ? "Review meal idea" : a.label}
              icon={actionIcon(a)}
              size="sm"
              variant={i === 0 ? "secondary" : "ghost"}
              onPress={() => onAction(a, i)}
            />
          ); })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  // One gap between every block, instead of per-block margins that drifted apart.
  body: { flex: 1, gap: 12 },
  coachRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  strip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignSelf: "flex-start",
  },
  messages: { gap: 12, paddingVertical: 4 },
  message: { gap: 8 },
  bubble: { maxWidth: "85%", paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1 },
  error: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12 },
  // A horizontal ScrollView stretches vertically in a flex column on Android unless told not to grow.
  suggestedScroll: { flexGrow: 0 },
  suggested: { gap: 8, alignItems: "center" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  about: { flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 12 },
  inputRow: {
    flexDirection: "row",
    // Send stays pinned to the bottom edge as the multiline input grows.
    alignItems: "flex-end",
    gap: 8,
    borderWidth: 1,
    paddingLeft: 8,
    paddingRight: 4,
    paddingVertical: 4,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    fontSize: 16,
    paddingTop: 11,
    paddingBottom: 11,
    textAlignVertical: "center",
  },
});
