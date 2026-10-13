// S02 · Welcome. No export yet (D27): built from DESIGN.md §6.2. The Zorka tiger greets on the orbit-ring motif
// (tap it to play). UX O4: answers saved on the phone are offered back ("Continue setup"), and the button shows
// loading or a retry while the profile isn't there yet.
import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { describeError } from "@/core/api/client";
import { NetworkBanner } from "@/core/network/NetworkBanner";
import { useTheme } from "@/core/theme";
import { Button, IconButton, Mascot, OrbitRings, Text } from "@/core/ui";
import { savedDraft, useDraft } from "@/features/onboarding/draft";
import { stepHref } from "@/features/onboarding/flow";
import { useActiveUser } from "@/features/users/activeUser";
import { useProfile } from "@/features/users/api";

export default function Welcome() {
  const { colors, layout } = useTheme();
  const insets = useSafeAreaInsets();
  const userId = useActiveUser((s) => s.userId);
  const profile = useProfile(userId);
  const start = useDraft((s) => s.start);
  const resume = useDraft((s) => s.resume);
  // Read on every render, so coming back to Welcome mid-setup offers the answers again.
  const saved = savedDraft(userId);
  const redo = !!profile.data?.onboardedAt;
  const failed = !profile.data && profile.isError;

  const begin = () => {
    if (!userId) return;
    start(userId, profile.data);
    router.push(stepHref("goal"));
  };
  const carryOn = () => {
    if (!userId || !resume(userId)) return begin();
    router.push(stepHref(saved?.lastStep ?? "goal"));
  };

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: colors.bg,
          paddingTop: insets.top + 8,
          paddingBottom: insets.bottom + 16,
          paddingHorizontal: layout.screenMargin,
        },
      ]}
    >
      <OrbitRings color={colors.primary} size={360} opacity={0.12} />
      <View style={styles.top}>
        {router.canGoBack() ? (
          <IconButton icon="arrow_back" accessibilityLabel="Back" onPress={() => router.back()} />
        ) : null}
      </View>
      <NetworkBanner />

      <View style={styles.hero}>
        <View style={styles.mark}>
          <Mascot size={170} playOnMount="happy" />
        </View>
        <Text variant="display" align="center" accessibilityRole="header">
          Your food, training and runs
        </Text>
        <Text variant="body-lg" color="textSecondary" align="center">
          With a coach that speaks first.
        </Text>
      </View>

      <View style={styles.footer}>
        {failed ? (
          <>
            <Text variant="body" color="textSecondary" align="center">
              {`${describeError(profile.error).title}. Your profile is needed to start.`}
            </Text>
            <Button
              label="Try again"
              size="lg"
              fullWidth
              loading={profile.isFetching}
              onPress={() => void profile.refetch()}
            />
          </>
        ) : saved ? (
          <>
            <Button label="Continue setup" size="lg" fullWidth glow onPress={carryOn} loading={!profile.data} />
            <Button label="Start over" variant="ghost" fullWidth onPress={begin} disabled={!profile.data} />
          </>
        ) : (
          <>
            <Button
              label={redo ? "Redo my plan" : "Let's set your goal"}
              size="lg"
              fullWidth
              glow
              onPress={begin}
              loading={!profile.data}
            />
            <Text variant="caption" color="textSecondary" align="center">
              Takes about a minute
            </Text>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: "hidden" },
  top: { height: 48, flexDirection: "row" },
  hero: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  mark: { marginBottom: 16 },
  footer: { gap: 12 },
});
