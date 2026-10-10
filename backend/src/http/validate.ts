// Request validation pattern: controllers parse params/query/body with Zod.
// A failed parse throws ZodError, which errorHandler turns into a 422 VALIDATION_FAILED.
// (Express 5 forwards rejected async handlers to the error handler, so no wrapper is needed.)
import type { z } from "zod";

export const parse = <S extends z.ZodType>(schema: S, value: unknown): z.infer<S> => schema.parse(value);
