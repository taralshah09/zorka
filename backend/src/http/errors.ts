// Central error handling. Every error response has the shape:
//   { "error": { "code": "NOT_FOUND", "message": "…", "details"?: … } }
import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";

export type ErrorCode =
  | "BAD_REQUEST"
  | "VALIDATION_FAILED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "SERVICE_UNAVAILABLE"
  | "INTERNAL";

const STATUS: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  VALIDATION_FAILED: 422,
  NOT_FOUND: 404,
  CONFLICT: 409,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL: 500,
};

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
  get status() {
    return STATUS[this.code];
  }
}

export const notFound = (what: string) => new AppError("NOT_FOUND", `${what} not found`);

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError("NOT_FOUND", `No route for ${req.method} ${req.path}`));
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(422).json({
      error: {
        code: "VALIDATION_FAILED",
        message: "Request validation failed",
        details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
    });
    return;
  }
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }
  // Malformed JSON body from express.json().
  if (err?.type === "entity.parse.failed") {
    res.status(400).json({ error: { code: "BAD_REQUEST", message: "Malformed JSON body" } });
    return;
  }
  req.log?.error({ err }, "Unhandled error");
  res.status(500).json({ error: { code: "INTERNAL", message: "Something went wrong" } });
};
