/**
 * server-sales-parser.ts — parses the POS "Server Sales Data" export.
 * Each server block = a summary row + a "Breakdown:" section (category
 * Name/Count/Discount/Total) + a "Payment Breakdown:" section (ignored).
 */

function splitCsvLine(line: string): string[] {
    const out: string[] = [];
    let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (inQ) {
            if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
            else cur += c;
        } else if (c === '"') inQ = true;
        else if (c === ",") { out.push(cur); cur = ""; }
        else cur += c;
    }
    out.push(cur);
    return out.map(s => s.trim());
}
const money = (s: string): number => {
    if (!s) return 0;
    const neg = /^\(.*\)$/.test(s.trim());
    const n = parseFloat(s.replace(/[()$,\s%]/g, ""));
    return Number.isFinite(n) ? (neg ? -Math.abs(n) : n) : 0;
};
function parseDT(s: string): Date | null {
    const m = s.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)/i);
    if (!m) return null;
    let h = +m[4]; const ap = m[7].toUpperCase();
    if (ap === "PM" && h < 12) h += 12;
    if (ap === "AM" && h === 12) h = 0;
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], h, +m[5], +m[6]));
}

/**
 * Map a POS "Breakdown:" category Name to a canonical bucket.
 *
 * POS exports vary in how they label categories (singular vs plural,
 * "Alcoholic Beverage(s)" vs "Liquor" / "Alcohol" / "Spirits", etc.), so we
 * match on robust, case-insensitive keywords rather than an exact string.
 *
 * ORDER MATTERS:
 *  - alcohol is tested BEFORE beverage because "Alcoholic Beverage" contains
 *    the word "beverage";
 *  - the non-alcoholic guard stops "Non-Alcoholic Beverage" (which contains the
 *    substring "alcohol") from being miscounted as liquor.
 *
 * Unknown labels fall through to "other" (kept out of the food/drink KPIs),
 * preserving the previous behaviour for genuinely unrecognised categories.
 */
export type BreakdownBucket = "food" | "beverage" | "alcohol" | "dessert" | "fees" | "other";
export function classifyBreakdownCategory(rawName: string): BreakdownBucket {
    const n = rawName.toLowerCase().trim();
    if (!n) return "other";
    if (/\bfees?\b|service charge|gratuit/.test(n)) return "fees";
    const nonAlcoholic = /non[-\s]?alcohol/.test(n);
    if (!nonAlcoholic && /alcohol|liquor|spirit|cocktail|\bwine\b|\bbeer\b|\bshots?\b|\bbar\b|sake|soju|whisky|whiskey|vodka|\brum\b|\bgin\b|tequila/.test(n)) return "alcohol";
    if (/dessert/.test(n)) return "dessert";
    if (/beverage|drink|\bsoda\b|juice|\btea\b|coffee|smoothie|mocktail/.test(n)) return "beverage";
    if (/food/.test(n)) return "food";
    return "other";
}

export interface ParsedServerRow {
    businessDate: string; staffName: string;
    shiftStart: string | null; shiftEnd: string | null; shiftHours: number;
    grossSales: number; discount: number; netSales: number;
    chargeTips: number; gratuity: number; serviceFees: number;
    avgPerGuest: number; avgPerOrder: number; guests: number; orders: number;
    foodSales: number; foodCount: number; beverageSales: number; beverageCount: number;
    alcoholSales: number; alcoholCount: number; dessertSales: number; dessertCount: number;
    otherSales: number;
}

export function detectServerSales(content: string): boolean {
    const head = content.slice(0, 400).toLowerCase();
    return head.includes("server sales data") || head.includes("average per guest");
}

export function parseServerSales(content: string): { rows: ParsedServerRow[]; date: string | null } {
    const lines = content.split(/\r?\n/);
    const rows: ParsedServerRow[] = [];
    let cur: ParsedServerRow | null = null;
    let mode: "none" | "breakdown" | "payment" = "none";
    let fileDate: string | null = null;

    const push = () => { if (cur) rows.push(cur); };

    for (const line of lines) {
        if (!line.trim()) continue;
        const c = splitCsvLine(line);
        const first = (c[0] ?? "").trim();
        const low = first.toLowerCase();

        if (low === "server sales data") continue;
        if (low === "from") continue;                       // summary header
        if (low === "breakdown:") { mode = "breakdown"; continue; }
        if (low === "payment breakdown:") { mode = "payment"; continue; }
        if (low === "name") continue;                       // breakdown header
        if (low === "payment method") continue;             // payment header

        // Summary row: starts with a datetime and has the full column set
        const start = parseDT(first);
        if (start && c.length >= 17) {
            push();
            const end = parseDT(c[1] ?? "");
            const hours = end && start ? Math.max(0, (end.getTime() - start.getTime()) / 3600000) : 0;
            const netSales = money(c[6]);
            const avgPerGuest = money(c[16]);
            const avgPerOrder = money(c[17]);
            const bd = start.toISOString().slice(0, 10);
            if (!fileDate) fileDate = bd;
            cur = {
                businessDate: bd, staffName: c[3] ?? "Unknown",
                shiftStart: start.toISOString(), shiftEnd: end ? end.toISOString() : null, shiftHours: Math.round(hours * 100) / 100,
                grossSales: money(c[4]), discount: Math.abs(money(c[5])), netSales,
                chargeTips: money(c[8]), gratuity: money(c[10]), serviceFees: money(c[9]),
                avgPerGuest, avgPerOrder,
                guests: avgPerGuest > 0 ? Math.round(netSales / avgPerGuest) : 0,
                orders: avgPerOrder > 0 ? Math.round(netSales / avgPerOrder) : 0,
                foodSales: 0, foodCount: 0, beverageSales: 0, beverageCount: 0,
                alcoholSales: 0, alcoholCount: 0, dessertSales: 0, dessertCount: 0, otherSales: 0,
            };
            mode = "none";
            continue;
        }

        // Breakdown category row: Name, Count, Discount, Total
        if (mode === "breakdown" && cur && c.length >= 4) {
            const count = parseInt(c[1]) || 0;
            const total = money(c[3]);
            switch (classifyBreakdownCategory(first)) {
                case "food":     cur.foodSales += total;     cur.foodCount += count;     break;
                case "beverage": cur.beverageSales += total; cur.beverageCount += count; break;
                case "alcohol":  cur.alcoholSales += total;  cur.alcoholCount += count;  break;
                case "dessert":  cur.dessertSales += total;  cur.dessertCount += count;  break;
                case "fees":     /* service fees, not product sales — skip */            break;
                default:         cur.otherSales += total;                                 break;
            }
        }
        // payment rows ignored
    }
    push();
    return { rows: rows.filter(r => r.staffName), date: fileDate };
}
