// LA4 · "This week": 7 dots (done, planned, moved, event), tap a day for why. Lives on Today and in the weekly check-in.
// The numbers come from planWeek; what can't fit is shown as forgiven, never carried into next week (D75).
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { useTheme } from "@/core/theme";
import { Card, Text } from "@/core/ui";
import type { WeekPlan } from "@shared/domain/week";
import { ADJUST_CODES, adjustLines, forgivenLines, weekdayShort, whyText } from "./copy";

type DotKind = "done" | "planned" | "moved" | "event";

const kindOf = (d: WeekPlan["days"][number]): DotKind => {
  if (d.past) return "done";
  if (d.why.includes("event_allowance")) return "event";
  if (d.why.some((w) => w === "event_prebank" || w === "over_spread" || w === "under_spread" || w === "session_moved")) return "moved";
  return "planned";
};

const LEGEND: Record<DotKind, string> = { done: "Done", planned: "Planned", moved: "Adjusted", event: "Event" };

export function WeekStrip({ week, today }: { week: WeekPlan; today: string }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState<string | null>(null);
  const fill: Record<DotKind, string> = { done: colors.textSecondary, planned: colors.primary, moved: colors.warn, event: colors.secondary };
  const selected = week.days.find((d) => d.date === open);
  const event = week.days.find((d) => !d.past && d.why.includes("event_allowance"));
  return (
    <Card>
      <Text variant="eyebrow" color="textSecondary">
        This week
      </Text>
      <View style={styles.row}>
        {week.days.map((d) => {
          const k = kindOf(d);
          return (
            <Pressable
              key={d.date}
              onPress={() => setOpen(open === d.date ? null : d.date)}
              accessibilityRole="button"
              accessibilityLabel={`${weekdayShort(d.date)}: ${LEGEND[k]}, ${d.kcal} kcal${d.train ? ", workout" : ""}`}
              style={styles.day}
            >
              <Text variant="caption" color={d.date === today ? "textPrimary" : "textSecondary"}>
                {weekdayShort(d.date).charAt(0)}
              </Text>
              <View style={[styles.dot, { backgroundColor: fill[k], borderColor: d.train ? colors.textPrimary : "transparent" }]} />
            </Pressable>
          );
        })}
      </View>
      <View style={styles.legend}>
        {(Object.keys(LEGEND) as DotKind[]).map((k) => (
          <View key={k} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: fill[k] }]} />
            <Text variant="caption" color="textTertiary">
              {LEGEND[k]}
            </Text>
          </View>
        ))}
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { borderColor: colors.textPrimary, borderWidth: 2 }]} />
          <Text variant="caption" color="textTertiary">
            Workout
          </Text>
        </View>
      </View>
      {event ? (
        <Text variant="caption" color="textSecondary">
          {weekdayShort(event.date)} pre-banked: other days are a little lighter.
        </Text>
      ) : null}
      {selected ? (
        <View style={styles.detail}>
          <Text variant="label">{`${weekdayShort(selected.date)} · ${selected.kcal} kcal · ${selected.proteinG} g protein${selected.steps != null ? ` · ${selected.steps.toLocaleString("en-IN")} steps` : ""}${selected.train ? " · workout" : ""}`}</Text>
          {(selected.past
            ? ["Counted as logged (or on target if not logged)."]
            : [...adjustLines(selected, today), ...whyText(selected.why.filter((w) => !(selected.adjust && ADJUST_CODES.includes(w))))]
          ).map((t) => (
            <Text key={t} variant="caption" color="textSecondary">
              {t}
            </Text>
          ))}
        </View>
      ) : null}
      {forgivenLines(week).map((t) => (
        <Text key={t} variant="caption" color="textSecondary">
          {t}
        </Text>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  day: { alignItems: "center", gap: 6, minWidth: 32, paddingVertical: 4 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
  detail: { gap: 4, marginTop: 8 },
  legend: { flexDirection: "row", flexWrap: "wrap", columnGap: 12, rowGap: 4, marginTop: 4 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
});
