// S43 Location / pincode sheet and S42 "Ordered it?" (P34, D59).
// S43 is the S49 explainer for location plus a pincode field; the system prompt opens only from "Continue".
// S42 is mounted once at the root: when the app comes back within 2 h of opening Zomato/Blinkit, it asks.
import { useEffect, useState } from "react";
import { AppState, StyleSheet, View } from "react-native";

import { BottomSheet, Button, Text, TextField, useToast } from "@/core/ui";
import { PermissionExplainer } from "@/features/permissions/PermissionExplainer";
import { formatInt } from "@/features/targets/format";
import { useActiveUser } from "@/features/users/activeUser";
import {
  dismissOrder,
  isPincode,
  logOrder,
  orderToAsk,
  requestLocation,
  type LocationAccess,
  type PendingOrder,
} from "./nearby";

export function LocationSheet({
  visible,
  onClose,
  access,
  pincode,
  onAccess,
  onPincode,
}: {
  visible: boolean;
  onClose: () => void;
  access: LocationAccess;
  pincode: string | null;
  onAccess: (a: LocationAccess) => void;
  onPincode: (pin: string | null) => void;
}) {
  const [pin, setPin] = useState(pincode ?? "");
  const [touched, setTouched] = useState(false);
  const valid = isPincode(pin);
  return (
    <BottomSheet visible={visible} onClose={onClose} size="full">
      {access === "granted" ? (
        <View style={styles.granted}>
          <Text variant="headline-sm">Using your location</Text>
          <Text variant="body" color="textSecondary">
            {"Only your area's name is used to search. You can use a pincode instead."}
          </Text>
        </View>
      ) : (
        <PermissionExplainer
          kind="nearby"
          denied={access === "denied"}
          onContinue={async () => {
            const next = await requestLocation();
            onAccess(next);
            if (next === "granted") {
              onPincode(null);
              onClose();
            }
          }}
          onNotNow={onClose}
        />
      )}
      <View style={styles.pin}>
        <TextField
          label="Or enter your pincode"
          value={pin}
          onChangeText={(t) => setPin(t.replace(/[^0-9]/g, "").slice(0, 6))}
          onBlur={() => setTouched(true)}
          keyboardType="number-pad"
          maxLength={6}
          error={touched && pin && !valid ? "Enter a 6-digit pincode" : undefined}
        />
        <Button
          label="Use pincode"
          variant="secondary"
          disabled={!valid}
          onPress={() => {
            onPincode(pin);
            onClose();
          }}
          fullWidth
        />
        {pincode ? (
          <Button label={`Stop using ${pincode}`} variant="ghost" onPress={() => onPincode(null)} fullWidth />
        ) : null}
      </View>
    </BottomSheet>
  );
}

/** S42: mounted once in the root layout. */
export function OrderedItPrompt() {
  const userId = useActiveUser((s) => s.userId);
  const toast = useToast();
  const [order, setOrder] = useState<PendingOrder | null>(null);

  useEffect(() => {
    const check = () => {
      const p = orderToAsk();
      // Opening the link leaves the app; ask only once it's back, for the profile that opened it.
      if (p && p.userId === userId && Date.now() - p.openedAt > 3_000) setOrder(p);
    };
    check();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") check();
    });
    return () => sub.remove();
  }, [userId]);

  if (!order) return null;
  const o = order.option;
  const close = () => {
    dismissOrder();
    setOrder(null);
  };
  return (
    <BottomSheet visible onClose={close} title={`Did you order ${o.name}?`}>
      <View style={styles.order}>
        <Text variant="body" color="textSecondary">
          {`${o.restaurant ? `${o.restaurant} · ` : ""}${o.source === "zomato" ? "Zomato" : "Blinkit"}`}
        </Text>
        <Text variant="headline-sm" tabular>
          {`≈ ${formatInt(o.macros.kcal)} kcal · ${formatInt(o.macros.proteinG)} g protein`}
        </Text>
        <Text variant="caption" color="textSecondary">
          {"Estimated by AI from the listing. You can edit the meal after it's saved."}
        </Text>
        <Button
          label="Yes, log it"
          icon="check"
          onPress={() => {
            logOrder(order);
            setOrder(null);
            toast({ message: `Logged ${o.name}` });
          }}
          fullWidth
        />
        <Button label="Not this time" variant="ghost" onPress={close} fullWidth />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  granted: { gap: 8, paddingVertical: 16 },
  pin: { gap: 12, marginTop: 8 },
  order: { gap: 12 },
});
