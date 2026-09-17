/**
 * Map ApiError to what the UI shows. One mapping, used by every surface.
 * The upgrade CTA keys on the machine code plan_limit_exceeded ONLY; a bare
 * 403/400 never produces an upgrade prompt.
 */
import { ApiError } from "./api";
import type { OpError } from "./types";

export type UiErrorKind =
  | "unauthorized"
  | "cap"
  | "rate_limited"
  | "offline"
  | "conflict"
  | "validation"
  | "server";

export interface UiError {
  kind: UiErrorKind;
  title: string;
  body: string;
  retryAfterSec?: number;
}

export function describeApiError(e: unknown): UiError {
  if (e instanceof ApiError) {
    switch (e.code) {
      case "unauthorized":
        return {
          kind: "unauthorized",
          title: "This API key is no longer valid.",
          body: "It may have been revoked in the dashboard. Disconnect and connect a new key.",
        };
      case "plan_limit_exceeded":
        return {
          kind: "cap",
          title: "You are at your plan's limit of active dynamic codes.",
          body: "Pause a code to free its slot, upgrade, or manage codes in the dashboard.",
        };
      case "rate_limited": {
        const secs = e.meta.retryAfter;
        return {
          kind: "rate_limited",
          title: secs
            ? `Too many requests. Try again in ${secs >= 60 ? `${Math.ceil(secs / 60)} minutes` : `${secs} seconds`}.`
            : "Too many requests. Try again shortly.",
          body:
            e.meta.remaining != null
              ? "This is the hourly limit on creating new codes."
              : "This is the per-minute request limit.",
          retryAfterSec: secs,
        };
      }
      case "slug_taken":
        return {
          kind: "conflict",
          title: "That short link is already taken.",
          body: "Choose a different back-half for the short URL.",
        };
      case "unsafe_destination":
        return {
          kind: "validation",
          title: "This destination is not allowed.",
          body: e.message,
        };
      case "invalid_request":
        return { kind: "validation", title: "That change was rejected.", body: e.message };
      default:
        return {
          kind: "server",
          title: "OpenQR could not complete this.",
          body: e.message || "The service returned an error. Nothing was lost; try again.",
        };
    }
  }
  // fetch throws TypeError on network failure / offline / SW termination.
  if (e instanceof TypeError) {
    return {
      kind: "offline",
      title: "Cannot reach OpenQR.",
      body: "Check your connection. Static QR codes still work: they are generated on this device.",
    };
  }
  return {
    kind: "server",
    title: "Something went wrong.",
    body: e instanceof Error ? e.message : "Unexpected error.",
  };
}

/** Classify a persisted op error (the coordinator stores code/status/message). */
export function describeStoredError(err: OpError | undefined): UiError {
  if (!err) return { kind: "server", title: "Something went wrong.", body: "" };
  return describeApiError(
    new ApiError(err.status ?? 500, err.code ?? "http_error", err.message),
  );
}
