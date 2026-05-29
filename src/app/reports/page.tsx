"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, FileDown, RefreshCw, FileText } from "lucide-react";
import {
    pmixApi,
    type ProteinHeatmapResult,
    type DessertHeatmapResult,
    type BeverageHeatmapResult,
    type CurryHeatmapResult,
} from "@/lib/api";
import { exportParReportToPDF } from "@/lib/par-report-pdf";

export default function ReportsPage() {
    const [days, setDays] = useState(7);

    const [protein,   setProtein]   = useState<ProteinHeatmapResult  | null>(null);
    const [dessert,   setDessert]   = useState<DessertHeatmapResult  | null>(null);
    const [beverage,  setBeverage]  = useState<BeverageHeatmapResult | null>(null);
    const [curry,     setCurry]     = useState<CurryHeatmapResult    | null>(null);

    const [loading,    setLoading]    = useState(false);
    const [error,      setError]      = useState<string | null>(null);

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
        </div>
    );
}
