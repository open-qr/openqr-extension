import { KEYS } from "./store";
import type { StoragePort } from "./store";

/**
 * One-time rating ask, gated on real use: after the third value moment
 * (QR exported, or a dynamic/static code created), the popup shows a small
 * card once. Rating, dismissing, or ignoring until the next popup after the
 * gate trips: either way it never returns on this profile.
 */

export const STORE_REVIEW_URL =
  "https://chromewebstore.google.com/detail/openqr-qr-code-generator/kmmcpdncekphplapinbnonppddomjmdk/reviews";

export const VALUE_EVENTS_TO_ASK = 3;

export async function recordValueEvent(p: StoragePort): Promise<void> {
  const items = await p.local.get([KEYS.valueEvents, KEYS.reviewAsked]);
  if (items[KEYS.reviewAsked] === true) return;
  const count = typeof items[KEYS.valueEvents] === "number" ? (items[KEYS.valueEvents] as number) : 0;
  await p.local.set({ [KEYS.valueEvents]: count + 1 });
}

export async function markReviewAsked(p: StoragePort): Promise<void> {
  await p.local.set({ [KEYS.reviewAsked]: true });
}
