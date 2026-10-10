// Veg / non-veg markers — brand §3.7: square outline + dot (veg) or triangle (non-veg), 14 px,
// 1.5 px stroke. Eggetarian and Jain are text chips (EGG, JAIN). No invented symbols.
import { StyleSheet, View } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";

import { useTheme } from "@/core/theme";
import { Text } from "./Text";

export type Diet = "veg" | "eggetarian" | "jain" | "non_veg";

const LABEL: Record<Diet, string> = {
  veg: "Veg",
  eggetarian: "Eggetarian",
  jain: "Jain",
  non_veg: "Non-veg",
};

export function DietMarker({ diet }: { diet: Diet }) {
  const { colors, radius } = useTheme();

  if (diet === "eggetarian" || diet === "jain") {
    return (
      <View
        style={[styles.textChip, { backgroundColor: colors.surfaceHigh, borderRadius: radius.full }]}
        accessibilityLabel={LABEL[diet]}
      >
        <Text variant="eyebrow" color="textSecondary">
          {diet === "eggetarian" ? "EGG" : "JAIN"}
        </Text>
      </View>
    );
  }

  const color = diet === "veg" ? colors.veg : colors.nonveg;
  return (
    <Svg width={14} height={14} viewBox="0 0 14 14" accessibilityLabel={LABEL[diet]}>
      <Rect x={0.75} y={0.75} width={12.5} height={12.5} rx={2} stroke={color} strokeWidth={1.5} fill="none" />
      {diet === "veg" ? (
        <Circle cx={7} cy={7} r={3.25} fill={color} />
      ) : (
        <Path d="M7 3.5 L10.5 10 L3.5 10 Z" fill={color} />
      )}
    </Svg>
  );
}

export const dietLabel = (diet: Diet) => LABEL[diet];

const styles = StyleSheet.create({
  textChip: { paddingHorizontal: 6, paddingVertical: 1 },
});
