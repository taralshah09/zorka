// Life plan entities: the "day_brief", "day_plan" and "memory_fact" sync handlers and their change feeds (D23, D78).
// One generic handler (LWW guard → delete or validate + upsert) serves all three; only the payload schema and the DTO
// differ. A brief's parsed facts go through validateDayFacts here too, so the server never stores garbage.
import type { z } from "zod";

import { validateDayFacts } from "../../../../shared/domain/life.js";
import type { ChangeFeed } from "../sync/changes.js";
import { lwwGuard, parseOpData, type EntityHandler } from "../sync/lww.js";
import type { DayBriefRecord, DayPlanRecord, EntityRepository, LifeRepositories, MemoryFactRecord } from "./life.repository.js";
import { DayBriefData, DayPlanData, MemoryFactData, type DayBriefDto, type DayPlanDto, type MemoryFactDto } from "./life.schemas.js";

type Rec = { id: string; userId: string; clientUpdatedAt: Date; deletedAt: Date | null; updatedAt: Date };

function entity<R extends Rec, S extends z.ZodType<Record<string, unknown>>>(
  repo: EntityRepository<R, z.infer<S>>,
  schema: S,
  toDto: (r: R) => unknown,
  clean: (d: z.infer<S>) => z.infer<S> = (d) => d,
): { sync: EntityHandler; changes: ChangeFeed } {
  const sync: EntityHandler = async (userId, op) => {
    const existing = await repo.find(op.id);
    const guard = lwwGuard(userId, op, existing ? { ownerId: existing.userId, clientUpdatedAt: existing.clientUpdatedAt } : null);
    if (guard) return guard;
    const at = new Date(op.clientUpdatedAt);
    if (op.action === "delete") {
      if (existing) await repo.softDelete(op.id, at);
      return { opId: op.opId, status: "applied" };
    }
    const parsed = parseOpData(schema, op);
    if (!parsed.ok) return parsed.result;
    await repo.upsert({ ...clean(parsed.data), id: op.id, userId, clientUpdatedAt: at });
    return { opId: op.opId, status: "applied" };
  };
  const changes: ChangeFeed = async (userId, since, limit) =>
    (await repo.listChanged(userId, since, limit)).map((r) => ({ id: r.id, updatedAt: r.updatedAt, deleted: !!r.deletedAt, data: toDto(r) }));
  return { sync, changes };
}

const briefDto = (r: DayBriefRecord): DayBriefDto => ({
  id: r.id,
  localDate: r.localDate,
  rawText: r.rawText,
  parsed: r.parsed,
  status: r.status,
  source: r.source,
  clientUpdatedAt: r.clientUpdatedAt.toISOString(),
});

const planDto = (r: DayPlanRecord): DayPlanDto => ({
  id: r.id,
  localDate: r.localDate,
  plan: r.plan,
  inputsHash: r.inputsHash,
  acceptedAt: r.acceptedAt?.toISOString() ?? null,
  clientUpdatedAt: r.clientUpdatedAt.toISOString(),
});

const factDto = (r: MemoryFactRecord): MemoryFactDto => ({
  id: r.id,
  key: r.key,
  kind: r.kind,
  value: r.value,
  text: r.text,
  source: r.source,
  confidence: r.confidence,
  evidence: r.evidence ?? null,
  status: r.status,
  validFrom: r.validFrom ?? null,
  validUntil: r.validUntil ?? null,
  clientUpdatedAt: r.clientUpdatedAt.toISOString(),
});

export function lifeService(repos: LifeRepositories) {
  const briefs = entity(repos.briefs, DayBriefData, briefDto, (d) => ({
    ...d,
    parsed: validateDayFacts(d.parsed) as unknown as Record<string, unknown>,
  }));
  const plans = entity(repos.plans, DayPlanData, planDto);
  const facts = entity(repos.facts, MemoryFactData, factDto);
  return {
    syncBrief: briefs.sync,
    syncPlan: plans.sync,
    syncFact: facts.sync,
    briefChanges: briefs.changes,
    planChanges: plans.changes,
    factChanges: facts.changes,
  };
}

export type LifeService = ReturnType<typeof lifeService>;
