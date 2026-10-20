// Home · "Your day": one timeline instead of a plan card and a meals card. Logged meals (done) and what's still
// planned (meals, a workout, a walk, prep) sorted by time; a planned meal drops out once that meal is logged. One line
// says why the day looks the way it does (a moved target, an assumed day, the protein step-up), never a wall of
// captions. Without a plan it's the logged meals and the meal that's due. Planned items open the flows that exist: a
// meal opens the log sheet (or the menu scan when eating out), a workout the prepared session, a walk the recorder.
// AB3: a meal the user told the Assistant Bar they will have ("paneer for dinner") takes its slot; tapping it logs it.
import { router, type Href } from "expo-router";
import { StyleSheet, View } from "react-native";

import { Icon, type IconName } from "@/core/icons/Icon";
import { useTheme } from "@/core/theme";
import { Badge, Button, Card, PressableScale, Text } from "@/core/ui";
import { formatPortion, MEAL_LABEL } from "@/features/food/format";
import { ADJUST_CODES, adjustLines, DAY_TYPE_LABEL, itemTime, itemTitle, stepUpLine, weekdayShort, whyText } from "@/features/life/copy";
import { mealTotals, type Meal } from "@/features/meals/store";
import { formatInt } from "@/features/targets/format";
import { mealTypeForTime } from "@shared/domain/food";
import { SLOT_MINUTE, type DayPlan, type PlanItem } from "@shared/domain/planDay";
import type { PlannedMeal } from "@/features/assistant/plannedMeals";
import { AddToMealButton } from "./AddToMeal";

const ICON: Record<PlanItem["kind"], IconName> = {
  meal: "restaurant",
  workout: "fitness_center",
  walk: "directions_walk",
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

type Row = { at: number; key: string } & (
  | { kind: "logged"; meal: Meal }
  | { kind: "planned"; item: PlanItem; past: boolean }
  | { kind: "told"; meal: PlannedMeal }
);

const minuteOf = (iso: string) => {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
};

/** The one line under the title: what moved today, else the assumed day, else the first other reason. */
function contextLine(plan: DayPlan, eatenProteinG: number): { text: string; onPress?: () => void } | null {
  const today = plan.week.days.find((d) => d.date === plan.date);
  const moved = today ? adjustLines(today, plan.date, eatenProteinG) : [];
  if (moved[0]) return { text: moved[0] };
  if (plan.assumed)
    return {
      text: `Planned as a usual ${weekdayShort(plan.date)}. Different day? Tell me ›`,
      onPress: () => router.push({ pathname: "/plan/tomorrow", params: { date: plan.date } }),
    };
  const why = whyText(plan.why.filter((w) => w !== "assumed_day" && !ADJUST_CODES.includes(w)))[0];
  return why ? { text: why } : null;
}

export function DayTimeline({
  meals,
  now,
  nowMinute,
  plan,
  eatenProteinG,
  onReplan,
  replanning,
  planned = [],
  onLogPlanned,
}: {
  meals: readonly Meal[];
  /** AB3: meals the user said they will have (Assistant Bar `plan_meal`). */
  planned?: readonly PlannedMeal[];
  onLogPlanned?: (meal: PlannedMeal) => void;
  now: Date;
  nowMinute: number;
  plan: DayPlan | null;
  /** Protein eaten so far, for the sick-day minimum line (D86). */
  eatenProteinG: number;
  /** D85: ask the AI to re-plan the week (online only). */
  onReplan?: () => void;
  replanning?: boolean;
}) {
  const { colors, radius } = useTheme();
  const logged = new Set(meals.map((m) => m.mealType));
  const rows: Row[] = meals.map((m) => ({ kind: "logged", meal: m, at: minuteOf(m.loggedAt), key: `m:${m.id}` }));
  const told = planned.filter((p) => !logged.has(p.mealType));
  for (const p of told) rows.push({ kind: "told", meal: p, at: SLOT_MINUTE[p.mealType], key: `t:${p.id}` });
  const toldSlots = new Set(told.map((p) => p.mealType));
  if (plan) {
    plan.items.forEach((item, i) => {
      if (item.kind === "prep" && item.dayOffset === -1) return;
      if (item.kind === "meal" && (logged.has(item.slot) || toldSlots.has(item.slot))) return;
      // Past walks, workouts and prep are gone; a past meal stays so it can still be logged.
      const past = item.at < nowMinute - 15;
      if (past && item.kind !== "meal") return;
      rows.push({ kind: "planned", item, past, at: item.at, key: `p:${item.kind}:${item.at}:${i}` });
    });
  } else {
    const due = mealTypeForTime(now);
    if (!logged.has(due) && !toldSlots.has(due))
      rows.push({ kind: "planned", item: { kind: "meal", slot: due, at: nowMinute, title: "", access: "unknown", options: [], usual: false }, past: false, at: nowMinute, key: "due" });
  }
  rows.sort((a, b) => a.at - b.at);

  const context = plan ? contextLine(plan, eatenProteinG) : null;
  const tip = plan ? stepUpLine(plan) : null;

  return (
    <Card>
      <View style={styles.head}>
        <Text variant="headline-sm" accessibilityRole="header" style={styles.flex}>
          Your day
        </Text>
        {plan && plan.dayType !== "normal" ? <Badge label={DAY_TYPE_LABEL[plan.dayType]} tone="lilac" /> : null}
      </View>
      {context ? (
        <Text
          variant="caption"
          color={context.onPress ? "secondaryText" : "textSecondary"}
          accessibilityRole={context.onPress ? "link" : undefined}
          onPress={context.onPress}
        >
          {context.text}
        </Text>
      ) : null}

      <View style={styles.list}>
        {rows.map((r) => {
          if (r.kind === "logged") {
            const totals = mealTotals(r.meal);
            return (
              <PressableScale
                key={r.key}
                onPress={() => router.push({ pathname: "/log/meal/[id]", params: { id: r.meal.id } })}
                accessibilityRole="button"
                accessibilityLabel={`${MEAL_LABEL[r.meal.mealType]} logged, ${formatInt(totals.kcal)} kcal`}
                style={styles.row}
              >
                <View style={[styles.mark, { backgroundColor: colors.primary, borderRadius: radius.full }]}>
                  <Icon name="check" size={16} color={colors.ink} />
                </View>
                <View style={styles.flex}>
                  <Text variant="label">{MEAL_LABEL[r.meal.mealType]}</Text>
                  <Text variant="caption" color="textSecondary" numberOfLines={1}>
                    {r.meal.items.map((i) => `${formatPortion(i.quantity, i.unit)} ${i.name}`).join(", ")}
                  </Text>
                </View>
                <Text variant="label" color="primaryText" tabular>
                  {`${formatInt(totals.kcal)} kcal`}
                </Text>
                <AddToMealButton meal={r.meal} />
              </PressableScale>
            );
          }
          if (r.kind === "told") {
            const kcal = r.meal.items.reduce((sum, i) => sum + i.kcal, 0);
            return (
              <PressableScale
                key={r.key}
                onPress={onLogPlanned ? () => onLogPlanned(r.meal) : undefined}
                disabled={!onLogPlanned || !r.meal.items.length}
                accessibilityRole="button"
                accessibilityLabel={`${MEAL_LABEL[r.meal.mealType]} planned: ${r.meal.text}. Tap to log it.`}
                style={styles.row}
              >
                <View style={[styles.mark, { borderColor: colors.secondary, borderWidth: 1.5, borderRadius: radius.full }]}>
                  <Icon name="restaurant" size={16} color={colors.secondaryText} />
                </View>
                <View style={styles.flex}>
                  <Text variant="label" numberOfLines={2}>
                    {`${MEAL_LABEL[r.meal.mealType]}: ${r.meal.text}`}
                  </Text>
                  <Text variant="caption" color="textTertiary">
                    {`You planned this · ${formatInt(kcal)} kcal · tap to log`}
                  </Text>
                </View>
                <Icon name="add" size={20} color={colors.textTertiary} />
              </PressableScale>
            );
          }
          const { item, past } = r;
          const href = hrefFor(item);
          const title = item.kind === "meal" && (past || !plan) ? `Log ${MEAL_LABEL[item.slot].toLowerCase()}` : itemTitle(item);
          const sub = item.kind === "meal" && !plan ? "Due now" : past ? "Not logged yet" : itemTime(item);
          return (
            <PressableScale
              key={r.key}
              onPress={href ? () => router.push(href) : undefined}
              disabled={!href}
              accessibilityRole={href ? "button" : undefined}
              accessibilityLabel={`${title}. ${sub}`}
              style={styles.row}
            >
              <View style={[styles.mark, { borderColor: colors.outline, borderWidth: 1.5, borderRadius: radius.full }]}>
                <Icon name={item.kind === "meal" && (past || !plan) ? "add" : ICON[item.kind]} size={16} color={colors.textSecondary} />
              </View>
              <View style={styles.flex}>
                <Text variant="label" color={past ? "textSecondary" : "textPrimary"} numberOfLines={2}>
                  {title}
                </Text>
                <Text variant="caption" color="textTertiary">
                  {sub}
                </Text>
              </View>
              {href ? <Icon name="chevron_right" size={20} color={colors.textTertiary} /> : null}
            </PressableScale>
          );
        })}
        {!rows.length ? (
          <Text variant="body" color="textSecondary">
            Nothing else planned today.
          </Text>
        ) : null}
      </View>

      {tip ? (
        <View style={[styles.tip, { backgroundColor: colors.surfaceHigh, borderRadius: radius.md }]}>
          <Icon name="info" size={16} color={colors.textSecondary} />
          <Text variant="caption" color="textSecondary" style={styles.flex}>
            {tip}
          </Text>
        </View>
      ) : null}

      {plan ? (
        <View style={[styles.foot, { borderTopColor: colors.outline }]}>
          {plan.source === "ai" ? (
            <Text variant="caption" color="textTertiary">
              {plan.ai?.summary ?? "Planned by AI"}
            </Text>
          ) : null}
          <View style={styles.footActions}>
            <Button label="Change plan" icon="edit" size="sm" variant="secondary" onPress={() => router.push({ pathname: "/plan/tomorrow", params: { date: plan.date } })} />
            {onReplan ? <Button label={replanning ? "Re-planning…" : "Re-plan"} icon="auto_awesome" size="sm" variant="ghost" loading={replanning} disabled={replanning} onPress={onReplan} /> : null}
          </View>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  head: { flexDirection: "row", alignItems: "center", gap: 8 },
  list: { marginTop: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  mark: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  tip: { flexDirection: "row", gap: 8, padding: 10, marginTop: 8, alignItems: "flex-start" },
  foot: { gap: 8, marginTop: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  footActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
