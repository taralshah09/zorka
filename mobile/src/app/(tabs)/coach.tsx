// S44 Coach chat (P35, D60). Coach header (avatar, name, change) · a day-context strip (kcal left, protein left, streak)
// · chat bubbles in the coach's accent · suggested replies · input. States: empty (coach greeting from the persona
// templates), typing, AI unavailable (Retry; never a fake reply), offline. History stays on the phone (D58).
// Built from the spec (no Stitch export). The mic in the input is left out: chat is typed (see D63).
// UX N1: a reply can carry up to two buttons (log this meal, open a screen, start the workout) to act on it in place.
// UX N2: suggested replies come from the day's situation; Home's brief opens this tab with `about` = its line.
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
import { dayContext, sendToCoach, useChat } from "@/features/coach/chat";
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
  const runAction = useCoachAction();
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

  const send = async (body: string, retry = false) => {
    if (!userId || !coach || !dg || typing || (!retry && !body.trim())) return;
    setError(null);
    setTyping(true);
    if (!retry) setText("");
    // The brief's context is used once; after that the chips follow the day again.
    if (about) router.setParams({ about: undefined });
    try {
      await sendToCoach(userId, coach, body, dayContext(dg, profile.data, streak), { retry });
    } catch (e) {
      const d = describeError(e);
      setError(
        d.title === "Can't reach Zorka"
          ? "You're offline. Your message is saved; retry when you're back."
          : "Coach is offline right now.",
      );
    } finally {
      setTyping(false);
    }
  };
  const lastIsUser = messages.length > 0 && messages[messages.length - 1]!.role === "user";

  if (!coach || !persona || !dg) {
    // P41: loading and "offline with no cached profile" aren't "no plan yet".
    if (profile.isPending || (profile.isError && !profile.data))
      return (
        <Screen withDock header={<AppHeader eyebrow="Coach" />}>
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
      <Screen withDock header={<AppHeader eyebrow="Coach" />}>
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
    <Screen withDock scroll={false} header={<AppHeader eyebrow="Coach" />}>
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
            <Bubble
              key={m.id}
              role={m.role}
              text={m.text}
              accent={PERSONAS[m.coach].accent}
              actions={m.actions}
              onAction={(a, index) => runAction(a, `${m.id}:${index}`)}
              messageId={m.id}
            />
          ))}
          {typing ? (
            <Text variant="caption" color={ACCENT_TEXT[persona.accent]} accessibilityLiveRegion="polite">
              {`${persona.name} is typing…`}
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
            <Chip key={s.label} label={s.label} onPress={() => void send(s.text)} disabled={typing || !online} />
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
            placeholder={`Message ${persona.name}`}
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
            disabled={typing || !text.trim() || !online}
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
