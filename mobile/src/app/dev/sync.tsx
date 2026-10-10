// P07 test screen: create a record (works offline), watch it sync when the connection is back.
import { router } from "expo-router";
import { StyleSheet, View } from "react-native";

import { useNetwork } from "@/core/network/network";
import { NetworkBanner } from "@/core/network/NetworkBanner";
import { useSyncStatus } from "@/core/sync/engine";
import { Badge, Button, Card, Header, ListItem, Screen, Text } from "@/core/ui";
import { createProbe, useLocalProbes } from "@/features/dev/syncProbes";
import { useServerProbes } from "@/features/dev/serverProbes";
import { useActiveUser } from "@/features/users/activeUser";

export default function SyncTest() {
  const userId = useActiveUser((s) => s.userId);
  const online = useNetwork((s) => s.online);
  const { pending, failed, lastError } = useSyncStatus();
  const local = useLocalProbes(userId);
  const server = useServerProbes(userId);

  const add = () => {
    if (!userId) return;
    createProbe(userId, `Test record · ${new Date().toLocaleTimeString()}${online ? "" : " (offline)"}`);
    local.reload();
  };

  return (
    <Screen header={<Header title="Offline sync test" onBack={() => router.back()} />}>
      <NetworkBanner />
      <Card eyebrow="How to test">
        <Text variant="body" color="textSecondary">
          Turn on airplane mode, add a record, then turn the connection back on. The record should switch from Waiting
          to Synced and appear in the server list.
        </Text>
      </Card>

      <View style={styles.row}>
        <Badge
          label={online ? "Online" : "Offline"}
          tone={online ? "success" : "neutral"}
          icon={online ? "cloud_done" : "cloud_off"}
        />
        <Badge label={`${pending} pending`} />
        {failed ? <Badge label={`${failed} failed`} tone="warning" /> : null}
      </View>
      {lastError ? (
        <Text variant="caption" color="textSecondary">
          Last error: {lastError}
        </Text>
      ) : null}

      <Button label="Add test record" icon="add" onPress={add} fullWidth />

      <Card eyebrow="On this phone" flush>
        {local.rows.length === 0 ? (
          <Text variant="body" color="textSecondary" style={styles.pad}>
            No records yet.
          </Text>
        ) : (
          local.rows.map((r) => <ListItem key={r.id} title={r.note} value={r.synced ? "Synced" : "Waiting"} />)
        )}
      </Card>

      <Card eyebrow="On the server" flush>
        <View style={styles.pad}>
          <Button
            label="Refresh"
            variant="ghost"
            size="sm"
            icon="refresh"
            onPress={() => server.refetch()}
            loading={server.isFetching}
          />
        </View>
        {server.isError ? (
          <Text variant="body" color="textSecondary" style={styles.pad}>
            {"Can't reach the server right now."}
          </Text>
        ) : (
          (server.data ?? []).map((p) => <ListItem key={p.id} title={p.note} />)
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  pad: { paddingHorizontal: 16, paddingBottom: 12 },
});
