// Active dummy user (D5, P05 gate): picked on S01 at first launch, switchable from Settings.
// Persisted on the device so the choice survives an app restart.
import { create } from "zustand";

import { kv, KV_KEYS } from "@/core/storage/kv";

type ActiveUserState = {
  userId: string | null;
  setUser: (id: string) => void;
  clearUser: () => void;
};

export const useActiveUser = create<ActiveUserState>((set) => ({
  userId: kv.get(KV_KEYS.activeUserId),
  setUser: (id) => {
    kv.set(KV_KEYS.activeUserId, id);
    set({ userId: id });
  },
  clearUser: () => {
    kv.remove(KV_KEYS.activeUserId);
    set({ userId: null });
  },
}));
