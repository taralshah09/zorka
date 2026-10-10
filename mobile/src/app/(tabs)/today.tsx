// S10 Today — P02 shell + P06 profile from the API. Rings, coach line, gap card and meals arrive in
// P10+ (each behind its own phase), so this shows the selected profile and honest empty states.
import { router } from "expo-router";
import { StyleSheet, View } from "react-native";

import { describeError } from "@/core/api/client";
import type { Profile } from "@/core/api/types";
import { NetworkBanner } from "@/core/network/NetworkBanner";
import { Button, Card, EmptyState, ErrorState, ListItem, Screen, Skeleton, Text } from "@/core/ui";
import { AppHeader } from "@/features/shell/AppHeader";
import { useActiveUser } from "@/features/users/activeUser";
import { useProfile } from "@/features/users/api";
import { profileRows } from "@/features/users/profileFormat";

export default function Today() {
  const userId = useActiveUser((s) => s.userId);
  const profile = useProfile(userId);

  return (
    <Screen withDock header={<AppHeader eyebrow="Today" />}>
      <NetworkBanner />
      <Text variant="headline-lg" accessibilityRole="header">
        {profile.data ? `Hi, ${profile.data.displayName}` : "Today"}
      </Text>

      {profile.isPending ? (
        <>
          <Skeleton variant="card" height={160} />
          <Skeleton variant="card" height={96} />
        </>
      ) : profile.isError && !profile.data ? (
        <ErrorState
          {...describeError(profile.error)}
          onRetry={() => profile.refetch()}
          retrying={profile.isRefetching}
        />
      ) : profile.data ? (
        <ProfileCard profile={profile.data} />
      ) : null}

      <EmptyState
        icon="restaurant"
        title="Nothing logged yet"
        body="Logging meals, workouts and runs arrives in the next phases."
      />
    </Screen>
  );
}

function ProfileCard({ profile }: { profile: Profile }) {
  const rows = profileRows(profile);
  return (
    <Card eyebrow="Your profile">
      {profile.onboardedAt ? null : (
        <Text variant="body" color="textSecondary" style={styles.note}>
          Not set up yet. Onboarding will fill this in.
        </Text>
      )}
      <View style={styles.list}>
        {rows.map((r) => (
          <ListItem key={r.label} title={r.label} value={r.value} />
        ))}
      </View>
      <Button label="Switch profile" variant="ghost" size="sm" icon="person" onPress={() => router.push("/profiles")} />
    </Card>
  );
}

const styles = StyleSheet.create({
  note: { marginBottom: 8 },
  list: { marginHorizontal: -16, marginBottom: 8 },
});
