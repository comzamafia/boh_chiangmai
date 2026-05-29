"use client";
/**
 * ItemUsageHeatmap
 *
 * Renders a responsive "Top N items × 7 days-of-week" numeric heatmap.
 * Each cell shows the exact sold qty and is shaded by intensity relative
 * to that item's own weekly peak — so a slow-selling item's cells are just
 * as readable as a best-seller's.
 *
 * Columns: Item name | Mon | Tue | Wed | Thu | Fri | Sat | Sun | Total | Avg
 * Fits without horizontal scroll on iPad (768 px wide).
 */

import type { PmixRangeTopItem } from "@/lib/api";

const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Red-shade palette (6 steps + zero).
// Hue kept consistent; brightness drops as qty rises.
const HEAT_CLASSES: [string, string][] = [
    // [background, text]
    ["bg-red-50  dark:bg-red-950/20",  "text-red-300  dark:text-red-700"],   // ~1–16 %
    ["bg-red-100 dark:bg-red-950/40",  "text-red-500  dark:text-red-400"],   // ~17–33 %
    ["bg-red-200 dark:bg-red-900/60",  "text-red-700  dark:text-red-300"],   // ~34–50 %
    ["bg-red-300 dark:bg-red-800/70",  "text-red-800  dark:text-red-200"],   // ~51–67 %
    ["bg-red-400 dark:bg-red-700/80",  "text-white    dark:text-red-100"],   // ~68–83 %
    ["bg-red-500 dark:bg-red-600",     "text-white    dark:text-white"],     // ~84–100 %
];

function heatClasses(val: number, max: number): { bg: string; txt: string } {
    if (!val || !max) return { bg: "", txt: "text-muted-foreground/30" };
    const t = val / max;
    const idx = Math.min(HEAT_CLASSES.length - 1, Math.floor(t * HEAT_CLASSES.length));
    const [bg, txt] = HEAT_CLASSES[idx];
    return { bg, txt };
}

interface Props {
    items:    PmixRangeTopItem[];
    dayCount: number;   // total calendar days in the selected range
}

export default function ItemUsageHeatmap({ items, dayCount }: Props) {
    if (!items.length) return null;

    // Count how many distinct Mondays, Tuesdays etc. exist in the range
    // so we can show per-occurrence averages per DOW (optional display tweak).
    // For now we just show raw totals per DOW.

    return (
        <div className="w-full overflow-x-auto">
            <table className="w-full text-xs border-collapse" style={{ minWidth: 480 }}>
                <thead>
                    <tr className="border-b border-border">
                        {/* Item name column */}
                        <th className="text-left font-semibold text-muted-foreground uppercase tracking-wide text-[10px] py-2 pr-3 w-full max-w-0">
                            Item
                        </th>
                        {/* DOW columns */}
                        {DOW_LABELS.map(d => (
                            <th key={d} className={`text-center font-bold text-[10px] uppercase tracking-wide py-2 px-1 whitespace-nowrap w-10
                                ${d === "Sat" || d === "Sun" ? "text-rose-500 dark:text-rose-400" : "text-muted-foreground"}`}>
                                {d}
                            </th>
                        ))}
                        {/* Total */}
                        <th className="text-center font-semibold text-muted-foreground uppercase tracking-wide text-[10px] py-2 px-1 w-12">
                            Total
                        </th>
                        {/* Avg/day */}
                        <th className="text-center font-semibold text-muted-foreground uppercase tracking-wide text-[10px] py-2 pl-1 w-12">
                            Avg
                        </th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                    {items.map((item, rowIdx) => {
                        const dow   = item.byDow ?? [0, 0, 0, 0, 0, 0, 0];
                        const peak  = Math.max(...dow, 1);

                        return (
                            <tr key={`${item.category}-${item.itemName}-${rowIdx}`}
                                className="hover:bg-muted/20 transition-colors group">

                                {/* Item name */}
                                <td className="py-1.5 pr-3 max-w-0">
                                    <div className="truncate font-medium text-foreground leading-tight">
                                        {item.itemName}
                                    </div>
                                    <div className="text-[9px] text-muted-foreground truncate leading-none mt-0.5">
                                        {item.category}
                                    </div>
                                </td>

                                {/* DOW cells */}
                                {dow.map((qty, d) => {
                                    const { bg, txt } = heatClasses(qty, peak);
                                    return (
                                        <td key={d}
                                            className={`text-center tabular-nums w-10 py-1 px-0.5`}>
                                            <div className={`
                                                rounded-md mx-0.5 py-1 font-semibold leading-none
                                                ${bg} ${txt}
                                                ${!qty ? "opacity-40" : ""}
                                            `}>
                                                {qty > 0 ? qty : "·"}
                                            </div>
                                        </td>
                                    );
                                })}

                                {/* Total */}
                                <td className="text-center tabular-nums font-bold text-foreground w-12 py-1 px-1">
                                    {item.qtySold.toLocaleString()}
                                </td>

                                {/* Avg/day */}
                                <td className="text-center tabular-nums text-muted-foreground w-12 py-1 pl-1">
                                    {item.avgQtyPerDay}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>

                {/* Footer totals row */}
                <tfoot>
                    <tr className="border-t-2 border-border bg-muted/20">
                        <td className="py-2 pr-3 font-bold text-[10px] uppercase tracking-wide text-muted-foreground">
                            TOTAL (top {items.length})
                        </td>
                        {Array.from({ length: 7 }, (_, d) => {
                            const sum = items.reduce((s, it) => s + (it.byDow?.[d] ?? 0), 0);
                            return (
                                <td key={d} className="text-center tabular-nums font-semibold text-foreground py-2 px-0.5">
                                    <div className="rounded-md mx-0.5 py-1 bg-muted/40">{sum > 0 ? sum : "·"}</div>
                                </td>
                            );
                        })}
                        <td className="text-center tabular-nums font-bold text-foreground py-2 px-1">
                            {items.reduce((s, it) => s + it.qtySold, 0).toLocaleString()}
                        </td>
                        <td className="text-center tabular-nums text-muted-foreground py-2 pl-1">
                            {dayCount > 0
                                ? (items.reduce((s, it) => s + it.qtySold, 0) / dayCount).toFixed(1)
                                : "—"}
                        </td>
                    </tr>
                </tfoot>
            </table>

            {/* Legend */}
            <div className="flex items-center gap-2 mt-3 text-[10px] text-muted-foreground">
                <span>Low</span>
                {HEAT_CLASSES.map(([bg], i) => (
                    <div key={i} className={`w-5 h-3 rounded-sm ${bg} border border-border/30`} />
                ))}
                <span>High</span>
                <span className="ml-3 text-rose-500 dark:text-rose-400 font-medium">Sat / Sun highlighted</span>
                <span className="ml-3">Avg = total ÷ {dayCount} calendar days</span>
            </div>
        </div>
    );
}
