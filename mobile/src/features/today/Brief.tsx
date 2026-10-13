// Home as a personal assistant: the coach has already read the day, so Home leads with one brief (what matters
// now and the one thing to tap), then a single glance at the numbers, then only the items that need the user.
// The full dashboards (macro split, steps rings, water glass, goal calendar, past days) live on /day.
import { router } from "expo-router";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import type { CoachId } from "@/core/api/types";
import { Icon, type IconName } from "@/core/icons/Icon";
import { useTheme } from "@/core/theme";
import { Avatar, Button, Card, PressableScale, Text } from "@/core/ui";
import { PERSONAS } from "@/features/coach/personas";
import { MEAL_LABEL } from "@/features/food/format";
import type { NextAction } from "@/features/gap/nextAction";
import { mealTotals, type Meal } from "@/features/meals/store";
import { formatInt } from "@/features/targets/format";
import { MEAL_TYPES, mealTypeForTime } from "@shared/domain/food";
import type { Targets } from "@shared/domain/targets";
import { AddToMealButton } from "./AddToMeal";
import type { Consumed } from "./TodayCards";

/** The brief: the coach's read of the day in their voice, and the one action that follows from it. */
export function BriefCard({
  coach,
  line,
  action,
  note,
  onAction,
  onAsk,
}: {
  coach: CoachId | null;
  /** The coach's line; without a coach the action's own title is the line. */
  line: string | null;
  action: NextAction;
  /** A small extra fact, e.g. "A freeze protected your streak." */
  note?: string;
  onAction: () => void;
  /** UX N2 · Opens Coach with this brief as the topic. Only with a coach. */
  onAsk?: () => void;
}) {
  const { colors } = useTheme();
  const persona = coach ? PERSONAS[coach] : null;
  const eyebrowColor = action.tone === "warning" ? "warn" : action.tone === "success" ? "primaryText" : "secondaryText";
  return (
    <Card
      variant={action.tone === "warning" ? "warning" : "raised"}
      accessibilityLabel={`${action.eyebrow}. ${line ?? action.title}`}
    >
      <View style={styles.briefHead}>
        {persona ? (
          <Avatar name={persona.name} accent={persona.accent} kind="coach" size={40} />
        ) : (
          <View style={[styles.briefIcon, { backgroundColor: colors.surfaceHighest }]}>
            <Icon name={action.icon} color={colors.textPrimary} />
          </View>
        )}
        <View style={styles.flex}>
          <Text variant="eyebrow" color={eyebrowColor}>
            {action.eyebrow}
          </Text>
          {persona ? (
            <Text variant="caption" color="textSecondary">
              {persona.name}
            </Text>
          ) : null}
        </View>
      </View>
      <Text variant="headline-sm" style={styles.briefLine}>
        {line ?? action.title}
      </Text>
      {line && line !== action.title ? (
        <Text variant="body" color="textSecondary">
          {action.title}
        </Text>
      ) : null}
      {note ? (
        <Text variant="caption" color="secondaryText">
          {note}
        </Text>
      ) : null}
      <View style={styles.briefCta}>
        <Button label={action.cta} icon={action.icon} onPress={onAction} fullWidth />
        {persona && onAsk ? (
          <Button label={`Ask ${persona.name} about this`} icon="forum" variant="ghost" size="sm" onPress={onAsk} />
        ) : null}
      </View>
    </Card>
  );
}

function Stat({
  label,
  value,
  sub,
  color,
  onPress,
  a11y,
}: {
  label: string;
  value: string;
  sub: string;
  color: string;
  onPress: () => void;
  a11y: string;
}) {
  return (
    <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={a11y} style={styles.stat}>
      <View style={[styles.statDot, { backgroundColor: color }]} />
      <Text variant="headline-sm" tabular numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text variant="caption" color="textSecondary" numberOfLines={1}>
        {label}
      </Text>
      <Text variant="unit" color="textTertiary" numberOfLines={1}>
        {sub}
      </Text>
    </PressableScale>
  );
}

/** One card with the four numbers that matter today. Tapping water logs a glass; the footer opens the full day. */
export function GlanceCard({
  targets,
  consumed,
  glasses,
  waterGoal,
  onAddGlass,
}: {
  targets: Targets;
  consumed: Consumed;
  glasses: number;
  waterGoal: number;
  onAddGlass: () => void;
}) {
  const { colors } = useTheme();
  const kcalLeft = targets.kcal - consumed.kcal;
  const proteinLeft = Math.max(0, targets.proteinG - consumed.proteinG);
  return (
    <Card>
      <View style={styles.stats}>
        <Stat
          label={kcalLeft >= 0 ? "kcal left" : "kcal over"}
          value={formatInt(Math.abs(kcalLeft))}
          sub={`of ${formatInt(targets.kcal)}`}
          color={colors.dataKcal}
          onPress={() => router.push("/gap")}
          a11y={`${formatInt(Math.abs(kcalLeft))} kcal ${kcalLeft >= 0 ? "left" : "over"}. Open ways to close the gap`}
        />
        <Stat
          label="g protein left"
          value={formatInt(proteinLeft)}
          sub={`of ${formatInt(targets.proteinG)} g`}
          color={colors.dataProtein}
          onPress={() => router.push("/gap")}
          a11y={`${formatInt(proteinLeft)} grams protein left`}
        />
        <Stat
          label="steps"
          value={consumed.steps === null ? "—" : formatInt(consumed.steps)}
          sub={`of ${formatInt(targets.steps)}`}
          color={colors.dataActivity}
          onPress={() => router.push("/activity/steps")}
          a11y={consumed.steps === null ? "Steps not connected. Open steps" : `${formatInt(consumed.steps)} steps`}
        />
        <Stat
          label="water"
          value={`${glasses}/${waterGoal}`}
          sub="tap to add"
          color={colors.secondary}
          onPress={onAddGlass}
          a11y={`Water: ${glasses} of ${waterGoal} glasses. Add a glass`}
        />
      </View>
      <PressableScale
        onPress={() => router.push("/day")}
        accessibilityRole="button"
        accessibilityLabel="See your full day"
        style={[styles.footer, { borderTopColor: colors.outline }]}
      >
        <Text variant="label" color="textSecondary" style={styles.flex}>
          Macros, meals, steps and past days
        </Text>
        <Text variant="label" color="primaryText">
          Full day
        </Text>
        <Icon name="chevron_right" size={16} color={colors.primaryText} />
      </PressableScale>
    </Card>
  );
}

/** One row in "Needs you": something only the user can decide, already prepared. */
export function NeedsYouRow({
  icon,
  title,
  subtitle,
  onPress,
  trailing,
}: {
  icon: IconName;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  trailing?: ReactNode;
}) {
  const { colors, radius, layout } = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={[title, subtitle].filter(Boolean).join(". ")}
      style={[styles.row, { backgroundColor: colors.surfaceLow, borderRadius: radius.lg, padding: layout.cardPadding }]}
    >
      <View style={[styles.rowIcon, { backgroundColor: colors.surfaceHigh, borderRadius: radius.md }]}>
        <Icon name={icon} size={20} color={colors.textPrimary} />
      </View>
      <View style={styles.flex}>
        <Text variant="title">{title}</Text>
        {subtitle ? (
          <Text variant="caption" color="textSecondary" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ?? (onPress ? <Icon name="chevron_right" size={20} color={colors.textTertiary} /> : null)}
    </PressableScale>
  );
}

/** Today's meals in one card: what's logged (each with "+" to add to it), then a single row for the meal that's due. */
export function TodayMeals({ meals, now }: { meals: readonly Meal[]; now: Date }) {
  const { colors } = useTheme();
  const logged = new Set(meals.map((m) => m.mealType));
  const due = mealTypeForTime(now);
  // The meal due now if it isn't logged yet, else the next unlogged one later in the day.
  const next = !logged.has(due) ? due : MEAL_TYPES.slice(MEAL_TYPES.indexOf(due) + 1).find((t) => !logged.has(t));
  return (
    <Card>
      <Text variant="headline-sm" accessibilityRole="header" style={styles.mealsHead}>
        Meals today
      </Text>
      {meals.length === 0 ? (
        <Text variant="body" color="textSecondary">
          Nothing logged yet.
        </Text>
      ) : (
        meals.map((m) => {
          const t = mealTotals(m);
          return (
            <PressableScale
              key={m.id}
              onPress={() => router.push({ pathname: "/log/meal/[id]", params: { id: m.id } })}
              accessibilityRole="button"
              accessibilityLabel={`${MEAL_LABEL[m.mealType]}, ${formatInt(t.kcal)} kcal`}
              style={styles.mealRow}
            >
              <Text variant="label" style={styles.mealType}>
                {MEAL_LABEL[m.mealType]}
              </Text>
              <Text variant="caption" color="textSecondary" numberOfLines={1} style={styles.flex}>
                {m.items.map((i) => i.name).join(", ")}
              </Text>
              <Text variant="label" color="primaryText" tabular>
                {`${formatInt(t.kcal)} kcal`}
              </Text>
              <AddToMealButton meal={m} />
            </PressableScale>
          );
        })
      )}
      {next ? (
        <PressableScale
          onPress={() => router.push({ pathname: "/quick-log", params: { mealType: next } })}
          accessibilityRole="button"
          accessibilityLabel={`Log ${MEAL_LABEL[next].toLowerCase()}`}
          style={[styles.mealRow, styles.mealNext, { borderTopColor: colors.outline }]}
        >
          <Icon name="add" size={16} color={colors.primaryText} />
          <Text variant="label" color="primaryText" style={styles.flex}>
            {`Log ${MEAL_LABEL[next].toLowerCase()}`}
          </Text>
        </PressableScale>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  briefHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  briefIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  briefLine: { marginTop: 12, marginBottom: 4 },
  briefCta: { marginTop: 16, gap: 4, alignItems: "stretch" },
  stats: { flexDirection: "row", gap: 8 },
  stat: { flex: 1, gap: 2 },
  statDot: { width: 8, height: 8, borderRadius: 4, marginBottom: 4 },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  rowIcon: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  mealsHead: { marginBottom: 8 },
  mealRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  mealType: { width: 76 },
  mealNext: { marginTop: 4, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12 },
});
