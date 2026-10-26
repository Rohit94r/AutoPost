/** Application error with an HTTP status and a stable machine-readable code. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (message: string, details?: unknown) => new AppError(400, "bad_request", message, details);
export const unauthorized = (message = "Sign in required") => new AppError(401, "unauthorized", message);
export const forbidden = (message = "You do not have access to this resource") => new AppError(403, "forbidden", message);
export const notFound = (what = "Resource") => new AppError(404, "not_found", `${what} not found`);
export const conflict = (message: string, details?: unknown) => new AppError(409, "conflict", message, details);
export const quotaExceeded = (message: string, details?: unknown) => new AppError(402, "quota_exceeded", message, details);
export const tooManyRequests = (retryAfterSec: number) =>
  new AppError(429, "rate_limited", "Too many requests. Please slow down.", { retryAfterSec });
export const notConfigured = (what: string) =>
  new AppError(503, "not_configured", `${what} is not configured on this server. Add the credentials to the environment.`);
