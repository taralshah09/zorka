// S34 · Log weight (P27). No export yet (D53): bottom sheet from DESIGN.md §6.7 — a large kg number with a stepper,
// the day, Save. Starts from the last weigh-in (or the onboarding weight). Works offline (local-first, D23).
import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";

import { useTheme } from "@/core/theme";
import { BottomSheet, Button, Chip, NumberStepper, Text, useToast } from "@/core/ui";
import { addDays } from "@shared/domain/progress";
import { localDate } from "@shared/domain/food";
import { formatKg, formatShortDate } from "@/features/targets/format";
import { logWeight, MAX_WEIGHT_KG, MIN_WEIGHT_KG, useWeights } from "@/features/progress/weights";
import { useActiveUser } from "@/features/users/activeUser";
import { useProfile } from "@/features/users/api";

/** Today and the three days before it (a missed weigh-in can be added the next morning). */
const DAYS_BACK = 3;

export default function LogWeight() {
  const toast = useToast();
  const userId = useActiveUser((s) => s.userId);
  const profile = useProfile(userId);
  const weights = useWeights(userId);
  const today = localDate(new Date());
  const start = weights[weights.length - 1]?.kg ?? profile.data?.weightKg ?? 70;
  const { colors, type } = useTheme();
  const [kg, setKg] = useState(start);
  const [text, setText] = useState(formatKg(start));
  const [day, setDay] = useState(today);
  const valid = Number.isFinite(kg) && kg >= MIN_WEIGHT_KG && kg <= MAX_WEIGHT_KG;
  const set = (v: number) => {
    const r = Math.round(v * 10) / 10;
    setKg(r);
    setText(formatKg(r));
  };
  const onType = (t: string) => {
    setText(t);
    setKg(Number(t.replace(",", ".")));
  };

  const days = Array.from({ length: DAYS_BACK + 1 }, (_, i) => addDays(today, -i));
  const label = (d: string) => (d === today ? "Today" : d === addDays(today, -1) ? "Yesterday" : formatShortDate(d));

  const save = () => {
    if (!userId) return;
    logWeight(userId, kg, day);
    toast({
      kind: "success",
      message: `${formatKg(kg)} kg logged${day === today ? "" : ` for ${label(day).toLowerCase()}`}`,
    });
    router.back();
  };

  return (
    <BottomSheet visible onClose={() => router.back()} title="Log weight">
      <View style={styles.body}>
        <View style={styles.big}>
          <TextInput
            value={text}
            onChangeText={onType}
            keyboardType="decimal-pad"
            maxLength={5}
            selectTextOnFocus
            accessibilityLabel="Weight in kilograms"
            style={[type.display, styles.input, { color: valid ? colors.textPrimary : colors.error }]}
          />
          <Text variant="headline-sm" color="textSecondary">
            kg
          </Text>
        </View>
        {!valid ? (
          <Text variant="caption" color="error" align="center">
            {`Enter a weight between ${MIN_WEIGHT_KG} and ${MAX_WEIGHT_KG} kg.`}
          </Text>
        ) : null}
        <View style={styles.center}>
          <NumberStepper
            label="Weight"
            value={valid ? kg : start}
            onChange={set}
            min={MIN_WEIGHT_KG}
            max={MAX_WEIGHT_KG}
            step={0.1}
            unit="kg"
            format={formatKg}
          />
        </View>
        <Text variant="label" color="textSecondary">
          Day
        </Text>
        <View style={styles.chips}>
          {days.map((d) => (
            <Chip key={d} kind="choice" label={label(d)} selected={d === day} onPress={() => setDay(d)} />
          ))}
        </View>
        <Text variant="caption" color="textSecondary">
          Your trend weight smooths out the daily swings.
        </Text>
        <Button label="Save" onPress={save} fullWidth disabled={!userId || !valid} />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: 16 },
  center: { alignItems: "center" },
  big: { flexDirection: "row", alignItems: "baseline", justifyContent: "center", gap: 8 },
  input: { minWidth: 120, textAlign: "center", padding: 0, fontVariant: ["tabular-nums"] },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
