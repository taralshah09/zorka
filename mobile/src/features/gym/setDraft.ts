import { kv } from "@/core/storage/kv";
const key = (userId: string, setId: string) => `zorka.setText.${userId}.${setId}`;
export function readSetText(userId: string, setId: string): Record<string, string> {
  try { return JSON.parse(kv.get(key(userId, setId)) ?? "{}"); } catch { return {}; }
}
export const saveSetText = (userId: string, setId: string, text: Record<string, string>) => kv.set(key(userId, setId), JSON.stringify(text));
export const clearSetText = (userId: string, setId: string) => kv.remove(key(userId, setId));
