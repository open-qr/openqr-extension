import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";

const apiClient = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/api")>();
  return { ...real, apiClient };
});

const { markStaleOps, refreshCache, runOp, submitOp, STALE_SENT_MS } = await import("@/lib/coordinator");
const { store } = await import("@/lib/store");

import { fakePort } from "./fake-port";
import type { OpRecord } from "@/lib/types";

const ME = {
  id: "u1",
  email: "test@example.com",
  name: null,
  created_at: "2026-01-01T00:00:00Z",
};

async function connectedPort() {
  const port = fakePort();
  await store.account.connect(port, "oqr_" + "a".repeat(40), ME);
  const gen = (await store.account.get(port))!.sessionGen;
  return { port, gen };
}

const noopSend = async () => ({});

describe("coordinator", () => {
  beforeEach(() => {
    apiClient.mockReset();
  });

  it("create_dynamic: pending to sent to done, cache refreshed, result stamped", async () => {
    const { port, gen } = await connectedPort();
    const createDynamic = vi.fn().mockResolvedValue({
      data: { id: "c1", slug: "spring-menu", short_url: "https://oqr.to/spring-menu", destination: "https://example.com" },
      meta: { remaining: 299 },
    });
    const listCodes = vi.fn().mockResolvedValue({ data: { codes: [] }, meta: {} });
    apiClient.mockReturnValue({ createDynamic, listCodes });

    const op = await submitOp(port, noopSend, "create_dynamic", { destination: "https://example.com" }, gen);
    expect(op.idempotencyKey).toMatch(/^openqr-ext-/);
    await runOp(port, op.opId);

    const done = (await store.ops.get(port))?.[op.opId] as OpRecord;
    expect(done.state).toBe("done");
    expect(done.result?.short_url).toBe("https://oqr.to/spring-menu");
    expect((done.result?._meta as { remaining: number }).remaining).toBe(299);
    expect(createDynamic).toHaveBeenCalledWith(expect.anything(), op.idempotencyKey);
    const cache = await store.codesCache.get(port);
    expect(cache?.gen).toBe(gen);
  });

  it("network failure lands in uncertain, never auto-retried, and Check replays the same key", async () => {
    const { port, gen } = await connectedPort();
    let attempts = 0;
    const createDynamic = vi.fn().mockImplementation(async () => {
      attempts += 1;
      if (attempts === 1) throw new TypeError("network gone");
      return { data: { id: "c1", slug: "s", short_url: "https://oqr.to/s", destination: "d" }, meta: {} };
    });
    const listCodes = vi.fn().mockResolvedValue({ data: { codes: [] }, meta: {} });
    apiClient.mockReturnValue({ createDynamic, listCodes });

    const op = await submitOp(port, noopSend, "create_dynamic", { destination: "https://example.com" }, gen);
    await runOp(port, op.opId);
    expect((await store.ops.get(port))?.[op.opId]?.state).toBe("uncertain");

    await runOp(port, op.opId);
    const done = (await store.ops.get(port))?.[op.opId] as OpRecord;
    expect(done.state).toBe("done");
    expect(createDynamic).toHaveBeenCalledTimes(2);
    expect(createDynamic).toHaveBeenNthCalledWith(2, expect.anything(), op.idempotencyKey);
  });

  it("definite API failure lands in failed with the machine code and is not re-run", async () => {
    const { port, gen } = await connectedPort();
    const err = new ApiError(403, "plan_limit_exceeded", "You are over the limit", {});
    const createDynamic = vi.fn().mockRejectedValue(err);
    apiClient.mockReturnValue({ createDynamic, listCodes: vi.fn() });

    const op = await submitOp(port, noopSend, "create_dynamic", { destination: "https://example.com" }, gen);
    await runOp(port, op.opId);
    const failed = (await store.ops.get(port))?.[op.opId] as OpRecord;
    expect(failed.state).toBe("failed");
    expect(failed.error?.code).toBe("plan_limit_exceeded");
    await runOp(port, op.opId);
    expect(createDynamic).toHaveBeenCalledTimes(1);
  });

  it("disconnect clears the key, account, cache and every pending op", async () => {
    const { port, gen } = await connectedPort();
    const op = await submitOp(port, noopSend, "create_static", { type: "text", fields: { text: "hi" } }, gen);
    await store.account.disconnect(port);
    expect(await store.ops.get(port)).toBeUndefined(); // pending work does not survive
    expect(await store.apiKey.get(port)).toBeUndefined();
    expect(await store.codesCache.get(port)).toBeUndefined();
    // running a voided op is a no-op, not a crash
    await expect(runOp(port, op.opId)).resolves.toBeUndefined();
  });

  it("stale sent ops are promoted to uncertain", async () => {
    const { port, gen } = await connectedPort();
    const stale: OpRecord = {
      opId: "op-stale",
      kind: "create_dynamic",
      gen,
      input: { destination: "https://example.com" },
      idempotencyKey: "openqr-ext-stale",
      state: "sent",
      createdAt: Date.now() - STALE_SENT_MS - 5_000,
      updatedAt: Date.now() - STALE_SENT_MS - 5_000,
    };
    await store.ops.put(port, stale);
    await markStaleOps(port);
    expect((await store.ops.get(port))?.["op-stale"]?.state).toBe("uncertain");
  });

  it("refreshCache failure keeps items and marks the cache stale", async () => {
    const { port, gen } = await connectedPort();
    await store.codesCache.write(port, gen, [
      { id: "a", type: "url", dynamic: false, destination: "https://x", label: null, status: "active", short_url: null, created_at: "2026-01-01" },
    ]);
    apiClient.mockReturnValue({ listCodes: vi.fn().mockRejectedValue(new TypeError("offline")) });
    await refreshCache(port);
    const cache = await store.codesCache.get(port);
    expect(cache?.items).toHaveLength(1);
    expect(cache?.stale).toBe(true);
  });

  it("ops written under an old session gen are voided, not run", async () => {
    const { port, gen } = await connectedPort();
    await store.account.connect(port, "oqr_" + "b".repeat(40), ME); // reconnect: new gen
    const op = await submitOp(port, noopSend, "create_dynamic", { destination: "https://example.com" }, gen);
    await runOp(port, op.opId);
    expect((await store.ops.get(port))?.[op.opId]?.state).toBe("failed");
  });
});
