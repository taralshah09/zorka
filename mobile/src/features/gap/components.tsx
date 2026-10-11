// S41 Gap Closer building blocks (P31–P34): GapHeader (remaining macros), GapOptionCard (source badge, macros, action),
// MoveOptionCard and the nearby-section states. Layout follows the S41 Stitch export (D11); no food photos (D15): the
// category icon tile stands in. Colours: kcal lime, protein orchid (D14); over = amber, calm copy.
import { StyleSheet, View } from "react-native";

import { Icon, type IconName } from "@/core/icons/Icon";
import { useTheme } from "@/core/theme";
import { Badge, Button, Card, DietMarker, NumberUnit, ProgressBar, Text } from "@/core/ui";
import { FoodTile } from "@/features/food/components";
import { formatInt } from "@/features/targets/format";
import type { FoodCategory } from "@/core/api/types";
import type { EatSource } from "@shared/domain/eatOptions";
import type { Gap } from "@shared/domain/gap";
import type { MoveOption } from "@shared/domain/moveOptions";
import type { EatOption } from "./eat";

const SOURCE_LABEL: Record<EatSource, string> = {
  usual: "Your usual",
  home: "Home",
  zomato: "Zomato",
  blinkit: "Blinkit",
};
const SOURCE_TONE: Record<EatSource, "lilac" | "orchid" | "lime"> = {
  usual: "lilac",
  home: "orchid",
  zomato: "lime",
  blinkit: "lime",
};

/** "480 kcal · 45 g protein left" with the coach's priority and the day's progress bars. */
export function GapHeader({ gap, lateNight }: { gap: Gap; lateNight: boolean }) {
  const { colors } = useTheme();
  const over = gap.state === "over";
  const r = gap.remaining;
  const priority =
    gap.state === "under"
      ? gap.focus === "protein"
        ? "Protein first"
        : "Calories first"
      : over
        ? "Balance it"
        : "On track";
  const kcalShare = gap.budget.kcal > 0 ? gap.eaten.kcal / gap.budget.kcal : 0;
  const proteinShare = gap.budget.proteinG > 0 ? gap.eaten.proteinG / gap.budget.proteinG : 0;
  return (
    <Card
      variant={over ? "warning" : "raised"}
      accessibilityLabel={
        over
          ? `${formatInt(-r.kcal)} kcal over today`
          : `${formatInt(r.kcal)} kcal and ${formatInt(Math.max(0, r.proteinG))} grams protein left`
      }
    >
      <View style={styles.headTop}>
        <Text variant="eyebrow" color={over ? "warn" : "textSecondary"} style={styles.flex}>
          {over ? "Over today" : lateNight ? "Left tonight" : "Left today"}
        </Text>
        <Badge label={priority} tone={over ? "warning" : gap.state === "under" ? "lilac" : "success"} outline />
      </View>
      {over ? (
        <NumberUnit value={formatInt(-r.kcal)} unit="kcal over" variant="display" color="warn" />
      ) : (
        <View style={styles.headNumbers}>
          <NumberUnit value={formatInt(Math.max(0, r.kcal))} unit="kcal" variant="display" color="primaryText" />
          <Text variant="headline-md" color="textTertiary">
            ·
          </Text>
          <NumberUnit
            value={`${formatInt(Math.max(0, r.proteinG))} g`}
            unit="protein"
            variant="display"
            color="tertiaryText"
          />
        </View>
      )}
      <Text variant="body" color="textSecondary">
        {over
          ? "One meal doesn't define the week. Pick a way to balance it below."
          : `Carbs ${formatInt(Math.max(0, r.carbsG))} g · Fat ${formatInt(Math.max(0, r.fatG))} g left`}
      </Text>
      <View style={styles.bars}>
        <View style={styles.flex}>
          <ProgressBar
            progress={kcalShare}
            color={over ? colors.warn : colors.dataKcal}
            accessibilityLabel="Calories eaten"
          />
        </View>
        <View style={styles.flex}>
          <ProgressBar progress={proteinShare} color={colors.dataProtein} accessibilityLabel="Protein eaten" />
        </View>
      </View>
    </Card>
  );
}

function Macros({ kcal, proteinG, approx }: { kcal: number; proteinG: number; approx: boolean }) {
  return (
    <View style={styles.macros}>
      <NumberUnit value={formatInt(kcal)} unit="kcal" variant="headline-md" approx={approx} />
      <Text variant="title" color="textTertiary">
        ·
      </Text>
      <NumberUnit
        value={`${formatInt(proteinG)} g`}
        unit="protein"
        variant="headline-md"
        color="tertiaryText"
        approx={approx}
      />
    </View>
  );
}

const ACTION_LABEL: Record<EatSource, string> = {
  usual: "Log this",
  home: "Log",
  zomato: "Open Zomato",
  blinkit: "Open Blinkit",
};

export function GapOptionCard({ option, onAction, busy }: { option: EatOption; onAction: () => void; busy?: boolean }) {
  const { colors, radius } = useTheme();
  const nearby = option.source === "zomato" || option.source === "blinkit";
  const category = (option.category ?? (nearby ? "restaurant" : "home_meal")) as FoodCategory;
  return (
    <Card accessibilityLabel={`${SOURCE_LABEL[option.source]}: ${option.name}`}>
      <View style={styles.optionTop}>
        <View style={[styles.flex, styles.optionText]}>
          <View style={styles.badges}>
            <Badge label={SOURCE_LABEL[option.source]} tone={SOURCE_TONE[option.source]} outline />
            {option.estimate ? <Badge label="≈ estimate" tone="estimate" /> : null}
            {option.diet ? <DietMarker diet={option.diet} /> : null}
          </View>
          <Text variant="headline-sm" numberOfLines={2}>
            {option.name}
          </Text>
          {option.detail ? (
            <Text variant="caption" color="textSecondary" numberOfLines={1}>
              {option.detail}
            </Text>
          ) : null}
        </View>
        <FoodTile category={category} size={56} />
      </View>
      <View style={[styles.optionBottom, { borderTopColor: colors.outlineSoft, borderRadius: radius.xs }]}>
        <Macros kcal={option.macros.kcal} proteinG={option.macros.proteinG} approx={option.estimate} />
        <Button
          label={ACTION_LABEL[option.source]}
          size="sm"
          variant={nearby ? "secondary" : "primary"}
          icon={nearby ? "open_in_new" : "check"}
          onPress={onAction}
          loading={busy}
        />
      </View>
    </Card>
  );
}

const MOVE_ICON: Record<"walk" | "ride" | "run", IconName> = {
  walk: "directions_walk",
  ride: "directions_bike",
  run: "directions_run",
};
const MOVE_NAME: Record<"walk" | "ride" | "run", string> = { walk: "Brisk walk", ride: "Ride", run: "Run" };

export function moveTitle(o: MoveOption): string {
  switch (o.kind) {
    case "activity":
      return `${MOVE_NAME[o.activity]} · ${o.minutes} min`;
    case "steps":
      return `Brisk walk · ${o.minutes} min`;
    case "spread":
      return `Spread it: walk ${o.minutes} min + ease tomorrow`;
    case "ease":
      return o.days > 1
        ? `Ease the next ${o.days} days by ${o.easePerDay} kcal`
        : `Tomorrow's target eases by ${o.easePerDay}`;
  }
}

function moveCaption(o: MoveOption): string {
  switch (o.kind) {
    case "activity":
      return o.closes
        ? `Burns about ${formatInt(o.kcal)} kcal, enough to balance it`
        : `Burns about ${formatInt(o.kcal)} kcal`;
    case "steps":
      return `About ${formatInt(o.steps)} steps and ${o.points} activity points · ≈ ${formatInt(o.kcal)} kcal`;
    case "spread":
      return `≈ ${formatInt(o.kcal)} kcal tonight, then ${o.easePerDay} kcal less ${o.days > 1 ? `for ${o.days} days` : "tomorrow"}`;
    case "ease":
      return "No late-night workout. Your target eases instead, never below your minimum.";
  }
}

export function MoveOptionCard({
  option,
  onAction,
  actionLabel,
  done,
}: {
  option: MoveOption;
  onAction: () => void;
  actionLabel: string;
  done?: boolean;
}) {
  const { colors, radius } = useTheme();
  const icon: IconName =
    option.kind === "ease" ? "bedtime" : option.kind === "spread" ? "directions_walk" : MOVE_ICON[option.activity];
  return (
    <Card accessibilityLabel={moveTitle(option)}>
      <View style={styles.moveRow}>
        <View style={[styles.moveIcon, { backgroundColor: colors.dataActivity, borderRadius: radius.md }]}>
          <Icon name={icon} color={colors.ink} />
        </View>
        <View style={styles.flex}>
          <Badge label="Activity" tone="lilac" outline />
          <Text variant="title" style={styles.moveTitle}>
            {moveTitle(option)}
          </Text>
          <Text variant="caption" color="textSecondary">
            {moveCaption(option)}
          </Text>
        </View>
      </View>
      <View style={styles.moveAction}>
        <Button
          label={done ? "Done" : actionLabel}
          size="sm"
          variant={option.kind === "ease" || option.kind === "spread" ? "secondary" : "primary"}
          icon={done ? "check" : option.kind === "ease" ? "check" : "play_arrow"}
          onPress={onAction}
          disabled={done}
        />
      </View>
    </Card>
  );
}

export function NearbyNotice({
  icon,
  title,
  body,
  actionLabel,
  onAction,
}: {
  icon: IconName;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { colors, radius } = useTheme();
  return (
    <View
      style={[
        styles.notice,
        { borderColor: colors.outline, borderRadius: radius.lg, backgroundColor: colors.surfaceLow },
      ]}
    >
      <Icon name={icon} color={colors.textSecondary} />
      <View style={styles.flex}>
        <Text variant="title">{title}</Text>
        <Text variant="caption" color="textSecondary">
          {body}
        </Text>
      </View>
      {actionLabel && onAction ? <Button label={actionLabel} size="sm" variant="ghost" onPress={onAction} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headTop: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  headNumbers: { flexDirection: "row", alignItems: "baseline", gap: 8, flexWrap: "wrap" },
  bars: { flexDirection: "row", gap: 8, marginTop: 12 },
  optionTop: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  optionText: { gap: 6 },
  badges: { flexDirection: "row", gap: 6, flexWrap: "wrap", alignItems: "center" },
  optionBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    flexWrap: "wrap",
  },
  macros: { flexDirection: "row", alignItems: "baseline", gap: 6, flexShrink: 1 },
  moveRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  moveIcon: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  moveTitle: { marginTop: 6 },
  moveAction: { alignItems: "flex-end", marginTop: 12 },
  notice: { flexDirection: "row", gap: 12, alignItems: "center", borderWidth: 1, borderStyle: "dashed", padding: 16 },
});
