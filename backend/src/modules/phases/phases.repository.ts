// Persistence for phases. The closing summary is one JSON column.
import { Prisma, type PrismaClient } from "../../generated/prisma/client.js";
import type { PhaseData } from "./phases.schemas.js";

export type PhaseRecord = PhaseData & {
  id: string;
  userId: string;
  clientUpdatedAt: Date;
  deletedAt: Date | null;
  updatedAt: Date;
};

export interface PhasesRepository {
  findPhase(id: string): Promise<PhaseRecord | null>;
  upsertPhase(p: { id: string; userId: string; clientUpdatedAt: Date } & PhaseData): Promise<void>;
  softDeletePhase(id: string, clientUpdatedAt: Date): Promise<void>;
  /** Changed since `since` (inclusive), deleted ones included, oldest change first. */
  listChanged(userId: string, since: Date, limit: number): Promise<PhaseRecord[]>;
}

type Row = NonNullable<Awaited<ReturnType<PrismaClient["phase"]["findUnique"]>>>;

const toRecord = ({ createdAt: _c, summary, ...r }: Row): PhaseRecord => ({
  ...r,
  summary: (summary ?? null) as PhaseData["summary"],
});

export function prismaPhasesRepository(prisma: PrismaClient): PhasesRepository {
  return {
    findPhase: async (id) => {
      const row = await prisma.phase.findUnique({ where: { id } });
      return row ? toRecord(row) : null;
    },

    upsertPhase: async ({ id, userId, clientUpdatedAt, summary, ...p }) => {
      // SQL NULL for an open phase (reopened phases drop their summary).
      const data = { ...p, summary: summary ?? Prisma.DbNull, clientUpdatedAt, deletedAt: null };
      await prisma.phase.upsert({ where: { id }, create: { id, userId, ...data }, update: data });
    },

    softDeletePhase: async (id, clientUpdatedAt) => {
      await prisma.phase.update({ where: { id }, data: { deletedAt: clientUpdatedAt, clientUpdatedAt } });
    },

    listChanged: async (userId, since, limit) =>
      (
        await prisma.phase.findMany({
          where: { userId, updatedAt: { gte: since } },
          orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
          take: limit,
        })
      ).map(toRecord),
  };
}
