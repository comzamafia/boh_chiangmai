"use client";
/**
 * BeverageCalendarModal
 *
 * Shows the monthly calendar for a beverage group's total daily orders,
 * then a detailed breakdown of every menu item in that group with:
 *   - Total qty for the date range
 *   - Avg / day
 *   - Mini inline bar showing each item's relative daily distribution
 */

import { useEffect, useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, ChevronLeft, ChevronRight, Download } from "lucide-react";
import * as XLSX from "xlsx";
import { pmixApi, type BeverageDailyItem } from "@/lib/api";

// ─── Calendar helpers ─────────────────────────────────────────────────────────
const DOW_SM = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const DOW_LG = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function daysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate(); }
function firstDow(y: number, m: number)    { return (new Date(y, m, 1).getDay() + 6) % 7; }

const HEAT = [
    "bg-purple-50 dark:bg-purple-950/40",
    "bg-purple-100 dark:bg-purple-900/50",
    "bg-purple-200 dark:bg-purple-800/60",
    "bg-purple-300 dark:bg-purple-700/80",
];
function heatBg(val: number, max: number) {
    if (!max || !val) return "";
    const t = val / max;
    if (t < 0.25) return HEAT[0];
    if (t < 0.5)  return HEAT[1];
    if (t < 0.75) return HEAT[2];
    return HEAT[3];
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
    group:     string;   // e.g. "Beer"
    rangeFrom: string;
    rangeTo:   string;
    open:      boolean;
    onClose:   () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function BeverageCalendarModal({ group, rangeFrom, rangeTo, open, onClose }: Props) {
    const [loading,       setLoading]       = useState(false);
    const [dayMap,        setDayMap]        = useState<Map<string, number>>(new Map());
    const [byItem,        setByItem]        = useState<BeverageDailyItem[]>([]);
    const [currentMonth,  setCurrentMonth]  = useState(rangeFrom.slice(0, 7));
    const [expandedItem,  setExpandedItem]  = useState<string | null>(null);

    useEffect(() => {
        if (open) {
            setCurrentMonth(rangeFrom.slice(0, 7));
            setExpandedItem(null);
        }
    }, [open, group, rangeFrom]);

    const load = useCallback(async () => {
        if (!open) return;
        setLoading(true);
        try {
            const res = await pmixApi.beverageDaily(group, rangeFrom, rangeTo);
            const m = new Map<string, number>();
            for (const d of res.days) m.set(d.date, d.qty);
            setDayMap(m);
            setByItem(res.byItem ?? []);
        } catch {
            setDayMap(new Map());
            setByItem([]);
        } finally {
            setLoading(false);
        }
    }, [open, group, rangeFrom, rangeTo]);

    useEffect(() => { load(); }, [load]);

    // Calendar pagination
    const [year, mon] = currentMonth.split("-").map(Number);
    const minMonth    = rangeFrom.slice(0, 7);
    const maxMonth    = rangeTo.slice(0, 7);
    const prevMonth   = () => { const m = new Date(year, mon - 2, 1).toISOString().slice(0, 7); if (m >= minMonth) setCurrentMonth(m); };
    const nextMonth   = () => { const m = new Date(year, mon,     1).toISOString().slice(0, 7); if (m <= maxMonth) setCurrentMonth(m); };

    const totalDays = daysInMonth(year, mon - 1);
    const startDow  = firstDow(year, mon - 1);
    const cells: (number | null)[] = [
        ...Array(startDow).fill(null),
        ...Array.from({ length: totalDays }, (_, i) => i + 1),
    ];
    while (cells.length % 7 !== 0) cells.push(null);

    const monthMax = Math.max(0, ...cells
        .filter((c): c is number => c !== null)
        .map(day => dayMap.get(`${year}-${String(mon).padStart(2,"0")}-${String(day).padStart(2,"0")}`) ?? 0));

    const monthLabel    = new Date(year, mon - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
    const daysWithData  = dayMap.size;
    const monthTotal    = [...dayMap.values()].reduce((s, v) => s + v, 0);
    const rangeDays     = Math.max(1, Math.round((new Date(rangeTo + "T00:00:00").getTime() - new Date(rangeFrom + "T00:00:00").getTime()) / 86_400_000) + 1);
    const maxItemQty    = byItem[0]?.totalQty ?? 1;

    // ── Excel export ──────────────────────────────────────────────────────────
    function handleExport() {
        const wb  = XLSX.utils.book_new();
        const dow = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

        // Sheet 1: daily group total
        const aoa: (string | number)[][] = [
            [`Group: ${group}`],
            [`Range: ${rangeFrom} → ${rangeTo}`],
            [],
            ["Date", "Day", "Total Qty"],
        ];
        const start = new Date(rangeFrom + "T00:00:00");
        const end   = new Date(rangeTo   + "T00:00:00");
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const iso = d.toISOString().slice(0, 10);
            aoa.push([iso, dow[d.getDay()], dayMap.get(iso) ?? 0]);
        }
        const ws1 = XLSX.utils.aoa_to_sheet(aoa);
        ws1["!cols"] = [{ wch: 14 }, { wch: 6 }, { wch: 12 }];
        XLSX.utils.book_append_sheet(wb, ws1, "Daily Total");

        // Sheet 2: item breakdown
        const aoa2: (string | number)[][] = [
            ["Item Name", "Total Qty", "Avg / Day"],
            ...byItem.map(it => [it.itemName, it.totalQty, it.avgPerDay]),
        ];
        const ws2 = XLSX.utils.aoa_to_sheet(aoa2);
        ws2["!cols"] = [{ wch: 35 }, { wch: 12 }, { wch: 12 }];
        XLSX.utils.book_append_sheet(wb, ws2, "By Item");

        XLSX.writeFile(wb, `${group.replace(/[\\/:*?"<>|]/g,"_")}_${rangeFrom}_to_${rangeTo}.xlsx`);
    }

    return (
        <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
            <DialogContent className="
                p-0 overflow-hidden
                w-[calc(100vw-1.5rem)] mx-auto
                sm:max-w-xl
                max-h-[92dvh] flex flex-col
            ">
                {/* Header */}
                <DialogHeader className="px-4 sm:px-5 pt-4 sm:pt-5 pb-3 border-b border-border shrink-0">
                    <DialogTitle className="flex items-center gap-2 text-sm sm:text-base min-w-0">
                        <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0 bg-purple-500" />
                        <span className="truncate font-semibold">{group}</span>
                        <span className="text-xs font-normal text-muted-foreground shrink-0 ml-0.5">(orders / day)</span>
                    </DialogTitle>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{rangeFrom} → {rangeTo}</p>
                </DialogHeader>

                <div className="px-3 sm:px-4 pb-4 pt-3 space-y-4 overflow-y-auto flex-1 min-h-0">

                    {/* ── Month nav ── */}
                    <div className="flex items-center justify-between">
                        <Button variant="ghost" size="icon" onClick={prevMonth} disabled={currentMonth <= minMonth}
                            className="h-9 w-9 rounded-xl touch-manipulation">
                            <ChevronLeft className="w-5 h-5" />
                        </Button>
                        <span className="text-sm font-semibold">{monthLabel}</span>
                        <Button variant="ghost" size="icon" onClick={nextMonth} disabled={currentMonth >= maxMonth}
                            className="h-9 w-9 rounded-xl touch-manipulation">
                            <ChevronRight className="w-5 h-5" />
                        </Button>
                    </div>

                    {loading ? (
                        <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground">
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
                                    if (day === null) return <div key={`e-${idx}`} className="min-h-[2.5rem] sm:min-h-[3.2rem]" />;
                                    const iso    = `${year}-${String(mon).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
                                    const qty    = dayMap.get(iso);
                                    const inRng  = iso >= rangeFrom && iso <= rangeTo;
                                    const heat   = qty ? heatBg(qty, monthMax) : "";
                                    return (
                                        <div key={iso} className={`
                                            rounded-md sm:rounded-lg border text-center select-none
                                            min-h-[2.5rem] sm:min-h-[3.2rem]
                                            flex flex-col items-center justify-start pt-1 transition-colors duration-100
                                            ${inRng ? "border-border" : "border-transparent opacity-30"}
                                            ${heat || "bg-muted/20"}
                                            ${qty ? "shadow-sm" : ""}
                                        `}>
                                            <div className={`text-[9px] sm:text-[10px] font-semibold leading-none ${qty ? "text-foreground" : "text-muted-foreground/60"}`}>
                                                {day}
                                            </div>
                                            {qty != null ? (
                                                <div className="mt-0.5 px-0.5 w-full">
                                                    <div className="text-[10px] sm:text-[11px] font-bold tabular-nums leading-tight text-purple-700 dark:text-purple-300">{qty}</div>
                                                    <div className="text-[8px] sm:text-[9px] text-muted-foreground leading-none">qty</div>
                                                </div>
                                            ) : (
                                                inRng && <div className="text-[9px] text-muted-foreground/30 mt-0.5">·</div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Calendar summary */}
                            {daysWithData > 0 ? (
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-2 border-t border-border text-xs text-muted-foreground">
                                    <span><strong className="text-foreground">{daysWithData}</strong> day{daysWithData !== 1 ? "s" : ""} with orders</span>
                                    <span>Range total <strong className="text-purple-600 dark:text-purple-300">{monthTotal.toLocaleString()} orders</strong></span>
                                    <div className="flex items-center gap-1 ml-auto">
                                        <span className="text-[10px]">Low</span>
                                        {HEAT.map(c => <div key={c} className={`w-2.5 h-2.5 rounded-sm border border-border/40 ${c}`} />)}
                                        <span className="text-[10px]">High</span>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-center text-xs text-muted-foreground py-2">
                                    No orders for <strong>{group}</strong> in {monthLabel}
                                </p>
                            )}

                            {/* Export button */}
                            {dayMap.size > 0 && (
                                <Button size="sm" variant="outline" onClick={handleExport}
                                    className="w-full h-9 gap-1.5 text-xs rounded-lg touch-manipulation">
                                    <Download className="w-3.5 h-3.5" />
                                    Export to Excel ({rangeFrom} → {rangeTo})
                                </Button>
                            )}

                            {/* ── Item breakdown ─────────────────────────────────────── */}
                            {byItem.length > 0 && (
                                <div className="rounded-xl border border-border overflow-hidden">
                                    {/* Section header */}
                                    <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border">
                                        <p className="text-xs font-semibold text-foreground">
                                            Menu Items — {byItem.length} items · {rangeDays}-day range
                                        </p>
                                        <span className="text-[10px] text-muted-foreground">tap row for daily detail</span>
                                    </div>

                                    {/* Column headers */}
                                    <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border-b border-border">
                                        <div>Item</div>
                                        <div className="text-right">Total</div>
                                        <div className="text-right">Avg/day</div>
                                    </div>

                                    {/* Rows */}
                                    <div className="divide-y divide-border">
                                        {byItem.map((it) => {
                                            const isExp = expandedItem === it.itemName;
                                            // Build a date→qty map for this item's days
                                            const itemDayMap = new Map(it.days.map(d => [d.date, d.qty]));
                                            return (
                                                <div key={it.itemName}>
                                                    {/* Summary row */}
                                                    <button
                                                        onClick={() => setExpandedItem(isExp ? null : it.itemName)}
                                                        className="w-full grid grid-cols-[1fr_auto_auto] gap-x-3 px-3 py-2 text-left hover:bg-muted/30 active:bg-muted/50 transition-colors touch-manipulation"
                                                    >
                                                        <div className="min-w-0">
                                                            <div className="text-xs font-medium text-foreground truncate">{it.itemName}</div>
                                                            {/* Progress bar */}
                                                            <div className="w-full bg-muted rounded-full h-1 mt-1">
                                                                <div className="bg-purple-500 h-1 rounded-full"
                                                                    style={{ width: `${Math.round((it.totalQty / maxItemQty) * 100)}%` }} />
                                                            </div>
                                                        </div>
                                                        <div className="text-right self-center tabular-nums font-bold text-purple-600 dark:text-purple-300 text-xs shrink-0">
                                                            {it.totalQty.toLocaleString()}
                                                        </div>
                                                        <div className="text-right self-center tabular-nums text-muted-foreground text-[11px] shrink-0">
                                                            {it.avgPerDay}
                                                        </div>
                                                    </button>

                                                    {/* Expanded daily detail */}
                                                    {isExp && it.days.length > 0 && (
                                                        <div className="bg-muted/20 px-3 py-2 space-y-0.5 border-t border-border">
                                                            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide mb-1">Daily breakdown</p>
                                                            <div className="grid grid-cols-[auto_1fr_auto] gap-x-3 max-h-48 overflow-y-auto text-xs">
                                                                {(() => {
                                                                    // Show all dates in range, not just dates with sales
                                                                    const rows: { date: string; qty: number }[] = [];
                                                                    const s = new Date(rangeFrom + "T00:00:00");
                                                                    const e = new Date(rangeTo   + "T00:00:00");
                                                                    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
                                                                        const iso = d.toISOString().slice(0, 10);
                                                                        const qty = itemDayMap.get(iso) ?? 0;
                                                                        rows.push({ date: iso, qty });
                                                                    }
                                                                    const maxDayQty = Math.max(1, ...rows.map(r => r.qty));
                                                                    return rows.map(({ date, qty }) => (
                                                                        <div key={date} className="contents">
                                                                            <span className="text-muted-foreground tabular-nums">{date.slice(5)}</span>
                                                                            <div className="self-center">
                                                                                <div className="h-1.5 bg-purple-200 dark:bg-purple-800 rounded-full overflow-hidden">
                                                                                    <div className="h-full bg-purple-500 rounded-full"
                                                                                        style={{ width: qty ? `${Math.round((qty / maxDayQty) * 100)}%` : "0%" }} />
                                                                                </div>
                                                                            </div>
                                                                            <span className={`tabular-nums text-right ${qty > 0 ? "font-semibold text-foreground" : "text-muted-foreground/40"}`}>
                                                                                {qty > 0 ? qty : "—"}
                                                                            </span>
                                                                        </div>
                                                                    ));
                                                                })()}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Footer total */}
                                    <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 px-3 py-2 border-t border-border bg-muted/20 text-xs font-bold">
                                        <div>TOTAL</div>
                                        <div className="text-right text-purple-600 dark:text-purple-300 tabular-nums">
                                            {byItem.reduce((s, it) => s + it.totalQty, 0).toLocaleString()}
                                        </div>
                                        <div className="text-right text-muted-foreground tabular-nums">
                                            {(byItem.reduce((s, it) => s + it.totalQty, 0) / rangeDays).toFixed(2)}
                                        </div>
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
