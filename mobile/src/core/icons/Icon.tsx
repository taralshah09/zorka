// Material Symbols Rounded (brand §5): weight 400, FILL 0 default, FILL 1 for active/selected.
import Svg, { Path } from "react-native-svg";

import { SYMBOLS, type IconName } from "./symbols.generated";

export type { IconName };

export type IconSize = 16 | 20 | 24 | 28;

type Props = {
  name: IconName;
  size?: IconSize;
  color: string;
  filled?: boolean;
  /** Icons are decorative by default; label the control that contains them instead. */
  accessibilityLabel?: string;
};

export function Icon({ name, size = 24, color, filled = false, accessibilityLabel }: Props) {
  const [outline, fill] = SYMBOLS[name];
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 -960 960 960"
      accessible={!!accessibilityLabel}
      accessibilityLabel={accessibilityLabel}
    >
      <Path d={filled ? fill : outline} fill={color} />
    </Svg>
  );
}
