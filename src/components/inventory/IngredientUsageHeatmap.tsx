"use client";
/**
 * IngredientUsageHeatmap — fully responsive
 *
 * Mobile  (< md): one card per ingredient — name, 7-day heat strip, summary row
 * Desktop (≥ md): full table with all columns
 *
 * Shared columns: daily qty heatmap | Total | Avg/d
 * Optional (when any row has inventory data):  📦 Bal (Ct−Sld) | 🛒 Order
 */

import type { IngredientTrendRow } from "@/lib/api";

// ─── Constants ───────────────────────────────────────────────────────────────
const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DOW_2     = ["Su",  "Mo",  "Tu",  "We",  "Th",  "Fr",  "Sa"];

const HEAT: [string, string][] = [
    ["bg-red-50  dark:bg-red-950/20", "text-red-400  dark:text-red-600"],
    ["bg-red-100 dark:bg-red-950/40", "text-red-600  dark:text-red-400"],
    ["bg-red-200 dark:bg-red-900/60", "text-red-700  dark:text-red-300"],
    ["bg-red-300 dark:bg-red-800/70", "text-red-800  dark:text-red-200"],
    ["bg-red-400 dark:bg-red-700/80", "text-white    dark:text-red-100"],
    ["bg-red-500 dark:bg-red-600",    "text-white    dark:text-white"],
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function heat(val: number, peak: number) {
    if (!val || !peak) return { bg: "", txt: "text-muted-foreground/20" };
    const i = Math.min(HEAT.length - 1, Math.floor((val / peak) * HEAT.length));
    return { bg: HEAT[i][0], txt: HEAT[i][1] };
}

function isWeekend(iso: string) {
    const d = new Date(iso + "T00:00:00").getDay();
    return d === 0 || d === 6;
}

function fmt(n: number) {
    return n % 1 === 0 ? String(n) : n.toFixed(2);
}

// Compute balance + order action for a row. Returns null only when the row
// has no inventory data at all (currentStock undefined — e.g. the inventory-
// transaction-based trend doesn't supply stock fields).
// When currentStock is 0 (no InventoryItem exists yet), we STILL return the
// computation so the UI shows Bal = 0 − sold and Order = +sold, flagging the
// shortage and prompting the user to set up tracking.
function flowAction(row: IngredientTrendRow, lastDateIdx: number) {
    if (row.currentStock == null) return null;
    const lastSold  = row.byDate[lastDateIdx] ?? 0;
    const balance   = row.currentStock - lastSold;
    const parMin    = row.parMin ?? 0;
    const orderQty  = parMin - balance;
    const tracked   = row.inventoryTracked !== false; // default true when omitted
    return { balance, lastSold, parMin, orderQty, tracked };
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
    dates:   string[];
    items:   IngredientTrendRow[];
    days:    number;
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function IngredientUsageHeatmap({ dates, items, days }: Props) {
    if (!items.length) return (
        <p className="text-sm text-muted-foreground py-8 text-center">
            No transactions found in the last {days} days.
        </p>
    );

    const hasInventory = items.some(r => r.currentStock != null);
    const lastDateIdx  = dates.length - 1;

    // ── Shared: balance status colour ────────────────────────────────────────
    function balColour(balance: number, parMin: number) {
        if (balance < 0)        return "text-red-600 dark:text-red-400";
        if (balance < parMin)   return "text-orange-600 dark:text-orange-400";
        return "text-emerald-600 dark:text-emerald-400";
    }
    function statusDot(balance: number, parMin: number) {
        if (balance < 0)        return "bg-red-500";
        if (balance < parMin)   return "bg-orange-400";
        return "bg-emerald-500";
    }

    return (
        <div className="w-full space-y-1">

            {/* ══════════════════════════════════════════════════════════════
                MOBILE: card per ingredient  (hidden on md+)
            ══════════════════════════════════════════════════════════════ */}
            <div className="md:hidden space-y-2">
                {items.map((row, ri) => {
                    const peak = Math.max(...row.byDate, 1);
                    const fa   = flowAction(row, lastDateIdx);

                    return (
                        <div key={row.ingredientId ?? ri}
                             className="rounded-xl border border-border bg-card overflow-hidden">

                            {/* Card header */}
                            <div className="flex items-center justify-between px-3 py-2 bg-muted/20 border-b border-border gap-2">
                                <div className="min-w-0 flex-1">
                                    <p className="font-semibold text-xs text-foreground truncate leading-tight">
                                        {row.ingredientName}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground mt-0.5">
                                        {row.category} · <span className="font-medium">{row.unit}</span>
                                    </p>
                                </div>
                                {/* Status badge (when inventory data available) */}
                                {fa ? (
                                    <div className="flex items-center gap-1 shrink-0">
                                        <span className={`w-2 h-2 rounded-full ${statusDot(fa.balance, fa.parMin)}`} />
                                        {fa.orderQty > 0 ? (
                                            <span className="text-[11px] font-bold text-orange-600 dark:text-orange-400">
                                                +{fmt(Math.ceil(fa.orderQty * 100) / 100)}
                                            </span>
                                        ) : (
                                            <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">✓</span>
                                        )}
                                    </div>
                                ) : null}
                            </div>

                            {/* 7-day heat strip */}
                            <div className="grid grid-cols-7 gap-0 px-1 pt-1.5 pb-0.5">
                                {dates.map((iso, di) => {
                                    const qty     = row.byDate[di] ?? 0;
                                    const { bg, txt } = heat(qty, peak);
                                    const weekend = isWeekend(iso);
                                    return (
                                        <div key={di} className="flex flex-col items-center gap-0.5 px-0.5">
                                            <span className={`text-[9px] font-bold ${weekend ? "text-rose-500 dark:text-rose-400" : "text-muted-foreground"}`}>
                                                {DOW_2[new Date(iso + "T00:00:00").getDay()]}
                                            </span>
                                            <span className="text-[8px] text-muted-foreground/60">{iso.slice(5)}</span>
                                            <div className={`w-full rounded py-1 text-center text-[10px] font-bold tabular-nums
                                                ${bg} ${txt} ${!qty ? "opacity-25" : ""}`}>
                                                {qty > 0 ? (qty % 1 === 0 ? qty : qty.toFixed(1)) : "·"}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Summary footer */}
                            <div className={`grid ${hasInventory && fa ? "grid-cols-4" : "grid-cols-2"} divide-x divide-border border-t border-border mt-1.5`}>
                                <div className="text-center py-2 px-1">
                                    <div className="text-[10px] text-muted-foreground">Total</div>
                                    <div className="text-xs font-bold text-foreground tabular-nums">
                                        {row.totalQty % 1 === 0 ? row.totalQty : row.totalQty.toFixed(1)}
                                        <span className="text-[9px] font-normal text-muted-foreground ml-0.5">{row.unit}</span>
                                    </div>
                                </div>
                                <div className="text-center py-2 px-1">
                                    <div className="text-[10px] text-muted-foreground">Avg/day</div>
                                    <div className="text-xs font-semibold tabular-nums">{row.avgPerDay}</div>
                                </div>
                                {hasInventory && fa && (
                                    <>
                                        <div className="text-center py-2 px-1">
                                            <div className="text-[10px] text-muted-foreground">📦 Bal</div>
                                            <div className={`text-xs font-bold tabular-nums ${balColour(fa.balance, fa.parMin)}`}>
                                                {fmt(fa.balance)}
                                            </div>
                                            <div className="text-[8px] text-muted-foreground/60">
                                                {fmt(row.currentStock!)}−{fmt(fa.lastSold)}
                                            </div>
                                            {!fa.tracked && (
                                                <div className="text-[8px] text-amber-600 dark:text-amber-400 italic mt-0.5">
                                                    not tracked
                                                </div>
                                            )}
                                        </div>
                                        <div className="text-center py-2 px-1">
                                            <div className="text-[10px] text-muted-foreground">🛒 Order</div>
                                            <div className="text-xs font-bold tabular-nums">
                                                {fa.orderQty > 0 ? (
                                                    <span className={fa.tracked
                                                        ? "text-orange-600 dark:text-orange-400"
                                                        : "text-amber-600 dark:text-amber-400"}>
                                                        Buy +{fmt(Math.ceil(fa.orderQty * 100) / 100)}
                                                    </span>
                                                ) : (
                                                    <span className="text-emerald-600 dark:text-emerald-400">✓</span>
                                                )}
                                            </div>
                                        </div>
                                    </>
                                )}
                                {hasInventory && !fa && (
                                    <div className="text-center py-2 px-1 col-span-2 text-[10px] text-muted-foreground/40 italic">
                                        no inventory link
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}

                {/* Mobile legend */}
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground pt-1 flex-wrap">
                    <span>Low</span>
                    {HEAT.map(([bg], i) => <div key={i} className={`w-4 h-3 rounded-sm ${bg} border border-border/20`} />)}
                    <span>High</span>
                    <span className="ml-1 text-rose-500 dark:text-rose-400">Sa/Su highlighted</span>
                </div>
            </div>

            {/* ══════════════════════════════════════════════════════════════
                DESKTOP: full table  (hidden on < md)
            ══════════════════════════════════════════════════════════════ */}
            <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-xs border-collapse" style={{ minWidth: hasInventory ? 600 : 480 }}>
                    <thead>
                        <tr className="border-b-2 border-border">
                            <th className="text-left font-semibold text-muted-foreground uppercase tracking-wide text-[10px] py-2 pr-3 w-full max-w-0">
                                Ingredient
                            </th>
                            {dates.map(iso => {
                                const dow = DOW_SHORT[new Date(iso + "T00:00:00").getDay()];
                                const we  = isWeekend(iso);
                                return (
                                    <th key={iso} className={`text-center py-1.5 px-0.5 w-10 whitespace-nowrap ${we ? "text-rose-500 dark:text-rose-400" : "text-muted-foreground"}`}>
                                        <div className="font-bold text-[10px] uppercase tracking-wide">{dow}</div>
                                        <div className="font-normal text-[9px] opacity-70">{iso.slice(5)}</div>
                                    </th>
                                );
                            })}
                            <th className="text-center font-semibold text-muted-foreground uppercase tracking-wide text-[10px] py-2 px-1 w-14">Total</th>
                            <th className="text-center font-semibold text-muted-foreground uppercase tracking-wide text-[10px] py-2 pl-1 w-12">Avg/d</th>
                            {hasInventory && <>
                                <th className="text-center font-semibold text-[10px] py-2 px-1 w-16 text-blue-600 dark:text-blue-400 uppercase tracking-wide whitespace-nowrap">
                                    📦 Bal
                                    <div className="font-normal text-[9px] text-muted-foreground">Ct−Sld</div>
                                </th>
                                <th className="text-center font-semibold text-[10px] py-2 pl-1 w-16 text-orange-600 dark:text-orange-400 uppercase tracking-wide whitespace-nowrap">
                                    🛒 Order
                                </th>
                            </>}
                        </tr>
                    </thead>

                    <tbody className="divide-y divide-border/50">
                        {items.map((row, ri) => {
                            const peak = Math.max(...row.byDate, 1);
                            const fa   = flowAction(row, lastDateIdx);
                            return (
                                <tr key={row.ingredientId ?? ri} className="hover:bg-muted/20 transition-colors">
                                    <td className="py-1.5 pr-3 max-w-0">
                                        <div className="truncate font-medium text-foreground leading-tight">{row.ingredientName}</div>
                                        <div className="text-[9px] text-muted-foreground truncate leading-none mt-0.5">{row.category} · {row.unit}</div>
                                    </td>
                                    {row.byDate.map((qty, di) => {
                                        const { bg, txt } = heat(qty, peak);
                                        return (
                                            <td key={di} className="w-10 py-1 px-0.5 text-center tabular-nums">
                                                <div className={`rounded-md mx-0.5 py-1 font-semibold leading-none ${bg} ${txt} ${!qty ? "opacity-30" : ""}`}>
                                                    {qty > 0 ? (qty % 1 === 0 ? qty : qty.toFixed(1)) : "·"}
                                                </div>
                                            </td>
                                        );
                                    })}
                                    <td className="text-center tabular-nums font-bold text-foreground w-14 py-1 px-1">
                                        {row.totalQty % 1 === 0 ? row.totalQty : row.totalQty.toFixed(1)}
                                        <div className="text-[9px] font-normal text-muted-foreground">{row.unit}</div>
                                    </td>
                                    <td className="text-center tabular-nums text-muted-foreground w-12 py-1 pl-1">{row.avgPerDay}</td>
                                    {hasInventory && (fa ? (() => {
                                        const bc = balColour(fa.balance, fa.parMin);
                                        return (
                                            <>
                                                <td className={`text-center tabular-nums w-16 py-1 px-1 ${bc} font-semibold`}>
                                                    {fmt(fa.balance)}
                                                    <div className="text-[9px] font-normal text-muted-foreground">{fmt(row.currentStock!)}−{fmt(fa.lastSold)}</div>
                                                    {!fa.tracked && (
                                                        <div className="text-[8px] text-amber-600 dark:text-amber-400 italic">not tracked</div>
                                                    )}
                                                </td>
                                                <td className="text-center tabular-nums w-16 py-1 pl-1 font-bold">
                                                    {fa.orderQty > 0
                                                        ? <span className={fa.tracked
                                                              ? "text-orange-600 dark:text-orange-400"
                                                              : "text-amber-600 dark:text-amber-400"}>
                                                              Buy +{fmt(Math.ceil(fa.orderQty * 100) / 100)}
                                                          </span>
                                                        : <span className="text-emerald-600 dark:text-emerald-400">✓</span>}
                                                </td>
                                            </>
                                        );
                                    })() : <><td className="text-center text-muted-foreground/30 py-1 px-1 text-[10px]">—</td><td /></>)}
                                </tr>
                            );
                        })}
                    </tbody>

                    <tfoot>
                        <tr className="border-t-2 border-border bg-muted/20">
                            <td className="py-2 pr-3 font-bold text-[10px] uppercase tracking-wide text-muted-foreground">
                                TOTAL ({items.length})
                            </td>
                            {dates.map((_, di) => {
                                const sum = items.reduce((s, r) => s + (r.byDate[di] ?? 0), 0);
                                return (
                                    <td key={di} className="text-center tabular-nums font-semibold text-foreground py-2 px-0.5">
                                        <div className="rounded-md mx-0.5 py-1 bg-muted/40">
                                            {sum > 0 ? (sum % 1 === 0 ? sum : sum.toFixed(1)) : "·"}
                                        </div>
                                    </td>
                                );
                            })}
                            <td className="text-center tabular-nums font-bold text-foreground py-2 px-1 w-14">
                                {(() => { const t = items.reduce((s, r) => s + r.totalQty, 0); return t % 1 === 0 ? t : t.toFixed(1); })()}
                            </td>
                            <td className="text-center tabular-nums text-muted-foreground py-2 pl-1">
                                {days > 0 ? (items.reduce((s, r) => s + r.totalQty, 0) / days).toFixed(1) : "—"}
                            </td>
                            {hasInventory && <><td /><td /></>}
                        </tr>
                    </tfoot>
                </table>

                {/* Desktop legend */}
                <div className="flex flex-wrap items-center gap-2 mt-3 text-[10px] text-muted-foreground">
                    <span>Low</span>
                    {HEAT.map(([bg], i) => <div key={i} className={`w-5 h-3 rounded-sm ${bg} border border-border/30`} />)}
                    <span>High</span>
                    <span className="ml-2 text-rose-500 dark:text-rose-400 font-medium">Weekends highlighted</span>
                    <span className="ml-2">Intensity per ingredient&apos;s own peak</span>
                </div>
            </div>
        </div>
    );
}
