// S44 Coach chat (P35, D60). Coach header (avatar, name, change) · a day-context strip (kcal left, protein left, streak)
// · chat bubbles in the coach's accent · suggested replies · input. States: empty (coach greeting from the persona
// templates), typing, AI unavailable (Retry; never a fake reply), offline. History stays on the phone (D58).
// Built from the spec (no Stitch export). The mic in the input is left out: chat is typed (see D63).
import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from "react-native";

import { describeError } from "@/core/api/client";
import { useNetwork } from "@/core/network/network";
import { NetworkBanner } from "@/core/network/NetworkBanner";
import { Icon } from "@/core/icons/Icon";
import { useTheme } from "@/core/theme";
import { Avatar, Button, Chip, EmptyState, ErrorState, IconButton, Screen, Skeleton, Text } from "@/core/ui";
import { useActivityClock } from "@/features/activity/store";
import { dayContext, sendToCoach, useChat } from "@/features/coach/chat";
import { CoachPickerSheet } from "@/features/coach/CoachPickerSheet";
import { coachLine } from "@/features/coach/lines";
import { PERSONAS } from "@/features/coach/personas";
import { useDayGap } from "@/features/gap/gap";
import { lineFacts, situationFor } from "@/features/gap/situation";
import { useStreak } from "@/features/progress/streak";
import { AppHeader } from "@/features/shell/AppHeader";
import { formatInt } from "@/features/targets/format";
import { useTargets } from "@/features/targets/targets";
import { useActiveUser } from "@/features/users/activeUser";
import { router } from "expo-router";

const SUGGESTED = ["What should I eat?", "Plan tomorrow", "How am I doing today?"];
const ACCENT_TEXT = { lime: "primaryText", lilac: "secondaryText", orchid: "tertiaryText" } as const;

export default function Coach() {
  const { colors, radius, layout } = useTheme();
  const userId = useActiveUser((s) => s.userId);
  const clock = useActivityClock();
  const { profile } = useTargets();
  const dg = useDayGap(clock);
  const streak = useStreak(userId, clock);
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

  const greeting = coachLine(coach, situationFor(dg, streak, false), lineFacts(dg, streak));
  const g = dg.gap;

  return (
    <Screen withDock scroll={false} header={<AppHeader eyebrow="Coach" />}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
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
            <Bubble key={m.id} role={m.role} text={m.text} accent={PERSONAS[m.coach].accent} />
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

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.suggested}
          keyboardShouldPersistTaps="handled"
        >
          {SUGGESTED.map((s) => (
            <Chip key={s} label={s} onPress={() => void send(s)} disabled={typing || !online} />
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

function Bubble({ role, text, accent }: { role: "user" | "coach"; text: string; accent: "lime" | "lilac" | "orchid" }) {
  const { colors, radius } = useTheme();
  const coach = role === "coach";
  return (
    <View
      accessibilityLabel={`${coach ? "Coach" : "You"}: ${text}`}
      style={[
        styles.bubble,
        coach
          ? {
              alignSelf: "flex-start",
              backgroundColor: colors.coachBubble[accent],
              borderColor: colors[accent === "lime" ? "primary" : accent === "lilac" ? "secondary" : "tertiary"],
            }
          : { alignSelf: "flex-end", backgroundColor: colors.surfaceHigh, borderColor: colors.outline },
        { borderRadius: radius.lg },
      ]}
    >
      <Text variant="body-lg">{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  coachRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  strip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignSelf: "flex-start",
    marginTop: 12,
  },
  messages: { gap: 10, paddingVertical: 12 },
  bubble: { maxWidth: "85%", paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1 },
  error: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12 },
  suggested: { gap: 8, paddingVertical: 8 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    paddingLeft: 8,
    paddingRight: 4,
    paddingVertical: 4,
  },
  input: { flex: 1, minHeight: 40, maxHeight: 120, fontSize: 16 },
});
