// S12 Settings — shell. Appearance (P03, persisted), Your plan (P09/P10), Demo profile (P06), sync
// status (P07). Editing single fields, food logging, notifications and permissions arrive with their
// phases (P18, P36); for now the plan is changed by redoing onboarding.
import { router } from "expo-router";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { apiBaseUrl } from "@/core/api/client";
import { useNetwork } from "@/core/network/network";
import { retryFailedNow, useSyncStatus } from "@/core/sync/engine";
import { useThemeControls, type ThemeName } from "@/core/theme";
import { Card, Header, ListItem, Screen, SegmentedControl, Text } from "@/core/ui";
import { GOAL_LABEL } from "@/features/onboarding/copy";
import { formatInt, formatKg, formatShortDate } from "@/features/targets/format";
import { useTargets } from "@/features/targets/targets";

const APPEARANCE = [
  { value: "dark", label: "Dark", icon: "dark_mode" },
  { value: "light", label: "Light", icon: "light_mode" },
] as const;

export default function Settings() {
  const { theme, setThemeName } = useThemeControls();
  const { profile, targets } = useTargets();
  const online = useNetwork((s) => s.online);
  const sync = useSyncStatus();

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
