// S10 Today Home building blocks (P10 shell). Consumed values are 0 until meal, step and activity
// logging land (P12, P23, P24); the coach line, next action and streak are placeholders until
// P30/P31/P37. Layout follows the S10 export; colours follow D14.
import { router } from "expo-router";
import { useId } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { Icon, type IconName } from "@/core/icons/Icon";
import { useTheme } from "@/core/theme";
import { Card, NumberUnit, PressableScale, ProgressBar, ProgressRing, Text } from "@/core/ui";
import { formatInt } from "@/features/targets/format";
import type { Targets } from "@shared/domain/targets";

/** Today's intake / burn. Everything is 0 until logging exists. */
export type Consumed = { kcal: number; proteinG: number; carbsG: number; fatG: number; steps: number };
export const NOTHING_CONSUMED: Consumed = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, steps: 0 };

const pct = (part: number, whole: number) => (whole > 0 ? part / whole : 0);

/** Streak chip — brand §8. Placeholder until the streak service (P30). */
export function StreakChip() {
  const { colors, radius } = useTheme();
  return (
    <View style={[styles.streak, { backgroundColor: colors.surfaceHigh, borderRadius: radius.full }]}>
      <Icon name="local_fire_department" size={16} color={colors.streak} filled />
      <Text variant="label">No streak yet</Text>
    </View>
  );
}

/** Hero card: calories left today, with the calorie ring. */
export function RemainingHero({ targets, consumed }: { targets: Targets; consumed: Consumed }) {
  const { colors, radius } = useTheme();
  const left = targets.kcal - consumed.kcal;
  const used = pct(consumed.kcal, targets.kcal);
  const proteinLeft = Math.max(0, targets.proteinG - consumed.proteinG);

  return (
    <Card variant="highlighted" glow accessibilityLabel={`${formatInt(left)} kcal left of ${formatInt(targets.kcal)}`}>
      <View style={styles.heroTop}>
        <View style={styles.flex}>
          <View style={styles.heroEyebrow}>
            <View style={[styles.heroPill, { borderColor: colors.ink, borderRadius: radius.full }]}>
              <Text variant="eyebrow" color="ink">
                Daily goal
              </Text>
            </View>
            <Text variant="label" color="ink" tabular>
              {`Target ${formatInt(targets.kcal)} kcal`}
            </Text>
          </View>
          <Text variant="headline-lg" color="ink">
            Remaining today
          </Text>
          <Text variant="body" color="ink">
            {`Consumed ${formatInt(consumed.kcal)} kcal · ${formatInt(proteinLeft)} g protein to go`}
          </Text>
        </View>
        <ProgressRing size="S" progress={used} color={colors.ink} accessibilityLabel="Calories eaten today">
          <Text variant="label" color="ink" tabular>
            {`${Math.round((1 - Math.min(1, used)) * 100)}%`}
          </Text>
          <Text variant="unit" color="ink">
            left
          </Text>
        </ProgressRing>
      </View>
      <View style={styles.heroNumber}>
        <NumberUnit value={formatInt(left)} unit="kcal" variant="display-xl" color="ink" unitColor="ink" />
      </View>
    </Card>
  );
}

/** Coloured metric tile (S10 "Activity steps" lilac / "Protein goal" orchid). */
function MetricTile({
  title,
  icon,
  bg,
  value,
  caption,
  footer,
  progress,
}: {
  title: string;
  icon: IconName;
  bg: string;
  value: string;
  caption: string;
  footer?: string;
  progress: number;
}) {
  const { colors, radius, layout } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={`${title}: ${value}. ${caption}`}
      style={[styles.tile, { backgroundColor: bg, borderRadius: radius.lg, padding: layout.cardPadding }]}
    >
      <View style={styles.tileHead}>
        <Text variant="title" color="ink" style={styles.flex}>
          {title}
        </Text>
        <View style={[styles.tileIcon, { borderRadius: radius.full, borderColor: colors.ink }]}>
          <Icon name={icon} size={16} color={colors.ink} />
        </View>
      </View>
      <Text variant="headline-lg" color="ink" tabular numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text variant="caption" color="ink">
        {caption}
      </Text>
      <ProgressBar progress={progress} color={colors.ink} track="rgba(22,24,27,0.15)" accessibilityLabel={title} />
      {footer ? (
        <Text variant="caption" color="ink">
          {footer}
        </Text>
      ) : null}
    </View>
  );
}

export function MetricTiles({ targets, consumed }: { targets: Targets; consumed: Consumed }) {
  const { colors } = useTheme();
  const proteinLeft = Math.max(0, targets.proteinG - consumed.proteinG);
  const proteinPct = pct(consumed.proteinG, targets.proteinG);
  return (
    <View style={styles.tiles}>
      <MetricTile
        title="Activity"
        icon="footprint"
        bg={colors.dataActivity}
        value={formatInt(consumed.steps)}
        caption={`Goal: ${formatInt(targets.steps)} steps`}
        progress={pct(consumed.steps, targets.steps)}
      />
      <MetricTile
        title="Protein"
        icon="egg"
        bg={colors.dataProtein}
        value={`${formatInt(consumed.proteinG)} / ${formatInt(targets.proteinG)} g`}
        caption={`${formatInt(proteinLeft)} g to go`}
        footer={`${Math.round(proteinPct * 100)}% done`}
        progress={proteinPct}
      />
    </View>
  );
}

/** "Daily macro balance": kcal-in ring + P · C · F remaining (order always P·C·F, brand §3.3). */
export function MacroBalance({ targets, consumed }: { targets: Targets; consumed: Consumed }) {
  const { colors, radius } = useTheme();
  const rows = [
    { label: "Protein", color: colors.dataProtein, left: targets.proteinG - consumed.proteinG },
    { label: "Carbs", color: colors.dataCarbs, left: targets.carbsG - consumed.carbsG },
    { label: "Fat", color: colors.dataFat, left: targets.fatG - consumed.fatG },
  ];
  return (
    <Card>
      <View style={styles.macroHead}>
        <Text variant="headline-sm" style={styles.flex}>
          Daily macro balance
        </Text>
        <Text variant="caption" color="textSecondary">
          Target split
        </Text>
      </View>
      <View style={styles.macroBody}>
        <ProgressRing
          size="M"
          progress={pct(consumed.kcal, targets.kcal)}
          color={colors.dataKcal}
          accessibilityLabel={`${formatInt(consumed.kcal)} kcal eaten`}
        >
          <Text variant="headline-sm" tabular>
            {formatInt(consumed.kcal)}
          </Text>
          <Text variant="unit" color="textSecondary">
            kcal in
          </Text>
        </ProgressRing>
        <View style={styles.macroRows}>
          {rows.map((r) => (
            <View
              key={r.label}
              accessible
              accessibilityLabel={`${r.label}: ${formatInt(Math.max(0, r.left))} grams left`}
              style={[styles.macroRow, { backgroundColor: colors.surfaceHigh, borderRadius: radius.full }]}
            >
              <View style={[styles.macroDot, { backgroundColor: r.color, borderRadius: radius.full }]} />
              <Text variant="label" style={styles.flex}>
                {r.label}
              </Text>
              <Text variant="label" color="textSecondary" tabular>
                {`${formatInt(Math.max(0, r.left))} g left`}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </Card>
  );
}

/** Next-best-action card — brand §8. Shell state only; the real states come in P31/P37. */
export function NextActionCard({ title, onPress }: { title: string; onPress: () => void }) {
  const { colors, radius, layout } = useTheme();
  const gradientId = `nba-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Next action: ${title}`}
      style={[styles.nba, { borderRadius: radius.lg, borderColor: colors.outline, padding: layout.cardPadding }]}
    >
      <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none" viewBox="0 0 100 100">
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={colors.surfaceLow} />
            <Stop offset="1" stopColor={colors.surfaceHigh} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="100" fill={`url(#${gradientId})`} />
      </Svg>
      <View style={[styles.nbaIcon, { backgroundColor: colors.secondary, borderRadius: radius.md }]}>
        <Icon name="restaurant" color={colors.ink} />
      </View>
      <View style={styles.flex}>
        <Text variant="eyebrow" color="secondaryText">
          Next action
        </Text>
        <Text variant="title">{title}</Text>
      </View>
      <View style={[styles.nbaChevron, { backgroundColor: colors.surfaceHighest, borderRadius: radius.full }]}>
        <Icon name="chevron_right" size={20} color={colors.textPrimary} />
      </View>
    </PressableScale>
  );
}

const MEALS = ["Breakfast", "Lunch", "Snacks", "Dinner"] as const;

/** Meals timeline with every slot empty (P12 fills it). */
export function MealSlots({ targets, consumed }: { targets: Targets; consumed: Consumed }) {
  const { colors, radius, layout } = useTheme();
  return (
    <View style={styles.meals}>
      <View style={styles.mealsHead}>
        <Text variant="headline-md" accessibilityRole="header" style={styles.flex}>
          Meals
        </Text>
        <Text variant="label" color="primaryText" tabular>
          {`${formatInt(consumed.kcal)} / ${formatInt(targets.kcal)} kcal`}
        </Text>
      </View>
      {MEALS.map((meal) => (
        <PressableScale
          key={meal}
          onPress={() => router.push("/quick-log")}
          accessibilityRole="button"
          accessibilityLabel={`Log ${meal.toLowerCase()}`}
          style={[
            styles.slot,
            {
              borderRadius: radius.lg,
              borderColor: colors.outline,
              backgroundColor: colors.surfaceLow,
              padding: layout.cardPadding,
            },
          ]}
        >
          <View style={[styles.slotPlus, { borderRadius: radius.md, borderColor: colors.outline }]}>
            <Icon name="add" color={colors.textSecondary} />
          </View>
          <View style={styles.flex}>
            <Text variant="title">{`Log ${meal.toLowerCase()}`}</Text>
            <Text variant="caption" color="textSecondary">
              Nothing logged yet
            </Text>
          </View>
        </PressableScale>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  streak: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6, paddingHorizontal: 12 },
  heroTop: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  heroEyebrow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" },
  heroPill: { borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2 },
  heroNumber: { marginTop: 16 },
  tiles: { flexDirection: "row", gap: 12 },
  tile: { flex: 1, gap: 6 },
  tileHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  tileIcon: { width: 28, height: 28, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  macroHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  macroBody: { flexDirection: "row", alignItems: "center", gap: 16 },
  macroRows: { flex: 1, gap: 8 },
  macroRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, paddingHorizontal: 12 },
  macroDot: { width: 8, height: 8 },
  nba: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, overflow: "hidden" },
  nbaIcon: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  nbaChevron: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  meals: { gap: 12, marginTop: 12 },
  mealsHead: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  slot: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderStyle: "dashed" },
  slotPlus: {
    width: 44,
    height: 44,
    borderWidth: 1,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
});
