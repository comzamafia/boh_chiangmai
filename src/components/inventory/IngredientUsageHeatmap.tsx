"use client";
/**
 * IngredientUsageHeatmap
 *
 * Shows top-N ingredients × N specific calendar dates (not DOW aggregation).
 * Each cell shows the exact qty used that day, shaded by intensity relative
 * to that ingredient's own peak day in the window.
 *
 * Columns: Ingredient | <date1 Mon> | … | <date7 Sun> | Total | Avg/day
 * Fits on iPad (768 px) without horizontal scroll for 7 columns.
 */

import type { IngredientTrendRow } from "@/lib/api";

const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const HEAT_CLASSES: [string, string][] = [
    ["bg-red-50  dark:bg-red-950/20",  "text-red-400  dark:text-red-600"],
    ["bg-red-100 dark:bg-red-950/40",  "text-red-600  dark:text-red-400"],
    ["bg-red-200 dark:bg-red-900/60",  "text-red-700  dark:text-red-300"],
    ["bg-red-300 dark:bg-red-800/70",  "text-red-800  dark:text-red-200"],
    ["bg-red-400 dark:bg-red-700/80",  "text-white    dark:text-red-100"],
    ["bg-red-500 dark:bg-red-600",     "text-white    dark:text-white"],
];

function heatClasses(val: number, peak: number) {
    if (!val || !peak) return { bg: "", txt: "text-muted-foreground/25" };
    const idx = Math.min(HEAT_CLASSES.length - 1, Math.floor((val / peak) * HEAT_CLASSES.length));
    const [bg, txt] = HEAT_CLASSES[idx];
    return { bg, txt };
}

/** YYYY-MM-DD → day-of-week label + short date (e.g. "Mon 05/26") */
function dateHeader(iso: string) {
    const d = new Date(iso + "T00:00:00");
    return { dow: DOW_SHORT[d.getDay()], mmdd: iso.slice(5) };
}

interface Props {
    dates:   string[];
    items:   IngredientTrendRow[];
    days:    number;
}

export default function IngredientUsageHeatmap({ dates, items, days }: Props) {
    if (!items.length) return (
        <p className="text-sm text-muted-foreground py-8 text-center">
            No "Out" or "Waste" transactions found in the last {days} days.
        </p>
    );

    const isWeekend = (iso: string) => { const d = new Date(iso + "T00:00:00").getDay(); return d === 0 || d === 6; };

    return (
        <div className="w-full overflow-x-auto">
            <table className="w-full text-xs border-collapse" style={{ minWidth: 480 }}>
                <thead>
                    <tr className="border-b-2 border-border">
                        <th className="text-left font-semibold text-muted-foreground uppercase tracking-wide text-[10px] py-2 pr-3 w-full max-w-0">
                            Ingredient
                        </th>
                        {dates.map(iso => {
                            const { dow, mmdd } = dateHeader(iso);
                            const weekend = isWeekend(iso);
                            return (
                                <th key={iso} className={`text-center py-1.5 px-0.5 w-10 whitespace-nowrap
                                    ${weekend ? "text-rose-500 dark:text-rose-400" : "text-muted-foreground"}`}>
                                    <div className="font-bold text-[10px] uppercase tracking-wide">{dow}</div>
                                    <div className="font-normal text-[9px] opacity-70">{mmdd}</div>
                                </th>
                            );
                        })}
                        <th className="text-center font-semibold text-muted-foreground uppercase tracking-wide text-[10px] py-2 px-1 w-14">
                            Total
                        </th>
                        <th className="text-center font-semibold text-muted-foreground uppercase tracking-wide text-[10px] py-2 pl-1 w-12">
                            Avg/d
                        </th>
                    </tr>
                </thead>

                <tbody className="divide-y divide-border/50">
                    {items.map((row, ri) => {
                        const peak = Math.max(...row.byDate, 1);
                        return (
                            <tr key={row.ingredientId ?? ri} className="hover:bg-muted/20 transition-colors">
                                {/* Ingredient name + category */}
                                <td className="py-1.5 pr-3 max-w-0">
                                    <div className="truncate font-medium text-foreground leading-tight">{row.ingredientName}</div>
                                    <div className="text-[9px] text-muted-foreground truncate leading-none mt-0.5">
                                        {row.category} · {row.unit}
                                    </div>
                                </td>

                                {/* Per-day cells */}
                                {row.byDate.map((qty, di) => {
                                    const { bg, txt } = heatClasses(qty, peak);
                                    return (
                                        <td key={di} className="w-10 py-1 px-0.5 text-center tabular-nums">
                                            <div className={`rounded-md mx-0.5 py-1 font-semibold leading-none
                                                ${bg} ${txt} ${!qty ? "opacity-30" : ""}`}>
                                                {qty > 0 ? (qty % 1 === 0 ? qty : qty.toFixed(1)) : "·"}
                                            </div>
                                        </td>
                                    );
                                })}

                                {/* Total */}
                                <td className="text-center tabular-nums font-bold text-foreground w-14 py-1 px-1">
                                    {row.totalQty % 1 === 0 ? row.totalQty : row.totalQty.toFixed(1)}
                                    <div className="text-[9px] font-normal text-muted-foreground">{row.unit}</div>
                                </td>

                                {/* Avg/day */}
                                <td className="text-center tabular-nums text-muted-foreground w-12 py-1 pl-1">
                                    {row.avgPerDay}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>

                {/* Footer totals */}
                <tfoot>
                    <tr className="border-t-2 border-border bg-muted/20">
                        <td className="py-2 pr-3 font-bold text-[10px] uppercase tracking-wide text-muted-foreground">
                            TOTAL (top {items.length})
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
                    </tr>
                </tfoot>
            </table>

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-2 mt-3 text-[10px] text-muted-foreground">
                <span>Low</span>
                {HEAT_CLASSES.map(([bg], i) => (
                    <div key={i} className={`w-5 h-3 rounded-sm ${bg} border border-border/30`} />
                ))}
                <span>High</span>
                <span className="ml-2 text-rose-500 dark:text-rose-400 font-medium">Weekends highlighted</span>
                <span className="ml-2">Intensity relative to each ingredient&apos;s own peak day</span>
            </div>
        </div>
    );
}
