// (+) Quick log — S11 is built in P10. For now the sheet lists the entries as "coming soon".
import { router } from "expo-router";
import { StyleSheet, View } from "react-native";

import { BottomSheet, ListItem, Text } from "@/core/ui";

const ENTRIES = [
  { icon: "mic", title: "Voice" },
  { icon: "photo_camera", title: "Camera" },
  { icon: "fitness_center", title: "Workout" },
  { icon: "directions_run", title: "Run" },
  { icon: "monitor_weight", title: "Weight" },
] as const;

export default function QuickLog() {
  return (
    <BottomSheet visible onClose={() => router.back()} title="Quick log">
      <Text variant="body" color="textSecondary" style={styles.note}>
        Logging arrives in the next phases.
      </Text>
      <View style={styles.list}>
        {ENTRIES.map((e) => (
          <ListItem key={e.title} icon={e.icon} title={e.title} value="Coming soon" />
        ))}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  note: { marginBottom: 8 },
  list: { marginHorizontal: -16 },
});
