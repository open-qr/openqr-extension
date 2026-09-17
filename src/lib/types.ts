/** Wire + domain types for the OpenQR API the extension talks to. */

/**
 * Machine-readable error codes from the API's `{ error, code }` envelope.
 * The `code` field is additive: older deployments omit it, in which case the
 * client derives a fallback from the HTTP status (see api.ts).
 */
export type ApiErrorCode =
  | "unauthorized"
  | "invalid_request"
  | "plan_limit_exceeded"
  | "rate_limited"
  | "slug_taken"
  | "unsafe_destination"
  | "not_found"
  | "server_error"
  | "http_error";

/** GET /v1/me. Everything after created_at is additive and may be absent. */
export interface MeResponse {
  id: string;
  email: string;
  name: string | null;
  created_at: string;
  /** Plan tier identifier (e.g. "free" | "pro" | "business"), when exposed. */
  plan?: string;
  enforced?: boolean;
  limits?: {
    /** null = unlimited active dynamic codes. */
    dynamic_codes: number | null;
    /** null = unlimited analytics window. */
    scan_analytics_days: number | null;
    detailed_analytics: boolean;
  };
  usage?: {
    active_dynamic: number;
  };
  features?: {
    protection: boolean;
    aliases: boolean;
    api: boolean;
  };
}

/** Row from GET /v1/codes (static and dynamic together, newest first). */
export interface CodeRow {
  id: string;
  type: string;
  dynamic: boolean;
  /**
   * The QR payload for dynamic codes this is the short URL; for static codes
   * the destination column CARRIES the payload string (server behaviour).
   * Never linkify or URL-validate a static row's destination.
   */
  destination: string;
  label: string | null;
  status: string;
  short_url: string | null;
  created_at: string;
}

export interface DynamicCreateResult {
  id: string;
  slug: string;
  short_url: string;
  destination: string;
  label?: string | null;
}

export interface StaticCreateResult {
  id: string;
  type: string;
  payload: string;
  label: string | null;
}

/** Rate-limit metadata lifted off response headers. */
export interface RateMeta {
  /** X-RateLimit-Limit: hourly creation quota. */
  limit?: number;
  /** X-RateLimit-Remaining: creations left this hour. */
  remaining?: number;
  /** X-RateLimit-Reset: unix seconds when the creation quota resets. */
  reset?: number;
  /** Retry-After seconds, on 429s. */
  retryAfter?: number;
  /** Idempotent-Replay: the create was served from the replay store. */
  idempotentReplay?: boolean;
}

export interface ScanBreakdownRow {
  value: string;
  n: number;
}

/** GET /v1/dynamic/{id}/scans. by_device/by_referrer are OMITTED (not empty)
 *  on plans without detailed analytics; presence drives the UI. */
export interface ScansResponse {
  id: string;
  slug: string;
  short_url: string;
  destination: string;
  scans: {
    total: number;
    last7: number;
    topCountry: string | null;
    topDevice: string | null;
  };
  analytics: {
    /** The window the server actually honoured (clamped by plan). */
    days_window: number;
    total: number;
    window_total: number;
    daily: Array<{ day: string; n: number }>;
    by_country: ScanBreakdownRow[];
    by_device?: ScanBreakdownRow[];
    by_referrer?: ScanBreakdownRow[];
  };
}

export type PayloadType =
  | "url"
  | "text"
  | "email"
  | "phone"
  | "sms"
  | "whatsapp"
  | "wifi"
  | "geo"
  | "vcard";

export type FieldValues = Record<string, string | boolean>;

/** Shared account + coordinator state (chrome.storage.local). */
export interface Settings {
  theme: "system" | "light" | "dark";
  /** Dev builds only (import.meta.env.DEV): point the client at a local worker. */
  baseUrl?: string;
}

export interface AccountState {
  /** Session generation: stamped into caches and ops; a mismatch means the
   *  data belongs to a previous connection and must be discarded. */
  sessionGen: string;
  email: string;
  name: string | null;
  me: MeResponse;
  connectedAt: number;
}

export interface CodesCache {
  gen: string;
  items: CodeRow[];
  fetchedAt: number;
  stale?: boolean;
}

export type OpKind =
  | "create_dynamic"
  | "create_static"
  | "update_destination"
  | "set_status";

export type OpState = "pending" | "sent" | "done" | "failed" | "uncertain";

export interface OpError {
  status?: number;
  code?: string;
  message: string;
  retryAfter?: number;
}

export interface OpRecord {
  opId: string;
  kind: OpKind;
  gen: string;
  input: Record<string, unknown>;
  /** Present on creates: the Idempotency-Key sent (and replayed verbatim on check). */
  idempotencyKey?: string;
  state: OpState;
  createdAt: number;
  updatedAt: number;
  result?: Record<string, unknown>;
  error?: OpError;
}

/** A payload staged by the background context menu for the create window. */
export interface StagedPayload {
  id: string;
  kind: "url" | "text";
  value: string;
  createdAt: number;
}

export interface Draft {
  tabUrl: string | null;
  type: PayloadType;
  /** Raw value for the single-field types (url/text). */
  value: string;
  fields: FieldValues;
  dirty: boolean;
  updatedAt: number;
}

export const DEFAULT_BASE_URL = "https://openqr.uk";
