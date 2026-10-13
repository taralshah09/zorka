// Number stepper — DESIGN.md §7.1: default, min/max reached.
// UX O1: tap the number to type it (out-of-range values snap to the nearest bound), and hold − / + to repeat.
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";

import { MAX_FONT_SCALE, tabularNums, useTheme } from "@/core/theme";
import { IconButton } from "./IconButton";
import { Text } from "./Text";

type Props = {
  label: string;
  value: number;
  onChange: (next: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  format?: (v: number) => string;
};

/** Hold this long before − / + starts repeating, then speed up to the fastest interval. */
const REPEAT_DELAY_MS = 400;
const REPEAT_START_MS = 120;
const REPEAT_FASTEST_MS = 40;

const decimalsOf = (n: number) => (String(n).split(".")[1] ?? "").length;

/** Typed text → number. Accepts a decimal comma, and "m:ss" / "hh:mm" for clock-formatted steppers. */
export function parseStepperText(text: string): number | null {
  const t = text.trim().replace(",", ".");
  if (!t) return null;
  const clock = /^(\d+):(\d{1,2})$/.exec(t);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function NumberStepper({ label, value, onChange, min, max, step = 1, unit, format = String }: Props) {
  const { colors, radius, type } = useTheme();
  const clamp = (v: number) => Math.min(max, Math.max(min, +v.toFixed(Math.max(2, decimalsOf(step)))));

  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");

  // Press-and-hold: the timer reads the latest value from a ref, and the tap that ends a hold is ignored.
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  }, [value]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repeated = useRef(false);
  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);

  const startRepeat = (dir: 1 | -1) => {
    stop();
    repeated.current = false;
    const tick = (delay: number) => {
      timer.current = setTimeout(() => {
        const next = clamp(latest.current + dir * step);
        if (next === latest.current) return stop();
        repeated.current = true;
        latest.current = next;
        onChange(next);
        tick(Math.max(REPEAT_FASTEST_MS, delay === REPEAT_DELAY_MS ? REPEAT_START_MS : delay * 0.85));
      }, delay);
    };
    tick(REPEAT_DELAY_MS);
  };
  const tap = (dir: 1 | -1) => {
    if (repeated.current) {
      repeated.current = false;
      return;
    }
    onChange(clamp(value + dir * step));
  };

  const beginTyping = () => {
    setText(String(value));
    setEditing(true);
  };
  const commit = () => {
    setEditing(false);
    const n = parseStepperText(text);
    if (n == null) return;
    // Whole-number steppers stay whole; a decimal stepper keeps the step's precision.
    const rounded = +n.toFixed(decimalsOf(step));
    const next = clamp(rounded);
    if (next !== value) onChange(next);
  };

  const unitText = unit ? (
    <Text variant="unit" color="textSecondary">
      {"  "}
      {unit}
    </Text>
  ) : null;

  return (
    <View
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min, max, now: value, text: `${format(value)}${unit ? ` ${unit}` : ""}` }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }, { name: "activate", label: "Type a value" }]}
      onAccessibilityAction={(e) => {
        const name = e.nativeEvent.actionName;
        if (name === "activate") return beginTyping();
        onChange(clamp(value + (name === "increment" ? step : -step)));
      }}
      style={[
        styles.row,
        { backgroundColor: colors.surfaceLow, borderRadius: radius.full, borderColor: colors.outline },
      ]}
    >
      <IconButton
        icon="remove"
        accessibilityLabel={`Decrease ${label}`}
        disabled={value <= min}
        onPressIn={() => startRepeat(-1)}
        onPressOut={stop}
        onPress={() => tap(-1)}
      />
      {editing ? (
        <View style={styles.value}>
          <TextInput
            autoFocus
            selectTextOnFocus
            value={text}
            onChangeText={setText}
            onBlur={commit}
            onSubmitEditing={commit}
            returnKeyType="done"
            keyboardType={decimalsOf(step) > 0 ? "decimal-pad" : "number-pad"}
            accessibilityLabel={`${label}, type a value`}
            maxFontSizeMultiplier={MAX_FONT_SCALE}
            selectionColor={colors.primary}
            cursorColor={colors.primary}
            style={[styles.input, type["headline-md"], tabularNums, { color: colors.textPrimary }]}
          />
          {unitText}
        </View>
      ) : (
        <Pressable onPress={beginTyping} hitSlop={8} accessibilityElementsHidden importantForAccessibility="no">
          <Text variant="headline-md" tabular style={styles.valueText}>
            {format(value)}
            {unitText}
          </Text>
        </Pressable>
      )}
      <IconButton
        icon="add"
        accessibilityLabel={`Increase ${label}`}
        disabled={value >= max}
        onPressIn={() => startRepeat(1)}
        onPressOut={stop}
        onPress={() => tap(1)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", padding: 6, borderWidth: 1, alignSelf: "flex-start", gap: 8 },
  valueText: { minWidth: 96, textAlign: "center" },
  value: { minWidth: 96, flexDirection: "row", alignItems: "center", justifyContent: "center" },
  input: { minWidth: 48, paddingVertical: 0, textAlign: "center" },
});
