import type { NextRequest } from "next/server";
import { updateSession } from "./lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

/**
 * Do not match "/" here — the marketing home page must be served without running
 * this edge layer first (avoids rare Vercel/edge + auth quirks on the root URL).
 * Session refresh still runs on /login, /landing, and all app shells.
 */
export const config = {
  matcher: ["/login", "/landing", "/dashboard/:path*", "/settings/:path*"],
};
