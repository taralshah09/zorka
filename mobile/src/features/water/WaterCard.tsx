// Today's water card: an empty glass that fills up as glasses are logged (instead of a ring). Tap the glass or
// "Add a glass" to log one; undo removes the latest. The fill rises over motion.ringChange ms, with no animation
// when reduce motion is on. Past the goal the glass stays full and the count keeps going.
import { useEffect, useId, useState } from "react";
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from "react-native";
import Svg, { ClipPath, Defs, G, Path, Rect } from "react-native-svg";

import { useTheme } from "@/core/theme";
import { Button, Card, IconButton, PressableScale, Text } from "@/core/ui";

const AnimatedRect = Animated.createAnimatedComponent(Rect);

const W = 72;
const H = 96;
// A tumbler, wider at the rim, with a rounded base.
const GLASS = `M6 4 H66 L58.5 86 Q58 92 52 92 H20 Q14 92 13.5 86 Z`;
const TOP = 6;
const BOTTOM = 92;

function Glass({
  progress,
  color,
  onPress,
  label,
}: {
  progress: number;
  color: string;
  onPress: () => void;
  label: string;
}) {
  const { colors, motion } = useTheme();
  const clipId = `glass-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const level = Math.max(0, Math.min(1, progress));
  const anim = useState(() => new Animated.Value(level))[0];

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled) return;
      if (reduce) anim.setValue(level);
      else
        Animated.timing(anim, {
          toValue: level,
          duration: motion.ringChange,
          easing: Easing.bezier(0.2, 0, 0, 1),
          useNativeDriver: false,
        }).start();
    });
    return () => {
      cancelled = true;
    };
  }, [level, anim, motion.ringChange]);

  const y = anim.interpolate({ inputRange: [0, 1], outputRange: [BOTTOM, TOP] });

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Logs one glass of water"
    >
      <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <Defs>
          <ClipPath id={clipId}>
            <Path d={GLASS} />
          </ClipPath>
        </Defs>
        <Path d={GLASS} fill={colors.surfaceHigh} />
        <G clipPath={`url(#${clipId})`}>
          <AnimatedRect x={0} y={y} width={W} height={H} fill={color} />
          {/* Surface highlight on the water line. */}
          <AnimatedRect x={0} y={y} width={W} height={3} fill={colors.ink} opacity={level > 0 ? 0.12 : 0} />
        </G>
        <Path d={GLASS} fill="none" stroke={colors.outline} strokeWidth={2} strokeLinejoin="round" />
        {/* Glint on the left wall. */}
        <Path
          d="M14 14 L19 76"
          stroke={colors.textPrimary}
          strokeOpacity={0.15}
          strokeWidth={3}
          strokeLinecap="round"
        />
      </Svg>
    </PressableScale>
  );
}

export function WaterCard({
  glasses,
  goal,
  onAdd,
  onUndo,
}: {
  glasses: number;
  goal: number;
  onAdd: () => void;
  onUndo: () => void;
}) {
  const { colors } = useTheme();
  const left = Math.max(0, goal - glasses);
  const label = `Water: ${glasses} of ${goal} glasses`;
  return (
    <Card>
      <View style={styles.row}>
        <Glass
          progress={goal > 0 ? glasses / goal : 0}
          color={colors.secondary}
          onPress={onAdd}
          label={`${label}. Add a glass`}
        />
        <View style={styles.body}>
          <Text variant="headline-sm" accessibilityRole="header">
            Water
          </Text>
          <Text variant="headline-md" tabular accessibilityLabel={label}>
            {`${glasses} / ${goal}`}
            <Text variant="unit" color="textSecondary">
              {"  glasses"}
            </Text>
          </Text>
          <Text variant="caption" color={left ? "textSecondary" : "primaryText"}>
            {left ? `${left} more to go` : "Goal reached"}
          </Text>
          <View style={styles.actions}>
            <Button label="Add a glass" icon="water_drop" size="sm" onPress={onAdd} />
            <IconButton icon="undo" accessibilityLabel="Undo last glass" onPress={onUndo} disabled={glasses === 0} />
          </View>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 16 },
  body: { flex: 1, gap: 4 },
  actions: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
});
