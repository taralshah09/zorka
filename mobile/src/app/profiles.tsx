// S01 · Profile picker — stands in for login (D5). States: default, loading, error, offline.
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { StyleSheet, View } from "react-native";

import { describeError } from "@/core/api/client";
import { NetworkBanner } from "@/core/network/NetworkBanner";
import { Avatar, Card, ErrorState, Header, Screen, Skeleton, Text, type Accent } from "@/core/ui";
import { Icon } from "@/core/icons/Icon";
import { useTheme } from "@/core/theme";
import { useActiveUser } from "@/features/users/activeUser";
import { useUsers } from "@/features/users/api";

const ACCENTS: Accent[] = ["lime", "lilac", "orchid"];

export default function ProfilePicker() {
  const { colors } = useTheme();
  const users = useUsers();
  const activeId = useActiveUser((s) => s.userId);
  const setUser = useActiveUser((s) => s.setUser);
  const queryClient = useQueryClient();
  const canGoBack = router.canGoBack();

  const pick = (id: string) => {
    setUser(id);
    queryClient.invalidateQueries({ queryKey: ["users", id] });
    router.replace("/today");
  };

  return (
    <Screen header={canGoBack ? <Header title="Switch profile" onBack={() => router.back()} /> : undefined}>
      <NetworkBanner />
      <View style={styles.titleBlock}>
        <Text variant="headline-lg" accessibilityRole="header">
          {"Who's training today?"}
        </Text>
        <Text variant="body" color="textSecondary">
          Pick a profile to continue.
        </Text>
      </View>

      {users.isPending ? (
        <View style={styles.list}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} variant="card" height={88} />
          ))}
        </View>
      ) : users.isError ? (
        <ErrorState {...describeError(users.error)} onRetry={() => users.refetch()} retrying={users.isRefetching} />
      ) : (
        <View style={styles.list}>
          {users.data.map((u, i) => {
            const active = u.id === activeId;
            return (
              <Card
                key={u.id}
                onPress={() => pick(u.id)}
                accessibilityLabel={`${u.displayName}, ${u.onboarded ? "profile set up" : "new here"}${active ? ", current profile" : ""}`}
              >
                <View style={styles.row}>
                  <Avatar name={u.displayName} accent={ACCENTS[i % ACCENTS.length]} size={56} />
                  <View style={styles.flex}>
                    <Text variant="headline-sm">{u.displayName}</Text>
                    <Text variant="body" color="textSecondary">
                      {u.onboarded ? "Profile set up" : "New here"}
                    </Text>
                  </View>
                  {active ? (
                    <Icon name="check_circle" color={colors.primaryText} filled />
                  ) : (
                    <Icon name="chevron_right" color={colors.textSecondary} />
                  )}
                </View>
              </Card>
            );
          })}
        </View>
      )}

      <Text variant="caption" color="textSecondary" align="center" style={styles.note}>
        Demo profiles. Data is saved per profile.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  titleBlock: { gap: 4, marginTop: 24, marginBottom: 12 },
  list: { gap: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 16 },
  flex: { flex: 1, gap: 2 },
  note: { marginTop: 12 },
});
