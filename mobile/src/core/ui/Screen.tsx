// Screen scaffold: theme background, optional header, scrollable body with the brand margins and
// dock clearance (brand §7.1).
import type { ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/core/theme";

type Props = {
  header?: ReactNode;
  children: ReactNode;
  /** Tab roots leave room for the floating dock. */
  withDock?: boolean;
  scroll?: boolean;
};

export function Screen({ header, children, withDock = false, scroll = true }: Props) {
  const { colors, layout } = useTheme();
  const insets = useSafeAreaInsets();
  const paddingBottom = withDock ? layout.dockClearance + insets.bottom : layout.sectionGap + insets.bottom;
  const content = [styles.content, { paddingHorizontal: layout.screenMargin, gap: layout.cardGap }];

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      {header ?? <View style={{ height: insets.top }} />}
      {scroll ? (
        <ScrollView contentContainerStyle={[content, { paddingBottom }]} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.root, content, { paddingBottom }]}>{children}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingTop: 16 },
});
