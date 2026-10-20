// AB4/AB6 · One turn's rows in the Zorka thread (docs/ASSISTANT_BAR_PLAN.md "Thread", "Repair"); the bubble's card shows
// the same turn natively (overlayView.ts): a receipt per action with its Undo, Approve rows with OK / Change / Not now (a day change shows its new
// numbers first), Ask rows with option chips, answers with their card, and a chip per logged food that opens its
// alternatives and a portion stepper, so a wrong item is two taps from right.
import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import type { AssistantParsedItem, ParseResult } from "@/core/api/types";
import { Icon } from "@/core/icons/Icon";
import { useTheme } from "@/core/theme";
import { Button, Chip, IconButton, Text } from "@/core/ui";
import { formatPortion } from "@/features/food/format";
import { briefFor } from "@/features/life/briefs";
import { useDayPlan } from "@/features/life/planner";
import { draftActions } from "@/features/log/draft";
import { formatInt } from "@/features/targets/format";
import { useActiveUser } from "@/features/users/activeUser";
import { factsForDayType } from "@shared/domain/assistant";
import type { DayType } from "@shared/domain/dayType";
import type { DayFacts } from "@shared/domain/life";
import { AnswerCard } from "./AnswerCard";
import { actionIcon } from "./executors";
import { answerAsk, approve, canUndo, dismiss, portion, swap, undo } from "./thread";
import { phoneContext } from "./turn";
import type { StoredItem, StoredTurn } from "./types";

/** What the user approves on a day change: the planner's new numbers for that day (D91: code, not the AI). */
function DayPreview({ date, dayType, facts }: { date: string; dayType: DayType; facts: DayFacts | null }) {
  const userId = useActiveUser((s) => s.userId);
  const existing = userId ? briefFor(userId, date) : null;
  const next = existing ? factsForDayType(dayType, existing.facts) : (facts ?? factsForDayType(dayType));
  const { plan } = useDayPlan(date, { save: "never", facts: next });
  if (!plan) return null;
  const t = plan.targets;
  return (
    <Text variant="caption" color="secondaryText" tabular>
      {`New plan: ${t.kcalRange ? `${formatInt(t.kcalRange[0])}–${formatInt(t.kcalRange[1])}` : formatInt(t.kcal)} kcal · ${formatInt(t.proteinG)} g protein${t.steps === null ? " · no step goal" : ` · ${formatInt(t.steps)} steps`}`}
    </Text>
  );
}

/** The confirm sheet for a meal the user wants to change before it's logged. */
function openInConfirm(item: StoredItem, userId: string, source: "voice" | "text") {
  if (item.resolved?.kind !== "meal") return;
  const result: ParseResult = {
    source,
    transcript: null,
    items: item.resolved.items,
    followUp: null,
    timings: { sttMs: null, aiMs: 0, matchMs: 0, totalMs: 0 },
    ai: { slot: "assistant", model: "", attempts: 0 },
  };
  draftActions.startFromParse(result, { mealType: item.resolved.mealType, userId });
  router.push("/log/confirm");
}

function FoodChips({ messageId, index, item, editable }: { messageId: string; index: number; item: StoredItem; editable: boolean }) {
  const [open, setOpen] = useState<number | null>(null);
  if (item.resolved?.kind !== "meal") return null;
  const foods: AssistantParsedItem[] = item.resolved.items;
  const picked = open === null ? null : foods[open];
  return (
    <View style={styles.chips}>
      <View style={styles.wrap}>
        {foods.map((p, i) => (
          <Chip
            key={`${p.query}-${i}`}
            label={p.food ? `${p.food.name} · ${formatPortion(p.quantity, p.unit)}` : `"${p.query}" · not found`}
            selected={open === i}
            disabled={!editable}
            onPress={() => setOpen(open === i ? null : i)}
          />
        ))}
      </View>
      {picked && editable ? (
        <View style={styles.wrap}>
          {picked.food ? (
            <>
              <IconButton icon="remove" accessibilityLabel="Less" onPress={() => void portion(messageId, index, open!, Math.max(0.5, picked.quantity - (picked.quantity > 1 ? 1 : 0.5)))} />
              <Text variant="label" tabular>
                {formatPortion(picked.quantity, picked.unit)}
              </Text>
              <IconButton icon="add" accessibilityLabel="More" onPress={() => void portion(messageId, index, open!, picked.quantity + (picked.quantity >= 1 ? 1 : 0.5))} />
            </>
          ) : null}
          {picked.alternatives.map((f) => (
            <Chip
              key={f.id}
              label={f.name}
              kind="choice"
              onPress={() => {
                void swap(messageId, index, open!, f);
                setOpen(null);
              }}
            />
          ))}
          {!picked.food && !picked.alternatives.length ? (
            <Text variant="caption" color="textSecondary">
              Nothing close. Tap Change to search.
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export function TurnView({
  messageId,
  turn,
  today,
  onSay,
}: {
  messageId: string;
  turn: StoredTurn;
  today: string;
  /** A clarify option, said back as the next turn. */
  onSay?: (text: string) => void;
}) {
  const { colors, radius } = useTheme();
  const userId = useActiveUser((s) => s.userId);

  return (
    <View style={styles.list}>
      {turn.items.map((item, i) => {
        const a = item.action;
        const muted = item.state === "undone" || item.state === "dismissed" || item.state === "refused";
        const change =
          item.state === "pending" && userId
            ? a.kind === "log_meal"
              ? () => {
                  openInConfirm(item, userId, turn.heard.source);
                  void dismiss(messageId, i);
                }
              : a.kind === "set_day"
                ? () => {
                    router.push({ pathname: "/plan/tomorrow", params: { date: a.date, text: a.note ?? turn.heard.text } });
                    void dismiss(messageId, i);
                  }
                : a.kind === "log_weight"
                  ? () => {
                      router.push("/log-weight");
                      void dismiss(messageId, i);
                    }
                  : null
            : null;
        const answer = item.resolved?.kind === "answer" ? item.resolved : null;
        return (
          <View
            key={i}
            style={[styles.row, { borderColor: colors.outline, borderRadius: radius.md }]}
            accessible={false}
          >
            <Icon name={item.state === "done" ? "check_circle" : actionIcon(a)} size={20} color={item.state === "done" ? colors.primaryText : colors.textSecondary} />
            <View style={styles.body}>
              <Text
                variant="body"
                color={muted ? "textTertiary" : "textPrimary"}
                accessibilityLiveRegion={item.state === "done" || item.state === "answered" ? "polite" : undefined}
              >
                {item.state === "undone" ? `Undone: ${item.receipt}` : item.state === "dismissed" ? `Skipped: ${item.receipt}` : item.receipt}
              </Text>
              {item.note && item.state !== "failed" ? (
                <Text variant="caption" color="warn">
                  {item.note}
                </Text>
              ) : null}
              {answer?.card ? <AnswerCard card={answer.card} /> : null}
              {a.kind === "log_meal" || a.kind === "plan_meal" ? (
                <FoodChips messageId={messageId} index={i} item={item} editable={(item.state === "pending" || item.state === "done") && turn.date === today} />
              ) : null}
              {item.state === "pending" && a.kind === "set_day" ? (
                <DayPreview date={a.date} dayType={a.dayType} facts={item.resolved?.kind === "day" ? item.resolved.facts : null} />
              ) : null}
              {item.state === "pending" && item.resolved?.kind === "day" && item.resolved.question ? (
                <Text variant="caption" color="textSecondary">
                  {item.resolved.question}
                </Text>
              ) : null}

              {item.state === "pending" ? (
                <View style={styles.wrap}>
                  <Button label="OK" size="sm" icon="check" onPress={() => void approve(messageId, i)} />
                  {change ? <Button label="Change" size="sm" variant="secondary" icon="edit" onPress={change} /> : null}
                  <Button label="Not now" size="sm" variant="ghost" onPress={() => void dismiss(messageId, i)} />
                </View>
              ) : null}
              {item.state === "asking" && item.ask?.options.length ? (
                <View style={styles.wrap}>
                  {item.ask.options.map((o) => (
                    <Chip
                      key={o.label}
                      label={o.label}
                      kind="choice"
                      onPress={() => userId && void answerAsk(messageId, i, o.patch, phoneContext(userId, today))}
                    />
                  ))}
                </View>
              ) : null}
              {item.state === "asking" && a.kind === "clarify" && a.options.length && onSay ? (
                <View style={styles.wrap}>
                  {a.options.map((o) => (
                    <Chip key={o} label={o} kind="choice" onPress={() => onSay(o)} />
                  ))}
                </View>
              ) : null}
              {item.state === "asking" && !item.ask?.options.length && !(a.kind === "clarify" && a.options.length) ? (
                <Text variant="caption" color="textSecondary">
                  Say it or type it to the bar.
                </Text>
              ) : null}
            </View>
            {canUndo(turn, item, today) ? (
              <Button label="Undo" size="sm" variant="ghost" icon="undo" onPress={() => void undo(messageId, i)} />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 8 },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 10, borderWidth: StyleSheet.hairlineWidth },
  body: { flex: 1, gap: 6 },
  wrap: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  chips: { gap: 8 },
});
