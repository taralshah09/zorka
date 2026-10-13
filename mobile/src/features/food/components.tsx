// Food-logging domain components (DESIGN.md §7.2): FoodTile, FoodRow, FoodItemRow (S16), UnitPicker,
// MacroTotals, MealTypeSelector, OilGheePrompt (P18) and FollowUpCard (P17). Styled per brand §8.
import { StyleSheet, View } from "react-native";

import type { FoodCategory } from "@/core/api/types";
import { Icon } from "@/core/icons/Icon";
import { useTheme } from "@/core/theme";
import {
  Chip,
  DietMarker,
  IconButton,
  MacroBar,
  NumberUnit,
  PressableScale,
  SegmentedControl,
  Text,
  type Diet,
} from "@/core/ui";
import { MEAL_TYPES, type FoodUnit, type Macros, type MealType, type OilLevel } from "@shared/domain/food";
import { CATEGORY_TILE, formatKcal, MEAL_LABEL, unitName } from "./format";

/** 44–64 px category tile (no food photos, D15). */
export function FoodTile({ category, size = 44 }: { category: FoodCategory | null; size?: number }) {
  const { colors, radius } = useTheme();
  const tile = CATEGORY_TILE[category ?? "home_meal"];
  const bg = tile.tint === "orchid" ? colors.tertiary : tile.tint === "lilac" ? colors.secondary : colors.primary;
  return (
    <View style={[styles.tile, { width: size, height: size, borderRadius: radius.md, backgroundColor: bg }]}>
      <Icon name={tile.icon} size={size >= 56 ? 28 : 20} color={colors.ink} />
    </View>
  );
}

/** A search / list row: tile · diet marker + name · serving · kcal (S18). */
export function FoodRow({
  name,
  diet,
  category,
  meta,
  kcal,
  onPress,
  onAdd,
  badge,
}: {
  name: string;
  diet: Diet | null;
  category: FoodCategory | null;
  meta: string;
  kcal: number;
  onPress?: () => void;
  /** Shows a "+" that logs the portion in `meta` without opening the food (UX L2). */
  onAdd?: () => void;
  badge?: string;
}) {
  const { colors, radius, layout } = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${meta}, ${formatKcal(kcal)}`}
      style={[styles.row, { backgroundColor: colors.surfaceLow, borderRadius: radius.lg, padding: layout.cardPadding }]}
    >
      <FoodTile category={category} />
      <View style={styles.flex}>
        <View style={styles.nameRow}>
          {diet ? <DietMarker diet={diet} /> : null}
          <Text variant="title" numberOfLines={1} style={styles.shrink}>
            {name}
          </Text>
          {badge ? (
            <Text variant="caption" color="secondaryText">
              {badge}
            </Text>
          ) : null}
        </View>
        <Text variant="caption" color="textSecondary" numberOfLines={1}>
          {meta}
        </Text>
      </View>
      <Text variant="label" color="primaryText" tabular>
        {formatKcal(kcal)}
      </Text>
      {onAdd ? <IconButton icon="add" accessibilityLabel={`Add ${name}, ${meta}`} onPress={onAdd} /> : null}
    </PressableScale>
  );
}

/** S16 food item row — confident · uncertain (amber, "Not sure. Tap to fix") · unmatched ("Search instead"). */
export function FoodItemRow({
  name,
  diet,
  portion,
  kcal,
  proteinG,
  state,
  note,
  onPress,
  onRemove,
  onStep,
}: {
  name: string;
  diet: Diet | null;
  portion: string;
  kcal: number;
  proteinG: number;
  state: "ok" | "uncertain" | "unmatched";
  note?: string;
  onPress: () => void;
  /** Shows a remove (✕) button, for dropping a wrong item without opening it. */
  onRemove?: () => void;
  /** Shows − / + around the portion, to fix the amount in place (UX F7). Null for a side that can't step. */
  onStep?: { down: (() => void) | null; up: (() => void) | null };
}) {
  const { colors, radius, layout } = useTheme();
  const warn = state === "uncertain";
  const unmatched = state === "unmatched";
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        unmatched
          ? `${name}: couldn't find it. Search instead`
          : `${name}, ${portion}, ${formatKcal(kcal)}, ${Math.round(proteinG)} grams protein${warn ? ". Not sure, tap to fix" : ""}`
      }
      style={[
        styles.item,
        {
          borderRadius: radius.lg,
          padding: layout.cardPadding,
          backgroundColor: colors.surfaceLow,
          borderColor: warn ? colors.warn : colors.outline,
          borderWidth: warn ? 1.5 : StyleSheet.hairlineWidth,
          borderStyle: unmatched ? "dashed" : "solid",
        },
      ]}
    >
      <View style={styles.itemTop}>
        {warn ? (
          <Icon name="warning" size={20} color={colors.warn} />
        ) : diet ? (
          <DietMarker diet={diet} />
        ) : (
          <Icon name="search" size={20} color={colors.textSecondary} />
        )}
        <View style={styles.flex}>
          <Text variant="title" numberOfLines={2}>
            {name}
          </Text>
          {unmatched ? (
            <Text variant="caption" color="textSecondary">
              {note ?? "Couldn't find this one"}
            </Text>
          ) : (
            <View style={styles.metaRow}>
              {onStep ? (
                <View style={styles.stepRow}>
                  <StepButton icon="remove" label={`Less ${name}`} onPress={onStep.down} />
                  <Text variant="caption" color="textSecondary">
                    {portion}
                  </Text>
                  <StepButton icon="add" label={`More ${name}`} onPress={onStep.up} />
                </View>
              ) : (
                <Text variant="caption" color="textSecondary">
                  {portion}
                </Text>
              )}
              <Text variant="caption" color="primaryText" tabular>
                {formatKcal(kcal)}
              </Text>
              <Text variant="caption" color="tertiaryText" tabular>
                {`${Math.round(proteinG)} g P`}
              </Text>
            </View>
          )}
        </View>
        {state === "ok" ? (
          <View style={[styles.check, { backgroundColor: colors.surfaceHigh, borderRadius: radius.full }]}>
            <Icon name="check" size={16} color={colors.primaryText} />
          </View>
        ) : (
          <Icon name={unmatched ? "chevron_right" : "edit"} size={20} color={colors.textSecondary} />
        )}
        {onRemove ? <IconButton icon="close" accessibilityLabel={`Remove ${name}`} onPress={onRemove} /> : null}
      </View>
      {warn || unmatched ? (
        <View
          style={[
            styles.callout,
            { backgroundColor: warn ? colors.warnContainer : colors.surfaceHigh, borderRadius: radius.sm },
          ]}
        >
          <Text variant="caption" color={warn ? "warn" : "textSecondary"} style={styles.flex}>
            {warn ? (note ?? "Not sure. Tap to fix") : "Search instead"}
          </Text>
          <Text variant="label" color={warn ? "warn" : "primaryText"}>
            {warn ? "FIX" : "SEARCH"}
          </Text>
        </View>
      ) : null}
    </PressableScale>
  );
}

/** The small − / + on an item row (UX F7). Tighter than IconButton so it fits the meta line. */
function StepButton({ icon, label, onPress }: { icon: "add" | "remove"; label: string; onPress: (() => void) | null }) {
  const { colors, radius } = useTheme();
  return (
    <PressableScale
      onPress={onPress ?? undefined}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !onPress }}
      hitSlop={8}
      style={[
        styles.step,
        { borderRadius: radius.full, backgroundColor: colors.surfaceHigh, opacity: onPress ? 1 : 0.4 },
      ]}
    >
      <Icon name={icon} size={16} color={colors.primaryText} />
    </PressableScale>
  );
}

/** Unit chips (katori, roti/piece, plate, glass, g, ml) — S17, S19. */
export function UnitPicker({
  units,
  value,
  onChange,
  liquid = false,
}: {
  units: readonly { unit: FoodUnit; grams: number }[];
  value: FoodUnit;
  onChange: (u: FoodUnit) => void;
  liquid?: boolean;
}) {
  return (
    <View style={styles.wrap} accessibilityRole="radiogroup" accessibilityLabel="Unit">
      {units.map((u) => (
        <Chip
          key={u.unit}
          kind="choice"
          label={
            u.unit === "g" || u.unit === "ml"
              ? u.unit
              : `${unitName(u.unit)} · ${Math.round(u.grams)} ${liquid ? "ml" : "g"}`
          }
          selected={u.unit === value}
          onPress={() => onChange(u.unit)}
        />
      ))}
    </View>
  );
}

/** kcal total + P·C·F tiles + the macro bar (S16 totals, S19, S21). */
export function MacroTotals({ totals, caption }: { totals: Macros; caption?: string }) {
  const { colors, radius, layout } = useTheme();
  const tiles = [
    { label: "Protein", value: totals.proteinG, color: colors.dataProtein },
    { label: "Carbs", value: totals.carbsG, color: colors.dataCarbs },
    { label: "Fat", value: totals.fatG, color: colors.dataFat },
  ];
  return (
    <View
      style={[
        styles.totals,
        { backgroundColor: colors.surfaceLow, borderRadius: radius.lg, padding: layout.cardPadding },
      ]}
      accessible
      accessibilityLabel={`Total ${formatKcal(totals.kcal)}. Protein ${Math.round(totals.proteinG)} grams, carbs ${Math.round(totals.carbsG)} grams, fat ${Math.round(totals.fatG)} grams`}
    >
      <View style={styles.totalsHead}>
        <NumberUnit value={Math.round(totals.kcal).toLocaleString("en-IN")} unit="kcal total" variant="display" />
        {caption ? (
          <Text variant="caption" color="secondaryText" style={styles.flex}>
            {caption}
          </Text>
        ) : null}
      </View>
      <MacroBar protein={totals.proteinG} carbs={totals.carbsG} fat={totals.fatG} accessibilityLabel="Macro split" />
      <View style={styles.tiles}>
        {tiles.map((t) => (
          <View
            key={t.label}
            style={[styles.macroTile, { backgroundColor: colors.surfaceHigh, borderRadius: radius.md }]}
          >
            <View style={styles.tileHead}>
              <View style={[styles.dot, { backgroundColor: t.color }]} />
              <Text variant="eyebrow" color="textSecondary">
                {t.label}
              </Text>
            </View>
            <Text variant="headline-sm" tabular>{`${Math.round(t.value)} g`}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function MealTypeSelector({ value, onChange }: { value: MealType; onChange: (m: MealType) => void }) {
  return (
    <SegmentedControl<MealType>
      accessibilityLabel="Meal"
      segments={MEAL_TYPES.map((m) => ({ value: m, label: MEAL_LABEL[m] }))}
      value={value}
      onChange={onChange}
    />
  );
}

const OIL: { value: OilLevel; label: string }[] = [
  { value: "little", label: "Little" },
  { value: "normal", label: "Normal" },
  { value: "heavy", label: "Heavy" },
];

/** P18 · "How much oil/ghee went in?" — S16 oil/ghee state. `deltaKcal` = change vs normal. */
export function OilGheePrompt({
  value,
  onChange,
  deltaKcal,
}: {
  value: OilLevel;
  onChange: (v: OilLevel) => void;
  deltaKcal: number;
}) {
  const { colors, radius, layout } = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surfaceLow, borderRadius: radius.lg, padding: layout.cardPadding },
      ]}
    >
      <View style={styles.cardHead}>
        <Text variant="headline-sm" style={styles.flex}>
          How much oil or ghee went in?
        </Text>
        {deltaKcal !== 0 ? (
          <View style={[styles.delta, { borderColor: colors.primary, borderRadius: radius.full }]}>
            <Text variant="caption" color="primaryText" tabular>
              {`${deltaKcal > 0 ? "+" : "−"}${Math.abs(deltaKcal)} kcal`}
            </Text>
          </View>
        ) : null}
      </View>
      <Text variant="caption" color="textSecondary">
        For the home-cooked items. Normal is a standard home recipe.
      </Text>
      <View style={styles.wrap} accessibilityRole="radiogroup" accessibilityLabel="Oil or ghee">
        {OIL.map((o) => (
          <Chip
            key={o.value}
            kind="choice"
            label={o.label}
            selected={value === o.value}
            onPress={() => onChange(o.value)}
          />
        ))}
      </View>
    </View>
  );
}

/** P17 · one follow-up question from a photo ("Half plate or full?"). */
export function FollowUpCard({
  question,
  options,
  answered,
  onAnswer,
}: {
  question: string;
  options: { label: string }[];
  answered: number | null;
  onAnswer: (index: number) => void;
}) {
  const { colors, radius, layout } = useTheme();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surfaceLow,
          borderRadius: radius.lg,
          padding: layout.cardPadding,
          borderWidth: answered === null ? 1.5 : 0,
          borderColor: colors.secondary,
        },
      ]}
    >
      <View style={styles.cardHead}>
        <Icon name="auto_awesome" size={20} color={colors.secondaryText} />
        <Text variant="headline-sm" style={styles.flex}>
          {question}
        </Text>
      </View>
      <View style={styles.wrap} accessibilityRole="radiogroup" accessibilityLabel={question}>
        {options.map((o, i) => (
          <Chip key={o.label} kind="choice" label={o.label} selected={answered === i} onPress={() => onAnswer(i)} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  shrink: { flexShrink: 1 },
  tile: { alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  item: { gap: 10 },
  itemTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 2 },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  step: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  check: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  callout: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  totals: { gap: 12 },
  totalsHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  tiles: { flexDirection: "row", gap: 8 },
  macroTile: { flex: 1, padding: 12, gap: 4 },
  tileHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  card: { gap: 10 },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  delta: { borderWidth: 1, paddingHorizontal: 10, paddingVertical: 2 },
});
