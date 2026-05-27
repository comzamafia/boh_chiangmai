"use client";

/**
 * DailyCalendarModal — generic mobile-first calendar popup
 *
 * Used for both Main Protein Totals and Main Desserts.
 * Accepts a `fetchFn` that returns per-day data, so each caller
 * wires its own API without duplicating calendar UI code.
 */

import { useEffect, useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";

// ─── public types ─────────────────────────────────────────────────────────────
export interface DailyCalendarDay {
    date: string;        // YYYY-MM-DD
    qty:  number;
    lb?:  number | null; // optional — shown when portionUnit = "oz"
}

// ─── constants ────────────────────────────────────────────────────────────────
const DOW_SM = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const DOW_LG = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ─── helpers ──────────────────────────────────────────────────────────────────
function daysInMonth(year: number, month: number) {
    return new Date(year, month + 1, 0).getDate();
}
function firstDowOfMonth(year: number, month: number) {
    const d = new Date(year, month, 1).getDay();
    return (d + 6) % 7; // Mon = 0
}

type ColorScheme = "teal" | "pink";

const COLOR = {
    teal: {
        dot:   "bg-teal-500",
        val:   "text-teal-700 dark:text-teal-300",
        total: "text-teal-700 dark:text-teal-300",
        heat:  ["bg-teal-50 dark:bg-teal-950/40","bg-teal-100 dark:bg-teal-900/50","bg-teal-200 dark:bg-teal-800/60","bg-teal-300 dark:bg-teal-700/80"],
    },
    pink: {
        dot:   "bg-pink-500",
        val:   "text-pink-700 dark:text-pink-300",
        total: "text-pink-700 dark:text-pink-300",
        heat:  ["bg-pink-50 dark:bg-pink-950/40","bg-pink-100 dark:bg-pink-900/50","bg-pink-200 dark:bg-pink-800/60","bg-pink-300 dark:bg-pink-700/80"],
    },
};

function heatBg(value: number, max: number, scheme: ColorScheme): string {
    if (max === 0 || value === 0) return "";
    const t = value / max;
    const heat = COLOR[scheme].heat;
    if (t < 0.25) return heat[0];
    if (t < 0.5)  return heat[1];
    if (t < 0.75) return heat[2];
    return heat[3];
}

// ─── component ────────────────────────────────────────────────────────────────
interface Props {
    itemName:  string;
    unitLabel: string;              // e.g. "lb / day" or "orders / day"
    color:     ColorScheme;
    rangeFrom: string;              // YYYY-MM-DD
    rangeTo:   string;
    open:      boolean;
    onClose:   () => void;
    /** Called once on open; receives (item, from, to) and must resolve DailyCalendarDay[] */
    fetchFn:   (item: string, from: string, to: string) => Promise<{ days: DailyCalendarDay[] }>;
    /** If true, show the .lb value instead of .qty when available */
    showLb?:   boolean;
}

export default function DailyCalendarModal({
    itemName, unitLabel, color, rangeFrom, rangeTo, open, onClose, fetchFn, showLb = false,
}: Props) {
    const initMonth = rangeFrom.slice(0, 7);
    const [currentMonth, setCurrentMonth] = useState(initMonth);
    const [loading,      setLoading]      = useState(false);
    const [dayMap,       setDayMap]       = useState<Map<string, DailyCalendarDay>>(new Map());

    useEffect(() => {
        if (open) setCurrentMonth(rangeFrom.slice(0, 7));
    }, [open, itemName, rangeFrom]);

    const load = useCallback(async () => {
        if (!open) return;
        setLoading(true);
        try {
            const res = await fetchFn(itemName, rangeFrom, rangeTo);
            const m = new Map<string, DailyCalendarDay>();
            for (const d of res.days) m.set(d.date, d);
            setDayMap(m);
        } catch {
            setDayMap(new Map());
        } finally {
            setLoading(false);
        }
    }, [open, itemName, rangeFrom, rangeTo, fetchFn]);

    useEffect(() => { load(); }, [load]);

    const [year, mon] = currentMonth.split("-").map(Number);
    const minMonth    = rangeFrom.slice(0, 7);
    const maxMonth    = rangeTo.slice(0, 7);

    function prevMonth() {
        const m = new Date(year, mon - 2, 1).toISOString().slice(0, 7);
        if (m >= minMonth) setCurrentMonth(m);
    }
    function nextMonth() {
        const m = new Date(year, mon, 1).toISOString().slice(0, 7);
        if (m <= maxMonth) setCurrentMonth(m);
    }

    // Build grid cells
    const totalDays = daysInMonth(year, mon - 1);
    const startDow  = firstDowOfMonth(year, mon - 1);
    const cells: (number | null)[] = [
        ...Array(startDow).fill(null),
        ...Array.from({ length: totalDays }, (_, i) => i + 1),
    ];
    while (cells.length % 7 !== 0) cells.push(null);

    // Max value for heat-map (within this month only)
    const monthMax = Math.max(0, ...cells
        .filter((c): c is number => c !== null)
        .map(day => {
            const iso = `${year}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const d   = dayMap.get(iso);
            if (!d) return 0;
            return showLb ? (d.lb ?? d.qty) : d.qty;
        }));

    const scheme = COLOR[color];
    const daysWithOrders = dayMap.size;
    const monthLabel = new Date(year, mon - 1, 1)
        .toLocaleString("en-US", { month: "long", year: "numeric" });

    const totalMonthVal = showLb
        ? [...dayMap.values()].reduce((s, d) => s + (d.lb ?? 0), 0)
        : [...dayMap.values()].reduce((s, d) => s + d.qty, 0);

    return (
        <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
            <DialogContent className="
                p-0 overflow-hidden
                w-[calc(100vw-1.5rem)] mx-auto
                sm:max-w-lg
                max-h-[92dvh] flex flex-col
            ">
                {/* Header */}
                <DialogHeader className="px-4 sm:px-5 pt-4 sm:pt-5 pb-3 border-b border-border shrink-0">
                    <DialogTitle className="flex items-center gap-2 text-sm sm:text-base min-w-0">
                        <span className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${scheme.dot}`} />
                        <span className="truncate font-semibold">{itemName}</span>
                        <span className="text-xs font-normal text-muted-foreground shrink-0 ml-0.5">
                            ({unitLabel})
                        </span>
                    </DialogTitle>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                        {rangeFrom} → {rangeTo}
                    </p>
                </DialogHeader>

                {/* Scrollable body */}
                <div className="px-3 sm:px-4 pb-4 pt-3 space-y-2.5 overflow-y-auto flex-1 min-h-0">

                    {/* Month nav */}
                    <div className="flex items-center justify-between">
                        <Button variant="ghost" size="icon"
                            onClick={prevMonth} disabled={currentMonth <= minMonth}
                            className="h-9 w-9 rounded-xl touch-manipulation">
                            <ChevronLeft className="w-5 h-5" />
                        </Button>
                        <span className="text-sm font-semibold">{monthLabel}</span>
                        <Button variant="ghost" size="icon"
                            onClick={nextMonth} disabled={currentMonth >= maxMonth}
                            className="h-9 w-9 rounded-xl touch-manipulation">
                            <ChevronRight className="w-5 h-5" />
                        </Button>
                    </div>

                    {loading ? (
                        <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
                            <Loader2 className="w-5 h-5 animate-spin" />
                            <span className="text-sm">Loading…</span>
                        </div>
                    ) : (
                        <>
                            {/* DOW header */}
                            <div className="grid grid-cols-7 gap-0.5">
                                {DOW_SM.map((sm, i) => (
                                    <div key={sm} className="text-center text-[10px] font-bold uppercase tracking-wide text-muted-foreground py-1">
                                        <span className="sm:hidden">{sm}</span>
                                        <span className="hidden sm:inline">{DOW_LG[i]}</span>
                                    </div>
                                ))}
                            </div>

                            {/* Calendar grid */}
                            <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
                                {cells.map((day, idx) => {
                                    if (day === null) {
                                        return <div key={`e-${idx}`} className="min-h-[2.5rem] sm:min-h-[3.2rem]" />;
                                    }
                                    const iso = `${year}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                                    const data    = dayMap.get(iso);
                                    const inRange = iso >= rangeFrom && iso <= rangeTo;
                                    const rawVal  = data ? (showLb ? (data.lb ?? data.qty) : data.qty) : 0;
                                    const heat    = data ? heatBg(rawVal, monthMax, color) : "";

                                    let displayVal: string | null = null;
                                    if (data) {
                                        displayVal = showLb && data.lb != null
                                            ? data.lb.toFixed(2)
                                            : data.qty.toString();
                                    }

                                    return (
                                        <div key={iso} className={`
                                            relative rounded-md sm:rounded-lg border text-center select-none
                                            min-h-[2.5rem] sm:min-h-[3.2rem]
                                            flex flex-col items-center justify-start pt-1
                                            transition-colors duration-100
                                            ${inRange ? "border-border" : "border-transparent opacity-30"}
                                            ${heat || "bg-muted/20"}
                                            ${data ? "shadow-sm" : ""}
                                        `}>
                                            {/* Date */}
                                            <div className={`text-[9px] sm:text-[10px] font-semibold leading-none ${data ? "text-foreground" : "text-muted-foreground/60"}`}>
                                                {day}
                                            </div>

                                            {/* Value */}
                                            {displayVal !== null ? (
                                                <div className="mt-0.5 px-0.5 w-full">
                                                    <div className={`text-[10px] sm:text-[11px] font-bold tabular-nums leading-tight ${scheme.val}`}>
                                                        {displayVal}
                                                    </div>
                                                    {showLb ? (
                                                        <div className="text-[8px] sm:text-[9px] text-muted-foreground leading-none">lb</div>
                                                    ) : (
                                                        <div className="text-[8px] sm:text-[9px] text-muted-foreground leading-none">qty</div>
                                                    )}
                                                </div>
                                            ) : (
                                                inRange && <div className="text-[9px] text-muted-foreground/30 mt-0.5">·</div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Summary */}
                            {daysWithOrders > 0 ? (
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-2 border-t border-border text-xs text-muted-foreground">
                                    <span>
                                        <strong className="text-foreground">{daysWithOrders}</strong> day{daysWithOrders !== 1 ? "s" : ""} with orders
                                    </span>
                                    <span>
                                        Month total{" "}
                                        <strong className={scheme.total}>
                                            {showLb ? totalMonthVal.toFixed(2) + " lb" : totalMonthVal.toLocaleString() + " orders"}
                                        </strong>
                                    </span>
                                    {/* Heat legend */}
                                    <div className="flex items-center gap-1 ml-auto">
                                        <span className="text-[10px]">Low</span>
                                        {scheme.heat.map(c => (
                                            <div key={c} className={`w-2.5 h-2.5 rounded-sm border border-border/40 ${c}`} />
                                        ))}
                                        <span className="text-[10px]">High</span>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-center text-xs text-muted-foreground py-4">
                                    No orders for <strong>{itemName}</strong> in {monthLabel}
                                </p>
                            )}
                        </>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
