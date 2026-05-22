"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
    ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ReferenceLine,
    ResponsiveContainer, BarChart, Bar, Cell, PieChart, Pie, Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
    Upload, Loader2, AlertTriangle, Star, TrendingDown, HelpCircle,
    Dog, ChefHat, FlameKindling, Beaker, UtensilsCrossed, Beer,
    IceCream, RefreshCw, BarChart3, PieChart as PieIcon,
    ClipboardList, Link2, FileSpreadsheet, Trash2, ChevronRight,
    TrendingUp, ShoppingBag, Layers,
} from "lucide-react";
import {
    pmixApi, PmixUpload, PmixAnalytics, PmixBcgItem, BcgQuadrant,
} from "@/lib/api";

// ─── Design tokens ────────────────────────────────────────────────────────────
const BCG_COLORS: Record<BcgQuadrant, string> = {
    Star:      "#22c55e",
    Plowhorse: "#f59e0b",
    Puzzle:    "#6366f1",
    Dog:       "#ef4444",
};

const BCG_ICONS: Record<BcgQuadrant, React.ReactNode> = {
    Star:      <Star className="w-3.5 h-3.5" />,
    Plowhorse: <TrendingDown className="w-3.5 h-3.5" />,
    Puzzle:    <HelpCircle className="w-3.5 h-3.5" />,
    Dog:       <Dog className="w-3.5 h-3.5" />,
};

const BCG_META: Record<BcgQuadrant, { label: string; action: string; light: string; dark: string }> = {
    Star:      { label: "Stars",      action: "Maintain & promote",            light: "bg-green-50 border-green-200 text-green-700",   dark: "dark:bg-green-950/40 dark:border-green-800 dark:text-green-300" },
    Plowhorse: { label: "Plowhorses", action: "Review cost / raise price",     light: "bg-amber-50 border-amber-200 text-amber-700",   dark: "dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-300" },
    Puzzle:    { label: "Puzzles",    action: "Push marketing & promotions",   light: "bg-indigo-50 border-indigo-200 text-indigo-700", dark: "dark:bg-indigo-950/40 dark:border-indigo-800 dark:text-indigo-300" },
    Dog:       { label: "Dogs",       action: "Consider removing from menu",   light: "bg-red-50 border-red-200 text-red-700",         dark: "dark:bg-red-950/40 dark:border-red-800 dark:text-red-300" },
};

const STATION_ICONS: Record<string, React.ReactNode> = {
    "Wok":               <FlameKindling className="w-4 h-4" />,
    "Grill / Appetizer": <ChefHat className="w-4 h-4" />,
    "Curry":             <Beaker className="w-4 h-4" />,
    "Expo":              <UtensilsCrossed className="w-4 h-4" />,
    "Bar":               <Beer className="w-4 h-4" />,
    "Dessert":           <IceCream className="w-4 h-4" />,
    "Other":             <ChefHat className="w-4 h-4" />,
};

const STATION_COLORS: Record<string, string> = {
    "Wok":               "#f59e0b",
    "Grill / Appetizer": "#ef4444",
    "Curry":             "#6366f1",
    "Expo":              "#14b8a6",
    "Bar":               "#8b5cf6",
    "Dessert":           "#ec4899",
    "Other":             "#94a3b8",
};

const DONUT_COLORS = ["#ef4444", "#f59e0b"];

const fmt    = (n: number) => n.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtN   = (n: number) => n.toLocaleString();
const fmtD   = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });

type Tab = "bcg" | "prep" | "qc" | "bom";

const TABS: { key: Tab; label: string; short: string; icon: React.ReactNode; color: string }[] = [
    { key: "bcg",  label: "Menu Engineering", short: "Menu",    icon: <BarChart3 className="w-4 h-4" />,    color: "text-rose-600"    },
    { key: "prep", label: "Kitchen Prep",      short: "Prep",    icon: <ClipboardList className="w-4 h-4" />,color: "text-orange-500"  },
    { key: "qc",   label: "Quality & Loss",    short: "Quality", icon: <PieIcon className="w-4 h-4" />,      color: "text-yellow-600"  },
    { key: "bom",  label: "BOM Linkage",       short: "BOM",     icon: <Link2 className="w-4 h-4" />,        color: "text-emerald-600" },
];

// ─── Tooltip components ───────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function BcgTooltip({ active, payload }: any) {
    if (!active || !payload?.[0]) return null;
    const d: PmixBcgItem = payload[0].payload;
    return (
        <div className="bg-popover text-popover-foreground border border-border rounded-xl shadow-xl p-3 text-sm max-w-[220px]">
            <p className="font-semibold text-sm leading-snug">{d.itemName}</p>
            <p className="text-muted-foreground text-xs mb-2">{d.category}</p>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border"
                style={{ background: BCG_COLORS[d.quadrant] + "22", color: BCG_COLORS[d.quadrant], borderColor: BCG_COLORS[d.quadrant] + "44" }}>
                {BCG_ICONS[d.quadrant]} {d.quadrant}
            </span>
            <div className="mt-2 space-y-0.5">
                <p className="text-xs text-muted-foreground">Qty: <strong className="text-foreground">{fmtN(d.qtySold)}</strong></p>
                <p className="text-xs text-muted-foreground">Avg price: <strong className="text-foreground">${fmt(d.unitPrice)}</strong></p>
                <p className="text-xs text-muted-foreground">Net sales: <strong className="text-foreground">${fmt(d.netSales)}</strong></p>
            </div>
        </div>
    );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DonutTooltip({ active, payload }: any) {
    if (!active || !payload?.[0]) return null;
    return (
        <div className="bg-popover text-popover-foreground border border-border rounded-xl shadow-xl p-2.5 text-sm">
            <p className="font-medium">{payload[0].name}</p>
            <p className="text-lg font-bold">${fmt(payload[0].value)}</p>
        </div>
    );
}

// ─── Skeleton loader ──────────────────────────────────────────────────────────
function Skeleton({ className = "" }: { className?: string }) {
    return <div className={`animate-pulse rounded-lg bg-muted/60 ${className}`} />;
}

function DashboardSkeleton() {
    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
            </div>
            <Skeleton className="h-10" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />)}
            </div>
            <Skeleton className="h-80" />
        </div>
    );
}

// ─── Upload Drop Zone ─────────────────────────────────────────────────────────
function UploadZone({ onFile, uploading }: { onFile: (f: File) => void; uploading: boolean }) {
    const [drag, setDrag] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    function onDrop(e: React.DragEvent) {
        e.preventDefault(); setDrag(false);
        const file = e.dataTransfer.files[0];
        if (file) onFile(file);
    }

    return (
        <div
            onDragOver={e => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            className={`
                relative flex flex-col items-center justify-center gap-4 p-10 rounded-2xl border-2 border-dashed
                cursor-pointer transition-all duration-200 text-center select-none
                ${drag
                    ? "border-primary bg-primary/8 scale-[1.01]"
                    : "border-border hover:border-primary/50 hover:bg-muted/30"}
            `}
        >
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) { onFile(f); e.target.value = ""; } }} />

            <div className={`p-5 rounded-2xl transition-colors ${drag ? "bg-primary/20" : "bg-muted/60"}`}>
                {uploading
                    ? <Loader2 className="w-10 h-10 text-primary animate-spin" />
                    : <FileSpreadsheet className={`w-10 h-10 transition-colors ${drag ? "text-primary" : "text-muted-foreground"}`} />
                }
            </div>

            <div>
                <p className="text-base font-semibold">
                    {uploading ? "Uploading…" : drag ? "Drop it here!" : "Upload a PMIX Report"}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                    Drag & drop or click to browse · XLSX, XLS, CSV
                </p>
            </div>

            {!uploading && (
                <Button size="sm" className="pointer-events-none mt-1" tabIndex={-1}>
                    <Upload className="w-3.5 h-3.5 mr-1.5" /> Choose File
                </Button>
            )}
        </div>
    );
}

// ─── KPI Card (matches dashboard.tsx pattern) ─────────────────────────────────
function KpiCard({ label, value, sub, icon: Icon, valueClass = "" }: {
    label: string; value: string | number; sub?: string;
    icon: React.ElementType; valueClass?: string;
}) {
    return (
        <Card>
            <CardContent className="pt-4 pb-4 px-4">
                <div className="flex items-start justify-between gap-2">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide leading-none">{label}</p>
                    <div className="p-1.5 rounded-md bg-primary/10 shrink-0">
                        <Icon className="w-3.5 h-3.5 text-primary" />
                    </div>
                </div>
                <p className={`text-2xl font-bold mt-2 tabular-nums ${valueClass}`}>{value}</p>
                {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
            </CardContent>
        </Card>
    );
}

// ─── BCG Quadrant pill ────────────────────────────────────────────────────────
function QuadrantPill({ quadrant, count, active, onClick }: {
    quadrant: BcgQuadrant; count: number; active: boolean; onClick: () => void;
}) {
    const m = BCG_META[quadrant];
    return (
        <button onClick={onClick}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-all
                ${active
                    ? `${m.light} ${m.dark} border-current shadow-sm`
                    : "bg-muted/30 border-border text-muted-foreground hover:text-foreground hover:bg-muted/60"
                }`}
        >
            <span style={{ color: BCG_COLORS[quadrant] }}>{BCG_ICONS[quadrant]}</span>
            <span>{m.label}</span>
            <Badge variant="secondary" className="ml-auto text-[11px] px-1.5 py-0 h-5">
                {count}
            </Badge>
        </button>
    );
}

// ─── Mobile BCG item card ─────────────────────────────────────────────────────
function BcgItemCard({ item, onClick }: { item: PmixBcgItem; onClick: () => void }) {
    const m = BCG_META[item.quadrant];
    return (
        <button onClick={onClick}
            className="w-full flex items-center gap-3 p-3 rounded-xl border bg-card hover:bg-muted/30 active:scale-[0.99] transition-all text-left">
            <span className={`p-2 rounded-lg border shrink-0 ${m.light} ${m.dark}`}
                style={{ color: BCG_COLORS[item.quadrant] }}>
                {BCG_ICONS[item.quadrant]}
            </span>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{item.itemName}</p>
                <p className="text-xs text-muted-foreground">{item.category} · {item.station}</p>
            </div>
            <div className="text-right shrink-0">
                <p className="text-sm font-bold tabular-nums">{fmtN(item.qtySold)}</p>
                <p className="text-xs text-muted-foreground">${fmt(item.unitPrice)}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        </button>
    );
}

// ─── Progress bar component ───────────────────────────────────────────────────
function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
    const pct = max > 0 ? Math.round((value / max) * 100) : 0;
    return (
        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── Main Page ────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
export default function PmixDashboardPage() {
    const [uploads,       setUploads]       = useState<PmixUpload[]>([]);
    const [selectedId,    setSelectedId]    = useState<string>("");
    const [analytics,     setAnalytics]     = useState<PmixAnalytics | null>(null);
    const [loading,       setLoading]       = useState(false);
    const [uploading,     setUploading]     = useState(false);
    const [error,         setError]         = useState<string | null>(null);
    const [activeTab,     setActiveTab]     = useState<Tab>("bcg");
    const [bcgFilter,     setBcgFilter]     = useState<BcgQuadrant | "All">("All");
    const [stationFilter, setStationFilter] = useState<string>("All");
    const [drillItem,     setDrillItem]     = useState<PmixBcgItem | null>(null);
    const [mounted,       setMounted]       = useState(false);
    const [showChart,     setShowChart]     = useState(false);  // desktop scatter toggle on mobile

    useEffect(() => { setMounted(true); }, []);

    // ── Load uploads ──
    const loadUploads = useCallback(async () => {
        try {
            const list = await pmixApi.listUploads();
            setUploads(list);
            if (list.length > 0 && !selectedId) setSelectedId(list[0].id);
        } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => { loadUploads(); }, [loadUploads]);

    // ── Load analytics ──
    const loadAnalytics = useCallback(async (id: string) => {
        if (!id) return;
        setLoading(true); setError(null);
        try {
            setAnalytics(await pmixApi.analytics(id));
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load analytics");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { if (selectedId) loadAnalytics(selectedId); }, [selectedId, loadAnalytics]);

    // ── Handle file ──
    async function handleFile(file: File) {
        setUploading(true); setError(null);
        try {
            const result = await pmixApi.upload(file, file.name.replace(/\.[^.]+$/, ""));
            await loadUploads();
            setSelectedId(result.uploadId);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Upload failed");
        } finally {
            setUploading(false);
        }
    }

    // ── Delete ──
    async function handleDelete(id: string) {
        if (!confirm("Remove this report?")) return;
        await pmixApi.deleteUpload(id);
        const rest = uploads.filter(x => x.id !== id);
        setUploads(rest);
        if (selectedId === id) { setSelectedId(rest[0]?.id ?? ""); setAnalytics(null); }
    }

    // ── Derived ──
    const bcgItems   = analytics?.axis1.items ?? [];
    const bcgSummary = analytics?.axis1.summary;
    const stations   = analytics?.axis2.stations ?? [];
    const prepList   = analytics?.axis2.prepList ?? [];
    const qcData     = analytics?.axis3;
    const bomData    = analytics?.axis4;

    const filteredBcg = bcgItems.filter(i =>
        bcgFilter === "All" || i.quadrant === bcgFilter
    );

    const stationOptions = ["All", ...stations.map(s => s.station)];
    const prepFiltered   = stationFilter === "All"
        ? prepList
        : prepList.filter(p => p.items.some(name => {
            const found = bcgItems.find(b => b.itemName === name);
            return found?.station === stationFilter;
        }));

    const maxPrepQty = prepList[0]?.qty ?? 1;

    const selectedUpload = uploads.find(u => u.id === selectedId);

    if (!mounted) return null;

    // ══════════════════════════════════════════════════════════════════════
    return (
        <div className="space-y-5 pb-16 sm:pb-10">

            {/* ── PAGE HEADER ─────────────────────────────────────────── */}
            <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-100 to-orange-100 dark:from-amber-900/40 dark:to-orange-900/40">
                    <BarChart3 className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                    <h1 className="text-lg sm:text-xl font-bold">PMIX Analytics</h1>
                    <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">
                        Product-mix intelligence — 4 strategic axes
                    </p>
                </div>
            </div>

            {/* ── ERROR BANNER ────────────────────────────────────────── */}
            {error && (
                <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-destructive/10 text-destructive text-sm border border-destructive/20">
                    <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
                </div>
            )}

            {/* ── EMPTY STATE ─────────────────────────────────────────── */}
            {!selectedId && !uploading && (
                <UploadZone onFile={handleFile} uploading={uploading} />
            )}

            {/* ── REPORT SELECTOR (when uploads exist) ────────────────── */}
            {uploads.length > 0 && (
                <div className="flex flex-col sm:flex-row gap-2">
                    <Select value={selectedId} onValueChange={setSelectedId}>
                        <SelectTrigger className="flex-1 h-10 rounded-xl">
                            <SelectValue placeholder="Select report…" />
                        </SelectTrigger>
                        <SelectContent>
                            {uploads.map(u => (
                                <SelectItem key={u.id} value={u.id}>
                                    <span className="flex items-center gap-2">
                                        <FileSpreadsheet className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                        {u.periodLabel ?? u.fileName}
                                        <span className="text-muted-foreground text-xs">· {u.totalItems} items</span>
                                    </span>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <div className="flex gap-2 shrink-0">
                        <Button variant="outline" className="h-10 rounded-xl gap-1.5 flex-1 sm:flex-none"
                            onClick={() => document.getElementById("pmix-file-input")?.click()}
                            disabled={uploading}>
                            {uploading
                                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading…</>
                                : <><Upload className="w-3.5 h-3.5" /> Upload</>
                            }
                        </Button>
                        <input id="pmix-file-input" type="file" accept=".xlsx,.xls,.csv" className="hidden"
                            onChange={e => { const f = e.target.files?.[0]; if (f) { handleFile(f); e.target.value = ""; } }} />

                        {selectedId && (
                            <>
                                <Button variant="outline" size="icon" className="h-10 w-10 rounded-xl shrink-0"
                                    onClick={() => loadAnalytics(selectedId)}>
                                    <RefreshCw className="w-3.5 h-3.5" />
                                </Button>
                                <Button variant="outline" size="icon" className="h-10 w-10 rounded-xl shrink-0 text-destructive hover:text-destructive"
                                    onClick={() => handleDelete(selectedId)}>
                                    <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* ── LOADING ──────────────────────────────────────────────── */}
            {loading && <DashboardSkeleton />}

            {/* ── DASHBOARD ────────────────────────────────────────────── */}
            {analytics && !loading && (
                <>
                    {/* ─ Report meta ─ */}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                        <span className="font-medium text-foreground">{selectedUpload?.periodLabel ?? selectedUpload?.fileName}</span>
                        <span>·</span>
                        <span>Uploaded {fmtD(selectedUpload?.uploadedAt ?? "")}</span>
                    </div>

                    {/* ─ KPI Row ─ */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <KpiCard label="Menu Items"   value={analytics.totalItems}              icon={Layers}       />
                        <KpiCard label="Total Covers" value={fmtN(analytics.totalQty)}          icon={ShoppingBag}  />
                        <KpiCard label="Net Sales"    value={`$${fmt(analytics.totalSales)}`}   icon={TrendingUp}   valueClass="text-green-600" />
                        <KpiCard label="Quality Alerts" value={analytics.axis3.alerts.length}
                            icon={AlertTriangle}
                            valueClass={analytics.axis3.alerts.length > 0 ? "text-red-600" : "text-muted-foreground"}
                            sub={analytics.axis3.alerts.length > 0 ? "items need review" : "no alerts"} />
                    </div>

                    {/* ─ Tab strip ─ */}
                    <div className="flex gap-1 overflow-x-auto pb-0.5 -mx-1 px-1 scrollbar-hide">
                        {TABS.map(t => (
                            <button key={t.key} onClick={() => setActiveTab(t.key)}
                                className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all shrink-0
                                    ${activeTab === t.key
                                        ? "bg-primary text-primary-foreground shadow-sm"
                                        : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                                    }`}
                            >
                                <span className={activeTab === t.key ? "opacity-100" : t.color}>{t.icon}</span>
                                <span className="hidden sm:inline">{t.label}</span>
                                <span className="sm:hidden">{t.short}</span>
                            </button>
                        ))}
                    </div>

                    {/* ══════════════════════════════════════════════════════
                        AXIS 1 — MENU ENGINEERING (BCG)
                    ══════════════════════════════════════════════════════ */}
                    {activeTab === "bcg" && (
                        <div className="space-y-5">

                            {/* Quadrant filter pills */}
                            <div className="flex gap-2 overflow-x-auto pb-0.5 -mx-1 px-1 scrollbar-hide">
                                <button onClick={() => setBcgFilter("All")}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium whitespace-nowrap transition-all shrink-0
                                        ${bcgFilter === "All"
                                            ? "bg-foreground text-background border-foreground"
                                            : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}>
                                    All · {bcgItems.length}
                                </button>
                                {(["Star","Plowhorse","Puzzle","Dog"] as BcgQuadrant[]).map(q => (
                                    <QuadrantPill key={q} quadrant={q}
                                        count={bcgItems.filter(i => i.quadrant === q).length}
                                        active={bcgFilter === q}
                                        onClick={() => setBcgFilter(bcgFilter === q ? "All" : q)} />
                                ))}
                            </div>

                            {/* Summary strip */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                {(["Star","Plowhorse","Puzzle","Dog"] as BcgQuadrant[]).map(q => {
                                    const m = BCG_META[q];
                                    const count = bcgSummary?.[q] ?? 0;
                                    return (
                                        <div key={q} onClick={() => setBcgFilter(bcgFilter === q ? "All" : q)}
                                            className={`relative cursor-pointer rounded-xl border p-4 transition-all hover:shadow-sm
                                                ${m.light} ${m.dark}
                                                ${bcgFilter === q ? "ring-2 shadow-sm" : ""}
                                            `}
                                            style={{ '--tw-ring-color': BCG_COLORS[q] } as React.CSSProperties}>
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-xs font-semibold uppercase tracking-wide opacity-70">{m.label}</span>
                                                <span style={{ color: BCG_COLORS[q] }}>{BCG_ICONS[q]}</span>
                                            </div>
                                            <p className="text-3xl font-bold tabular-nums">{count}</p>
                                            <p className="text-[11px] mt-1 opacity-75 leading-tight">{m.action}</p>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Chart toggle (desktop) / card list (mobile primary) */}
                            <div className="flex items-center justify-between">
                                <p className="text-sm text-muted-foreground">
                                    {filteredBcg.length} {filteredBcg.length === 1 ? "item" : "items"}
                                    {bcgFilter !== "All" ? ` · ${BCG_META[bcgFilter].label}` : ""}
                                </p>
                                <button onClick={() => setShowChart(v => !v)}
                                    className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2.5 py-1 rounded-lg hover:bg-muted/50">
                                    <BarChart3 className="w-3.5 h-3.5" />
                                    {showChart ? "Hide chart" : "Show matrix chart"}
                                </button>
                            </div>

                            {/* Scatter chart — desktop only, collapsible */}
                            {showChart && (
                                <Card className="overflow-hidden">
                                    <CardHeader className="pb-1 pt-4 px-5">
                                        <CardTitle className="text-sm font-semibold">Menu Engineering Matrix</CardTitle>
                                        <p className="text-xs text-muted-foreground">
                                            X = Qty Sold (Popularity) · Y = Avg Unit Price (Profitability proxy) · Dashed lines = portfolio averages
                                        </p>
                                    </CardHeader>
                                    <CardContent className="pt-2">
                                        <ResponsiveContainer width="100%" height={400}>
                                            <ScatterChart margin={{ top: 16, right: 24, bottom: 28, left: 16 }}>
                                                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                                                <XAxis type="number" dataKey="qtySold" name="Qty Sold"
                                                    label={{ value: "Qty Sold →", position: "insideBottom", offset: -14, fontSize: 10, fill: "#94a3b8" }}
                                                    tick={{ fontSize: 10, fill: "#94a3b8" }} />
                                                <YAxis type="number" dataKey="unitPrice" name="Avg Price"
                                                    label={{ value: "Avg Price ($)", angle: -90, position: "insideLeft", fontSize: 10, fill: "#94a3b8" }}
                                                    tick={{ fontSize: 10, fill: "#94a3b8" }} />
                                                <ZAxis range={[55, 55]} />
                                                <Tooltip content={<BcgTooltip />} />
                                                {bcgSummary && (
                                                    <>
                                                        <ReferenceLine x={bcgSummary.avgQty} stroke="#cbd5e1" strokeDasharray="5 3"
                                                            label={{ value: "avg qty", position: "insideTopRight", fontSize: 9, fill: "#94a3b8" }} />
                                                        <ReferenceLine y={bcgSummary.avgPrice} stroke="#cbd5e1" strokeDasharray="5 3"
                                                            label={{ value: "avg price", position: "insideTopRight", fontSize: 9, fill: "#94a3b8" }} />
                                                    </>
                                                )}
                                                {(["Star","Plowhorse","Puzzle","Dog"] as BcgQuadrant[]).map(q => (
                                                    <Scatter key={q} name={BCG_META[q].label}
                                                        data={filteredBcg.filter(i => i.quadrant === q)}
                                                        fill={BCG_COLORS[q]} opacity={0.82}
                                                        onClick={d => setDrillItem(d as PmixBcgItem)}
                                                        style={{ cursor: "pointer" }} />
                                                ))}
                                            </ScatterChart>
                                        </ResponsiveContainer>
                                        <div className="flex flex-wrap gap-4 justify-center mt-1 pb-1">
                                            {(["Star","Plowhorse","Puzzle","Dog"] as BcgQuadrant[]).map(q => (
                                                <div key={q} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: BCG_COLORS[q] }} />
                                                    {BCG_META[q].label}
                                                </div>
                                            ))}
                                        </div>
                                    </CardContent>
                                </Card>
                            )}

                            {/* Card list (mobile-first, shows always) */}
                            <div className="space-y-2">
                                {filteredBcg.map(item => (
                                    <BcgItemCard key={item.id} item={item} onClick={() => setDrillItem(item)} />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ══════════════════════════════════════════════════════
                        AXIS 2 — KITCHEN PREP
                    ══════════════════════════════════════════════════════ */}
                    {activeTab === "prep" && (
                        <div className="space-y-5">

                            {/* Station overview bar */}
                            <Card className="overflow-hidden">
                                <CardHeader className="pb-1 pt-4 px-5">
                                    <CardTitle className="text-sm font-semibold">Total Covers by Station</CardTitle>
                                </CardHeader>
                                <CardContent className="pt-2">
                                    <ResponsiveContainer width="100%" height={Math.max(160, stations.length * 44)}>
                                        <BarChart data={stations} layout="vertical"
                                            margin={{ top: 4, right: 32, left: 95, bottom: 4 }}>
                                            <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-border" />
                                            <XAxis type="number" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                                            <YAxis type="category" dataKey="station" tick={{ fontSize: 11 }} width={90} />
                                            <Tooltip formatter={(v) => [fmtN(Number(v ?? 0)), "Covers"]} contentStyle={{ fontSize: 12 }} />
                                            <Bar dataKey="totalQty" radius={[0, 6, 6, 0]}>
                                                {stations.map(s => (
                                                    <Cell key={s.station} fill={STATION_COLORS[s.station] ?? "#94a3b8"} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </CardContent>
                            </Card>

                            {/* Station cards grid */}
                            <div className="grid sm:grid-cols-2 gap-3">
                                {stations.map(station => {
                                    const color = STATION_COLORS[station.station] ?? "#94a3b8";
                                    const maxQty = station.items[0]?.qty ?? 1;
                                    return (
                                        <Card key={station.station} className="overflow-hidden">
                                            <CardHeader className="pb-2 pt-4 px-4">
                                                <div className="flex items-center gap-2">
                                                    <span className="p-1.5 rounded-lg" style={{ background: color + "22", color }}>
                                                        {STATION_ICONS[station.station] ?? <ChefHat className="w-4 h-4" />}
                                                    </span>
                                                    <span className="font-semibold text-sm">{station.station}</span>
                                                    <Badge variant="secondary" className="ml-auto text-xs">
                                                        {fmtN(station.totalQty)} covers
                                                    </Badge>
                                                </div>
                                            </CardHeader>
                                            <CardContent className="px-4 pb-4 space-y-2.5">
                                                {station.items.slice(0, 8).map((item, idx) => (
                                                    <div key={idx} className="space-y-1">
                                                        <div className="flex justify-between text-xs">
                                                            <span className="truncate max-w-[70%] text-muted-foreground font-medium">{item.name}</span>
                                                            <span className="font-bold tabular-nums ml-2 shrink-0" style={{ color }}>{fmtN(item.qty)}</span>
                                                        </div>
                                                        <ProgressBar value={item.qty} max={maxQty} color={color} />
                                                    </div>
                                                ))}
                                            </CardContent>
                                        </Card>
                                    );
                                })}
                            </div>

                            {/* Prep list */}
                            <Card className="overflow-hidden">
                                <CardHeader className="pb-2 pt-4 px-5">
                                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                                        <div>
                                            <CardTitle className="text-sm font-semibold">Mise en Place — Modifier Prep List</CardTitle>
                                            <p className="text-xs text-muted-foreground mt-0.5">Ranked by volume for pre-service prep</p>
                                        </div>
                                        {/* Station filter */}
                                        <Select value={stationFilter} onValueChange={setStationFilter}>
                                            <SelectTrigger className="sm:w-40 h-8 text-xs rounded-lg sm:ml-auto">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {stationOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <div className="divide-y">
                                        {prepFiltered.slice(0, 25).map((p, i) => (
                                            <div key={i} className="flex items-center gap-3 px-5 py-3">
                                                <span className="text-xs text-muted-foreground w-5 shrink-0 tabular-nums">{i + 1}</span>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium truncate">{p.modifier}</p>
                                                    <p className="text-xs text-muted-foreground truncate">{p.group}</p>
                                                </div>
                                                <div className="text-right shrink-0 w-16">
                                                    <p className="text-sm font-bold tabular-nums">{fmtN(p.qty)}</p>
                                                    <ProgressBar value={p.qty} max={maxPrepQty} color="#6366f1" />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    )}

                    {/* ══════════════════════════════════════════════════════
                        AXIS 3 — QUALITY CONTROL
                    ══════════════════════════════════════════════════════ */}
                    {activeTab === "qc" && qcData && (
                        <div className="space-y-5">

                            {/* KPI row */}
                            <div className="grid grid-cols-3 gap-3">
                                <div className="rounded-xl border bg-red-50 dark:bg-red-950/30 border-red-100 dark:border-red-900 p-4">
                                    <p className="text-xs font-medium text-red-600 dark:text-red-400 uppercase tracking-wide">Refunds</p>
                                    <p className="text-2xl font-bold text-red-700 dark:text-red-300 mt-1 tabular-nums">${fmt(qcData.totalRefunds)}</p>
                                </div>
                                <div className="rounded-xl border bg-amber-50 dark:bg-amber-950/30 border-amber-100 dark:border-amber-900 p-4">
                                    <p className="text-xs font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wide">Discounts</p>
                                    <p className="text-2xl font-bold text-amber-700 dark:text-amber-300 mt-1 tabular-nums">${fmt(qcData.totalDiscounts)}</p>
                                </div>
                                <div className="rounded-xl border bg-destructive/8 border-destructive/20 p-4">
                                    <p className="text-xs font-medium text-destructive uppercase tracking-wide">Total Loss</p>
                                    <p className="text-2xl font-bold text-destructive mt-1 tabular-nums">${fmt(qcData.totalLoss)}</p>
                                </div>
                            </div>

                            {/* Donut + Alerts side by side */}
                            <div className="grid sm:grid-cols-2 gap-4">
                                {/* Donut */}
                                <Card>
                                    <CardHeader className="pb-1 pt-4 px-5">
                                        <CardTitle className="text-sm font-semibold">Loss Breakdown</CardTitle>
                                    </CardHeader>
                                    <CardContent className="pt-2">
                                        <ResponsiveContainer width="100%" height={220}>
                                            <PieChart>
                                                <Pie data={qcData.donutData} dataKey="value" nameKey="name"
                                                    cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={4}>
                                                    {qcData.donutData.map((_, i) => (
                                                        <Cell key={i} fill={DONUT_COLORS[i]} />
                                                    ))}
                                                </Pie>
                                                <Tooltip content={<DonutTooltip />} />
                                                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </CardContent>
                                </Card>

                                {/* Quality alerts */}
                                <Card className="overflow-hidden">
                                    <CardHeader className="pb-2 pt-4 px-5">
                                        <div className="flex items-center gap-2">
                                            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                                            <CardTitle className="text-sm font-semibold">Quality Risk Alerts</CardTitle>
                                            {qcData.alerts.length > 0
                                                ? <Badge variant="destructive" className="ml-auto">{qcData.alerts.length}</Badge>
                                                : <Badge variant="secondary" className="ml-auto">Clear</Badge>
                                            }
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-0.5">Refund rate &gt; 5% (min 3 orders)</p>
                                    </CardHeader>
                                    <CardContent className="p-0">
                                        {qcData.alerts.length === 0 ? (
                                            <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
                                                <div className="text-3xl">✅</div>
                                                <p className="text-sm font-medium">No quality alerts this period</p>
                                            </div>
                                        ) : (
                                            <div className="divide-y">
                                                {qcData.alerts.map(a => (
                                                    <div key={a.id} className="flex items-center gap-3 px-5 py-3 bg-red-50/50 dark:bg-red-950/20">
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-sm font-medium truncate">{a.itemName}</p>
                                                            <p className="text-xs text-muted-foreground">{a.category}</p>
                                                        </div>
                                                        <Badge variant="destructive" className="shrink-0">{a.refundRate}%</Badge>
                                                        <span className="text-sm text-muted-foreground shrink-0">${fmt(a.totalLoss)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            </div>

                            {/* Top 5 Refunded */}
                            <Card className="overflow-hidden">
                                <CardHeader className="pb-2 pt-4 px-5">
                                    <CardTitle className="text-sm font-semibold">Top 5 Refunded Items</CardTitle>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <div className="divide-y">
                                        {qcData.top5Refunded.map((item, i) => (
                                            <div key={item.id}
                                                className={`flex items-center gap-3 px-5 py-3.5 ${item.alert ? "bg-red-50/40 dark:bg-red-950/20" : ""}`}>
                                                <span className="text-xs text-muted-foreground w-5 tabular-nums shrink-0">{i + 1}</span>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium truncate">{item.itemName}</p>
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                        <span className="text-xs text-muted-foreground">{item.category}</span>
                                                        {item.alert && <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">Alert</Badge>}
                                                    </div>
                                                </div>
                                                <div className="text-right shrink-0 space-y-0.5">
                                                    <p className="text-sm font-bold text-destructive">${fmt(item.totalLoss)}</p>
                                                    <p className="text-xs text-muted-foreground">{item.refundRate}% refund rate</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>

                            {/* All items loss table (scrollable) */}
                            {qcData.items.some(i => i.totalLoss > 0) && (
                                <Card className="overflow-hidden">
                                    <CardHeader className="pb-2 pt-4 px-5">
                                        <CardTitle className="text-sm font-semibold">All Items — Financial Loss Ranking</CardTitle>
                                    </CardHeader>
                                    <div className="overflow-x-auto">
                                        <div className="max-h-72 overflow-y-auto">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>Item</TableHead>
                                                        <TableHead className="text-right">Qty</TableHead>
                                                        <TableHead className="text-right">Refund</TableHead>
                                                        <TableHead className="text-right">Discount</TableHead>
                                                        <TableHead className="text-right">Loss</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {qcData.items.filter(i => i.totalLoss > 0).map(item => (
                                                        <TableRow key={item.id}>
                                                            <TableCell className="text-sm max-w-[160px] truncate">{item.itemName}</TableCell>
                                                            <TableCell className="text-right text-sm tabular-nums">{fmtN(item.qtySold)}</TableCell>
                                                            <TableCell className="text-right text-red-600 text-sm tabular-nums">${fmt(item.refundAmount)}</TableCell>
                                                            <TableCell className="text-right text-amber-600 text-sm tabular-nums">${fmt(item.discountAmount)}</TableCell>
                                                            <TableCell className="text-right font-semibold text-sm tabular-nums">${fmt(item.totalLoss)}</TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    </div>
                                </Card>
                            )}
                        </div>
                    )}

                    {/* ══════════════════════════════════════════════════════
                        AXIS 4 — BOM LINKAGE
                    ══════════════════════════════════════════════════════ */}
                    {activeTab === "bom" && bomData && (
                        <div className="space-y-5">

                            {/* Status cards */}
                            <div className="grid grid-cols-3 gap-3">
                                <div className="rounded-xl border bg-green-50 dark:bg-green-950/30 border-green-100 dark:border-green-900 p-4">
                                    <p className="text-xs font-medium text-green-700 dark:text-green-400 uppercase tracking-wide">Linked</p>
                                    <p className="text-3xl font-bold text-green-700 dark:text-green-300 mt-1">{bomData.linkedCount}</p>
                                    <p className="text-xs text-green-600 dark:text-green-500 mt-0.5">recipes matched</p>
                                </div>
                                <div className="rounded-xl border bg-muted/30 p-4">
                                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Unlinked</p>
                                    <p className="text-3xl font-bold mt-1">{bomData.unlinkedCount}</p>
                                    <p className="text-xs text-muted-foreground mt-0.5">no match</p>
                                </div>
                                <div className="rounded-xl border bg-blue-50 dark:bg-blue-950/30 border-blue-100 dark:border-blue-900 p-4">
                                    <p className="text-xs font-medium text-blue-700 dark:text-blue-400 uppercase tracking-wide">Ingredients</p>
                                    <p className="text-3xl font-bold text-blue-700 dark:text-blue-300 mt-1">{bomData.consumption.length}</p>
                                    <p className="text-xs text-blue-600 dark:text-blue-500 mt-0.5">tracked</p>
                                </div>
                            </div>

                            {bomData.linkedCount === 0 ? (
                                <Card>
                                    <CardContent className="flex flex-col items-center justify-center py-14 gap-3 text-center">
                                        <div className="p-4 rounded-2xl bg-muted/40">
                                            <Link2 className="w-8 h-8 text-muted-foreground/50" />
                                        </div>
                                        <div>
                                            <p className="font-semibold">No recipes matched yet</p>
                                            <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                                                BOH recipe names must partially match POS item names for auto-linking.
                                            </p>
                                        </div>
                                    </CardContent>
                                </Card>
                            ) : (
                                <>
                                    {/* Consumption list with mini bars */}
                                    {bomData.consumption.length > 0 && (
                                        <Card className="overflow-hidden">
                                            <CardHeader className="pb-2 pt-4 px-5">
                                                <CardTitle className="text-sm font-semibold">Ingredient Depletion Estimate</CardTitle>
                                                <p className="text-xs text-muted-foreground mt-0.5">Based on qty sold × BOM ratios (linked items only)</p>
                                            </CardHeader>
                                            <CardContent className="p-0">
                                                <div className="divide-y">
                                                    {bomData.consumption.map((c, i) => {
                                                        const maxQty = bomData.consumption[0]?.totalQty ?? 1;
                                                        return (
                                                            <div key={c.ingredientId} className="flex items-center gap-3 px-5 py-3">
                                                                <span className="text-xs text-muted-foreground w-5 tabular-nums shrink-0">{i + 1}</span>
                                                                <div className="flex-1 min-w-0 space-y-1">
                                                                    <div className="flex items-center justify-between gap-2">
                                                                        <p className="text-sm font-medium truncate">{c.ingredientName}</p>
                                                                        <div className="flex items-center gap-1.5 shrink-0">
                                                                            <span className="text-sm font-bold tabular-nums">
                                                                                {c.totalQty.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                                                            </span>
                                                                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">{c.unit}</Badge>
                                                                        </div>
                                                                    </div>
                                                                    <ProgressBar value={c.totalQty} max={maxQty} color="#22c55e" />
                                                                </div>
                                                                <Badge variant="secondary" className="text-[10px] shrink-0 h-5">{c.groupId}</Badge>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </CardContent>
                                        </Card>
                                    )}

                                    {/* Matched items */}
                                    <Card className="overflow-hidden">
                                        <CardHeader className="pb-2 pt-4 px-5">
                                            <CardTitle className="text-sm font-semibold">
                                                Matched POS Items
                                                <Badge variant="secondary" className="ml-2">{bomData.linkedItems.length}</Badge>
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent className="p-0">
                                            <div className="divide-y">
                                                {bomData.linkedItems.map((item, i) => (
                                                    <div key={i} className="flex items-center gap-3 px-5 py-3">
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-sm font-medium truncate">{item.itemName}</p>
                                                            <p className="text-xs text-muted-foreground">{item.category}</p>
                                                        </div>
                                                        <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400 shrink-0">
                                                            <Link2 className="w-3 h-3" />
                                                            <span className="text-xs font-medium">Linked</span>
                                                        </div>
                                                        <span className="text-sm font-bold tabular-nums shrink-0">{fmtN(item.qtySold)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </CardContent>
                                    </Card>
                                </>
                            )}
                        </div>
                    )}
                </>
            )}

            {/* ══════════════════════════════════════════════════════════
                DRILL-DOWN ITEM MODAL
            ══════════════════════════════════════════════════════════ */}
            <Dialog open={!!drillItem} onOpenChange={open => { if (!open) setDrillItem(null); }}>
                <DialogContent className="sm:max-w-md max-h-[90dvh] overflow-y-auto">
                    {drillItem && (() => {
                        const m = BCG_META[drillItem.quadrant];
                        const stationEntry = analytics?.axis2.stations
                            .find(s => s.station === drillItem.station)?.items
                            .find(i => i.name === drillItem.itemName);
                        const mods = stationEntry?.modifiers ?? [];
                        const modsByGroup = mods.reduce<Record<string, typeof mods>>((acc, m) => {
                            (acc[m.group] ??= []).push(m);
                            return acc;
                        }, {});

                        return (
                            <>
                                <DialogHeader className="pb-0">
                                    <div className="flex items-start gap-3">
                                        <span className={`p-2 rounded-xl border shrink-0 mt-0.5 ${m.light} ${m.dark}`}
                                            style={{ color: BCG_COLORS[drillItem.quadrant] }}>
                                            {BCG_ICONS[drillItem.quadrant]}
                                        </span>
                                        <div>
                                            <DialogTitle className="leading-snug text-base">{drillItem.itemName}</DialogTitle>
                                            <p className="text-xs text-muted-foreground mt-0.5">{drillItem.category} · {drillItem.station}</p>
                                        </div>
                                    </div>
                                </DialogHeader>

                                <div className="space-y-4 mt-4">
                                    {/* Quadrant badge */}
                                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${m.light} ${m.dark}`}>
                                        {BCG_ICONS[drillItem.quadrant]}
                                        {drillItem.quadrant} · {m.action}
                                    </span>

                                    {/* Stats grid */}
                                    <div className="grid grid-cols-3 gap-2.5">
                                        {[
                                            { label: "Qty Sold",   value: fmtN(drillItem.qtySold),     big: true  },
                                            { label: "Avg Price",  value: `$${fmt(drillItem.unitPrice)}`,big: false },
                                            { label: "Net Sales",  value: `$${fmt(drillItem.netSales)}`, big: true  },
                                        ].map(stat => (
                                            <div key={stat.label} className="rounded-xl bg-muted/40 p-3 text-center">
                                                <p className="text-xs text-muted-foreground">{stat.label}</p>
                                                <p className={`font-bold tabular-nums mt-0.5 ${stat.big ? "text-lg" : "text-sm"}`}>{stat.value}</p>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Modifier choices */}
                                    {Object.keys(modsByGroup).length > 0 && (
                                        <div className="space-y-3">
                                            <p className="text-sm font-semibold">Customer Choices</p>
                                            {Object.entries(modsByGroup).map(([group, choices]) => (
                                                <div key={group} className="rounded-xl bg-muted/30 p-3">
                                                    <p className="text-xs font-medium text-muted-foreground mb-2.5">{group}</p>
                                                    <div className="space-y-1.5">
                                                        {choices.sort((a, b) => b.qty - a.qty).map(c => {
                                                            const total = choices.reduce((s, x) => s + x.qty, 0);
                                                            const pct = total > 0 ? Math.round((c.qty / total) * 100) : 0;
                                                            return (
                                                                <div key={c.modifier}>
                                                                    <div className="flex justify-between text-xs mb-1">
                                                                        <span className="font-medium">{c.modifier}</span>
                                                                        <span className="text-muted-foreground tabular-nums">{c.qty} ({pct}%)</span>
                                                                    </div>
                                                                    <ProgressBar value={c.qty} max={choices[0].qty} color="#6366f1" />
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </>
                        );
                    })()}
                </DialogContent>
            </Dialog>
        </div>
    );
}
