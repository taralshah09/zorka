import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";
export type BatteryOptimization = "restricted" | "exempt" | "unknown";
export async function batteryOptimization(): Promise<BatteryOptimization> {
  if (Platform.OS !== "android" || !requireOptionalNativeModule("ExpoBattery")) return "unknown";
  try {
    const Battery = await import("expo-battery");
    return await Battery.isBatteryOptimizationEnabledAsync() ? "restricted" : "exempt";
  } catch { return "unknown"; }
}
