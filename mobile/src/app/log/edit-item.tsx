// S17 · Edit item (P15). Built from DESIGN.md §6.4 (no export yet, D35): change the food, quantity
// stepper, unit picker (katori, piece, plate, glass, g, ml), live macros, Update / Remove.
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";

import { Button, Card, EmptyState, Header, ListItem, NumberStepper, Screen, Text } from "@/core/ui";
import { FoodTile, MacroTotals, UnitPicker } from "@/features/food/components";
import { unitName } from "@/features/food/format";
import { nutritionOf } from "@/features/food/catalog";
import { draftActions, useDraft } from "@/features/log/draft";
import { applyOil, portion, unitOptions, type FoodUnit } from "@shared/domain/food";
import { useTargets } from "@/features/targets/targets";

const isBase = (u: FoodUnit) => u === "g" || u === "ml";

export default function EditItem() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const item = useDraft((s) => s.draft?.items.find((i) => i.key === key));
  const oilLevel = useDraft((s) => s.draft?.oilLevel ?? "normal");
  const { profile } = useTargets();
  const [quantity, setQuantity] = useState(item?.quantity ?? 1);
  const [unit, setUnit] = useState<FoodUnit>(item?.unit ?? "g");

  if (item?.snapshot && !item.food) return <Screen header={<Header title="Change remembered portion" onBack={() => router.back()} />}>
    <Text variant="title">{item.snapshot.name}</Text>
    <NumberStepper label={`Amount in ${item.unit}`} value={quantity} onChange={setQuantity} min={0.5} max={2000} step={0.5} />
    <Text variant="body">Nutrition scales from the saved portion. The original usual stays unchanged.</Text>
    <Button label="Update portion" onPress={() => { draftActions.setQuantity(item.key, quantity); router.back(); }} />
  </Screen>;
  if (!item?.food) {
    return (
      <Screen header={<Header title="Edit item" onBack={() => router.back()} />}>
        <EmptyState icon="search" title="Nothing to edit here" actionLabel="Back" onAction={() => router.back()} />
      </Screen>
    );
  }
  const food = item.food;
  const changeUnit = (u: FoodUnit) => {
    if (isBase(u) !== isBase(unit)) setQuantity(isBase(u) ? 100 : 1);
    setUnit(u);
  };
  const p = portion(nutritionOf(food), quantity, unit);
  const macros = profile.data?.oilGheePrompt && food.homeCooked ? applyOil(p.macros, p.grams, oilLevel) : p.macros;

  return (
    <Screen header={<Header title="Edit item" onBack={() => router.back()} />}>
      {item.uncertain && item.query.toLowerCase() !== food.name.toLowerCase() ? (
        <Text variant="body" color="textSecondary">{`You said "${item.query}". We matched it to:`}</Text>
      ) : null}
      <Card flush>
        <ListItem
          title={food.name}
          subtitle="Change food"
          trailing={<FoodTile category={food.category} />}
          chevron
          onPress={() =>
            router.push({ pathname: "/log/search", params: { mode: "replace", key: item.key, q: item.query } })
          }
        />
      </Card>

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
      <Text variant="caption" color="textSecondary">{`≈ ${Math.round(p.grams)} ${food.liquid ? "ml" : "g"}`}</Text>

      <MacroTotals totals={macros} />

      <Button
        label="Update"
        icon="check"
        onPress={() => {
          draftActions.replaceItem(item.key, food, quantity, unit);
          router.back();
        }}
        fullWidth
        glow
      />
      <Button
        label="Remove item"
        variant="destructive"
        icon="delete"
        onPress={() => {
          draftActions.removeItem(item.key);
          router.back();
        }}
        fullWidth
      />
    </Screen>
  );
}
