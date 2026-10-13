// Daily step goal input (D48) — onboarding S09 and Settings. Type any whole number from 2,000 to
// 100,000 (UX F13), or tap a preset. Reports null while the text is not a valid goal.
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { Chip, TextField } from "@/core/ui";
import { STEP_GOAL_MAX, STEP_GOAL_MIN } from "@shared/domain/targets";
import { formatInt } from "./format";

const PRESETS = [5000, 8000, 10_000, 12_000, 15_000] as const;

/** Typed text → a valid step goal, or null. Accepts thousands separators ("10,000"). */
export function parseStepGoal(text: string): number | null {
  const t = text.replace(/[,\s]/g, "");
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return n >= STEP_GOAL_MIN && n <= STEP_GOAL_MAX ? n : null;
}

type Props = {
  initial: number;
  onChange: (goal: number | null) => void;
  disabled?: boolean;
};

export function StepGoalField({ initial, onChange, disabled }: Props) {
  const [text, setText] = useState(String(initial));
  const goal = parseStepGoal(text);

  const set = (next: string) => {
    setText(next);
    onChange(parseStepGoal(next));
  };

  return (
    <View style={styles.wrap}>
      <TextField
        label="Daily step goal"
        unit="steps"
        keyboardType="number-pad"
        maxLength={7}
        value={text}
        onChangeText={set}
        disabled={disabled}
        warning={
          goal == null
            ? `Enter a goal from ${formatInt(STEP_GOAL_MIN)} to ${formatInt(STEP_GOAL_MAX)} steps.`
            : undefined
        }
      />
      <View style={styles.chips}>
        {PRESETS.map((p) => (
          <Chip
            key={p}
            kind="choice"
            label={formatInt(p)}
            selected={goal === p}
            disabled={disabled}
            onPress={() => set(String(p))}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
