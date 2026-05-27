"use client";

/**
 * ProteinCalendarModal
 * Pops up when the user clicks a protein row in Main Protein Totals.
 * Shows a monthly calendar with per-day lb (or qty) usage for that protein.
 */

import { useEffect, useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { pmixApi, ProteinDailyDay } from "@/lib/api";

// ─── helpers ──────────────────────────────────────────────────────────────────
const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function daysInMonth(year: number, month: number) {
    return new Date(year, month + 1, 0).getDate();
}
/** Monday = 0 … Sunday = 6 */
function firstDowOfMonth(year: number, month: number) {
    const d = new Date(year, month, 1).getDay(); // 0=Sun…6=Sat
    return (d + 6) % 7; // shift so Mon=0
}

// intensity colour based on value relative to max
function heatBg(value: number, max: number): string {
    if (max === 0 || value === 0) return "";
    const t = value / max; // 0→1
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
    // Start calendar on the month of rangeFrom
    const initMonth = rangeFrom.slice(0, 7); // "YYYY-MM"
    const [currentMonth, setCurrentMonth] = useState(initMonth);
    const [loading,      setLoading]      = useState(false);
    const [dayMap,       setDayMap]       = useState<Map<string, ProteinDailyDay>>(new Map());

    // Re-initialise month when a different protein is opened
    useEffect(() => {
        if (open) setCurrentMonth(rangeFrom.slice(0, 7));
    }, [open, protein, rangeFrom]);

    // Fetch data whenever modal opens or protein changes
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

    // Month navigation — clamp to rangeFrom/rangeTo months
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

    // Build calendar grid
    const totalDays  = daysInMonth(year, mon - 1);
    const startDow   = firstDowOfMonth(year, mon - 1); // 0=Mon
    const cells: (number | null)[] = [
        ...Array(startDow).fill(null),
        ...Array.from({ length: totalDays }, (_, i) => i + 1),
    ];
    // pad to complete last row
    while (cells.length % 7 !== 0) cells.push(null);

    // max lb in this month (for heat-map)
    const monthVals = cells
        .filter((c): c is number => c !== null)
        .map(day => {
            const iso = `${year}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            return dayMap.get(iso);
        })
        .filter(Boolean);
    const maxLb = Math.max(0, ...monthVals.map(d => d!.lb ?? d!.qty));

    const showLb = portionUnit === "oz";

    const monthLabel = new Date(year, mon - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });

    return (
        <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
            <DialogContent className="max-w-lg w-full p-0 overflow-hidden">
                <DialogHeader className="px-5 pt-5 pb-3 border-b border-border">
                    <DialogTitle className="flex items-center gap-2 text-base">
                        <span className="inline-block w-2.5 h-2.5 rounded-full bg-teal-500 shrink-0" />
                        {protein} — Daily Usage Calendar
                        {showLb && <span className="text-xs font-normal text-muted-foreground ml-1">(lb)</span>}
                    </DialogTitle>
                </DialogHeader>

                <div className="px-4 pb-5 pt-3 space-y-3">
                    {/* Month navigation */}
                    <div className="flex items-center justify-between">
                        <Button
                            variant="ghost" size="icon"
                            onClick={prevMonth}
                            disabled={currentMonth <= minMonth}
                            className="h-8 w-8 rounded-lg"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </Button>
                        <span className="text-sm font-semibold">{monthLabel}</span>
                        <Button
                            variant="ghost" size="icon"
                            onClick={nextMonth}
                            disabled={currentMonth >= maxMonth}
                            className="h-8 w-8 rounded-lg"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </Button>
                    </div>

                    {loading ? (
                        <div className="flex items-center justify-center py-10 text-muted-foreground gap-2">
                            <Loader2 className="w-5 h-5 animate-spin" />
                            <span className="text-sm">Loading…</span>
                        </div>
                    ) : (
                        <>
                            {/* Day-of-week header */}
                            <div className="grid grid-cols-7 gap-px">
                                {DOW_LABELS.map(d => (
                                    <div key={d} className="text-center text-[10px] font-bold uppercase tracking-wide text-muted-foreground py-1">
                                        {d}
                                    </div>
                                ))}
                            </div>

                            {/* Calendar grid */}
                            <div className="grid grid-cols-7 gap-1">
                                {cells.map((day, idx) => {
                                    if (day === null) {
                                        return <div key={`e-${idx}`} />;
                                    }
                                    const iso = `${year}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                                    const data = dayMap.get(iso);
                                    const displayVal = data
                                        ? showLb
                                            ? data.lb !== null ? data.lb.toFixed(2) : data.qty.toString()
                                            : data.qty.toString()
                                        : null;
                                    const unit = showLb ? "lb" : "qty";
                                    // is this day inside the range?
                                    const inRange = iso >= rangeFrom && iso <= rangeTo;
                                    const heat = data
                                        ? heatBg(showLb ? (data.lb ?? 0) : data.qty, maxLb)
                                        : "";

                                    return (
                                        <div
                                            key={iso}
                                            className={`
                                                relative rounded-lg border text-center select-none
                                                transition-colors duration-100
                                                ${inRange ? "border-border" : "border-transparent opacity-40"}
                                                ${heat || "bg-muted/20"}
                                                ${data ? "shadow-sm" : ""}
                                            `}
                                            style={{ minHeight: "3.6rem" }}
                                        >
                                            {/* Date number */}
                                            <div className={`
                                                text-[10px] font-semibold leading-none pt-1.5 pb-0.5
                                                ${data ? "text-foreground" : "text-muted-foreground"}
                                            `}>
                                                {day}
                                            </div>

                                            {/* Value */}
                                            {displayVal !== null ? (
                                                <div className="px-0.5">
                                                    <div className="text-[11px] font-bold tabular-nums text-teal-700 dark:text-teal-300 leading-tight">
                                                        {displayVal}
                                                    </div>
                                                    <div className="text-[9px] text-muted-foreground leading-tight">
                                                        {unit}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="text-[10px] text-muted-foreground/40 leading-tight mt-0.5">—</div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Legend / summary */}
                            {dayMap.size > 0 && (
                                <div className="flex items-center gap-3 pt-1 border-t border-border text-xs text-muted-foreground flex-wrap">
                                    <span>
                                        <strong className="text-foreground">{dayMap.size}</strong> day{dayMap.size !== 1 ? "s" : ""} with orders
                                    </span>
                                    {showLb && (
                                        <span>
                                            Total <strong className="text-teal-700 dark:text-teal-300">
                                                {[...dayMap.values()].reduce((s, d) => s + (d.lb ?? 0), 0).toFixed(2)}
                                            </strong> lb in this month
                                        </span>
                                    )}
                                    <div className="flex items-center gap-1 ml-auto">
                                        <span className="text-[10px]">Low</span>
                                        {["bg-teal-50","bg-teal-100","bg-teal-200","bg-teal-300"].map(c => (
                                            <div key={c} className={`w-3 h-3 rounded-sm ${c}`} />
                                        ))}
                                        <span className="text-[10px]">High</span>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
