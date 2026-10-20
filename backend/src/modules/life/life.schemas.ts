// LA1–LA5 · Life plan entities (docs/LIFE_PLAN.md, D78): the day brief ("day_brief"), the accepted day plan ("day_plan")
// and the memory facts ("memory_fact"). All three are written on the phone and synced last-write-wins (D23), so a
// reinstall restores them through the usual pull. Chat transcripts never come here.
import { z } from "zod";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** JSON payloads are plain objects of bounded size. */
const json = (maxChars: number) =>
  z.record(z.string(), z.unknown()).refine((v) => JSON.stringify(v).length <= maxChars, `at most ${maxChars} characters of JSON`);

export const BRIEF_STATUSES = ["draft", "confirmed"] as const;
export const BRIEF_SOURCES = ["brief", "calendar", "inferred"] as const;
export const FACT_KINDS = ["constraint", "pattern", "preference", "event"] as const;
export const FACT_SOURCES = ["onboarding", "brief", "chat", "inferred", "user"] as const;
export const FACT_STATUSES = ["suggested", "active", "dismissed"] as const;

export const DayBriefData = z
  .object({
    localDate: date,
    rawText: z.string().max(2000),
    /** DayFacts; the service runs validateDayFacts over it before storing. */
    parsed: json(20_000),
    status: z.enum(BRIEF_STATUSES),
    source: z.enum(BRIEF_SOURCES),
  })
  .strict();
export type DayBriefData = z.infer<typeof DayBriefData>;

export const DayPlanData = z
  .object({
    localDate: date,
    plan: json(100_000),
    inputsHash: z.string().min(1).max(64),
    acceptedAt: z.string().datetime({ offset: true }).nullable(),
  })
  .strict();
export type DayPlanData = z.infer<typeof DayPlanData>;

export const MemoryFactData = z
  .object({
    key: z.string().min(1).max(120),
    kind: z.enum(FACT_KINDS),
    value: z.unknown().refine((v) => v !== undefined && JSON.stringify(v).length <= 4000, "value is required (≤ 4000 chars)"),
    text: z.string().trim().min(1).max(300),
    source: z.enum(FACT_SOURCES),
    confidence: z.number().min(0).max(1),
    evidence: z
      .object({ count: z.number().int().min(0), window: z.number().int().min(0), lastSeen: date })
      .strict()
      .nullable(),
    status: z.enum(FACT_STATUSES),
    validFrom: date.nullable(),
    validUntil: date.nullable(),
  })
  .strict();
export type MemoryFactData = z.infer<typeof MemoryFactData>;

export type DayBriefDto = DayBriefData & { id: string; clientUpdatedAt: string };
export type DayPlanDto = DayPlanData & { id: string; clientUpdatedAt: string };
export type MemoryFactDto = MemoryFactData & { id: string; clientUpdatedAt: string };
