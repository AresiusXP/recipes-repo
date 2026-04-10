import { type Instrumentation } from "next";
import { logger, serializeError } from "@/lib/logger";

/**
 * Next.js instrumentation hook.
 *
 * `register` is called once when a new server instance starts.
 * `onRequestError` is called by Next.js for every uncaught server error
 * (server renders, route handlers, server actions, proxy handlers) that
 * would otherwise silently swallow context in production.
 *
 * Place this file at `src/instrumentation.ts` so Next.js picks it up
 * automatically (stable since Next.js 15 / Next.js 16).
 */

export function register() {
  logger.info({ event: "server.start" }, "Next.js server instance started");
}

export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request,
  context
) => {
  logger.error(
    {
      event: "request.error",
      err: serializeError(err),
      request: {
        path: request.path,
        method: request.method,
      },
      context: {
        routerKind: context.routerKind,
        routePath: context.routePath,
        routeType: context.routeType,
        renderSource: context.renderSource,
        revalidateReason: context.revalidateReason,
      },
    },
    "Uncaught server request error"
  );
};
