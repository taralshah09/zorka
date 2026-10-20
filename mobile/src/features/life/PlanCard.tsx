// LA3 · The day plan on Today: the day type, today's targets (a range on away days), the next 2–3 items, and
// "Assumed a usual Tuesday. Tell me if not." when there was no brief (D79). Items open the flows that already exist: a
// meal opens the log sheet (or the menu scan when eating out), a workout the prepared session (PA3), a walk the recorder.
import { router, type Href } from "expo-router";
import { StyleSheet, View } from "react-native";

import type { IconName } from "@/core/icons/Icon";
import { Badge, Button, Card, ListItem, Text } from "@/core/ui";
import type { DayPlan, PlanItem } from "@shared/domain/planDay";
import { ADJUST_CODES, adjustLines, DAY_TYPE_LABEL, itemTime, itemTitle, sourceLine, stepUpLine, weekdayShort, whyText } from "./copy";

const ICON: Record<PlanItem["kind"], IconName> = {
  meal: "restaurant",
  workout: "fitness_center",
  walk: "directions_walk",
  water: "water_drop",
  prep: "shopping_bag",
};

function hrefFor(item: PlanItem): Href | null {
  switch (item.kind) {
    case "meal":
      return item.access === "eat_out" ? "/menu/scan" : { pathname: "/quick-log", params: { mealType: item.slot } };
    case "workout":
      return "/train/prepare";
    case "walk":
      return { pathname: "/activity/record", params: { kind: "walk" } };
    default:
      return null;
  }
}

export function PlanCard({
  plan,
  nowMinute,
  accepted,
  onAccept,
  onReplan,
  replanning,
  eatenProteinG,
}: {
  plan: DayPlan;
  nowMinute: number;
  accepted: boolean;
  onAccept: () => void;
  /** D85: ask the AI to re-plan the week. */
  onReplan?: () => void;
  replanning?: boolean;
  /** Protein eaten so far today, for the sick-day minimum line (D86). */
  eatenProteinG?: number;
}) {
  const next = plan.items.filter((i) => !(i.kind === "prep" && i.dayOffset === -1) && i.at >= nowMinute - 15).slice(0, 3);
  const t = plan.targets;
  const kcal = t.kcalRange ? `${t.kcalRange[0]}–${t.kcalRange[1]} kcal` : `${t.kcal} kcal`;
  // What moved today and why ("Since Tuesday came in short…"), then any other reason the adjust lines don't cover.
  const today = plan.week.days.find((d) => d.date === plan.date);
  const moved = today ? adjustLines(today, plan.date, eatenProteinG) : [];
  const why = whyText(plan.why.filter((w) => w !== "assumed_day" && !(moved.length && ADJUST_CODES.includes(w)))).slice(0, 2);
  return (
    <Card>
      <View style={styles.top}>
        <Text variant="eyebrow" color="textSecondary">
          {"Today's plan"}
        </Text>
        <Badge label={DAY_TYPE_LABEL[plan.dayType]} tone={plan.dayType === "normal" ? "neutral" : "lilac"} />
      </View>
      <Text variant="title">{`${kcal} · ${t.proteinG} g protein${t.steps != null ? ` · ${t.steps.toLocaleString("en-IN")} steps` : ""}`}</Text>
      <Text variant="caption" color="textSecondary">
        {sourceLine(plan)}
      </Text>
      {plan.ai?.summary ? <Text variant="caption" color="textSecondary">{plan.ai.summary}</Text> : null}
      {stepUpLine(plan) ? (
        <Text variant="caption" color="textSecondary">
          {stepUpLine(plan)}
        </Text>
      ) : null}
      {plan.assumed ? (
        <Text variant="caption" color="textSecondary" accessibilityRole="link" onPress={() => router.push({ pathname: "/plan/tomorrow", params: { date: plan.date } })}>
          {`Assumed a usual ${weekdayShort(plan.date)}. Tell me if not.`}
        </Text>
      ) : null}
      {moved.map((m) => (
        <Text key={m} variant="body">
          {m}
        </Text>
      ))}
      {why.map((w) => (
        <Text key={w} variant="caption" color="textSecondary">
          {w}
        </Text>
      ))}
      {next.map((item, i) => {
        const href = hrefFor(item);
        return (
          <ListItem
            key={`${item.kind}:${item.at}:${i}`}
            icon={ICON[item.kind]}
            title={itemTitle(item)}
            subtitle={itemTime(item)}
            chevron={!!href}
            onPress={href ? () => router.push(href) : undefined}
          />
        );
      })}
      {!next.length ? (
        <Text variant="body" color="textSecondary">
          Nothing else planned today.
        </Text>
      ) : null}
      <View style={styles.actions}>
        {!accepted ? <Button label="Accept" size="sm" onPress={onAccept} /> : null}
        <Button label="Change" size="sm" variant="secondary" onPress={() => router.push({ pathname: "/plan/tomorrow", params: { date: plan.date } })} />
        {onReplan ? <Button label={replanning ? "Re-planning…" : "Ask AI to re-plan"} size="sm" variant="ghost" loading={replanning} disabled={replanning} onPress={onReplan} /> : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  actions: { flexDirection: "row", gap: 8, marginTop: 8 },
});
