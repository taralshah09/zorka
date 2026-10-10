import { pino, type Logger } from "pino";

export function createLogger(level: string, pretty: boolean): Logger {
  return pino({
    level,
    // Never log credentials or connection strings.
    redact: ["req.headers.authorization", "req.headers.cookie", "*.DATABASE_URL", "*.DIRECT_URL"],
    ...(pretty ? { transport: { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:HH:MM:ss" } } } : {}),
  });
}
