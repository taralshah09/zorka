// S12 Settings — shell. Appearance (P03, persisted), Your plan (P09/P10, plus the daily step goal,
// D48), Food logging (P18: the oil/ghee prompt), Coach & nudges (P35/P36: change coach, S45 notifications), Demo profile
// (P06), sync status (P07). The plan itself is changed by redoing onboarding.
import { router } from "expo-router";
import { useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { apiBaseUrl, describeError } from "@/core/api/client";
import { useNetwork } from "@/core/network/network";
import { retryFailedNow, useSyncStatus } from "@/core/sync/engine";
import { useThemeControls, type ThemeName } from "@/core/theme";
import {
  BottomSheet,
  Button,
  Card,
  Header,
  ListItem,
  Screen,
  SegmentedControl,
  Text,
  Toggle,
  useToast,
} from "@/core/ui";
import { HealthConnectSettings } from "@/features/activity/HealthConnectSettings";
import { CoachPickerSheet } from "@/features/coach/CoachPickerSheet";
import { PERSONAS } from "@/features/coach/personas";
import { useNudgeSettings } from "@/features/nudges/settings";
import { GOAL_LABEL } from "@/features/onboarding/copy";
import { formatInt, formatKg, formatShortDate } from "@/features/targets/format";
import { StepGoalField } from "@/features/targets/StepGoalField";
import { useTargets } from "@/features/targets/targets";
import { useActiveUser } from "@/features/users/activeUser";
import { useUpdateProfile } from "@/features/users/api";
import { STEP_GOAL_MAX, STEP_GOAL_MIN } from "@shared/domain/targets";

const APPEARANCE = [
  { value: "dark", label: "Dark", icon: "dark_mode" },
  { value: "light", label: "Light", icon: "light_mode" },
] as const;

type CheckinStyle = "simple" | "detailed";
const CHECKIN_STYLES = [
  { value: "simple", label: "Simple" },
  { value: "detailed", label: "Detailed" },
] as const;

const TARGET_SOURCE = {
  plan: undefined,
  phase: "Set by your phase",
  checkin: "Adjusted at your weekly check-in",
} as const;

export default function Settings() {
  const { theme, setThemeName } = useThemeControls();
  const { profile, targets, source, ease } = useTargets();
  const online = useNetwork((s) => s.online);
  const sync = useSyncStatus();
  const toast = useToast();
  const userId = useActiveUser((s) => s.userId);
  const updateProfile = useUpdateProfile(userId);
  const [stepSheet, setStepSheet] = useState(false);
  const [coachSheet, setCoachSheet] = useState(false);
  const nudges = useNudgeSettings(userId);
  const oilPrompt = updateProfile.isPending ? !!updateProfile.variables?.oilGheePrompt : !!profile.data?.oilGheePrompt;
  const pendingDetail = updateProfile.isPending ? updateProfile.variables?.checkinDetailed : undefined;
  const checkinStyle: CheckinStyle = (pendingDetail ?? profile.data?.checkinDetailed) ? "detailed" : "simple";

  // The profile is server-owned (D23), so this setting needs the network.
  const setOilPrompt = (next: boolean) =>
    updateProfile.mutate(
      { oilGheePrompt: next },
      { onError: (e) => toast({ kind: "error", message: describeError(e).title }) },
    );

  // P28 (D50): Simple or Detailed weekly check-in. Server-owned like the rest of the profile.
  const setCheckinStyle = (next: CheckinStyle) =>
    updateProfile.mutate(
      { checkinDetailed: next === "detailed" },
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
              <ListItem
                icon="restaurant"
                title="Daily calories"
                subtitle={ease ? `Eased by ${ease} kcal today` : TARGET_SOURCE[source]}
                value={`${formatInt(targets.kcal)} kcal`}
                divider
              />
              <ListItem
                icon="egg"
                title="Protein · carbs · fat"
                value={`${targets.proteinG} · ${targets.carbsG} · ${targets.fatG} g`}
                divider
              />
              <ListItem
                icon="footprint"
                title="Daily step goal"
                value={formatInt(targets.steps)}
                chevron
                divider
                onPress={() => setStepSheet(true)}
              />
              <ListItem icon="refresh" title="Redo setup" chevron onPress={() => router.push("/onboarding")} />
            </>
          ) : (
            <ListItem icon="tune" title="Set up your plan" chevron onPress={() => router.push("/onboarding")} />
          )}
        </Card>
      </Section>

      {profile.data ? (
        <StepGoalSheet
          visible={stepSheet}
          onClose={() => setStepSheet(false)}
          current={profile.data.stepGoal}
          online={online}
        />
      ) : null}

      <Section title="Weekly check-in">
        <SegmentedControl<CheckinStyle>
          accessibilityLabel="Weekly check-in detail"
          segments={CHECKIN_STYLES}
          value={checkinStyle}
          onChange={(v) => v !== checkinStyle && setCheckinStyle(v)}
        />
        <Text variant="caption" color="textSecondary">
          {online
            ? "Simple shows whether you're on track. Detailed shows your estimated burn and why the target changed."
            : "Connect to change this."}
        </Text>
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

      <Section title="Coach & nudges">
        <Card flush>
          <ListItem
            icon="forum"
            title="Coach"
            value={profile.data?.coach ? PERSONAS[profile.data.coach].name : "Not set"}
            subtitle={online ? undefined : "Connect to change this."}
            chevron
            divider
            onPress={online && profile.data ? () => setCoachSheet(true) : undefined}
          />
          <ListItem
            icon="notifications"
            title="Notifications"
            value={nudges.enabled ? `Up to ${nudges.perDay} a day` : "Off"}
            chevron
            onPress={() => router.push("/notifications")}
          />
        </Card>
      </Section>
      <CoachPickerSheet
        visible={coachSheet}
        onClose={() => setCoachSheet(false)}
        current={profile.data?.coach ?? null}
      />

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

/** Edits the daily step goal (D48). Server-owned like the rest of the profile, so it needs the network. */
function StepGoalSheet({
  visible,
  onClose,
  current,
  online,
}: {
  visible: boolean;
  onClose: () => void;
  current: number;
  online: boolean;
}) {
  const userId = useActiveUser((s) => s.userId);
  const updateProfile = useUpdateProfile(userId);
  const toast = useToast();
  const [goal, setGoal] = useState<number | null>(current);
  // Each time the sheet opens, start again from the saved goal.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setGoal(current);
  }

  const save = () => {
    if (goal == null) return;
    if (goal === current) return onClose();
    updateProfile.mutate(
      { stepGoal: goal },
      {
        onSuccess: () => {
          toast({ message: `Step goal set to ${formatInt(goal)}` });
          onClose();
        },
        onError: (e) => toast({ kind: "error", message: describeError(e).title }),
      },
    );
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Daily step goal">
      <View style={styles.sheet}>
        <Text variant="body" color="textSecondary">
          {online
            ? `At least ${formatInt(STEP_GOAL_MIN)} steps a day, up to ${formatInt(STEP_GOAL_MAX)}.`
            : "Connect to change your step goal."}
        </Text>
        {/* Remount on open so the field starts from the saved goal. */}
        {visible ? <StepGoalField initial={current} onChange={setGoal} disabled={!online} /> : null}
        <Button label="Save" onPress={save} loading={updateProfile.isPending} disabled={!online || goal == null} />
      </View>
    </BottomSheet>
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
  sheet: { gap: 16 },
});
