// Shared onboarding layout — DESIGN.md §6.2: top progress bar (step x of STEP_COUNT), back arrow, one question
// per screen, primary button pinned to the bottom and disabled until the step is valid.
import { router } from "expo-router";
import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/core/theme";
import { Button, IconButton, ProgressBar, Text } from "@/core/ui";
import { STEP_COUNT } from "./copy";

type Props = {
  step: number;
  title: string;
  subtitle?: string;
  children: ReactNode;
  cta: string;
  onNext: () => void;
  canContinue: boolean;
  loading?: boolean;
  /** Lime glow on the CTA (S09 only; one glow per screen). */
  glow?: boolean;
};

export function OnboardingStep({ step, title, subtitle, children, cta, onNext, canContinue, loading, glow }: Props) {
  const { colors, layout } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.bg }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.top, { paddingTop: insets.top + 8, paddingHorizontal: layout.screenMargin }]}>
        <IconButton icon="arrow_back" accessibilityLabel="Back" onPress={() => router.back()} />
        <View style={styles.progress}>
          <ProgressBar
            progress={step / STEP_COUNT}
            color={colors.primary}
            accessibilityLabel={`Step ${step} of ${STEP_COUNT}`}
          />
        </View>
        <Text variant="label" color="textSecondary" tabular>
          {`${step} of ${STEP_COUNT}`}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingHorizontal: layout.screenMargin, gap: layout.cardGap }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.titleBlock}>
          <Text variant="headline-lg" accessibilityRole="header">
            {title}
          </Text>
          {subtitle ? (
            <Text variant="body" color="textSecondary">
              {subtitle}
            </Text>
          ) : null}
        </View>
        {children}
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            paddingHorizontal: layout.screenMargin,
            paddingBottom: insets.bottom + 16,
            borderTopColor: colors.outline,
            backgroundColor: colors.bg,
          },
        ]}
      >
        <Button
          label={cta}
          size="lg"
          fullWidth
          glow={glow}
          disabled={!canContinue}
          loading={loading}
          onPress={onNext}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: { flexDirection: "row", alignItems: "center", gap: 12, paddingBottom: 8 },
  progress: { flex: 1 },
  body: { paddingTop: 16, paddingBottom: 24 },
  titleBlock: { gap: 4, marginBottom: 8 },
  footer: { paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
});
