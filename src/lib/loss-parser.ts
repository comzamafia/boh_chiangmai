/**
 * loss-parser.ts — parsers + business logic for the Loss Management feature.
 * Handles the two real POS exports:
 *   loss-management_YYYY-MM-DD.csv  (3 metadata header rows, Complaint/Undo)
 *   discounts_YYYY-MM-DD.csv        (mixed Summary + Logs blocks)
 */

// ── CSV helpers ──────────────────────────────────────────────────────────────
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
    const neg = /^\(.*\)$/.test(s.trim());
    const n = parseFloat(s.replace(/[()$,\s]/g, ""));
    return Number.isFinite(n) ? (neg ? Math.abs(n) : n) : 0;
};

// ── Classifiers / lookups ────────────────────────────────────────────────────
const GENERIC_ITEMS = new Set(["food", "drink", "item", "items", "misc", "n/a", "na", "-", ""]);
const UNASSIGNED_USERS = new Set(["bar bar", "host pos", "bar", "host"]);

export const REASON_MAP: { match: string[]; category: string }[] = [
    { match: ["entry error", "entry mistake", "double punch", "double tap"],                 category: "Entry Error" },
    { match: ["changed mind", "customer confused", "just one", "didn't get it", "didn’t get it", "didnt get it"], category: "Customer Changed Mind" },
    { match: ["not in stock", "run out", "sold out", "no make", "out of stock"],             category: "Out of Stock" },
    { match: ["too salty", "salty", "too spicy", "no egg", "got egg", "supposed to be", "instead"], category: "Food Quality / Wrong Order" },
    { match: ["server mistake", "wrong drink", "wrong order"],                                category: "Server Mistake" },
    { match: ["don't like", "don’t like", "dont like", "did not like", "didn't like"],        category: "Customer Dissatisfied" },
    { match: ["spilled", "spill"],                                                            category: "Spillage / Accident" },
    { match: ["manager special", "offer for complaint", "manager courtesy", "comp"],          category: "Manager Courtesy" },
    { match: ["tap water"],                                                                   category: "Order Modification" },
];
function normalizeReason(raw: string): string {
    const r = raw.toLowerCase().trim();
    if (!r) return "Unspecified";
    for (const m of REASON_MAP) if (m.match.some(k => r.includes(k))) return m.category;
    return "Uncategorized";
}

/** Normalise using a custom keyword→category list (DB-editable), falling back to defaults. */
export function normalizeWithMap(raw: string, map: { keyword: string; category: string }[]): string {
    const r = raw.toLowerCase().trim();
    if (!r) return "Unspecified";
    for (const m of map) { const k = m.keyword.toLowerCase().trim(); if (k && r.includes(k)) return m.category; }
    return normalizeReason(raw);
}

/** Default map flattened to keyword rows (used to seed the editable table). */
export function defaultReasonRows(): { keyword: string; category: string }[] {
    return REASON_MAP.flatMap(m => m.match.map(keyword => ({ keyword, category: m.category })));
}
function zoneOf(table: string): string {
    const t = table.trim().toUpperCase();
    if (t === "104") return "VIP";
    if (t.startsWith("B")) return "Bar / Booth";
    if (t.startsWith("L")) return "Lounge / Patio";
    if (t.startsWith("R")) return "Reserved";
    return "Main";
}
const isGeneric = (item: string) => GENERIC_ITEMS.has(item.toLowerCase().trim()) || item.trim().length < 3;
const isUnassigned = (user: string) => UNASSIGNED_USERS.has(user.toLowerCase().trim());
const isAnonAuth = (by: string) => UNASSIGNED_USERS.has(by.toLowerCase().trim()) || by.toLowerCase().trim() === "host";

// ── Types ────────────────────────────────────────────────────────────────────
export interface ParsedComplaint {
    businessDate: string; tableNumber: string; zone: string; orderId: string;
    userName: string; isUnassignedUser: boolean; actionType: string;
    grossAmount: number; netAmount: number; isUndoReconciled: boolean;
    itemDetail: string; isGenericItem: boolean; reasonRaw: string; reasonCategory: string; device: string;
}
export interface ParsedDiscount {
    businessDate: string; createTime: string | null; displayId: string; discountName: string;
    discountCategory: string; discountAmount: number; itemCount: number; authorizedBy: string;
    isAnonymousAuth: boolean; riskLevel: string; isBulkDiscount: boolean;
}

export function detectFileType(content: string): "loss" | "discount" | null {
    const head = content.slice(0, 600).toLowerCase();
    if (head.includes("item complaint data") || head.includes("action date")) return "loss";
    if (head.includes("discount data") || head.includes("discount amount")) return "discount";
    return null;
}

// ── loss-management.csv ───────────────────────────────────────────────────────
export function parseLossManagement(content: string): { rows: ParsedComplaint[]; errors: string[]; date: string | null } {
    const lines = content.split(/\r?\n/);
    const errors: string[] = [];
    const hi = lines.findIndex(l => splitCsvLine(l)[0]?.toLowerCase() === "action date");
    if (hi === -1) return { rows: [], errors: ["Header row 'Action Date' not found"], date: null };

    const raw: ParsedComplaint[] = [];
    let date: string | null = null;
    for (let i = hi + 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const c = splitCsvLine(lines[i]);
        if (c.length < 9) continue;
        const [actionDate, table, orderId, user, action, amount, item, reason, device] = c;
        if (action !== "Complaint" && action !== "Undo") { errors.push(`Row ${i + 1}: invalid Action "${action}" (quarantined)`); continue; }
        if (!date) date = actionDate;
        raw.push({
            businessDate: actionDate, tableNumber: table, zone: zoneOf(table), orderId,
            userName: user, isUnassignedUser: isUnassigned(user), actionType: action,
            grossAmount: money(amount), netAmount: money(amount), isUndoReconciled: false,
            itemDetail: item, isGenericItem: isGeneric(item), reasonRaw: reason, reasonCategory: normalizeReason(reason), device,
        });
    }

    // Undo reconciliation: match Undo → Complaint by orderId + itemDetail + amount
    const key = (r: ParsedComplaint) => `${r.orderId}|||${r.itemDetail.toLowerCase().trim()}|||${r.grossAmount.toFixed(2)}`;
    const undoCount = new Map<string, number>();
    for (const r of raw) if (r.actionType === "Undo") undoCount.set(key(r), (undoCount.get(key(r)) ?? 0) + 1);
    for (const r of raw) {
        if (r.actionType !== "Complaint") continue;
        const k = key(r);
        if ((undoCount.get(k) ?? 0) > 0) { r.netAmount = 0; r.isUndoReconciled = true; undoCount.set(k, undoCount.get(k)! - 1); }
    }
    return { rows: raw, errors, date };
}

// ── discounts.csv (mixed Summary + Logs) ─────────────────────────────────────
function parseCreateTime(s: string): string | null {
    // "Jun 6, 2026, 6:11:23 PM" → drop the comma after the year so Date can parse it
    const cleaned = s.replace(/(\d{4}),/, "$1");
    const d = new Date(cleaned);
    return isNaN(d.getTime()) ? null : d.toISOString();
}
const CATEGORY_OF: Record<string, string> = { "order discount": "Order", "item discount": "Item", "promotion item discount": "Promotion" };

export function parseDiscounts(content: string): { rows: ParsedDiscount[]; date: string | null } {
    const lines = content.split(/\r?\n/);
    const rows: ParsedDiscount[] = [];
    let curName = "", curCat = "", date: string | null = null;
    let inLogs = false;

    for (const line of lines) {
        if (!line.trim()) { inLogs = false; continue; }
        const c = splitCsvLine(line);
        const first = (c[0] ?? "").trim();

        if (first.toLowerCase() === "logs") { inLogs = true; continue; }
        if (first.toLowerCase() === "display id") continue;       // logs header
        if (first.toLowerCase() === "date" || first.toLowerCase() === "discount data") continue;

        // Summary row: date, name, type, amount, count
        if (/^\d{4}-\d{2}-\d{2}$/.test(first) && c.length >= 5 && CATEGORY_OF[(c[2] ?? "").toLowerCase().trim()]) {
            if (!date) date = first;
            curName = c[1]; curCat = CATEGORY_OF[c[2].toLowerCase().trim()];
            inLogs = false;
            continue;
        }

        // Log row (within a Logs block): displayId, createTime, amount, count, authorizedBy
        if (inLogs && c.length >= 5 && curName) {
            const [displayId, createTime, amount, count, by] = c;
            const amt = money(amount);
            const iso = parseCreateTime(createTime);
            const hour = iso ? new Date(iso).getHours() : -1;
            const anon = isAnonAuth(by);
            const isManager100 = /manager\s*100%/i.test(curName);
            const isCustom = /custom discount/i.test(curName);
            let risk: string = "LOW";
            if ((isManager100 && anon) || (isCustom && anon) || amt >= 50 || hour >= 22) risk = "HIGH";
            else if (anon || (amt >= 25 && amt < 50)) risk = "MEDIUM";
            rows.push({
                businessDate: date ?? first, createTime: iso, displayId, discountName: curName,
                discountCategory: curCat, discountAmount: amt, itemCount: parseInt(count) || 1,
                authorizedBy: by, isAnonymousAuth: anon, riskLevel: risk, isBulkDiscount: false,
            });
        }
    }

    // Bulk discount: >10 Item-discount log lines sharing the same displayId + createTime
    const grp = new Map<string, ParsedDiscount[]>();
    for (const r of rows) if (r.discountCategory === "Item") {
        const k = `${r.displayId}|||${r.createTime}`;
        (grp.get(k) ?? grp.set(k, []).get(k)!).push(r);
    }
    for (const arr of grp.values()) if (arr.length > 10) arr.forEach(r => { r.isBulkDiscount = true; });

    return { rows, date };
}
