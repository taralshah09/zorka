// Connectivity: NetInfo → a tiny zustand store, and TanStack Query's onlineManager so queries
// pause offline and refetch on reconnect.
import NetInfo from "@react-native-community/netinfo";
import { onlineManager } from "@tanstack/react-query";
import { create } from "zustand";

type NetworkState = { online: boolean };

export const useNetwork = create<NetworkState>(() => ({ online: true }));

let started = false;

/** Call once at app start. */
export function startNetworkMonitoring(): void {
  if (started) return;
  started = true;
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((s) => {
      // isInternetReachable is null while unknown; treat unknown as online to avoid a false banner.
      const online = !!s.isConnected && s.isInternetReachable !== false;
      useNetwork.setState({ online });
      setOnline(online);
    }),
  );
}
