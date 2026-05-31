"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, FileDown, RefreshCw, FileText, TrendingDown, AlertTriangle } from "lucide-react";
import {
    pmixApi, reportsApi,
    type ProteinHeatmapResult,
    type DessertHeatmapResult,
    type BeverageHeatmapResult,
    type CurryHeatmapResult,
    type FoodCostVarianceResult,
} from "@/lib/api";
import { exportParReportToPDF } from "@/lib/par-report-pdf";

function daysAgoIso(n: number) {
    const d = new Date(); d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
}
function thb(n: number) { return `฿${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }

export default function ReportsPage() {
    const [days, setDays] = useState(7);

    const [protein,   setProtein]   = useState<ProteinHeatmapResult  | null>(null);
    const [dessert,   setDessert]   = useState<DessertHeatmapResult  | null>(null);
    const [beverage,  setBeverage]  = useState<BeverageHeatmapResult | null>(null);
    const [curry,     setCurry]     = useState<CurryHeatmapResult    | null>(null);

    const [loading,    setLoading]    = useState(false);
    const [error,      setError]      = useState<string | null>(null);

    // Food cost variance
    const [variance,        setVariance]        = useState<FoodCostVarianceResult | null>(null);
    const [varianceLoading, setVarianceLoading] = useState(false);

    const loadAll = async (n: number) => {
        setLoading(true);
        setError(null);
        try {
            const [p, d, b, c] = await Promise.all([
                pmixApi.proteinHeatmap(n).catch(() => null),
                pmixApi.dessertHeatmap(n).catch(() => null),
                pmixApi.beverageHeatmap(n, 100).catch(() => null),
                pmixApi.curryHeatmap(n).catch(() => null),
            ]);
            setProtein(p);
            setDessert(d);
            setBeverage(b);
            setCurry(c);
        } catch {
            setError("Failed to load heatmap data.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadAll(days); }, [days]);

    // Load food-cost variance for the same window
    useEffect(() => {
        setVarianceLoading(true);
        reportsApi.foodCostVariance(daysAgoIso(days - 1), new Date().toISOString().slice(0, 10))
            .then(setVariance)
            .catch(() => setVariance(null))
            .finally(() => setVarianceLoading(false));
    }, [days]);

    const hasAny =
        (protein?.items.length ?? 0) > 0 ||
        (dessert?.items.length ?? 0) > 0 ||
        (beverage?.items.length ?? 0) > 0 ||
        (curry?.items.length ?? 0) > 0;

    function handleExport() {
        if (!hasAny) return;
        const anyDates = protein?.dates ?? dessert?.dates ?? beverage?.dates ?? curry?.dates ?? [];
        const fromDate = anyDates[0]                 ?? new Date().toISOString().slice(0, 10);
        const toDate   = anyDates[anyDates.length-1] ?? new Date().toISOString().slice(0, 10);
        exportParReportToPDF({
            protein, dessert, beverage, curry,
            fromDate, toDate,
        });
    }

    // ── Summary card row ─────────────────────────────────────────────────────
    const summary = [
        { label: "🥩 Main Protein",          count: protein?.items.length  ?? 0, colour: "border-teal-200 dark:border-teal-800 bg-teal-50/40 dark:bg-teal-950/20"   },
        { label: "🍮 Main Desserts",         count: dessert?.items.length  ?? 0, colour: "border-pink-200 dark:border-pink-800 bg-pink-50/40 dark:bg-pink-950/20"   },
        { label: "🍹 Beverages (every menu)", count: beverage?.items.length ?? 0, colour: "border-purple-200 dark:border-purple-800 bg-purple-50/40 dark:bg-purple-950/20" },
        { label: "🍛 Main Curry",            count: curry?.items.length    ?? 0, colour: "border-amber-200 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-950/20" },
    ];

    return (
        <div className="space-y-5 p-4 sm:p-6 max-w-5xl mx-auto">

            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <FileText className="w-6 h-6 text-primary" />
                        Reports
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        PAR / ROP Suggestion Report — Main Protein · Main Desserts · Beverages · Main Curry
                    </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <div className="flex items-center gap-1 p-0.5 bg-muted/50 rounded-lg">
                        {[7, 14, 30].map(d => (
                            <button key={d}
                                onClick={() => setDays(d)}
                                disabled={loading}
                                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all
                                    ${days === d ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}
                                    disabled:opacity-50`}>
                                {d}d
                            </button>
                        ))}
                    </div>
                    <button onClick={() => loadAll(days)} disabled={loading}
                        className="p-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors disabled:opacity-50"
                        title="Refresh">
                        <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                    </button>
                </div>
            </div>

            {/* PAR Formula explanation */}
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-base">📐 PAR / ROP Formula (Lean)</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-1">
                    <p><strong className="text-foreground">ADU</strong> = total qty ÷ days</p>
                    <p><strong className="text-foreground">PAR Min</strong> = ADU × 1 (1-day safety stock — supplier delivers almost daily)</p>
                    <p><strong className="text-foreground">ROP</strong> = ADU × 1 + PAR Min = ADU × 2 (reorder when 2 days remain)</p>
                    <p><strong className="text-foreground">PAR Max</strong> = ADU × 3 (max 3 days on hand → less waste)</p>
                </CardContent>
            </Card>

            {/* Summary grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {summary.map(s => (
                    <Card key={s.label} className={`border-2 ${s.colour}`}>
                        <CardContent className="py-4 px-4">
                            <p className="text-xs text-muted-foreground">{s.label}</p>
                            <p className="text-2xl font-bold mt-1 tabular-nums">{loading ? "…" : s.count}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">items</p>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {error && (
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            )}

            {/* Download card */}
            <Card className="border-2 border-primary/30">
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                        <FileDown className="w-5 h-5 text-primary" />
                        Download PAR / ROP Suggestion Report
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                        Combined PDF with all 4 sections, lean formula, current stock comparison, and Order suggestions for items below PAR Min.
                    </p>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex items-center gap-2 py-4 text-muted-foreground">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span className="text-sm">Loading data from PMIX…</span>
                        </div>
                    ) : !hasAny ? (
                        <p className="text-sm text-muted-foreground italic">
                            No PMIX data found in the last {days} days. Upload a PMIX report in{" "}
                            <a href="/analysis/pmix" className="underline text-primary">PMIX Analytics</a> first.
                        </p>
                    ) : (
                        <Button onClick={handleExport} disabled={!hasAny}
                            className="gap-2 bg-primary hover:bg-primary/90">
                            <FileDown className="w-4 h-4" />
                            Download PDF Report ({days}-day window)
                        </Button>
                    )}
                </CardContent>
            </Card>

            {/* ── Food Cost Variance ──────────────────────────────────────── */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                        <TrendingDown className="w-5 h-5 text-rose-500" />
                        Food Cost Variance — last {days} days
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                        Where money leaks: logged <strong>waste</strong> + physical-count <strong>shrinkage</strong>
                        (counted &lt; expected), valued at average cost. Worst offenders first.
                    </p>
                </CardHeader>
                <CardContent>
                    {varianceLoading ? (
                        <div className="flex items-center gap-2 py-4 text-muted-foreground">
                            <Loader2 className="w-4 h-4 animate-spin" /><span className="text-sm">Loading…</span>
                        </div>
                    ) : !variance || variance.items.length === 0 ? (
                        <p className="text-sm text-muted-foreground italic">
                            No usage, waste, or stock-count data in this window yet. Log waste and run a
                            Physical Stock Count to populate variance.
                        </p>
                    ) : (
                        <>
                            {/* Totals strip */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                                <div className="rounded-xl border-2 border-rose-200 dark:border-rose-800 bg-rose-50/40 dark:bg-rose-950/20 px-4 py-3">
                                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Total Loss</p>
                                    <p className="text-xl font-bold text-rose-600 dark:text-rose-400 tabular-nums">{thb(variance.totals.lossValue)}</p>
                                </div>
                                <div className="rounded-xl border border-border px-4 py-3">
                                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Waste</p>
                                    <p className="text-xl font-bold tabular-nums">{thb(variance.totals.wasteValue)}</p>
                                </div>
                                <div className="rounded-xl border border-border px-4 py-3">
                                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Count Shrinkage</p>
                                    <p className="text-xl font-bold tabular-nums">{thb(variance.totals.shrinkageValue)}</p>
                                </div>
                                <div className="rounded-xl border border-border px-4 py-3">
                                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Sales Usage</p>
                                    <p className="text-xl font-bold tabular-nums">{thb(variance.totals.salesUsageValue)}</p>
                                </div>
                            </div>

                            {/* Per-ingredient table */}
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs border-collapse" style={{ minWidth: 560 }}>
                                    <thead>
                                        <tr className="border-b-2 border-border text-muted-foreground uppercase tracking-wide text-[10px]">
                                            <th className="text-left font-semibold py-2 pr-3">Ingredient</th>
                                            <th className="text-right font-semibold py-2 px-2">Sales Use</th>
                                            <th className="text-right font-semibold py-2 px-2">Waste</th>
                                            <th className="text-right font-semibold py-2 px-2">Count Var.</th>
                                            <th className="text-right font-semibold py-2 px-2">Loss Qty</th>
                                            <th className="text-right font-semibold py-2 pl-2">Loss ฿</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/50">
                                        {variance.items.slice(0, 40).map(it => (
                                            <tr key={it.ingredientId} className="hover:bg-muted/20">
                                                <td className="py-1.5 pr-3">
                                                    <div className="font-medium text-foreground truncate">{it.name}</div>
                                                    <div className="text-[10px] text-muted-foreground">{it.category} · {it.unit}</div>
                                                </td>
                                                <td className="text-right tabular-nums py-1.5 px-2 text-muted-foreground">{it.salesUsage || "—"}</td>
                                                <td className="text-right tabular-nums py-1.5 px-2">{it.wasteQty ? <span className="text-amber-600 dark:text-amber-400 font-medium">{it.wasteQty}</span> : "—"}</td>
                                                <td className="text-right tabular-nums py-1.5 px-2">
                                                    {it.countVariance === 0 ? "—" :
                                                        <span className={it.countVariance < 0 ? "text-rose-600 dark:text-rose-400 font-medium" : "text-emerald-600 dark:text-emerald-400"}>
                                                            {it.countVariance > 0 ? "+" : ""}{it.countVariance}
                                                        </span>}
                                                </td>
                                                <td className="text-right tabular-nums py-1.5 px-2 font-medium">{it.lossQty || "—"}</td>
                                                <td className="text-right tabular-nums py-1.5 pl-2 font-bold">
                                                    {it.lossValue > 0
                                                        ? <span className="text-rose-600 dark:text-rose-400">{thb(it.lossValue)}</span>
                                                        : <span className="text-muted-foreground">—</span>}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-3">
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                                Count Var. needs Physical Stock Counts to populate. Negative = stock missing vs expected (shrinkage).
                            </p>
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
