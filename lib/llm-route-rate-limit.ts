import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

type Bucket = { count: number; resetAt: number };

const store = new Map<string, Bucket>();

/** Prune stale entries periodically to avoid unbounded growth (best-effort, in-memory). */
let pruneTick = 0;

function pruneStale(now: number) {
  pruneTick += 1;
  if (pruneTick % 80 !== 0) return;
  for (const [k, b] of store) {
    if (now > b.resetAt + 120_000) store.delete(k);
  }
}

function clientKey(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp?.trim()) return realIp.trim();
  return "unknown";
}

const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 20;

/**
 * Basic per-IP sliding window for LLM-backed routes (single Node instance).
 * Returns a 429 response when over limit, otherwise null.
 */
export function llmRouteRateLimitResponse(
  req: NextRequest,
  routeId: "parseorder" | "ingest-order"
): NextResponse | null {
  const now = Date.now();
  pruneStale(now);
  const key = `${routeId}:${clientKey(req)}`;
  let b = store.get(key);
  if (!b || now >= b.resetAt) {
    b = { count: 0, resetAt: now + WINDOW_MS };
    store.set(key, b);
  }
  b.count += 1;
  if (b.count > MAX_PER_WINDOW) {
    return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });
  }
  return null;
}
