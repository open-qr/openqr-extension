import { describe, expect, it } from "vitest";
import { fakePort } from "./fake-port";
import { KEYS } from "@/lib/store";
import { markReviewAsked, recordValueEvent, VALUE_EVENTS_TO_ASK } from "@/lib/review";

describe("review gate", () => {
  it("counts value events until the gate, then stops after being asked", async () => {
    const port = fakePort();
    for (let i = 1; i < VALUE_EVENTS_TO_ASK; i++) {
      await recordValueEvent(port);
      expect(await port.local.get([KEYS.valueEvents])).toEqual({ [KEYS.valueEvents]: i });
    }
    await markReviewAsked(port);
    await recordValueEvent(port);
    // Asked flag freezes the counter for good.
    expect(await port.local.get([KEYS.valueEvents])).toEqual({ [KEYS.valueEvents]: VALUE_EVENTS_TO_ASK - 1 });
  });

  it("is not account-scoped: disconnect-style clears leave the counters alone", async () => {
    const port = fakePort();
    await recordValueEvent(port);
    // account.disconnect removes a fixed key list; the review keys survive it.
    await port.local.remove([KEYS.apiKey, KEYS.account, KEYS.codesCache, KEYS.ops]);
    expect(await port.local.get([KEYS.valueEvents])).toEqual({ [KEYS.valueEvents]: 1 });
  });
});
