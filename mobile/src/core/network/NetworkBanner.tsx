// S50 offline banner, driven by connectivity. Render it under the header on any screen.
import { useNetwork } from "./network";
import { OfflineBanner } from "@/core/ui";

export function NetworkBanner() {
  const online = useNetwork((s) => s.online);
  return online ? null : <OfflineBanner mode="offline" />;
}
