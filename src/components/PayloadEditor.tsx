import { useState } from "react";
import { PAYLOAD_TYPES, payloadTypeMeta } from "@/lib/payloads";
import type { FieldValues, PayloadType } from "@/lib/types";

/**
 * Payload editor: a single destination field by default, with the other
 * eight content types under "More types". value/fields are owned by the
 * parent (the draft); this component only edits them.
 */
export function PayloadEditor({
  type,
  fields,
  onChange,
}: {
  type: PayloadType;
  fields: FieldValues;
  onChange: (next: { type: PayloadType; fields: FieldValues }) => void;
}) {
  const [showMore, setShowMore] = useState(false);
  const meta = payloadTypeMeta(type);

  const set = (name: string, v: string | boolean) =>
    onChange({ type, fields: { ...fields, [name]: v } });

  const switchType = (t: PayloadType) =>
    onChange({ type: t, fields: t === "url" ? { url: String(fields.url ?? "") } : {} });

  const isSingle = type === "url" || type === "text";

  return (
    <div className="space-y-3">
      {isSingle ? (
        type === "url" ? (
          <input
            className="input font-mono text-[13px]"
            placeholder="https://example.com"
            value={String(fields.url ?? "")}
            autoFocus
            spellCheck={false}
            onChange={(e) => set("url", e.target.value)}
          />
        ) : (
          <textarea
            className="input min-h-20 resize-y"
            placeholder="Any text: a code, a note, a message"
            value={String(fields.text ?? "")}
            onChange={(e) => set("text", e.target.value)}
          />
        )
      ) : (
        <div className="space-y-2.5">
          {meta?.fields.map((f) => (
            <label key={f.name} className="block space-y-1">
              <span className="label">
                {f.label}
                {f.required ? <span className="text-destructive"> *</span> : null}
              </span>
              {f.type === "textarea" ? (
                <textarea
                  className="input min-h-16 resize-y"
                  placeholder={f.placeholder}
                  value={String(fields[f.name] ?? "")}
                  onChange={(e) => set(f.name, e.target.value)}
                />
              ) : f.type === "select" ? (
                <select
                  className="input"
                  value={String(fields[f.name] ?? f.options?.[0]?.value ?? "")}
                  onChange={(e) => set(f.name, e.target.value)}
                >
                  {f.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : f.type === "checkbox" ? (
                <span className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--primary)]"
                    checked={fields[f.name] === true}
                    onChange={(e) => set(f.name, e.target.checked)}
                  />
                  <span className="text-sm">{f.label}</span>
                </span>
              ) : (
                <input
                  className="input"
                  type={f.type === "tel" ? "tel" : "text"}
                  placeholder={f.placeholder}
                  value={String(fields[f.name] ?? "")}
                  onChange={(e) => set(f.name, e.target.value)}
                />
              )}
            </label>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          className={chipCls(type === "url")}
          onClick={() => switchType("url")}
        >
          URL
        </button>
        <button
          type="button"
          className={chipCls(showMore)}
          onClick={() => setShowMore((v) => !v)}
        >
          More types
        </button>
      </div>
      {showMore && (
        <div className="flex flex-wrap gap-1.5">
          {PAYLOAD_TYPES.filter((t) => t.id !== "url").map((t) => (
            <button
              key={t.id}
              type="button"
              className={chipCls(type === t.id)}
              onClick={() => switchType(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function chipCls(active: boolean): string {
  return `badge cursor-pointer border px-2.5 py-1 ${
    active ? "border-primary bg-accent text-fg" : "border-border bg-card text-muted-fg hover:bg-muted"
  }`;
}
