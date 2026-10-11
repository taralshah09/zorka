// S12 Settings — shell. Appearance (P03, persisted), Your plan (P09/P10), Food logging (P18: the
// oil/ghee prompt), Demo profile (P06), sync status (P07). Editing single fields, notifications and
// permissions arrive with their phases (P36); for now the plan is changed by redoing onboarding.
import { router } from "expo-router";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { apiBaseUrl, describeError } from "@/core/api/client";
import { useNetwork } from "@/core/network/network";
import { retryFailedNow, useSyncStatus } from "@/core/sync/engine";
import { useThemeControls, type ThemeName } from "@/core/theme";
import { Card, Header, ListItem, Screen, SegmentedControl, Text, Toggle, useToast } from "@/core/ui";
import { HealthConnectSettings } from "@/features/activity/HealthConnectSettings";
import { GOAL_LABEL } from "@/features/onboarding/copy";
import { formatInt, formatKg, formatShortDate } from "@/features/targets/format";
import { useTargets } from "@/features/targets/targets";
import { useActiveUser } from "@/features/users/activeUser";
import { useUpdateProfile } from "@/features/users/api";

const APPEARANCE = [
  { value: "dark", label: "Dark", icon: "dark_mode" },
  { value: "light", label: "Light", icon: "light_mode" },
] as const;

export default function Settings() {
  const { theme, setThemeName } = useThemeControls();
  const { profile, targets } = useTargets();
  const online = useNetwork((s) => s.online);
  const sync = useSyncStatus();
  const toast = useToast();
  const userId = useActiveUser((s) => s.userId);
  const updateProfile = useUpdateProfile(userId);
  const oilPrompt = updateProfile.isPending ? !!updateProfile.variables?.oilGheePrompt : !!profile.data?.oilGheePrompt;

  // The profile is server-owned (D23), so this setting needs the network.
  const setOilPrompt = (next: boolean) =>
    updateProfile.mutate(
      { oilGheePrompt: next },
      { onError: (e) => toast({ kind: "error", message: describeError(e).title }) },
    );

  const syncValue = sync.failed
    ? `${sync.failed} not synced`
    : sync.pending
      ? `${sync.pending} waiting`
      : sync.lastSyncedAt
        ? "All synced"
        : "Nothing to sync";

  return (
    <Screen header={<Header title="Settings" onBack={() => router.back()} />}>
      <Section title="Appearance">
        <SegmentedControl<ThemeName>
          accessibilityLabel="Appearance"
          segments={APPEARANCE}
          value={theme.name}
          onChange={setThemeName}
        />
      </Section>

      <Section title="Your plan">
        <Card flush>
          {targets && profile.data?.goal ? (
            <>
              <ListItem
                icon="trophy"
                title={GOAL_LABEL[profile.data.goal]}
                subtitle={
                  targets.goalDate && profile.data.targetWeightKg != null
                    ? `${formatKg(profile.data.targetWeightKg)} kg by ~${formatShortDate(targets.goalDate)}`
                    : undefined
                }
                divider
              />
              <ListItem icon="restaurant" title="Daily calories" value={`${formatInt(targets.kcal)} kcal`} divider />
              <ListItem
                icon="egg"
                title="Protein · carbs · fat"
                value={`${targets.proteinG} · ${targets.carbsG} · ${targets.fatG} g`}
                divider
              />
              <ListItem icon="footprint" title="Steps" value={formatInt(targets.steps)} divider />
              <ListItem icon="refresh" title="Redo setup" chevron onPress={() => router.push("/onboarding")} />
            </>
          ) : (
            <ListItem icon="tune" title="Set up your plan" chevron onPress={() => router.push("/onboarding")} />
          )}
        </Card>
      </Section>

      <Section title="Food logging">
        <Card flush>
          <ListItem
            icon="restaurant"
            title="Ask about oil/ghee for home-cooked food"
            subtitle={
              online ? "Little, normal or heavy. When off, standard recipe values are used." : "Connect to change this."
            }
            trailing={
              <Toggle
                value={oilPrompt}
                onValueChange={setOilPrompt}
                disabled={!online || !profile.data || updateProfile.isPending}
                accessibilityLabel="Ask about oil or ghee for home-cooked food"
              />
            }
          />
        </Card>
      </Section>

      <Section title="Health & activity">
        <HealthConnectSettings />
      </Section>

      <Section title="Demo profile">
        <Card flush>
          <ListItem
            icon="person"
            title={profile.data?.displayName ?? "No profile"}
            subtitle="Switch demo profile"
            chevron
            onPress={() => router.push("/profiles")}
          />
        </Card>
      </Section>

      <Section title="Sync">
        <Card flush>
          <ListItem
            icon={online ? "cloud_done" : "cloud_off"}
            title={online ? "Online" : "Offline"}
            value={syncValue}
            onPress={sync.failed ? retryFailedNow : undefined}
            chevron={!!sync.failed}
          />
        </Card>
      </Section>

      {__DEV__ ? (
        <Section title="Developer">
          <Card flush>
            <ListItem
              icon="tune"
              title="Component preview"
              chevron
              divider
              onPress={() => router.push("/dev/components")}
            />
            <ListItem icon="sync" title="Offline sync test" chevron onPress={() => router.push("/dev/sync")} />
          </Card>
        </Section>
      ) : null}

      <Section title="About">
        <Card flush>
          <ListItem icon="info" title="Kimbo" subtitle={`API: ${apiBaseUrl() ?? "not configured"}`} />
        </Card>
      </Section>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="eyebrow" color="textSecondary">
        {title}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8, marginBottom: 12 },
});
