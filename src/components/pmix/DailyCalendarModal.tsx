"use client";

/**
 * DailyCalendarModal — generic mobile-first calendar popup
 *
 * Renders a monthly calendar of daily usage for one protein or dessert item,
 * plus an optional PAR / ROP suggestion card below.
 */

import { useEffect, useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, ChevronLeft, ChevronRight, Brain, AlertCircle, Download } from "lucide-react";
import * as XLSX from "xlsx";

// ─── public types ─────────────────────────────────────────────────────────────
export interface DailyCalendarDay {
    date: string;
    qty:  number;
    lb?:  number | null;
}

// Kept for backwards compatibility with callers that still pass the optional
// inventory-linked props — the values are ignored by this component.
export interface ParApplyItem {
    inventoryItemId: string;
    parMin:          number;
    parMax:          number;
    reorderPoint:    number;
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
    itemName:      string;
    unitLabel:     string;
    color:         ColorScheme;
    rangeFrom:     string;
    rangeTo:       string;
    open:          boolean;
    onClose:       () => void;
    fetchFn:       (item: string, from: string, to: string) => Promise<{ days: DailyCalendarDay[] }>;
    showLb?:       boolean;
    /** @deprecated — ignored. PAR/ROP is now computed from PMIX data alone. */
    parSuggestion?: unknown;
    /** @deprecated — ignored. PAR/ROP is now computed from PMIX data alone. */
    onApplyPar?:    unknown;
}

export default function DailyCalendarModal({
    itemName, unitLabel, color, rangeFrom, rangeTo, open, onClose,
    fetchFn, showLb = false,
}: Props) {
    const initMonth = rangeFrom.slice(0, 7);
    const [currentMonth, setCurrentMonth] = useState(initMonth);
    const [loading,      setLoading]      = useState(false);
    const [dayMap,       setDayMap]       = useState<Map<string, DailyCalendarDay>>(new Map());

    useEffect(() => {
        if (open) {
            setCurrentMonth(rangeFrom.slice(0, 7));
        }
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

    // ─── Self-contained PAR/ROP suggestion from PMIX data alone ───────────────
    // Uses the calendar's own unit (lb for proteins with oz portions, orders
    // otherwise). No inventory or ingredient link required.
    const rangeDays = Math.max(
        1,
        Math.round(
            (new Date(rangeTo + "T00:00:00").getTime() -
                new Date(rangeFrom + "T00:00:00").getTime()) /
                86_400_000,
        ) + 1,
    );
    const totalUsage = showLb
        ? [...dayMap.values()].reduce((s, d) => s + (d.lb ?? 0), 0)
        : [...dayMap.values()].reduce((s, d) => s + d.qty, 0);
    const aduSelf = totalUsage / rangeDays;

    // Lean PAR — supplier delivers almost daily so we keep minimal buffer
    //   PAR Min  = ADU × 1   (1-day safety stock — enough for a single missed delivery)
    //   ROP      = ADU × 1 + PAR Min = ADU × 2   (reorder when 2 days of stock remain)
    //   PAR Max  = ADU × 3   (3-day max on hand — no need to hold a full week)
    const LEAD_TIME_DAYS = 1;
    const HOLDING_DAYS   = 3;
    const SAFETY_MULT    = 1;
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const selfParMin = r2(aduSelf * SAFETY_MULT);
    const selfROP    = r2(aduSelf * LEAD_TIME_DAYS + selfParMin);
    const selfParMax = r2(aduSelf * HOLDING_DAYS);
    const selfUnit   = showLb ? "lb" : "orders";
    const hasSelfData = aduSelf > 0;

    // ── Excel export handler ─────────────────────────────────────────────────
    function handleExport() {
        // Build full day list across the entire range
        const start = new Date(rangeFrom + "T00:00:00");
        const end   = new Date(rangeTo   + "T00:00:00");
        const dowNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

        const headerRow: (string | number)[] = showLb
            ? ["Date", "Day", "Qty", "Lb"]
            : ["Date", "Day", "Qty"];

        const rows: (string | number)[][] = [];
        let totalQty = 0;
        let totalLb  = 0;
        let daysWith = 0;

        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const iso = d.toISOString().slice(0, 10);
            const data = dayMap.get(iso);
            const qty = data?.qty ?? 0;
            const lb  = data?.lb  ?? 0;
            if (qty > 0) { totalQty += qty; daysWith++; }
            totalLb += lb;
            rows.push(showLb
                ? [iso, dowNames[d.getDay()], qty, Number(lb.toFixed(2))]
                : [iso, dowNames[d.getDay()], qty]
            );
        }

        // Summary block at the top
        const meta: (string | number)[][] = [
            [`Item: ${itemName}`],
            [`Unit: ${unitLabel}`],
            [`Range: ${rangeFrom} → ${rangeTo}`],
            [`Days with orders: ${daysWith}`],
            [`Total qty: ${totalQty}`],
            ...(showLb ? [[`Total lb: ${totalLb.toFixed(2)}`]] : []),
            [`Generated: ${new Date().toISOString().slice(0, 19).replace("T", " ")}`],
            [],
        ];

        const aoa = [...meta, headerRow, ...rows];

        // Totals row at bottom
        aoa.push(showLb
            ? ["Total", "", totalQty, Number(totalLb.toFixed(2))]
            : ["Total", "", totalQty]
        );

        const ws = XLSX.utils.aoa_to_sheet(aoa);

        // Column widths
        ws["!cols"] = showLb
            ? [{ wch: 14 }, { wch: 6 }, { wch: 10 }, { wch: 10 }]
            : [{ wch: 14 }, { wch: 6 }, { wch: 10 }];

        const wb = XLSX.utils.book_new();
        const safeName = itemName.replace(/[\\/:*?"<>|]/g, "_").slice(0, 28);
        XLSX.utils.book_append_sheet(wb, ws, safeName || "Daily");

        const fileName = `${safeName}_${rangeFrom}_to_${rangeTo}.xlsx`;
        XLSX.writeFile(wb, fileName);
    }

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
                <div className="px-3 sm:px-4 pb-4 pt-3 space-y-3 overflow-y-auto flex-1 min-h-0">

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
                        <div className="flex items-center justify-center py-10 text-muted-foreground gap-2">
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
                                    const iso     = `${year}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                                    const data    = dayMap.get(iso);
                                    const inRange = iso >= rangeFrom && iso <= rangeTo;
                                    const rawVal  = data ? (showLb ? (data.lb ?? data.qty) : data.qty) : 0;
                                    const heat    = data ? heatBg(rawVal, monthMax, color) : "";
                                    const displayVal = data
                                        ? showLb && data.lb != null ? data.lb.toFixed(2) : data.qty.toString()
                                        : null;

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
                                            <div className={`text-[9px] sm:text-[10px] font-semibold leading-none ${data ? "text-foreground" : "text-muted-foreground/60"}`}>
                                                {day}
                                            </div>
                                            {displayVal !== null ? (
                                                <div className="mt-0.5 px-0.5 w-full">
                                                    <div className={`text-[10px] sm:text-[11px] font-bold tabular-nums leading-tight ${scheme.val}`}>
                                                        {displayVal}
                                                    </div>
                                                    <div className="text-[8px] sm:text-[9px] text-muted-foreground leading-none">
                                                        {showLb ? "lb" : "qty"}
                                                    </div>
                                                </div>
                                            ) : (
                                                inRange && <div className="text-[9px] text-muted-foreground/30 mt-0.5">·</div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Calendar summary */}
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
                                    <div className="flex items-center gap-1 ml-auto">
                                        <span className="text-[10px]">Low</span>
                                        {scheme.heat.map(c => (
                                            <div key={c} className={`w-2.5 h-2.5 rounded-sm border border-border/40 ${c}`} />
                                        ))}
                                        <span className="text-[10px]">High</span>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-center text-xs text-muted-foreground py-2">
                                    No orders for <strong>{itemName}</strong> in {monthLabel}
                                </p>
                            )}

                            {/* Export to Excel */}
                            {dayMap.size > 0 && (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={handleExport}
                                    className="w-full h-9 gap-1.5 text-xs rounded-lg touch-manipulation"
                                >
                                    <Download className="w-3.5 h-3.5" />
                                    Export to Excel ({rangeFrom} → {rangeTo})
                                </Button>
                            )}
                        </>
                    )}

                    {/* ── PAR / ROP Suggestion card (self-contained, PMIX-only) ─── */}
                    {hasSelfData && (
                        <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-950/30 overflow-hidden">
                            {/* Card header */}
                            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-blue-200 dark:border-blue-800 bg-blue-100/50 dark:bg-blue-900/30">
                                <Brain className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-semibold text-blue-900 dark:text-blue-200">
                                        PAR / ROP Suggestion
                                    </p>
                                    <p className="text-[10px] text-blue-700 dark:text-blue-400 truncate">
                                        {itemName} · {rangeDays}-day ADU: <strong>{aduSelf.toFixed(2)}</strong> {selfUnit}/day · from PMIX sales
                                    </p>
                                </div>
                            </div>

                            {/* PAR grid — values in the calendar's own unit */}
                            <div className="px-3 py-2.5 space-y-2">
                                <div className="grid grid-cols-[auto_1fr_1fr_1fr] gap-x-3 gap-y-1 text-xs">
                                    <div />
                                    <div className="text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">PAR Min</div>
                                    <div className="text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">ROP</div>
                                    <div className="text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">PAR Max</div>

                                    <div className="text-[10px] text-blue-700 dark:text-blue-400 font-semibold self-center">
                                        Suggest<br />
                                        <span className="text-[9px] font-normal text-muted-foreground">({selfUnit})</span>
                                    </div>
                                    <div className="text-center tabular-nums font-bold text-blue-700 dark:text-blue-300 bg-blue-100/60 dark:bg-blue-900/40 rounded py-0.5">
                                        {selfParMin.toFixed(2)}
                                    </div>
                                    <div className="text-center tabular-nums font-bold text-blue-700 dark:text-blue-300 bg-blue-100/60 dark:bg-blue-900/40 rounded py-0.5">
                                        {selfROP.toFixed(2)}
                                    </div>
                                    <div className="text-center tabular-nums font-bold text-blue-700 dark:text-blue-300 bg-blue-100/60 dark:bg-blue-900/40 rounded py-0.5">
                                        {selfParMax.toFixed(2)}
                                    </div>
                                </div>

                                {/* Legend with the formula */}
                                <div className="text-[10px] text-muted-foreground space-y-0.5">
                                    <p>All values in <strong>{selfUnit}</strong></p>
                                    <p className="leading-tight">
                                        PAR Min = ADU × {SAFETY_MULT} ·
                                        ROP = ADU × {LEAD_TIME_DAYS} + PAR Min ·
                                        PAR Max = ADU × {HOLDING_DAYS} days
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {!hasSelfData && !loading && (
                        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-3 py-3 flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400">
                            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                            <span>No PMIX sales recorded for <strong>{itemName}</strong> in this range — PAR/ROP suggestion unavailable.</span>
                        </div>
                    )}

                </div>
            </DialogContent>
        </Dialog>
    );
}
