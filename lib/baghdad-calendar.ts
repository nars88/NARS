/**
 * Calendar-day bounds in Asia/Baghdad (UTC+3, no DST) as UTC Date instants
 * for Prisma @db.Timestamptz comparisons.
 */
const BAGHDAD_TZ = "Asia/Baghdad";

export function isSameBaghdadCalendarDay(isoDate: string, ref: Date = new Date()): boolean {
  const a = baghdadYmdParts(new Date(isoDate));
  const b = baghdadYmdParts(ref);
  return a.y === b.y && a.m === b.m && a.d === b.d;
}

function baghdadYmdParts(ref: Date): { y: string; m: string; d: string } {
  /** sv-SE يعطي YYYY-MM-DD بشكل ثابت مع timeZone */
  const s = new Intl.DateTimeFormat("sv-SE", {
    timeZone: BAGHDAD_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ref);
  const [y, m, d] = s.split("-");
  if (!y || !m || !d) {
    return { y: "1970", m: "01", d: "01" };
  }
  return { y, m, d };
}

/** Start of the Baghdad calendar day containing `ref` (inclusive). */
export function baghdadStartOfDayContaining(ref: Date): Date {
  const { y, m, d } = baghdadYmdParts(ref);
  return new Date(`${y}-${m}-${d}T00:00:00+03:00`);
}

/** Start of the next Baghdad calendar day after `baghdadDayStart` (exclusive upper bound for "today"). */
export function baghdadAddLocalDays(baghdadDayStart: Date, days: number): Date {
  return new Date(baghdadDayStart.getTime() + days * 24 * 60 * 60 * 1000);
}
