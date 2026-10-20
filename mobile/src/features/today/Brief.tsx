// Home as a personal assistant: a hero with where the day stands (kcal left, protein, steps, water), then one brief
// (what matters now and the one thing to tap), then only the items that need the user. The day's timeline is
// DayTimeline.tsx; the full dashboards (macro split, steps rings, water glass, goal calendar, past days) live on /day.
import { router } from "expo-router";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import type { CoachId } from "@/core/api/types";
import { Icon, type IconName } from "@/core/icons/Icon";
import { useTheme } from "@/core/theme";
import { Avatar, Button, Card, NumberUnit, PressableScale, ProgressBar, Text } from "@/core/ui";
import { PERSONAS } from "@/features/coach/personas";
import type { NextAction } from "@/features/gap/nextAction";
import { formatInt } from "@/features/targets/format";
import type { Targets } from "@shared/domain/targets";
import type { Consumed } from "./TodayCards";

/** The brief: the coach's read of the day in their voice, and the one action that follows from it. */
export function BriefCard({
  coach,
  line,
  action,
  note,
  onNotePress,
  onAction,
  onAsk,
  extra,
}: {
  coach: CoachId | null;
  /** The coach's line; without a coach the action's own title is the line. */
  line: string | null;
  action: NextAction;
  /** A small extra fact, e.g. "A freeze protected your streak." */
  note?: string;
  /** Makes the note a link (UX W2: the freeze note opens how streaks work). */
  onNotePress?: () => void;
  onAction: () => void;
  /** UX N2 · Opens Coach with this brief as the topic. Only with a coach. */
  onAsk?: () => void;
  /** Secondary choices under the CTA (the usual meal's "Change portion" / "Not now"). */
  extra?: ReactNode;
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
        <Text
          variant="caption"
          color="secondaryText"
          onPress={onNotePress}
          accessibilityRole={onNotePress ? "link" : undefined}
        >
          {onNotePress ? `${note} How it works ›` : note}
        </Text>
      ) : null}
      <View style={styles.briefCta}>
        {action.cta ? <Button label={action.cta} icon={action.icon} onPress={onAction} fullWidth /> : null}
        {extra}
        {action.cta && persona && onAsk && !extra ? (
          <Button label={`Ask ${persona.name} about this`} icon="forum" variant="ghost" size="sm" onPress={onAsk} />
        ) : null}
      </View>
    </Card>
  );
}

function HeroStat({ label, value, onPress, a11y }: { label: string; value: string; onPress: () => void; a11y: string }) {
  return (
    <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={a11y} style={styles.stat}>
      <Text variant="headline-sm" color="ink" tabular numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text variant="caption" color="ink" numberOfLines={1} style={styles.statLabel}>
        {label}
      </Text>
    </PressableScale>
  );
}

/**
 * The hero: kcal left today (big), how much is eaten, and protein, steps and water underneath. A non-usual day says
 * so in a pill (targets were adjusted for it); an away day's range is the line under the number. Tapping water logs a
 * glass; the footer opens the full day.
 */
export function TodayHero({
  targets,
  consumed,
  glasses,
  waterGoal,
  onAddGlass,
  dayLabel,
  kcalRange,
  coverage,
}: {
  targets: Pick<Targets, "kcal" | "proteinG"> & { steps: number | null };
  consumed: Consumed;
  glasses: number;
  waterGoal: number;
  onAddGlass: () => void;
  /** "Busy day", "Sick day"…; null on a usual day. */
  dayLabel: string | null;
  kcalRange?: [number, number];
  /** How complete today's records are ("2 meals recorded. These totals may be incomplete."). */
  coverage: string | null;
}) {
  const { colors, radius } = useTheme();
  const kcalLeft = targets.kcal - consumed.kcal;
  const proteinLeft = Math.max(0, targets.proteinG - consumed.proteinG);
  const sub = kcalRange
    ? `Anywhere in ${formatInt(kcalRange[0])}–${formatInt(kcalRange[1])} kcal is fine today`
    : `${formatInt(consumed.kcal)} eaten of ${formatInt(targets.kcal)} kcal`;
  return (
    <Card variant="highlighted" glow accessibilityLabel={`${formatInt(Math.abs(kcalLeft))} kcal ${kcalLeft >= 0 ? "left" : "over"} today. ${sub}`}>
      <View style={styles.heroTop}>
        <Text variant="eyebrow" color="ink" style={styles.flex}>
          {kcalLeft >= 0 ? "Left today" : "Over today"}
        </Text>
        {dayLabel ? (
          <View style={[styles.pill, { backgroundColor: colors.ink, borderRadius: radius.full }]}>
            <Text variant="label" style={{ color: colors.primary }}>
              {dayLabel}
            </Text>
          </View>
        ) : null}
      </View>
      <PressableScale onPress={() => router.push("/gap")} accessibilityRole="button" accessibilityLabel="Open ways to close the gap">
        <NumberUnit value={formatInt(Math.abs(kcalLeft))} unit="kcal" variant="display-xl" color="ink" unitColor="ink" />
      </PressableScale>
      <Text variant="body" color="ink">
        {sub}
      </Text>
      <View style={styles.heroBar}>
        <ProgressBar progress={targets.kcal > 0 ? consumed.kcal / targets.kcal : 0} color={colors.ink} track="rgba(0,0,0,0.12)" accessibilityLabel="Calories eaten" />
      </View>
      <View style={styles.stats}>
        <HeroStat label="protein left" value={`${formatInt(proteinLeft)} g`} onPress={() => router.push("/gap")} a11y={`${formatInt(proteinLeft)} grams protein left of ${formatInt(targets.proteinG)}`} />
        <HeroStat
          label={targets.steps != null ? `of ${formatInt(targets.steps)} steps` : "steps"}
          value={consumed.steps === null ? "—" : formatInt(consumed.steps)}
          onPress={() => router.push("/activity/steps")}
          a11y={consumed.steps === null ? "Steps not connected. Open steps" : `${formatInt(consumed.steps)} steps`}
        />
        <HeroStat label="water · tap +1" value={`${glasses}/${waterGoal}`} onPress={onAddGlass} a11y={`Water: ${glasses} of ${waterGoal} glasses. Add a glass`} />
      </View>
      <PressableScale
        onPress={() => router.push("/day")}
        accessibilityRole="button"
        accessibilityLabel="See your full day"
        style={[styles.footer, { borderTopColor: "rgba(0,0,0,0.15)" }]}
      >
        <Text variant="caption" color="ink" style={styles.flex} numberOfLines={2}>
          {coverage ?? "Macros, meals, steps and past days"}
        </Text>
        <Text variant="label" color="ink">
          Full day
        </Text>
        <Icon name="chevron_right" size={16} color={colors.ink} />
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

const styles = StyleSheet.create({
  flex: { flex: 1 },
  briefHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  briefIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  briefLine: { marginTop: 12, marginBottom: 4 },
  briefCta: { marginTop: 16, gap: 4, alignItems: "stretch" },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  pill: { paddingHorizontal: 10, paddingVertical: 4 },
  heroBar: { marginTop: 12 },
  stats: { flexDirection: "row", gap: 8, marginTop: 16 },
  stat: { flex: 1, gap: 2 },
  statLabel: { opacity: 0.75 },
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
});
