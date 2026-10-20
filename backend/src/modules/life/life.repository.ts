// Persistence for the life plan entities: day briefs, day plans and memory facts.
import { Prisma, type PrismaClient } from "../../generated/prisma/client.js";
import type { DayBriefData, DayPlanData, MemoryFactData } from "./life.schemas.js";

type Meta = { id: string; userId: string; clientUpdatedAt: Date; deletedAt: Date | null; updatedAt: Date };
export type DayBriefRecord = Meta & DayBriefData;
export type DayPlanRecord = Meta & Omit<DayPlanData, "acceptedAt"> & { acceptedAt: Date | null };
export type MemoryFactRecord = Meta & MemoryFactData;

/** One synced entity: find, upsert, soft delete, and the change feed. */
export interface EntityRepository<R, D> {
  find(id: string): Promise<R | null>;
  upsert(r: { id: string; userId: string; clientUpdatedAt: Date } & D): Promise<void>;
  softDelete(id: string, clientUpdatedAt: Date): Promise<void>;
  /** Changed since `since` (inclusive), deleted ones included, oldest change first. */
  listChanged(userId: string, since: Date, limit: number): Promise<R[]>;
}

export type LifeRepositories = {
  briefs: EntityRepository<DayBriefRecord, DayBriefData>;
  plans: EntityRepository<DayPlanRecord, DayPlanData>;
  facts: EntityRepository<MemoryFactRecord, MemoryFactData>;
};

const meta = { id: true, userId: true, clientUpdatedAt: true, deletedAt: true, updatedAt: true } as const;
const changedWhere = (userId: string, since: Date) => ({ userId, updatedAt: { gte: since } });
const changedOrder = [{ updatedAt: "asc" as const }, { id: "asc" as const }];
const asJson = (v: unknown) => v as Prisma.InputJsonValue;

export function prismaLifeRepositories(prisma: PrismaClient): LifeRepositories {
  const briefSelect = { ...meta, localDate: true, rawText: true, parsed: true, status: true, source: true } as const;
  const planSelect = { ...meta, localDate: true, plan: true, inputsHash: true, acceptedAt: true } as const;
  const factSelect = {
    ...meta,
    key: true,
    kind: true,
    value: true,
    text: true,
    source: true,
    confidence: true,
    evidence: true,
    status: true,
    validFrom: true,
    validUntil: true,
  } as const;

  return {
    briefs: {
      find: async (id) => (await prisma.dayBrief.findUnique({ where: { id }, select: briefSelect })) as DayBriefRecord | null,
      upsert: async ({ id, userId, clientUpdatedAt, parsed, ...b }) => {
        const data = { ...b, parsed: asJson(parsed), clientUpdatedAt, deletedAt: null };
        await prisma.dayBrief.upsert({ where: { id }, create: { id, userId, ...data }, update: data });
      },
      softDelete: async (id, at) => {
        await prisma.dayBrief.update({ where: { id }, data: { deletedAt: at, clientUpdatedAt: at } });
      },
      listChanged: async (userId, since, limit) =>
        (await prisma.dayBrief.findMany({ where: changedWhere(userId, since), orderBy: changedOrder, take: limit, select: briefSelect })) as DayBriefRecord[],
    },
    plans: {
      find: async (id) => (await prisma.dayPlan.findUnique({ where: { id }, select: planSelect })) as DayPlanRecord | null,
      upsert: async ({ id, userId, clientUpdatedAt, plan, acceptedAt, ...p }) => {
        const data = { ...p, plan: asJson(plan), acceptedAt: acceptedAt ? new Date(acceptedAt) : null, clientUpdatedAt, deletedAt: null };
        await prisma.dayPlan.upsert({ where: { id }, create: { id, userId, ...data }, update: data });
      },
      softDelete: async (id, at) => {
        await prisma.dayPlan.update({ where: { id }, data: { deletedAt: at, clientUpdatedAt: at } });
      },
      listChanged: async (userId, since, limit) =>
        (await prisma.dayPlan.findMany({ where: changedWhere(userId, since), orderBy: changedOrder, take: limit, select: planSelect })) as DayPlanRecord[],
    },
    facts: {
      find: async (id) => (await prisma.memoryFact.findUnique({ where: { id }, select: factSelect })) as MemoryFactRecord | null,
      upsert: async ({ id, userId, clientUpdatedAt, value, evidence, ...f }) => {
        const data = {
          ...f,
          value: asJson(value),
          evidence: evidence ? asJson(evidence) : Prisma.DbNull,
          clientUpdatedAt,
          deletedAt: null,
        };
        await prisma.memoryFact.upsert({ where: { id }, create: { id, userId, ...data }, update: data });
      },
      softDelete: async (id, at) => {
        await prisma.memoryFact.update({ where: { id }, data: { deletedAt: at, clientUpdatedAt: at } });
      },
      listChanged: async (userId, since, limit) =>
        (await prisma.memoryFact.findMany({ where: changedWhere(userId, since), orderBy: changedOrder, take: limit, select: factSelect })) as MemoryFactRecord[],
    },
  };
}
