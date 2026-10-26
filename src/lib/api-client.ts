/** Browser-side JSON client for /api/v1. Errors carry the server's code/message/details. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown; idempotencyKey?: string } = {}): Promise<T> {
  const { json, idempotencyKey, headers, ...rest } = init;
  const res = await fetch(path.startsWith("/api") ? path : `/api/v1${path}`, {
    ...rest,
    headers: {
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      ...headers,
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    credentials: "same-origin",
  });
  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) {
    const e = (data as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error;
    throw new ApiError(res.status, e?.code ?? "error", e?.message ?? `Request failed (${res.status})`, e?.details);
  }
  return data as T;
}

function safeJson(t: string) {
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

export function errorMessage(err: unknown) {
  if (err instanceof ApiError) {
    const problems = (err.details as { problems?: { issues: { message: string }[] }[] } | undefined)?.problems;
    if (problems?.length) return `${err.message} ${problems.flatMap((p) => p.issues.map((i) => i.message)).join(" ")}`;
    return err.message;
  }
  return err instanceof Error ? err.message : "Something went wrong";
}
