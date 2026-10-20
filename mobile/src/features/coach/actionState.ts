import { kv } from "@/core/storage/kv";
export type ActionResult = { kind: "meal" | "workout" | "idea"; id: string };
const key = (userId: string, action: string) => `zorka.coachAction.${userId}.${action}`;
export function actionResult(userId: string | null, action: string): ActionResult | null {
  try { return JSON.parse(userId ? kv.get(key(userId, action)) ?? "null" : "null"); } catch { return null; }
}
export function completeAction(userId: string, action: string, result: ActionResult) {
  kv.set(key(userId, action), JSON.stringify(result));
}
