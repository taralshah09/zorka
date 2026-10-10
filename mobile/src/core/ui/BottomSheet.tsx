// Bottom sheet — brand §8: surface-low, top radius-2xl, 40×4 handle, scrim behind. 250 ms (§9).
// Sizes: small (content height), medium (~60%), full (~92%). Android back closes the sheet first.
import { useEffect, useState, type ReactNode } from "react";
import { Animated, Easing, Modal, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/core/theme";
import { Text } from "./Text";

type Props = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  size?: "small" | "medium" | "full";
  children: ReactNode;
};

export function BottomSheet({ visible, onClose, title, size = "small", children }: Props) {
  const { colors, radius, elevation, motion } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const anim = useState(() => new Animated.Value(0))[0];
  const [mounted, setMounted] = useState(visible);
  // Mount as soon as it opens; unmount only after the close animation finishes.
  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    Animated.timing(anim, {
      toValue: visible ? 1 : 0,
      duration: motion.sheet,
      easing: Easing.bezier(0.2, 0, 0, 1),
      useNativeDriver: true,
    }).start(() => {
      if (!visible) setMounted(false);
    });
  }, [visible, anim, motion.sheet]);

  const sheetHeight = size === "full" ? height * 0.92 : size === "medium" ? height * 0.6 : undefined;

  return (
    <Modal
      visible={mounted}
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      animationType="none"
      onRequestClose={onClose}
    >
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim, opacity: anim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close sheet" />
      </Animated.View>
      <Animated.View
        accessibilityViewIsModal
        style={[
          styles.sheet,
          {
            height: sheetHeight,
            maxHeight: height * 0.92,
            backgroundColor: colors.surfaceLow,
            borderTopLeftRadius: radius["2xl"],
            borderTopRightRadius: radius["2xl"],
            paddingBottom: insets.bottom + 16,
            boxShadow: elevation.floating,
            transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [height, 0] }) }],
          },
        ]}
      >
        <View style={[styles.handle, { backgroundColor: colors.surfaceHighest, borderRadius: radius.full }]} />
        {title ? (
          <Text variant="headline-sm" style={styles.title} accessibilityRole="header">
            {title}
          </Text>
        ) : null}
        <View style={size === "small" ? undefined : styles.flex}>{children}</View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12 },
  handle: { width: 40, height: 4, alignSelf: "center", marginBottom: 12 },
  title: { marginBottom: 12 },
  flex: { flex: 1 },
});
