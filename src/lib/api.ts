/**
 * Thin API client for https://openqr.uk/v1.
 *
 * Deliberately fetch-based (not the SDK class): the extension needs the
 * Idempotency-Key header and response metadata on every call, which the
 * published SDK does not expose yet. Wire shapes mirror @open-qr/sdk and the
 * API's OpenAPI spec; when the SDK grows these capabilities the internals
 * here swap over without touching callers.
 */
import { DEFAULT_BASE_URL } from "./types";
import type {
  CodeRow,
  DynamicCreateResult,
  FieldValues,
  MeResponse,
  PayloadType,
  RateMeta,
  ScansResponse,
  StaticCreateResult,
} from "./types";

export class ApiError extends Error {
  readonly status: number;
  /** Machine code from the body when present, else derived from the status. */
  readonly code: string;
  readonly meta: RateMeta;

  constructor(status: number, code: string, message: string, meta: RateMeta = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.meta = meta;
  }
}

const CODE_FOR_STATUS: Record<number, string> = {
  400: "invalid_request",
  401: "unauthorized",
  403: "plan_limit_exceeded",
  404: "not_found",
  409: "slug_taken",
  429: "rate_limited",
};

function parseRateMeta(headers: Headers): RateMeta {
  const meta: RateMeta = {};
  const limit = headers.get("x-ratelimit-limit");
  const remaining = headers.get("x-ratelimit-remaining");
  const reset = headers.get("x-ratelimit-reset");
  const retryAfter = headers.get("retry-after");
  if (limit != null) meta.limit = Number(limit);
  if (remaining != null) meta.remaining = Number(remaining);
  if (reset != null) meta.reset = Number(reset);
  if (retryAfter != null && /^\d+$/.test(retryAfter)) meta.retryAfter = Number(retryAfter);
  if (headers.get("idempotent-replay") === "true") meta.idempotentReplay = true;
  return meta;
}

interface RequestOpts {
  method?: string;
  body?: unknown;
  idempotencyKey?: string;
}

async function request<T>(
  key: string,
  baseUrl: string,
  path: string,
  opts: RequestOpts = {},
): Promise<{ data: T; meta: RateMeta }> {
  const headers: Record<string, string> = { Authorization: `Bearer ${key}` };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;

  const res = await fetch(`${baseUrl}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const meta = parseRateMeta(res.headers);

  if (!res.ok) {
    let message = `Request failed (${res.status}).`;
    let code: string | undefined;
    try {
      const parsed = (await res.json()) as { error?: string; code?: string };
      if (parsed?.error) message = parsed.error;
      code = parsed?.code;
    } catch {
      // non-JSON error body; keep the generic message
    }
    throw new ApiError(res.status, code ?? CODE_FOR_STATUS[res.status] ?? "http_error", message, meta);
  }
  return { data: (await res.json()) as T, meta };
}

export interface ApiClient {
  me(): Promise<{ data: MeResponse; meta: RateMeta }>;
  listCodes(limit?: number): Promise<{ data: { codes: CodeRow[] }; meta: RateMeta }>;
  createDynamic(
    input: { destination: string; label?: string },
    idempotencyKey?: string,
  ): Promise<{ data: DynamicCreateResult; meta: RateMeta }>;
  createStatic(
    input: { type: PayloadType; fields: FieldValues; label?: string },
    idempotencyKey?: string,
  ): Promise<{ data: StaticCreateResult; meta: RateMeta }>;
  updateDynamic(
    id: string,
    patch: { destination?: string; label?: string | null; status?: "active" | "paused"; pause_until?: string | null },
  ): Promise<{ data: DynamicCreateResult; meta: RateMeta }>;
  getScans(id: string, days?: number): Promise<{ data: ScansResponse; meta: RateMeta }>;
}

export function apiClient(key: string, baseUrl: string = DEFAULT_BASE_URL): ApiClient {
  return {
    me: () => request<MeResponse>(key, baseUrl, "/v1/me"),
    listCodes: (limit = 500) =>
      request<{ codes: CodeRow[] }>(key, baseUrl, `/v1/codes?limit=${limit}`),
    createDynamic: (input, idempotencyKey) =>
      request<DynamicCreateResult>(key, baseUrl, "/v1/dynamic", {
        method: "POST",
        body: input,
        idempotencyKey,
      }),
    createStatic: (input, idempotencyKey) =>
      request<StaticCreateResult>(key, baseUrl, "/v1/codes", {
        method: "POST",
        body: input,
        idempotencyKey,
      }),
    updateDynamic: (id, patch) =>
      request<DynamicCreateResult>(key, baseUrl, `/v1/dynamic/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: patch,
      }),
    getScans: (id, days) =>
      request<ScansResponse>(
        key,
        baseUrl,
        `/v1/dynamic/${encodeURIComponent(id)}/scans${days ? `?days=${days}` : ""}`,
      ),
  };
}

/** Key shape check before wasting a round trip: oqr_ + 20+ word chars. */
export function looksLikeApiKey(v: string): boolean {
  return /^oqr_[A-Za-z0-9]{20,}$/.test(v.trim());
}
