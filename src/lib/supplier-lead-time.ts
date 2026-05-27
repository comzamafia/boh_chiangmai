/**
 * Lead-time calculator driven by a supplier's delivery schedule.
 *
 * Concepts
 * ────────
 *  deliveryDays         — ISO weekdays the supplier delivers (1=Mon … 7=Sun)
 *  orderCutoffTime      — "HH:MM" 24h time by which an order must be placed
 *  orderCutoffDayOffset — how many days BEFORE a delivery the cutoff applies
 *                         (0 = cutoff is on the delivery day itself,
 *                          1 = cutoff is the day before — the common case)
 *
 * Three numbers come out of this:
 *   effectiveLeadDays  — calendar days from `from` until the next delivery you
 *                        can still book. Use this when displaying "next ETA".
 *   worstCaseLeadDays  — longest possible wait, i.e. just-missed-the-cutoff
 *                        scenario plus longest gap between consecutive
 *                        delivery days. Use this for PAR Min / ROP safety
 *                        stock so you never run out.
 *   nextDeliveryDate   — Date object for the next delivery
 *   nextOrderBy        — Date+time by which the order must be placed to
 *                        catch nextDeliveryDate
 */

export interface SupplierScheduleLike {
    deliveryDays:         number[];         // ISO 1..7
    orderCutoffTime:      string | null;    // "HH:MM"
    orderCutoffDayOffset: number;           // typically 0 or 1
    leadTimeFallback?:    number;           // when no schedule, use this
}

export interface LeadTimeResult {
    effectiveLeadDays:  number;
    worstCaseLeadDays:  number;
    nextDeliveryDate:   Date  | null;
    nextOrderBy:        Date  | null;
    /** True when the supplier has no usable schedule (deliveryDays empty). */
    fallback:           boolean;
}

/** ISO weekday: 1 (Mon) … 7 (Sun). JS Date.getDay() returns 0 (Sun)..6 (Sat). */
function isoWeekday(d: Date): number {
    const js = d.getDay();
    return js === 0 ? 7 : js;
}

/** Parse "HH:MM" → minutes-since-midnight. Returns null if blank/malformed. */
function parseHHMM(s: string | null | undefined): number | null {
    if (!s) return null;
    const m = /^(\d{1,2}):(\d{2})$/.exec(s);
    if (!m) return null;
    const h = Number(m[1]); const min = Number(m[2]);
    if (h < 0 || h > 23 || min < 0 || min > 59) return null;
    return h * 60 + min;
}

/** Add `days` whole days to a date (no time mutation). */
function addDays(d: Date, days: number): Date {
    const r = new Date(d);
    r.setDate(r.getDate() + days);
    return r;
}

/** Return Date with time set to HH:MM on the same calendar day. */
function withTime(d: Date, minutesOfDay: number): Date {
    const r = new Date(d);
    r.setHours(Math.floor(minutesOfDay / 60), minutesOfDay % 60, 0, 0);
    return r;
}

/** Longest run of consecutive missing days in a sorted weekday set (1..7). */
function longestGap(days: number[]): number {
    if (days.length === 0) return 7;
    if (days.length >= 7)  return 1;
    const set = new Set(days);
    let longest = 0;
    for (let start = 1; start <= 7; start++) {
        if (!set.has(start)) continue;
        // walk forward day by day until we find the next delivery day
        let cursor = start;
        for (let step = 1; step <= 7; step++) {
            cursor = cursor === 7 ? 1 : cursor + 1;
            if (set.has(cursor)) {
                if (step > longest) longest = step;
                break;
            }
        }
    }
    return longest;
}

export function calculateLeadTime(
    sched: SupplierScheduleLike,
    from: Date = new Date(),
): LeadTimeResult {
    // No schedule data — fall back to a flat lead time
    if (!sched.deliveryDays || sched.deliveryDays.length === 0) {
        const flat = Math.max(1, sched.leadTimeFallback ?? 1);
        return {
            effectiveLeadDays: flat,
            worstCaseLeadDays: flat,
            nextDeliveryDate:  null,
            nextOrderBy:       null,
            fallback:          true,
        };
    }

    const deliveryDays = [...new Set(sched.deliveryDays)].filter(d => d >= 1 && d <= 7).sort();
    const cutoffMin    = parseHHMM(sched.orderCutoffTime) ?? 17 * 60; // default 17:00
    const offset       = Math.max(0, sched.orderCutoffDayOffset ?? 1);

    // Search forward up to 14 days for the next delivery whose cutoff is still in the future.
    let nextDelivery: Date | null = null;
    let nextOrderBy: Date | null = null;
    for (let step = 0; step <= 14; step++) {
        const candidate = addDays(from, step);
        if (!deliveryDays.includes(isoWeekday(candidate))) continue;
        const orderBy = withTime(addDays(candidate, -offset), cutoffMin);
        if (orderBy >= from) {
            nextDelivery = candidate;
            nextOrderBy  = orderBy;
            break;
        }
    }

    if (!nextDelivery || !nextOrderBy) {
        // Shouldn't happen unless cutoff offset > 14 days
        const flat = Math.max(1, sched.leadTimeFallback ?? 7);
        return {
            effectiveLeadDays: flat,
            worstCaseLeadDays: flat,
            nextDeliveryDate:  null,
            nextOrderBy:       null,
            fallback:          true,
        };
    }

    // Round effective lead in whole days, anchored to start-of-day
    const startToday      = withTime(from,         0);
    const startDelivery   = withTime(nextDelivery, 0);
    const effectiveLeadMs = startDelivery.getTime() - startToday.getTime();
    const effectiveLeadDays = Math.max(0, Math.round(effectiveLeadMs / 86_400_000));

    // Worst-case = longest gap in delivery schedule + the cutoff offset
    // (just-missed-cutoff means waiting longestGap days for the next slot)
    const worstCaseLeadDays = Math.max(1, longestGap(deliveryDays) + offset);

    return {
        effectiveLeadDays,
        worstCaseLeadDays,
        nextDeliveryDate: nextDelivery,
        nextOrderBy,
        fallback: false,
    };
}

/** ISO weekday → 3-letter English label */
export const WEEKDAY_SHORT: Record<number, string> = {
    1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat", 7: "Sun",
};

/** Format a deliveryDays array for display: [1,3,5] → "Mon, Wed, Fri" */
export function formatDeliveryDays(days: number[]): string {
    if (!days || days.length === 0) return "—";
    if (days.length === 7)          return "Every day";
    return [...new Set(days)].sort().map(d => WEEKDAY_SHORT[d] ?? d).join(", ");
}
