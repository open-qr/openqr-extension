import { chromePort, openTab, useStorageValue } from "@/lib/hooks";
import { markReviewAsked, STORE_REVIEW_URL, VALUE_EVENTS_TO_ASK } from "@/lib/review";
import { KEYS } from "@/lib/store";

/**
 * The one-time rating ask. Renders nothing until the value gate trips
 * (third export or created code) and never again after any interaction.
 */
export function ReviewAsk() {
  const valueEvents = useStorageValue<number>(KEYS.valueEvents, 0);
  const reviewAsked = useStorageValue<boolean>(KEYS.reviewAsked, false);
  if (reviewAsked || valueEvents < VALUE_EVENTS_TO_ASK) return null;

  const done = () => void markReviewAsked(chromePort());

  return (
    <section className="card space-y-2 p-4">
      <p className="text-sm">Making QR codes with this yet? A rating helps other people find OpenQR.</p>
      <div className="flex gap-2">
        <button
          type="button"
          className="btn btn-primary px-3 py-1.5 text-xs"
          onClick={() => {
            done();
            openTab(STORE_REVIEW_URL);
          }}
        >
          Rate OpenQR
        </button>
        <button type="button" className="btn btn-ghost px-3 py-1.5 text-xs" onClick={done}>
          Not now
        </button>
      </div>
    </section>
  );
}
