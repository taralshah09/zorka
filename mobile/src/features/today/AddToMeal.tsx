// "Add to {meal}" on a logged meal row (UX F8): once lunch is logged, its row still takes one more item.
import { Pressable, StyleSheet } from "react-native";

import { Icon } from "@/core/icons/Icon";
import { useTheme } from "@/core/theme";
import { MEAL_LABEL } from "@/features/food/format";
import { addToMeal } from "@/features/log/nav";
import type { Meal } from "@/features/meals/store";
import { useActiveUser } from "@/features/users/activeUser";

export function AddToMealButton({ meal }: { meal: Meal }) {
  const { colors } = useTheme();
  const userId = useActiveUser((s) => s.userId);
  if (!userId) return null;
  return (
    <Pressable
      onPress={() => addToMeal(userId, meal)}
      accessibilityRole="button"
      accessibilityLabel={`Add to ${MEAL_LABEL[meal.mealType].toLowerCase()}`}
      hitSlop={12}
      style={({ pressed }) => [styles.button, { opacity: pressed ? 0.6 : 1 }]}
    >
      <Icon name="add_circle" size={24} color={colors.primaryText} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { padding: 4 },
});
