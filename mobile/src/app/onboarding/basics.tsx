// S04 · Basics (step 2): age stepper (tap to type, UX O1), sex, height (cm or ft/in), current weight, and how you
// eat (S06's diet chips, moved here in UX O3). State: amber validation message on an out-of-range value.
// Sex uses choice chips, not a segmented control: "Prefer not to say" doesn't fit a third segment
// at phone width (deviation recorded in D27).
import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { Chip, NumberStepper, SegmentedControl, Text, TextField } from "@/core/ui";
import { DIET_OPTIONS, SEX_OPTIONS } from "@/features/onboarding/copy";
import { BOUNDS, inRange, parseNumber, useDraft } from "@/features/onboarding/draft";
import { nextStep, stepHref } from "@/features/onboarding/flow";
import { OnboardingStep } from "@/features/onboarding/OnboardingStep";
import { formatKg } from "@/features/targets/format";

type HeightUnit = "cm" | "ftin";
const CM_PER_IN = 2.54;

const toFtIn = (cm: number) => {
  const totalIn = Math.round(cm / CM_PER_IN);
  return { ft: Math.floor(totalIn / 12), inch: totalIn % 12 };
};

export default function BasicsStep() {
  const draft = useDraft();
  const { update } = draft;

  const [heightUnit, setHeightUnit] = useState<HeightUnit>("cm");
  const [cmText, setCmText] = useState(draft.heightCm == null ? "" : formatKg(draft.heightCm));
  const initialFtIn = draft.heightCm == null ? null : toFtIn(draft.heightCm);
  const [ftText, setFtText] = useState(initialFtIn ? String(initialFtIn.ft) : "");
  const [inText, setInText] = useState(initialFtIn ? String(initialFtIn.inch) : "");
  const [weightText, setWeightText] = useState(draft.weightKg == null ? "" : formatKg(draft.weightKg));

  const setHeightCm = (cm: number | null) => update({ heightCm: cm == null ? null : +cm.toFixed(1) });

  const onCm = (t: string) => {
    setCmText(t);
    setHeightCm(parseNumber(t));
  };
  const onFtIn = (ft: string, inch: string) => {
    setFtText(ft);
    setInText(inch);
    const f = parseNumber(ft);
    const i = parseNumber(inch) ?? 0;
    setHeightCm(f == null ? null : (f * 12 + i) * CM_PER_IN);
  };
  const switchUnit = (u: HeightUnit) => {
    setHeightUnit(u);
    if (draft.heightCm == null) return;
    if (u === "cm") {
      setCmText(String(Math.round(draft.heightCm)));
    } else {
      const { ft, inch } = toFtIn(draft.heightCm);
      setFtText(String(ft));
      setInText(String(inch));
    }
  };
  const onWeight = (t: string) => {
    setWeightText(t);
    update({ weightKg: parseNumber(t) });
  };

  const heightOk = inRange(draft.heightCm, BOUNDS.heightCm);
  const weightOk = inRange(draft.weightKg, BOUNDS.weightKg);
  const heightTouched = heightUnit === "cm" ? cmText.trim() !== "" : ftText.trim() !== "";
  const heightWarning =
    heightTouched && !heightOk
      ? heightUnit === "cm"
        ? `Enter a height between ${BOUNDS.heightCm.min} and ${BOUNDS.heightCm.max} cm.`
        : "Enter a height between 3 ft 4 in and 8 ft 2 in."
      : undefined;
  const weightWarning =
    weightText.trim() !== "" && !weightOk
      ? `Enter a weight between ${BOUNDS.weightKg.min} and ${BOUNDS.weightKg.max} kg.`
      : undefined;

  return (
    <OnboardingStep
      id="basics"
      title="A few basics"
      subtitle="Used to work out how much energy you burn."
      cta="Continue"
      canContinue={!!draft.sex && !!draft.diet && heightOk && weightOk && inRange(draft.age, BOUNDS.age)}
      onNext={() => router.push(stepHref(nextStep("basics", draft.goal)))}
    >
      <View style={styles.field}>
        <Text variant="label" color="textSecondary">
          Age
        </Text>
        <NumberStepper
          label="Age"
          value={draft.age}
          min={BOUNDS.age.min}
          max={BOUNDS.age.max}
          unit="yrs"
          onChange={(age) => update({ age })}
        />
      </View>

      <View style={styles.field}>
        <Text variant="label" color="textSecondary">
          Sex
        </Text>
        <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Sex">
          {SEX_OPTIONS.map((o) => (
            <Chip
              key={o.value}
              kind="choice"
              label={o.label}
              selected={draft.sex === o.value}
              onPress={() => update({ sex: o.value })}
            />
          ))}
        </View>
      </View>

      <View style={styles.field}>
        <View style={styles.row}>
          <Text variant="label" color="textSecondary" style={styles.flex}>
            Height
          </Text>
          <View style={styles.unitToggle}>
            <SegmentedControl<HeightUnit>
              accessibilityLabel="Height unit"
              segments={[
                { value: "cm", label: "cm" },
                { value: "ftin", label: "ft / in" },
              ]}
              value={heightUnit}
              onChange={switchUnit}
            />
          </View>
        </View>
        {heightUnit === "cm" ? (
          <TextField
            label="Height in centimetres"
            unit="cm"
            keyboardType="decimal-pad"
            placeholder="170"
            value={cmText}
            onChangeText={onCm}
            warning={heightWarning}
          />
        ) : (
          <View style={styles.ftIn}>
            <View style={styles.flex}>
              <TextField
                label="Feet"
                unit="ft"
                keyboardType="number-pad"
                placeholder="5"
                value={ftText}
                onChangeText={(t) => onFtIn(t, inText)}
                warning={heightWarning}
              />
            </View>
            <View style={styles.flex}>
              <TextField
                label="Inches"
                unit="in"
                keyboardType="number-pad"
                placeholder="7"
                value={inText}
                onChangeText={(t) => onFtIn(ftText, t)}
              />
            </View>
          </View>
        )}
      </View>

      <TextField
        label="Current weight"
        unit="kg"
        keyboardType="decimal-pad"
        placeholder="70"
        value={weightText}
        onChangeText={onWeight}
        warning={weightWarning}
      />

      <View style={styles.field}>
        <Text variant="label" color="textSecondary">
          How do you eat?
        </Text>
        <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Diet preference">
          {DIET_OPTIONS.map((o) => (
            <Chip
              key={o.value}
              kind="choice"
              label={o.label}
              diet={o.value}
              selected={draft.diet === o.value}
              onPress={() => update({ diet: o.value })}
            />
          ))}
        </View>
        <Text variant="caption" color="textSecondary">
          Food suggestions will match this.
        </Text>
      </View>
    </OnboardingStep>
  );
}

const styles = StyleSheet.create({
  field: { gap: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  unitToggle: { width: 180 },
  ftIn: { flexDirection: "row", gap: 12 },
  flex: { flex: 1 },
});
