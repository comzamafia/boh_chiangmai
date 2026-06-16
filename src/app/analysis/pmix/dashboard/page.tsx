"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
    Loader2, FileDown, RefreshCw, CalendarDays,
    UtensilsCrossed, Wine, GlassWater, Cake, Star, Sparkles, BarChart3,
} from "lucide-react";
import { pmixApi, type PmixDashboardResult, type PmixUpload } from "@/lib/api";
import { exportPmixDashboardToPDF } from "@/lib/pmix-dashboard-pdf";
import { STORE_SHORT } from "@/lib/branding";

const LOCATION_LABEL = STORE_SHORT;
type Mode = "single" | "range";

// ─── KPI card colour tokens ──────────────────────────────────────────────────
const KPI = {
    food:     { border: "border-rose-300/70 dark:border-rose-700",       bg: "bg-rose-50/40 dark:bg-rose-950/20",       label: "text-rose-600 dark:text-rose-400",       big: "text-rose-600 dark:text-rose-400",       icon: UtensilsCrossed },
    liquor:   { border: "border-emerald-300/70 dark:border-emerald-700", bg: "bg-emerald-50/40 dark:bg-emerald-950/20", label: "text-emerald-600 dark:text-emerald-400", big: "text-emerald-600 dark:text-emerald-400", icon: Wine },
    beverage: { border: "border-blue-300/70 dark:border-blue-700",       bg: "bg-blue-50/40 dark:bg-blue-950/20",       label: "text-blue-600 dark:text-blue-400",       big: "text-blue-600 dark:text-blue-400",       icon: GlassWater },
    dessert:  { border: "border-orange-300/70 dark:border-orange-700",   bg: "bg-orange-50/40 dark:bg-orange-950/20",   label: "text-orange-600 dark:text-orange-400",   big: "text-orange-600 dark:text-orange-400",   icon: Cake },
};

function fmtMoney(n: number) {
    return `$${n.toLocaleString("en-CA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
function formatDateMonDay(iso: string): string {
    const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
    if (isNaN(d.getTime())) return iso;
    const months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
    return `${months[d.getMonth()]} ${d.getDate()}`;
}
function isoOnly(iso: string) {
    return /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : iso;
}
function todayIso() { return new Date().toISOString().slice(0, 10); }
function daysAgoIso(n: number) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function PmixDashboardPage() {
    const [mode,        setMode]        = useState<Mode>("single");
    const [uploads,     setUploads]     = useState<PmixUpload[]>([]);
    const [selectedId,  setSelectedId]  = useState<string>("");
    const [rangeFrom,   setRangeFrom]   = useState<string>(daysAgoIso(6));
    const [rangeTo,     setRangeTo]     = useState<string>(todayIso());

    const [data,        setData]        = useState<PmixDashboardResult | null>(null);
    const [loading,     setLoading]     = useState(false);
    const [error,       setError]       = useState<string | null>(null);

    // Load upload list
    useEffect(() => {
        pmixApi.listUploads()
            .then(list => {
                setUploads(list);
                if (list.length > 0) setSelectedId(list[0].id);
            })
            .catch(() => setError("Failed to load PMIX uploads"));
    }, []);

    // Load dashboard data
    const load = useCallback(async () => {
        if (mode === "single" && !selectedId) return;
        if (mode === "range" && (!rangeFrom || !rangeTo)) return;
        setLoading(true);
        setError(null);
        try {
            const res = mode === "single"
                ? await pmixApi.dashboard(selectedId)
                : await pmixApi.dashboardRange(rangeFrom, rangeTo);
            setData(res);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load dashboard");
            setData(null);
        } finally {
            setLoading(false);
        }
    }, [mode, selectedId, rangeFrom, rangeTo]);

    // Auto-load on single-upload selection change OR mode switch
    useEffect(() => {
        if (mode === "single") load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode, selectedId]);

    function handleExport() {
        if (data) exportPmixDashboardToPDF(data, LOCATION_LABEL);
    }

    // Switch mode: clear data so user sees a clean slate
    function changeMode(m: Mode) {
        if (m === mode) return;
        setMode(m);
        setData(null);
        setError(null);
    }

    // Title bar label
    const titleLabel = data
        ? (data.rangeFrom && data.rangeTo
            ? `${formatDateMonDay(data.rangeFrom)} – ${formatDateMonDay(data.rangeTo)}`
            : formatDateMonDay(isoOnly(data.businessDate)))
        : "";

    const dateBadge = data
        ? (data.rangeFrom && data.rangeTo
            ? `${data.rangeFrom} → ${data.rangeTo}`
            : isoOnly(data.businessDate))
        : "";

    return (
        <div className="space-y-5 p-4 sm:p-6 max-w-6xl mx-auto">

            {/* ── Top bar ───────────────────────────────────────────────────── */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                    <BarChart3 className="w-6 h-6 text-primary shrink-0" />
                    <div className="min-w-0">
                        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">PMIX Dashboard</h1>
                        <p className="text-xs text-muted-foreground">
                            Single day or aggregated range · click Export PDF for a printable copy
                        </p>
                    </div>
                </div>

                <Button onClick={handleExport} disabled={!data || loading}
                    className="h-9 gap-1.5 text-xs bg-primary hover:bg-primary/90">
                    <FileDown className="w-4 h-4" />
                    <span className="hidden sm:inline">Export PDF</span>
                </Button>
            </div>

            {/* ── Mode + selector card ──────────────────────────────────────── */}
            <Card>
                <CardContent className="p-4 space-y-3">
                    {/* Mode toggle */}
                    <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-xl w-full sm:w-fit">
                        {([
                            { key: "single", icon: "📅", label: "Single Day" },
                            { key: "range",  icon: "📊", label: "Date Range" },
                        ] as const).map(opt => (
                            <button key={opt.key}
                                onClick={() => changeMode(opt.key)}
                                className={`flex-1 sm:flex-none px-4 py-1.5 rounded-lg text-sm font-semibold transition-all
                                    ${mode === opt.key ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                                {opt.icon} {opt.label}
                            </button>
                        ))}
                    </div>

                    {/* Single-day picker */}
                    {mode === "single" && (
                        <div className="flex flex-wrap items-end gap-2">
                            <div className="flex-1 min-w-[240px]">
                                <Label className="text-xs text-muted-foreground">PMIX Upload</Label>
                                <Select value={selectedId} onValueChange={setSelectedId} disabled={uploads.length === 0}>
                                    <SelectTrigger className="h-10 mt-1 text-xs">
                                        <SelectValue placeholder="Pick a PMIX upload" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {uploads.map(u => (
                                            <SelectItem key={u.id} value={u.id} className="text-xs">
                                                {u.periodLabel ?? u.fileName.replace(/\.[^.]+$/, "")}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <Button variant="outline" size="icon" onClick={load} disabled={loading || !selectedId}
                                title="Refresh" className="h-10 w-10">
                                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                            </Button>
                        </div>
                    )}

                    {/* Range pickers */}
                    {mode === "range" && (
                        <>
                            <div className="grid grid-cols-2 sm:flex sm:items-end gap-2 sm:gap-3">
                                <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">From</Label>
                                    <Input type="date" value={rangeFrom} onChange={e => setRangeFrom(e.target.value)}
                                        className="h-10 rounded-xl w-full sm:w-40 text-sm" />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">To</Label>
                                    <Input type="date" value={rangeTo} onChange={e => setRangeTo(e.target.value)}
                                        className="h-10 rounded-xl w-full sm:w-40 text-sm" />
                                </div>
                                <Button onClick={load} disabled={loading || !rangeFrom || !rangeTo}
                                    className="h-10 rounded-xl gap-2 bg-primary col-span-2 sm:col-span-1">
                                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <BarChart3 className="w-4 h-4" />}
                                    Load Dashboard
                                </Button>
                                <Button variant="outline" size="icon" onClick={load} disabled={loading} title="Refresh"
                                    className="h-10 w-10">
                                    <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                                </Button>
                            </div>
                            {/* Quick presets */}
                            <div className="flex gap-1.5 flex-wrap">
                                {[
                                    { label: "Today",      from: todayIso(),       to: todayIso() },
                                    { label: "7 days",     from: daysAgoIso(6),    to: todayIso() },
                                    { label: "14 days",    from: daysAgoIso(13),   to: todayIso() },
                                    { label: "30 days",    from: daysAgoIso(29),   to: todayIso() },
                                    { label: "This month", from: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10), to: todayIso() },
                                ].map(p => (
                                    <button key={p.label}
                                        onClick={() => { setRangeFrom(p.from); setRangeTo(p.to); }}
                                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-muted/50 hover:bg-muted border border-border transition-colors">
                                        {p.label}
                                    </button>
                                ))}
                            </div>
                            {data?.rangeFrom && (
                                <p className="text-xs text-muted-foreground">
                                    Aggregated <strong className="text-foreground">{data.uploadCount}</strong> uploads across{" "}
                                    <strong className="text-foreground">{data.dayCount}</strong> day{(data.dayCount ?? 0) !== 1 ? "s" : ""} ({data.rangeFrom} → {data.rangeTo})
                                </p>
                            )}
                        </>
                    )}
                </CardContent>
            </Card>

            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

            {loading && (
                <Card><CardContent className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="text-sm">Loading dashboard…</span>
                </CardContent></Card>
            )}

            {!loading && data && (
                <>
                    {/* ── Title bar ──────────────────────────────────────── */}
                    <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                        <h2 className="text-base sm:text-lg font-bold tracking-wide text-primary">
                            {LOCATION_LABEL.toUpperCase()} · {titleLabel} PRODUCT MIX DASHBOARD
                        </h2>
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground border border-border rounded-lg px-3 py-1.5 bg-card">
                            <CalendarDays className="w-3.5 h-3.5" />
                            {dateBadge}
                        </span>
                    </div>

                    {/* ── 4 KPI cards ─────────────────────────────────────── */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <KpiCard label="FOOD"     theme={KPI.food}     macro={data.macros.FOOD} />
                        <KpiCard label="LIQUOR"   theme={KPI.liquor}   macro={data.macros.LIQUOR} />
                        <KpiCard label="BEVERAGE" theme={KPI.beverage} macro={data.macros.BEVERAGE} />
                        <KpiCard label="DESSERT"  theme={KPI.dessert}  macro={data.macros.DESSERT} />
                    </div>

                    {/* ── Top Selling Items by Category ───────────────────── */}
                    <SectionBar>TOP SELLING ITEMS BY CATEGORY</SectionBar>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        {data.topByCategory.map(cat => (
                            <ItemColumn key={cat.category} title={cat.category} items={cat.items} colour="pink" />
                        ))}
                    </div>

                    {/* ── Bar Performance (4 columns) ─────────────────────── */}
                    <SectionBar>BAR PERFORMANCE</SectionBar>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <ItemColumn title="COCKTAILS" icon="🍹" items={data.bar.cocktails} colour="pink" />
                        <ItemColumn title="MOCKTAILS" icon="🍸" items={data.bar.mocktails} colour="pink" />
                        <ItemColumn title="BEER"      icon="🍺" items={data.bar.beer}      colour="blue" />
                        <ItemColumn title="BEVERAGE"  icon="🥤" items={data.bar.beverage}  colour="blue" />
                    </div>

                    {/* ── Dessert Performance (separate section) ──────────── */}
                    <SectionBar>DESSERT PERFORMANCE</SectionBar>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <ItemColumn title="DESSERTS" icon="🍰" items={data.desserts} colour="orange" />
                    </div>

                    {/* ── Key Insights + Management Focus ─────────────────── */}
                    <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
                        <Card className="lg:col-span-3">
                            <div className="px-4 py-2 bg-purple-600 dark:bg-purple-700 text-white text-xs font-bold tracking-wide rounded-t-xl">
                                KEY INSIGHTS
                            </div>
                            <CardContent className="space-y-1.5 p-4">
                                {data.insights.map((line, i) => (
                                    <div key={i} className="flex items-start gap-2 text-sm">
                                        <Sparkles className="w-3.5 h-3.5 mt-1 text-emerald-500 shrink-0" />
                                        <span>{line}</span>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>

                        <Card className="lg:col-span-2">
                            <div className="px-4 py-2 bg-purple-600 dark:bg-purple-700 text-white text-xs font-bold tracking-wide rounded-t-xl">
                                MANAGEMENT FOCUS
                            </div>
                            <CardContent className="space-y-3 p-4">
                                {data.focus.map((f, i) => (
                                    <div key={i}>
                                        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                                            <Star className="w-3.5 h-3.5 text-amber-500" />
                                            {f.emoji} {f.title}
                                        </div>
                                        <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{f.body}</p>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    </div>

                    <p className="text-[10px] text-muted-foreground text-center mt-2">
                        Total Sales <strong className="text-foreground">{fmtMoney(data.totalSales)}</strong>
                        {" · "}Total Qty <strong className="text-foreground">{data.totalQty.toLocaleString()}</strong>
                        {data.dayCount != null && data.dayCount > 1 && (
                            <> {" · "}across <strong className="text-foreground">{data.dayCount}</strong> days</>
                        )}
                    </p>
                </>
            )}

            {!loading && !data && !error && mode === "single" && uploads.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-12">
                    No PMIX uploads found. Upload a PMIX report in <a href="/analysis/pmix" className="underline text-primary">PMIX Analytics</a>.
                </p>
            )}
            {!loading && !data && mode === "range" && !error && (
                <p className="text-sm text-muted-foreground text-center py-12">
                    Pick a From/To range and click <strong>Load Dashboard</strong>.
                </p>
            )}
        </div>
    );
}

// ─── Sub-components ──────────────────────────────────────────────────────────
function SectionBar({ children }: { children: React.ReactNode }) {
    return (
        <div className="bg-purple-600 dark:bg-purple-700 text-white px-4 py-2 rounded-xl font-bold text-xs tracking-wide shadow-sm">
            {children}
        </div>
    );
}

function KpiCard({ label, theme, macro, footnote }: {
    label:     string;
    theme:     typeof KPI[keyof typeof KPI];
    macro:     { sales: number; qty: number; pct: number };
    footnote?: string;
}) {
    const Icon = theme.icon;
    return (
        <Card className={`border-2 ${theme.border} ${theme.bg}`}>
            <CardContent className="px-4 py-3">
                <div className={`flex items-center gap-1.5 text-xs font-bold tracking-wide ${theme.label}`}>
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                </div>
                <p className={`text-3xl font-bold mt-1 tabular-nums ${theme.big}`}>
                    {macro.pct}<span className="text-base">%</span>
                </p>
                <p className="text-base font-bold text-foreground tabular-nums mt-0.5">
                    {fmtMoney(macro.sales)}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                    {footnote ?? "of Total Sales"}
                </p>
            </CardContent>
        </Card>
    );
}

const COL_COLOURS = {
    pink:   { rank: "bg-rose-500",   title: "text-rose-600 dark:text-rose-400"     },
    blue:   { rank: "bg-blue-500",   title: "text-blue-600 dark:text-blue-400"     },
    orange: { rank: "bg-orange-500", title: "text-orange-600 dark:text-orange-400" },
};

function ItemColumn({ title, items, colour, icon }: {
    title:  string;
    items:  { itemName: string; qty: number }[];
    colour: keyof typeof COL_COLOURS;
    icon?:  string;
}) {
    const c = COL_COLOURS[colour];
    return (
        <Card>
            <CardContent className="p-3 space-y-1.5">
                <div className={`flex items-center gap-1.5 text-xs font-bold tracking-wide ${c.title}`}>
                    {icon && <span>{icon}</span>}
                    {title.toUpperCase()}
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-x-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide border-b border-border pb-1">
                    <span>Item</span>
                    <span className="text-right">Sold</span>
                </div>
                {items.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic py-1">No data</p>
                ) : (
                    items.map((it, i) => (
                        <div key={i} className="grid grid-cols-[auto_1fr_auto] gap-x-2 items-center py-0.5">
                            <span className={`flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold text-white tabular-nums ${c.rank}`}>
                                {i + 1}
                            </span>
                            <span className="text-xs text-foreground truncate">{it.itemName}</span>
                            <span className="text-xs font-bold text-foreground tabular-nums">{it.qty}</span>
                        </div>
                    ))
                )}
            </CardContent>
        </Card>
    );
}
