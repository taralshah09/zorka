// Header — brand §7.1/§7.3/§8: 64 high + status bar inset, bg at 90% with a hairline bottom border.
// Left: logo lock-up, or back button + title. Right: optional slot + avatar (opens Settings).
// No bell: there's no notification inbox in scope.
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/core/theme";
import { IconButton } from "./IconButton";
import { LogoLockup } from "./Logo";
import { Text } from "./Text";

type Props = {
  title?: string;
  eyebrow?: string;
  onBack?: () => void;
  /** Right-side content, e.g. a sync pill and the profile avatar. */
  right?: ReactNode;
};

export function Header({ title, eyebrow, onBack, right }: Props) {
  const { colors, layout } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.wrap,
        {
          paddingTop: insets.top,
          // 90% opacity of the theme background (E6 ≈ 0.9 alpha).
          backgroundColor: `${colors.bg}E6`,
          borderBottomColor: colors.outline,
        },
      ]}
    >
      <View style={[styles.row, { height: layout.headerHeight, paddingHorizontal: layout.screenMargin }]}>
        {onBack ? (
          <View style={styles.left}>
            <IconButton icon="arrow_back" accessibilityLabel="Back" onPress={onBack} />
            {title ? (
              <Text variant="headline-sm" numberOfLines={1} accessibilityRole="header" style={styles.flex}>
                {title}
              </Text>
            ) : null}
          </View>
        ) : (
          <LogoLockup eyebrow={eyebrow} />
        )}
        <View style={styles.right}>{right}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderBottomWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  left: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  right: { flexDirection: "row", alignItems: "center", gap: 8 },
  flex: { flex: 1 },
});
