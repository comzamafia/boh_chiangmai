"use client";

/**
 * ProteinCalendarModal — mobile-first
 * Opens when the user taps a protein row in Main Protein Totals.
 * Shows a monthly calendar with per-day lb (or qty) usage.
 */

import { useEffect, useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { pmixApi, ProteinDailyDay } from "@/lib/api";

// ─── constants ────────────────────────────────────────────────────────────────
/** Mon-first day-of-week labels — 2-char on mobile saves space */
const DOW_SM = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const DOW_LG = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ─── helpers ──────────────────────────────────────────────────────────────────
function daysInMonth(year: number, month: number) {
    return new Date(year, month + 1, 0).getDate();
}
/** Monday = 0 … Sunday = 6 */
function firstDowOfMonth(year: number, month: number) {
    const d = new Date(year, month, 1).getDay(); // 0=Sun…6=Sat
    return (d + 6) % 7;
}

function heatBg(value: number, max: number): string {
    if (max === 0 || value === 0) return "";
    const t = value / max;
    if (t < 0.25) return "bg-teal-50  dark:bg-teal-950/40";
    if (t < 0.5)  return "bg-teal-100 dark:bg-teal-900/50";
    if (t < 0.75) return "bg-teal-200 dark:bg-teal-800/60";
    return              "bg-teal-300 dark:bg-teal-700/80";
}

// ─── component ────────────────────────────────────────────────────────────────
interface Props {
    protein:     string;
    portionUnit: string | null;
    rangeFrom:   string;   // YYYY-MM-DD
    rangeTo:     string;   // YYYY-MM-DD
    open:        boolean;
    onClose:     () => void;
}

export default function ProteinCalendarModal({
    protein, portionUnit, rangeFrom, rangeTo, open, onClose,
}: Props) {
    const initMonth = rangeFrom.slice(0, 7);
    const [currentMonth, setCurrentMonth] = useState(initMonth);
    const [loading,      setLoading]      = useState(false);
    const [dayMap,       setDayMap]       = useState<Map<string, ProteinDailyDay>>(new Map());

    useEffect(() => {
        if (open) setCurrentMonth(rangeFrom.slice(0, 7));
    }, [open, protein, rangeFrom]);

    const fetchData = useCallback(async () => {
        if (!open) return;
        setLoading(true);
        try {
            const result = await pmixApi.proteinDaily(protein, rangeFrom, rangeTo);
            const m = new Map<string, ProteinDailyDay>();
            for (const d of result.days) m.set(d.date, d);
            setDayMap(m);
        } catch {
            setDayMap(new Map());
        } finally {
            setLoading(false);
        }
    }, [open, protein, rangeFrom, rangeTo]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const [year, mon] = currentMonth.split("-").map(Number);
    const minMonth = rangeFrom.slice(0, 7);
    const maxMonth = rangeTo.slice(0, 7);

    function prevMonth() {
        const d = new Date(year, mon - 2, 1);
        const m = d.toISOString().slice(0, 7);
        if (m >= minMonth) setCurrentMonth(m);
    }
    function nextMonth() {
        const d = new Date(year, mon, 1);
        const m = d.toISOString().slice(0, 7);
        if (m <= maxMonth) setCurrentMonth(m);
    }

    // Build calendar cells
    const totalDays = daysInMonth(year, mon - 1);
    const startDow  = firstDowOfMonth(year, mon - 1);
    const cells: (number | null)[] = [
        ...Array(startDow).fill(null),
        ...Array.from({ length: totalDays }, (_, i) => i + 1),
    ];
    while (cells.length % 7 !== 0) cells.push(null);

    // max value this month for heat-map
    const monthVals = cells
        .filter((c): c is number => c !== null)
        .map(day => {
            const iso = `${year}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            return dayMap.get(iso);
        })
        .filter(Boolean);
    const maxVal = Math.max(0, ...monthVals.map(d => d!.lb ?? d!.qty));

    const showLb = portionUnit === "oz";
    const monthLabel = new Date(year, mon - 1, 1)
        .toLocaleString("en-US", { month: "long", year: "numeric" });

    const totalMonthLb = showLb
        ? [...dayMap.values()].reduce((s, d) => s + (d.lb ?? 0), 0)
        : null;
    const daysWithOrders = dayMap.size;

    return (
        <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
            {/*
                Mobile: full-width with 12px side margins (mx-3), max-h with scroll
                Desktop (sm+): centered, max-w-lg
            */}
            <DialogContent className="
                p-0 overflow-hidden
                w-[calc(100vw-1.5rem)] mx-auto
                sm:max-w-lg
                max-h-[92dvh] flex flex-col
            ">
                {/* ── Header ── */}
                <DialogHeader className="px-4 sm:px-5 pt-4 sm:pt-5 pb-3 border-b border-border shrink-0">
                    <DialogTitle className="flex items-center gap-2 text-sm sm:text-base min-w-0">
                        <span className="inline-block w-2.5 h-2.5 rounded-full bg-teal-500 shrink-0" />
                        {/* Truncate long protein names on narrow screens */}
                        <span className="truncate font-semibold">{protein}</span>
                        <span className="text-xs font-normal text-muted-foreground shrink-0 ml-0.5">
                            {showLb ? "(lb / day)" : "(orders / day)"}
                        </span>
                    </DialogTitle>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                        {rangeFrom} → {rangeTo}
                    </p>
                </DialogHeader>

                {/* ── Scrollable body ── */}
                <div className="px-3 sm:px-4 pb-4 pt-3 space-y-2.5 overflow-y-auto flex-1 min-h-0">

                    {/* Month navigation */}
                    <div className="flex items-center justify-between">
                        <Button
                            variant="ghost" size="icon"
                            onClick={prevMonth}
                            disabled={currentMonth <= minMonth}
                            className="h-9 w-9 rounded-xl touch-manipulation"
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </Button>
                        <span className="text-sm font-semibold">{monthLabel}</span>
                        <Button
                            variant="ghost" size="icon"
                            onClick={nextMonth}
                            disabled={currentMonth >= maxMonth}
                            className="h-9 w-9 rounded-xl touch-manipulation"
                        >
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
                            {/* Day-of-week header — 2-char on mobile, 3-char on sm+ */}
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

                                    const rawVal = data
                                        ? showLb ? (data.lb ?? data.qty) : data.qty
                                        : 0;
                                    const displayVal = data
                                        ? showLb
                                            ? data.lb !== null ? data.lb.toFixed(2) : data.qty.toString()
                                            : data.qty.toString()
                                        : null;

                                    const heat = data ? heatBg(rawVal, maxVal) : "";

                                    return (
                                        <div
                                            key={iso}
                                            className={`
                                                relative rounded-md sm:rounded-lg border text-center select-none
                                                min-h-[2.5rem] sm:min-h-[3.2rem]
                                                flex flex-col items-center justify-start pt-1
                                                transition-colors duration-100
                                                ${inRange ? "border-border" : "border-transparent opacity-30"}
                                                ${heat || "bg-muted/20"}
                                                ${data ? "shadow-sm" : ""}
                                            `}
                                        >
                                            {/* Date number */}
                                            <div className={`
                                                text-[9px] sm:text-[10px] font-semibold leading-none
                                                ${data ? "text-foreground" : "text-muted-foreground/60"}
                                            `}>
                                                {day}
                                            </div>

                                            {/* Value */}
                                            {displayVal !== null ? (
                                                <div className="mt-0.5 px-0.5 w-full">
                                                    <div className="text-[10px] sm:text-[11px] font-bold tabular-nums text-teal-700 dark:text-teal-300 leading-tight">
                                                        {displayVal}
                                                    </div>
                                                    {showLb && (
                                                        <div className="text-[8px] sm:text-[9px] text-muted-foreground leading-none">
                                                            lb
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                inRange && (
                                                    <div className="text-[9px] text-muted-foreground/30 mt-0.5">·</div>
                                                )
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Summary strip */}
                            {daysWithOrders > 0 && (
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-2 border-t border-border text-xs text-muted-foreground">
                                    <span>
                                        <strong className="text-foreground">{daysWithOrders}</strong> day{daysWithOrders !== 1 ? "s" : ""} with orders
                                    </span>
                                    {totalMonthLb !== null && (
                                        <span>
                                            Month total{" "}
                                            <strong className="text-teal-700 dark:text-teal-300">
                                                {totalMonthLb.toFixed(2)} lb
                                            </strong>
                                        </span>
                                    )}
                                    {/* Heat-map legend */}
                                    <div className="flex items-center gap-1 ml-auto">
                                        <span className="text-[10px]">Low</span>
                                        {["bg-teal-50","bg-teal-100","bg-teal-200","bg-teal-300"].map(c => (
                                            <div key={c} className={`w-2.5 h-2.5 rounded-sm border border-border/40 ${c}`} />
                                        ))}
                                        <span className="text-[10px]">High</span>
                                    </div>
                                </div>
                            )}

                            {daysWithOrders === 0 && (
                                <p className="text-center text-xs text-muted-foreground py-4">
                                    No orders for <strong>{protein}</strong> in {monthLabel}
                                </p>
                            )}
                        </>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
