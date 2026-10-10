// Type scale — BRAND_GUIDELINES.md §4. Plus Jakarta Sans only.
// Android picks a weight by font family name (fontWeight is ignored for custom fonts),
// so each weight maps to its own loaded family.
import type { TextStyle } from "react-native";

export const fontFamily = {
  400: "PlusJakartaSans_400Regular",
  500: "PlusJakartaSans_500Medium",
  600: "PlusJakartaSans_600SemiBold",
  700: "PlusJakartaSans_700Bold",
  800: "PlusJakartaSans_800ExtraBold",
} as const;

export type FontWeight = keyof typeof fontFamily;

type Spec = { size: number; line: number; weight: FontWeight; trackingEm: number; upper?: boolean };

const spec = {
  "display-xl": { size: 48, line: 52, weight: 800, trackingEm: -0.03 },
  display: { size: 40, line: 48, weight: 800, trackingEm: -0.03 },
  "headline-lg": { size: 28, line: 34, weight: 700, trackingEm: -0.02 },
  "headline-md": { size: 22, line: 28, weight: 700, trackingEm: -0.01 },
  "headline-sm": { size: 18, line: 24, weight: 600, trackingEm: 0 },
  title: { size: 16, line: 22, weight: 600, trackingEm: 0 },
  "body-lg": { size: 16, line: 24, weight: 400, trackingEm: 0 },
  body: { size: 14, line: 20, weight: 400, trackingEm: 0 },
  "label-lg": { size: 14, line: 18, weight: 700, trackingEm: 0 },
  label: { size: 13, line: 18, weight: 600, trackingEm: 0.01 },
  eyebrow: { size: 11, line: 14, weight: 700, trackingEm: 0.08, upper: true },
  unit: { size: 12, line: 16, weight: 600, trackingEm: 0.04, upper: true },
  caption: { size: 12, line: 16, weight: 500, trackingEm: 0.02 },
} satisfies Record<string, Spec>;

export type TypeVariant = keyof typeof spec;

export const typeScale = Object.fromEntries(
  Object.entries(spec).map(([name, s]: [string, Spec]) => [
    name,
    {
      fontFamily: fontFamily[s.weight],
      fontSize: s.size,
      lineHeight: s.line,
      letterSpacing: +(s.trackingEm * s.size).toFixed(2),
      ...(s.upper ? { textTransform: "uppercase" } : null),
    } satisfies TextStyle,
  ]),
) as Record<TypeVariant, TextStyle>;

/** Brand §4.1 — tabular figures on live / numeric values. Verified on device at P03 handover. */
export const tabularNums: TextStyle = { fontVariant: ["tabular-nums"] };

/** Brand §4.2 — text must survive 130% system font scaling. */
export const MAX_FONT_SCALE = 1.3;
