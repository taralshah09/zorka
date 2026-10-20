// D85 · The AI week planner on the phone. Sends the week (base targets, what was logged, briefs, what each day can reach,
// and the rules plan as a reference) to POST /plan/week, and keeps the model's answer per Mon–Sun week on the phone, so
// the plan works offline and every re-render plans the same. planDay guards the cached answer every time it runs
// (shared/domain/aiPlan.ts). Re-plans happen when a brief is confirmed, once a day on first open, or on request.
import { create } from "zustand";

import { api } from "@/core/api/client";
import type { Profile } from "@/core/api/types";
import { useNetwork } from "@/core/network/network";
import { kv } from "@/core/storage/kv";
import type { AiWeek } from "@shared/domain/aiPlan";
import { planDay, type PlanDayInput } from "@shared/domain/planDay";
import { LEDGER_RULES, weekDates } from "@shared/domain/week";

export type CachedAiWeek = AiWeek & { at: string; slot: string; model: string };
type PlanWeekResult = { days: AiWeek["days"]; summary: string | null; ai: { slot: string; model: string; attempts: number } };

export const useAiWeekVersion = create<{ v: number; busy: boolean }>(() => ({ v: 0, busy: false }));
const key = (userId: string, date: string) => `zorka.aiWeek.${userId}.${weekDates(date)[0]}`;
const dayKey = (userId: string) => `zorka.aiReplanDay.${userId}`;

/** The model's latest answer for the week holding `date`, or null (then the code plan is used). */
export function aiWeekFor(userId: string | null, date: string): CachedAiWeek | null {
  if (!userId) return null;
  try {
    const raw = kv.get(key(userId, date));
    return raw ? (JSON.parse(raw) as CachedAiWeek) : null;
  } catch {
    return null;
  }
}

export function clearAiWeek(userId: string, date: string) {
  kv.remove(key(userId, date));
  useAiWeekVersion.setState((s) => ({ v: s.v + 1 }));
}

/**
 * Asks the model to plan the rest of the week holding `input.date`. Resolves to true when a new answer was cached.
 * Never throws: offline, no AI or a bad answer leave the previous plan (or the code plan) in place.
 */
export async function requestAiWeek(
  userId: string,
  input: PlanDayInput,
  ctx: { profile: Profile | null | undefined; briefs: ReadonlyMap<string, { rawText: string }>; facts: readonly string[] },
): Promise<boolean> {
  if (!useNetwork.getState().online || useAiWeekVersion.getState().busy) return false;
  const code = planDay({ ...input, ai: null });
  const codeDays = new Map(code.week.days.map((d) => [d.date, d]));
  const p = ctx.profile;
  useAiWeekVersion.setState({ busy: true });
  try {
    const body = {
      today: input.today,
      focusDate: input.date,
      goal: input.base.goal,
      floorKcal: input.base.floorKcal,
      sessionsTarget: input.sessionsTarget,
      standing: { mealSource: p?.mealSource ?? null, budget: p?.budget ?? null, workPattern: p?.workPattern ?? null },
      facts: ctx.facts.slice(0, 8).map((f) => f.slice(0, 200)),
      days: input.ledger.map((d) => {
        const c = codeDays.get(d.date);
        // The focus day's own type and reach come from planDay; other days from their ledger rows.
        const focus = d.date === input.date;
        return {
          date: d.date,
          dayType: focus ? code.dayType : d.dayType,
          brief: ctx.briefs.get(d.date)?.rawText?.slice(0, 400) || null,
          base: { kcal: d.baseKcal, proteinG: d.baseProteinG, steps: d.baseSteps },
          actual: d.date < input.today ? d.actual : null,
          achievableProteinG: focus ? code.protein.achievableG : (d.achievableProteinG ?? null),
          canTrain: LEDGER_RULES[focus ? code.dayType : d.dayType].canTrain && d.capacity.canTrain,
          code: { kcal: c?.kcal ?? d.baseKcal, proteinG: c?.proteinG ?? d.baseProteinG, steps: c?.steps ?? null, train: !!c?.train },
        };
      }),
    };
    const res = await api<PlanWeekResult>(`/users/${userId}/plan/week`, { method: "POST", body, timeoutMs: 40_000 });
    if (!res.days.length) return false;
    const cached: CachedAiWeek = { days: res.days, summary: res.summary, at: new Date().toISOString(), slot: res.ai.slot, model: res.ai.model };
    kv.set(key(userId, input.date), JSON.stringify(cached));
    return true;
  } catch {
    return false;
  } finally {
    useAiWeekVersion.setState((s) => ({ v: s.v + 1, busy: false }));
  }
}

/** Once a day, on first open: true the first time it's asked for `today`. */
export function dueForDailyReplan(userId: string, today: string): boolean {
  if (kv.get(dayKey(userId)) === today) return false;
  kv.set(dayKey(userId), today);
  return true;
}
