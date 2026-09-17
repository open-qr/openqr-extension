/**
 * API layer: a thin adapter over the published @open-qr/sdk.
 *
 * The adapter exists to keep two things stable for the rest of the extension:
 *  - one error type (ApiError) with a machine `code`, so the coordinator and
 *    the UI never import SDK internals;
 *  - a uniform {data, meta} return shape with rate/replay metadata.
 * 0.3.0-beta.1 of the SDK grew me()/listCodes/createStaticCode/idempotency;
 * when it stabilises as 0.3.0 this file shrinks further, not grows.
 */
import { OpenQR, OpenQRError } from "@open-qr/sdk";
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

type SdkLike = ReturnType<typeof makeSdk>;

function makeSdk(key: string, baseUrl: string) {
  return new OpenQR({ apiKey: key, baseUrl });
}

function toApiError(e: unknown): ApiError {
  if (e instanceof OpenQRError) {
    const meta: RateMeta = {};
    if (e.rateLimit) {
      meta.limit = e.rateLimit.limit;
      meta.remaining = e.rateLimit.remaining;
      meta.reset = e.rateLimit.reset;
    }
    if (e.retryAfter != null) meta.retryAfter = e.retryAfter;
    return new ApiError(e.status, e.code, e.message, meta);
  }
  // fetch throws TypeError on network failure / offline; let it classify as such.
  throw e;
}

function metaOf(code: unknown): RateMeta {
  const c = code as {
    rateLimit?: { limit: number; remaining: number; reset: number };
    /** createStaticCode attaches the rate snapshot as `meta`. */
    meta?: { limit: number; remaining: number; reset: number };
    idempotentReplay?: boolean;
  };
  const rl = c.rateLimit ?? c.meta;
  const meta: RateMeta = {};
  if (rl) {
    meta.limit = rl.limit;
    meta.remaining = rl.remaining;
    meta.reset = rl.reset;
  }
  if (c.idempotentReplay) meta.idempotentReplay = true;
  return meta;
}

export function apiClient(key: string, baseUrl: string = DEFAULT_BASE_URL): ApiClient {
  const sdk = (): SdkLike => makeSdk(key, baseUrl);
  return {
    async me() {
      try {
        return { data: await sdk().me(), meta: {} };
      } catch (e) {
        throw toApiError(e);
      }
    },
    async listCodes(limit = 500) {
      try {
        const page = await sdk().listCodes({ limit });
        return { data: { codes: page.items }, meta: {} };
      } catch (e) {
        throw toApiError(e);
      }
    },
    async createDynamic(input, idempotencyKey) {
      try {
        const code = await sdk().createDynamicCode(input, idempotencyKey);
        return { data: code as DynamicCreateResult, meta: metaOf(code) };
      } catch (e) {
        throw toApiError(e);
      }
    },
    async createStatic(input, idempotencyKey) {
      try {
        const code = (await sdk().createStaticCode(
          { type: input.type, fields: input.fields, label: input.label },
          idempotencyKey,
        )) as unknown as Record<string, unknown>;
        const { meta: _m, ...data } = code;
        return { data: data as unknown as StaticCreateResult, meta: metaOf(code) };
      } catch (e) {
        throw toApiError(e);
      }
    },
    async updateDynamic(id, patch) {
      try {
        const code = await sdk().updateDynamicCode(id, patch);
        return { data: code, meta: {} };
      } catch (e) {
        throw toApiError(e);
      }
    },
    async getScans(id, days) {
      try {
        return { data: await sdk().getScans(id, days ? { days } : undefined), meta: {} };
      } catch (e) {
        throw toApiError(e);
      }
    },
  };
}

/** Key shape check before wasting a round trip: oqr_ + 20+ word chars. */
export function looksLikeApiKey(v: string): boolean {
  return /^oqr_[A-Za-z0-9]{20,}$/.test(v.trim());
}
