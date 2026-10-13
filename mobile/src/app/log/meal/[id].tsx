// S21 · Meal detail (P12/P13). Built from DESIGN.md §6.4 (no export yet, D35): meal name and time,
// photo if any, items, totals, and Edit / Repeat / Save as usual / Delete. Repeat and Delete act straight away
// and offer Undo (UX F3); Repeat keeps the meal's type (UX L1).
import { router, useLocalSearchParams } from "expo-router";
import { Image, StyleSheet, View } from "react-native";

import { Badge, Button, EmptyState, Header, Screen, Text, useToast } from "@/core/ui";
import { FoodItemRow, MacroTotals } from "@/features/food/components";
import { formatPortion, MEAL_LABEL } from "@/features/food/format";
import { editMeal } from "@/features/log/nav";
import { deleteMeal, mealKey, mealTotals, repeatMeal, restoreMeal, useMeal } from "@/features/meals/store";
import { removeUsual, saveUsual, useUsualMeals } from "@/features/meals/usual";
import { useActiveUser } from "@/features/users/activeUser";
import { useTheme } from "@/core/theme";

const OIL_LABEL = { little: "Little oil/ghee", normal: "Normal oil/ghee", heavy: "Heavy oil/ghee" } as const;

export default function MealDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { radius } = useTheme();
  const toast = useToast();
  const userId = useActiveUser((s) => s.userId);
  const meal = useMeal(id);
  const usuals = useUsualMeals(userId);

  if (!meal || !userId) {
    return (
      <Screen header={<Header title="Meal" onBack={() => router.back()} />}>
        <EmptyState
          icon="restaurant"
          title="This meal isn't here anymore"
          actionLabel="Back"
          onAction={() => router.back()}
        />
      </Screen>
    );
  }

  const time = new Date(meal.loggedAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  const title = `${MEAL_LABEL[meal.mealType]} · ${time}`;

  const edit = () => editMeal(userId, meal);
  const usual = usuals.find((u) => mealKey(u) === mealKey(meal)) ?? null;

  const repeat = () => {
    const copy = repeatMeal(meal);
    toast({
      kind: "success",
      message: `${MEAL_LABEL[meal.mealType]} logged again`,
      onUndo: () => deleteMeal(copy),
    });
    router.back();
  };

  const toggleUsual = () => {
    if (usual) {
      removeUsual(userId, usual.id);
      toast({ kind: "info", message: "Removed from your usual meals" });
    } else {
      const saved = saveUsual(userId, meal);
      toast({
        kind: "success",
        message: "Saved. It's on quick log now",
        onUndo: () => removeUsual(userId, saved.id),
      });
    }
  };

  const remove = () => {
    deleteMeal(meal);
    toast({ kind: "info", message: `${MEAL_LABEL[meal.mealType]} deleted`, onUndo: () => restoreMeal(meal) });
    router.back();
  };

  return (
    <Screen header={<Header title={title} onBack={() => router.back()} />}>
      <View style={styles.tags}>
        <Badge
          label={meal.synced ? "Synced" : "Saved on phone"}
          tone={meal.synced ? "neutral" : "lilac"}
          icon={meal.synced ? "cloud_done" : "sync"}
        />
        {meal.oilLevel ? <Badge label={OIL_LABEL[meal.oilLevel]} /> : null}
      </View>

      {meal.photoUri ? (
        <Image
          source={{ uri: meal.photoUri }}
          style={[styles.photo, { borderRadius: radius.lg }]}
          accessibilityLabel="Your meal photo"
        />
      ) : null}

      {meal.items.map((i) => (
        <FoodItemRow
          key={i.id}
          name={i.name}
          diet={i.diet}
          portion={formatPortion(i.quantity, i.unit)}
          kcal={i.kcal}
          proteinG={i.proteinG}
          state="ok"
          onPress={edit}
        />
      ))}

      <MacroTotals totals={mealTotals(meal)} />

      <View style={styles.actions}>
        <View style={styles.flex}>
          <Button label="Edit" variant="secondary" icon="edit" onPress={edit} fullWidth />
        </View>
        <View style={styles.flex}>
          <Button label="Repeat" variant="secondary" icon="replay" onPress={repeat} fullWidth />
        </View>
      </View>
      <Button
        label={usual ? "Saved as usual" : "Save as usual"}
        variant="ghost"
        icon={usual ? "check_circle" : "add_circle"}
        onPress={toggleUsual}
        accessibilityHint={usual ? "Removes it from quick log" : "Puts it on quick log for one-tap logging"}
        fullWidth
      />
      <Button label="Delete meal" variant="destructive" icon="delete" onPress={remove} fullWidth />
      <Text variant="caption" color="textTertiary" style={styles.center}>
        {`Repeat logs this ${MEAL_LABEL[meal.mealType].toLowerCase()} again now.`}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  tags: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  photo: { width: "100%", aspectRatio: 4 / 3 },
  actions: { flexDirection: "row", gap: 8 },
  flex: { flex: 1 },
  center: { textAlign: "center" },
});
