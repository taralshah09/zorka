// S19 · Food detail & portion (P12). Built from DESIGN.md §6.4 (no export yet, D35): name, cuisine tag,
// diet marker, portion (quantity + Indian unit), macros for that portion, Add. The portion starts at what the
// user logged last time (UX L2).
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { Badge, Button, DietMarker, EmptyState, Header, NumberStepper, Screen, Text, dietLabel } from "@/core/ui";
import { FoodTile, MacroTotals, UnitPicker } from "@/features/food/components";
import { CUISINE_LABEL, MEAL_LABEL, unitName } from "@/features/food/format";
import { getFood, nutritionOf, useFoods } from "@/features/food/catalog";
import { finishPick, mealTypeParam, pickMode, useFinishDraft, type PickParams } from "@/features/log/nav";
import { useDraft } from "@/features/log/draft";
import { lastPortion } from "@/features/meals/store";
import { useActiveUser } from "@/features/users/activeUser";
import { mealTypeForTime, portion, unitOptions, type FoodUnit } from "@shared/domain/food";

const isBase = (u: FoodUnit) => u === "g" || u === "ml";

export default function FoodDetail() {
  const params = useLocalSearchParams<PickParams & { id: string }>();
  const userId = useActiveUser((s) => s.userId);
  useFoods(userId); // re-render when the catalog refreshes
  const food = userId ? getFood(userId, params.id) : null;
  const draftMeal = useDraft((s) => s.draft?.mealType);
  // A voice item that wasn't in the list keeps the amount the person said, when the new food has that unit.
  const spoken = useDraft((s) =>
    s.draft?.source === "voice" && params.key ? s.draft.items.find((i) => i.key === params.key && !i.food) : undefined,
  );
  const hasUnit = (u: FoodUnit) => !!food && unitOptions(nutritionOf(food)).some((o) => o.unit === u);
  // Read once: the portion only seeds the starting amount.
  const [last] = useState(() => (food && userId ? lastPortion(userId, food.id) : null));
  const keep = spoken ? (hasUnit(spoken.unit) ? spoken : null) : last && hasUnit(last.unit) ? last : null;
  const finish = useFinishDraft();

  const [unit, setUnit] = useState<FoodUnit>(keep?.unit ?? food?.defaultUnit ?? "g");
  const [quantity, setQuantity] = useState(keep?.quantity ?? (food && isBase(food.defaultUnit) ? 100 : 1));

  if (!food) {
    return (
      <Screen header={<Header title="Food" onBack={() => router.back()} />}>
        <EmptyState
          icon="search"
          title="This food isn't available"
          actionLabel="Back to search"
          onAction={() => router.back()}
        />
      </Screen>
    );
  }

  const changeUnit = (u: FoodUnit) => {
    if (isBase(u) !== isBase(unit)) setQuantity(isBase(u) ? 100 : 1);
    setUnit(u);
  };
  const { grams, macros } = portion(nutritionOf(food), quantity, unit);
  const mode = pickMode(params);
  const meal = mealTypeParam(params) ?? draftMeal ?? mealTypeForTime(new Date());
  const cuisine = CUISINE_LABEL[food.cuisine];
  const actionLabel = mode === "replace" ? "Use this food" : `Add to ${MEAL_LABEL[meal].toLowerCase()}`;

  return (
    <Screen header={<Header title={food.name} onBack={() => router.back()} />}>
      <View style={styles.head}>
        <FoodTile category={food.category} size={64} />
        <View style={styles.flex}>
          <Text variant="headline-md">{food.name}</Text>
          <View style={styles.tags}>
            <DietMarker diet={food.diet} />
            <Text variant="caption" color="textSecondary">
              {dietLabel(food.diet)}
            </Text>
            {cuisine ? <Badge label={cuisine} tone="lilac" outline /> : null}
            {food.custom ? <Badge label="My food" /> : <Badge label="estimate" tone="estimate" />}
          </View>
        </View>
      </View>

      <Text variant="eyebrow" color="textSecondary">
        Portion
      </Text>
      <UnitPicker units={unitOptions(nutritionOf(food))} value={unit} onChange={changeUnit} liquid={food.liquid} />
      <NumberStepper
        label={isBase(unit) ? `Amount in ${unit}` : `How many ${unitName(unit)}`}
        value={quantity}
        onChange={setQuantity}
        min={isBase(unit) ? 10 : 0.5}
        max={isBase(unit) ? 2000 : 20}
        step={isBase(unit) ? 10 : 0.5}
        unit={isBase(unit) ? unit : undefined}
      />
      <Text variant="caption" color="textSecondary">
        {`≈ ${Math.round(grams)} ${food.liquid ? "ml" : "g"}`}
      </Text>

      <MacroTotals totals={macros} />

      <Button
        label={actionLabel}
        icon="add"
        onPress={() => finishPick(food, quantity, unit, params, finish)}
        glow
        fullWidth
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", gap: 16, alignItems: "center" },
  flex: { flex: 1, gap: 6 },
  tags: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
});
