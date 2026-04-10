import pino from "pino";

/**
 * Centralized structured logger for server-side use.
 *
 * Outputs newline-delimited JSON to stdout so that Loki (or any log aggregator
 * scraping container stdout) can ingest and index the logs without extra
 * configuration. Every log line contains at minimum:
 *   - level      : trace | debug | info | warn | error | fatal
 *   - time       : Unix epoch milliseconds
 *   - app        : application name (APP_NAME env, default "recipes-repo")
 *   - msg        : human-readable message
 *   - ...context : caller-supplied structured fields
 *
 * Usage:
 *   import { logger } from "@/lib/logger";
 *   logger.info({ userId: "abc", action: "importRecipe" }, "Recipe import started");
 *   logger.error({ err: serializeError(e) }, "Unexpected failure");
 *
 * Child loggers:
 *   const log = logger.child({ component: "scraper", operationId });
 *   log.warn({ url }, "Page fetch returned non-OK status");
 *
 * Log levels controlled via LOG_LEVEL env variable (default: "info").
 */

const APP_NAME = process.env.APP_NAME ?? "recipes-repo";
const LOG_LEVEL = process.env.LOG_LEVEL ?? "info";

export const logger = pino({
  name: APP_NAME,
  level: LOG_LEVEL,
  // In production output is already newline-delimited JSON; pino default.
  // In development Next.js may capture and re-format stdout, but pino JSON
  // is still Loki-ingestible even when pretty-printed by the terminal.
  formatters: {
    level(label) {
      // Use the human-readable level name instead of numeric value so Loki
      // label selectors can filter by level string directly.
      return { level: label };
    },
  },
  // Serialize the well-known `err` key using pino's built-in error serializer
  // so stack traces, error names, and messages are captured consistently.
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
  },
  base: {
    app: APP_NAME,
  },
  // ISO timestamps are chosen for human readability in raw container logs.
  // Loki handles both ISO strings and epoch ms automatically.
  timestamp: pino.stdTimeFunctions.isoTime,
});

/**
 * Serialize an unknown caught value into a safe plain object for logging.
 *
 * Never pass the raw `unknown` value directly to pino as it may be non-Error
 * (strings, numbers, plain objects) and will not be serialized predictably.
 *
 * @example
 *   } catch (e) {
 *     logger.error({ err: serializeError(e) }, "Something failed");
 *   }
 */
export function serializeError(value: unknown): Record<string, unknown> {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      // Include `cause` if present (ES2022+)
      ...(value.cause !== undefined ? { cause: String(value.cause) } : {}),
      // Include errno / code for system errors (e.g. ENOENT, EACCES)
      ...("code" in value ? { code: (value as NodeJS.ErrnoException).code } : {}),
    };
  }
  // Fallback for thrown strings / numbers / plain objects
  if (typeof value === "object" && value !== null) {
    return value as Record<string, unknown>;
  }
  return { raw: String(value) };
}
