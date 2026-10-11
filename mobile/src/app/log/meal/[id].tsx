// S21 · Meal detail (P12/P13). Built from DESIGN.md §6.4 (no export yet, D35): meal name and time,
// photo if any, items, totals, and Edit / Repeat / Delete (with Undo).
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Image, StyleSheet, View } from "react-native";

import { Badge, Button, Dialog, EmptyState, Header, Screen, Text, useToast } from "@/core/ui";
import { FoodItemRow, MacroTotals } from "@/features/food/components";
import { formatPortion, MEAL_LABEL } from "@/features/food/format";
import { getFood } from "@/features/food/catalog";
import { draftActions } from "@/features/log/draft";
import { deleteMeal, mealTotals, repeatMeal, restoreMeal, useMeal } from "@/features/meals/store";
import { useActiveUser } from "@/features/users/activeUser";
import { useTheme } from "@/core/theme";
import { mealTypeForTime } from "@shared/domain/food";

const OIL_LABEL = { little: "Little oil/ghee", normal: "Normal oil/ghee", heavy: "Heavy oil/ghee" } as const;

export default function MealDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { radius } = useTheme();
  const toast = useToast();
  const userId = useActiveUser((s) => s.userId);
  const meal = useMeal(id);
  const [confirmDelete, setConfirmDelete] = useState(false);

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

  const edit = () => {
    draftActions.startFromMeal(meal, (foodId) => getFood(userId, foodId));
    router.push("/log/confirm");
  };

  const repeat = () => {
    const type = mealTypeForTime(new Date());
    repeatMeal(meal, type);
    toast({ kind: "success", message: `Logged again as ${MEAL_LABEL[type].toLowerCase()}` });
    router.back();
  };

  const remove = () => {
    setConfirmDelete(false);
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
        label="Delete meal"
        variant="destructive"
        icon="delete"
        onPress={() => setConfirmDelete(true)}
        fullWidth
      />
      <Text variant="caption" color="textTertiary" style={styles.center}>
        Repeat logs this meal again now.
      </Text>

      <Dialog
        visible={confirmDelete}
        title="Delete this meal?"
        body="It comes off today's totals. You can undo right after."
        confirmLabel="Delete"
        destructive
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
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
