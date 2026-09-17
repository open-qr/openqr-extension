#!/usr/bin/env node
/**
 * Fixture OpenQR API for e2e: a stateful stand-in for https://openqr.uk/v1
 * with idempotent creates, plan-cap and rate-limit injection, response
 * delays (to close surfaces mid-request) and a /_control surface for the
 * tests to steer it. CORS-open, like the real API.
 */
import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 8788);
const CAP = Number(process.env.CAP ?? 1);

const state = {
  codes: [],
  idem: new Map(), // idempotencyKey -> {status, body}
  control: { delayMs: 0, capEnforced: false, next429: false, dropResponse: false },
  stats: { dynamicCreates: 0, patches: 0, staticCreates: 0 },
  serial: 0,
};

const ME = {
  id: "u-fix",
  email: "fixture@example.com",
  name: null,
  created_at: "2026-09-17T00:00:00Z",
  plan: "free",
  enforced: true,
  limits: { dynamic_codes: CAP, scan_analytics_days: 7, detailed_analytics: false },
  usage: { active_dynamic: 0 },
  features: { protection: false, aliases: false, api: true },
};

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization,Content-Type,Idempotency-Key");
}

function json(res, status, body, extra = {}) {
  cors(res);
  for (const [k, v] of Object.entries(extra)) res.setHeader(k, v);
  res.statusCode = status;
  res.end(JSON.stringify(body));
}

function activeDynamic() {
  return state.codes.filter((c) => c.dynamic && c.status === "active").length;
}

function makeCode({ destination, label = null, dynamic = true, type = "url", payload = null }) {
  state.serial += 1;
  const slug = `fx${state.serial}`;
  const code = {
    id: `c${state.serial}`,
    type,
    dynamic,
    destination: dynamic ? destination : (payload ?? destination),
    label,
    status: "active",
    short_url: dynamic ? `https://oqr.to/${slug}` : null,
    created_at: new Date(Date.now() - state.serial * 60_000).toISOString(),
  };
  state.codes.unshift(code);
  ME.usage.active_dynamic = activeDynamic();
  return code;
}

async function body(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
  const path = url.pathname;

  if (req.method === "OPTIONS") {
    cors(res);
    res.statusCode = 204;
    return res.end();
  }

  if (path === "/_control" && req.method === "POST") {
    const c = await body(req);
    Object.assign(state.control, c.control ?? {});
    if (c.action === "reset") {
      state.codes = [];
      state.idem.clear();
      state.stats = { dynamicCreates: 0, patches: 0, staticCreates: 0 };
      ME.usage.active_dynamic = 0;
      Object.assign(state.control, { delayMs: 0, capEnforced: false, next429: false, dropResponse: false });
    }
    return json(res, 200, { ok: true });
  }
  if (path === "/_state" && req.method === "GET") {
    return json(res, 200, { codes: state.codes, stats: state.stats, me: ME });
  }

  const auth = req.headers.authorization ?? "";
  if (auth !== `Bearer ${process.env.FIXTURE_KEY ?? "oqr_fixturekeyfore2e1234567890XYZ"}`) {
    return json(res, 401, { error: "Unauthorized. Provide a Bearer API key.", code: "unauthorized" });
  }

  if (state.control.delayMs > 0 && (path === "/v1/dynamic" || path === "/v1/codes")) {
    await new Promise((r) => setTimeout(r, state.control.delayMs));
  }
  if (state.control.dropResponse && path === "/v1/dynamic" && req.method === "POST") {
    // Simulate a connection that dies after the server processed the request:
    // destroy the socket without a response, like a popup closing mid-flight
    // from the client's perspective.
    state.stats.dynamicCreates += 1;
    req.socket.destroy();
    return;
  }

  if (path === "/v1/me" && req.method === "GET") {
    return json(res, 200, ME);
  }

  if (path === "/v1/codes" && req.method === "GET") {
    return json(res, 200, { codes: state.codes });
  }

  if (path === "/v1/codes" && req.method === "POST") {
    const idem = req.headers["idempotency-key"];
    state.stats.staticCreates += 1;
    if (idem && state.idem.has(idem)) {
      const hit = state.idem.get(idem);
      return json(res, hit.status, hit.body, { "Idempotent-Replay": "true" });
    }
    const { type = "url", fields = {}, label = null } = await body(req);
    const payload =
      type === "wifi"
        ? `WIFI:T:WPA;S:${fields.ssid ?? ""};P:${fields.password ?? ""};;`
        : type === "text"
          ? String(fields.text ?? "")
          : String(fields.url ?? "");
    const code = makeCode({ destination: payload, label, dynamic: false, type, payload });
    const out = { id: code.id, type, payload: code.destination, label, next: null };
    if (idem) state.idem.set(idem, { status: 201, body: out });
    return json(res, 201, out, rateHeaders());
  }

  if (path === "/v1/dynamic" && req.method === "POST") {
    const idem = req.headers["idempotency-key"];
    if (idem && state.idem.has(idem)) {
      const hit = state.idem.get(idem);
      return json(res, hit.status, hit.body, { "Idempotent-Replay": "true" });
    }
    if (state.control.next429) {
      state.control.next429 = false;
      return json(res, 429, { error: "Rate limit exceeded. Slow down.", code: "rate_limited" }, { "Retry-After": "60" });
    }
    state.stats.dynamicCreates += 1;
    if (state.control.capEnforced || activeDynamic() >= CAP) {
      return json(res, 403, {
        error: "You have reached the limit on the Free plan for active dynamic codes.",
        code: "plan_limit_exceeded",
      });
    }
    const { destination, label = null } = await body(req);
    const code = makeCode({ destination, label });
    const out = { id: code.id, slug: code.id.replace("c", "fx"), short_url: code.short_url, destination, label };
    if (idem) state.idem.set(idem, { status: 201, body: out });
    return json(res, 201, out, rateHeaders());
  }

  const patch = /^\/v1\/dynamic\/([^/]+)$/.exec(path);
  if (patch && req.method === "PATCH") {
    state.stats.patches += 1;
    const code = state.codes.find((c) => c.id === patch[1]);
    if (!code) return json(res, 404, { error: "Not found", code: "not_found" });
    const b = await body(req);
    if (typeof b.destination === "string") code.destination = b.destination;
    if (b.status === "active" || b.status === "paused") code.status = b.status;
    ME.usage.active_dynamic = activeDynamic();
    return json(res, 200, {
      id: code.id,
      slug: code.id.replace("c", "fx"),
      short_url: code.short_url,
      destination: code.destination,
      label: code.label,
      status: code.status,
    });
  }

  const scans = /^\/v1\/dynamic\/([^/]+)\/scans$/.exec(path);
  if (scans && req.method === "GET") {
    const code = state.codes.find((c) => c.id === scans[1]);
    if (!code) return json(res, 404, { error: "Not found", code: "not_found" });
    const days = Math.min(Number(url.searchParams.get("days") ?? 30), ME.limits.scan_analytics_days);
    return json(res, 200, {
      id: code.id,
      slug: code.id,
      short_url: code.short_url,
      destination: code.destination,
      scans: { total: 42, last7: 9, topCountry: "GB", topDevice: null },
      analytics: {
        days_window: days,
        total: 42,
        window_total: 12,
        daily: Array.from({ length: days }, (_, i) => ({ day: `2026-09-${String(i + 1).padStart(2, "0")}`, n: i % 3 })),
        by_country: [{ value: "GB", n: 40 }, { value: "US", n: 2 }],
      },
    });
  }

  json(res, 404, { error: `No fixture route ${req.method} ${path}`, code: "not_found" });
});

function rateHeaders() {
  return {
    "X-RateLimit-Limit": "300",
    "X-RateLimit-Remaining": "299",
    "X-RateLimit-Reset": String(Math.floor(Date.now() / 1000) + 3600),
  };
}

server.listen(PORT, "127.0.0.1", () => console.log(`fixture api on http://127.0.0.1:${PORT}`));
