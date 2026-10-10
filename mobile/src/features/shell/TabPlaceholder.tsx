// Empty tab roots for the P02 shell. Each is replaced by its real screen in a later phase.
import type { IconName } from "@/core/icons/Icon";
import { NetworkBanner } from "@/core/network/NetworkBanner";
import { EmptyState, Screen, Text } from "@/core/ui";
import { AppHeader } from "./AppHeader";

type Props = { eyebrow: string; title: string; icon: IconName; body: string };

export function TabPlaceholder({ eyebrow, title, icon, body }: Props) {
  return (
    <Screen withDock header={<AppHeader eyebrow={eyebrow} />}>
      <NetworkBanner />
      <Text variant="headline-lg" accessibilityRole="header">
        {title}
      </Text>
      <EmptyState icon={icon} title="Coming soon" body={body} />
    </Screen>
  );
}
