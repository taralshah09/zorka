import { Text } from "@/core/ui";
import { View } from "react-native";
import type { RoutePoint } from "@shared/domain/activity";
import { RouteSketch } from "./RouteSketch";

export type RouteMapProps = { points: readonly RoutePoint[]; mode?: "preview" | "live" | "summary" };

// Web preview stays usable without the native map module.
export function RouteMap({ points }: RouteMapProps) {
  return (
    <View style={{ gap: 8 }}>
      <Text variant="caption" color="textSecondary">
        Street maps are available in the Android/iOS app.
      </Text>
      <RouteSketch points={points} />
    </View>
  );
}
