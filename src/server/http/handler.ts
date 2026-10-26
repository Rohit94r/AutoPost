import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { requireApiContext, type WorkspaceContext } from "@/server/auth/session";
import { env } from "@/server/env";
import { AppError, badRequest, forbidden } from "@/server/errors";
import { logger } from "@/server/logger";
import { enforceRateLimit, RATE_LIMITS, type RateLimitRule } from "@/server/rate-limit";
import type { Role } from "@/server/workspaces/service";

export interface ApiContext<P> extends WorkspaceContext {
  req: NextRequest;
  params: P;
  correlationId: string;
  log: typeof logger;
}

interface Options {
  role?: Role;
  rateLimit?: RateLimitRule;
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * CSRF defence for cookie-authenticated JSON APIs: mutating requests must come from our own
 * origin (browsers always send Origin on cross-site POST/fetch). Combined with SameSite=Lax cookies.
 */
export function assertSameOrigin(req: Request) {
  if (!MUTATING.has(req.method)) return;
  const origin = req.headers.get("origin");
  const allowed = new URL(env().APP_BASE_URL).origin;
  const self = new URL(req.url).origin;
  if (!origin || (origin !== allowed && origin !== self)) throw forbidden("Cross-origin request rejected");
}

export function errorResponse(err: unknown, correlationId: string, log = logger) {
  if (err instanceof AppError) {
    if (err.status >= 500) log.error({ err, correlationId }, err.message);
    const res = NextResponse.json(
      { error: { code: err.code, message: err.message, details: err.details ?? null, correlationId } },
      { status: err.status },
    );
    const retry = (err.details as { retryAfterSec?: number } | undefined)?.retryAfterSec;
    if (err.status === 429 && retry) res.headers.set("Retry-After", String(retry));
    return res;
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: { code: "validation_error", message: "Invalid request", details: err.issues, correlationId } },
      { status: 400 },
    );
  }
  log.error({ err, correlationId }, "unhandled API error");
  return NextResponse.json(
    { error: { code: "internal_error", message: "Something went wrong. Please try again.", correlationId } },
    { status: 500 },
  );
}

/** Wraps an authenticated, workspace-scoped API route with validation, CSRF, rate limits and error mapping. */
export function apiRoute<P = Record<string, string>>(
  opts: Options,
  fn: (ctx: ApiContext<P>) => Promise<Response | unknown>,
) {
  return async (req: NextRequest, segment: { params: Promise<P> }) => {
    const correlationId = req.headers.get("x-request-id")?.slice(0, 64) || crypto.randomUUID();
    const log = logger.child({ correlationId, route: req.nextUrl.pathname, method: req.method });
    try {
      assertSameOrigin(req);
      const minRole = opts.role ?? (MUTATING.has(req.method) ? "editor" : "viewer");
      const ctx = await requireApiContext(minRole);
      await enforceRateLimit(opts.rateLimit ?? RATE_LIMITS.default, ctx.user.id);
      const params = (await segment?.params) ?? ({} as P);
      const result = await fn({ ...ctx, req, params, correlationId, log });
      const res = result instanceof Response ? result : NextResponse.json(result ?? { ok: true });
      res.headers.set("x-request-id", correlationId);
      return res;
    } catch (err) {
      return errorResponse(err, correlationId, log);
    }
  };
}

export async function parseJson<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw badRequest("Request body must be valid JSON");
  }
  return schema.parse(body);
}

export function parseQuery<T>(req: NextRequest, schema: ZodType<T>): T {
  return schema.parse(Object.fromEntries(req.nextUrl.searchParams.entries()));
}

export const uuidParam = (value: string | undefined, what = "id") => {
  if (!value || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw badRequest(`Invalid ${what}`);
  }
  return value;
};
