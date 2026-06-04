"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
    ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ReferenceLine,
    ResponsiveContainer, BarChart, Bar, Cell, PieChart, Pie, Legend,
    AreaChart, Area,
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
    ClipboardList, Link2, FileSpreadsheet, Trash2, ChevronRight, ChevronLeft, ChevronDown,
    TrendingUp, ShoppingBag, Layers, Zap, CheckCircle2, CalendarDays,
    ArrowRight, RotateCcw, Package, Download, Brain, LayoutList,
    CircleCheck, CircleAlert, Info, Search, Plus, Table2, Beef, X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
    pmixApi, PmixUpload, PmixAnalytics, PmixBcgItem, BcgQuadrant,
    PmixDailySummary, PmixDailySummaryIngredient, PmixTrendPoint, ParSuggestion,
    PortionCalcResult, IngredientSummaryResult,
    PmixCalendarDay, PmixRangeResult,
} from "@/lib/api";
import ProteinCalendarModal from "@/components/pmix/ProteinCalendarModal";
import DailyCalendarModal from "@/components/pmix/DailyCalendarModal";
import BeverageCalendarModal from "@/components/pmix/BeverageCalendarModal";
import GroupCalendarModal from "@/components/pmix/GroupCalendarModal";
import ItemUsageHeatmap from "@/components/pmix/ItemUsageHeatmap";

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

// Group Ingredient Depletion by food category, ordered by prep priority:
// 1) Protein  2) Sauce & Curry  3) Noodles  4) Vegetable  5) Other
const DEPLETION_BUCKETS: { label: string; test: RegExp; dot: string; bar: string }[] = [
    { label: "Protein",        test: /protein|meat|seafood|poultry|chicken|beef|pork|duck|fish|shrimp|prawn|crab|egg|tofu/i, dot: "bg-rose-500",    bar: "#f43f5e" },
    { label: "Sauce & Curry",  test: /sauce|curry|paste|condiment|seasoning|stock|broth|marinad/i,                          dot: "bg-amber-500",   bar: "#f59e0b" },
    { label: "Noodles",        test: /noodle|pasta|rice|grain|flour|starch|wrapper|vermicelli/i,                            dot: "bg-yellow-600",  bar: "#ca8a04" },
    { label: "Vegetable",      test: /veg|herb|produce|mushroom|salad|green|onion|garlic|chili|pepper/i,                    dot: "bg-emerald-500", bar: "#22c55e" },
];
function depletionBucket(category: string | null): number {
    const c = category ?? "";
    const idx = DEPLETION_BUCKETS.findIndex(b => b.test.test(c));
    return idx === -1 ? DEPLETION_BUCKETS.length : idx;
}
function groupConsumptionByCategory<T extends { totalQty: number; category: string | null }>(items: T[]) {
    const buckets = [...DEPLETION_BUCKETS, { label: "Other", test: /.^/, dot: "bg-slate-400", bar: "#94a3b8" }];
    return buckets
        .map((b, i) => ({ ...b, items: items.filter(it => depletionBucket(it.category) === i).sort((a, b2) => b2.totalQty - a.totalQty) }))
        .filter(g => g.items.length > 0);
}

type Tab = "bcg" | "prep" | "qc" | "bom" | "summary" | "portion" | "ingsum";

const TABS: { key: Tab; label: string; short: string; icon: React.ReactNode; color: string }[] = [
    { key: "bcg",     label: "Menu Engineering", short: "Menu",    icon: <BarChart3 className="w-4 h-4" />,    color: "text-rose-600"    },
    { key: "prep",    label: "Kitchen Prep",      short: "Prep",    icon: <ClipboardList className="w-4 h-4" />,color: "text-orange-500"  },
    { key: "qc",      label: "Quality & Loss",    short: "Quality", icon: <PieIcon className="w-4 h-4" />,      color: "text-yellow-600"  },
    { key: "bom",     label: "BOM Linkage",       short: "BOM",     icon: <Link2 className="w-4 h-4" />,        color: "text-emerald-600" },
    { key: "summary", label: "Daily Summary",        short: "Summary", icon: <LayoutList className="w-4 h-4" />,   color: "text-blue-600"    },
    { key: "portion", label: "Portion Calc",         short: "Portion", icon: <Package className="w-4 h-4" />,      color: "text-violet-600"  },
    { key: "ingsum",  label: "Ingredient Summary",   short: "Ing. Sum",icon: <Table2 className="w-4 h-4" />,       color: "text-teal-600"    },
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

// ─── Mini Calendar Component ──────────────────────────────────────────────────
function PmixMiniCalendar({
    month, onMonthChange, days, loading, selectedUploadId, onDayClick,
}: {
    month: string;
    onMonthChange: (m: string) => void;
    days: PmixCalendarDay[];
    loading: boolean;
    selectedUploadId: string;
    onDayClick: (day: PmixCalendarDay) => void;
}) {
    const parts = (month ?? "").split("-").map(Number);
    const y = isFinite(parts[0]) ? parts[0] : new Date().getUTCFullYear();
    const m = isFinite(parts[1]) ? parts[1] : new Date().getUTCMonth() + 1;
    const firstDay  = new Date(Date.UTC(y, m - 1, 1));
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const startDow  = firstDay.getUTCDay(); // 0=Sun

    // Map "YYYY-MM-DD" → day data
    const dayMap = new Map<string, PmixCalendarDay>();
    for (const d of days) dayMap.set(d.date, d);

    const cells: (number | null)[] = [
        ...Array(startDow).fill(null),
        ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ];
    while (cells.length % 7 !== 0) cells.push(null);

    function prevMonth() {
        const d = new Date(Date.UTC(y, m - 2, 1));
        onMonthChange(d.toISOString().slice(0, 7));
    }
    function nextMonth() {
        const d = new Date(Date.UTC(y, m, 1));
        onMonthChange(d.toISOString().slice(0, 7));
    }

    const monthLabel = firstDay.toLocaleDateString("en-CA", { month: "long", year: "numeric", timeZone: "UTC" });

    return (
        <div className="select-none">
            {/* Month nav */}
            <div className="flex items-center justify-between mb-2">
                <button onClick={prevMonth} className="p-1 rounded-lg hover:bg-muted/60 transition-colors">
                    <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm font-semibold">{monthLabel}</span>
                <button onClick={nextMonth} className="p-1 rounded-lg hover:bg-muted/60 transition-colors">
                    <ChevronRight className="w-4 h-4" />
                </button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 mb-1">
                {["Su","Mo","Tu","We","Th","Fr","Sa"].map(d => (
                    <div key={d} className="text-center text-[10px] font-semibold text-muted-foreground py-0.5">{d}</div>
                ))}
            </div>

            {/* Cells */}
            {loading ? (
                <div className="h-24 flex items-center justify-center text-muted-foreground text-xs">
                    <Loader2 className="w-4 h-4 animate-spin mr-1" /> Loading…
                </div>
            ) : (
                <div className="grid grid-cols-7 gap-0.5">
                    {cells.map((day, i) => {
                        if (day === null) return <div key={i} />;
                        const dateStr = `${month}-${String(day).padStart(2, "0")}`;
                        const info    = dayMap.get(dateStr);
                        const isActive = info?.uploadIds.some(id => id === selectedUploadId) ?? false;
                        const today   = new Date().toISOString().slice(0, 10);
                        const isToday = dateStr === today;

                        return (
                            <button key={i} onClick={() => info && onDayClick(info)}
                                disabled={!info}
                                className={`relative flex flex-col items-center justify-center rounded-lg h-9 text-xs transition-all
                                    ${isActive
                                        ? "bg-primary text-primary-foreground font-bold shadow-sm"
                                        : info
                                            ? "bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900/50 font-semibold border border-teal-200 dark:border-teal-800"
                                            : isToday
                                                ? "bg-muted/60 text-muted-foreground ring-1 ring-primary/30"
                                                : "text-muted-foreground/60"
                                    }`}>
                                <span>{day}</span>
                                {info && (
                                    <span className={`text-[8px] leading-none font-normal ${isActive ? "text-primary-foreground/80" : "text-teal-500"}`}>
                                        {info.count > 1 ? `×${info.count}` : "●"}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            )}
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
    const [showChart,     setShowChart]     = useState(false);

    // Portion Calc state
    const [portionCalc,        setPortionCalc]        = useState<PortionCalcResult | null>(null);
    const [portionLoading,     setPortionLoading]     = useState(false);
    const [portionExpanded,    setPortionExpanded]    = useState<Set<string>>(new Set());
    const [portionSearch,      setPortionSearch]      = useState("");
    const [portionCatFilter,   setPortionCatFilter]   = useState<string>("All");
    const [portionShowUnmatched, setPortionShowUnmatched] = useState(false);

    // Daily Summary state
    const [summary,          setSummary]          = useState<PmixDailySummary | null>(null);
    const [summaryLoading,   setSummaryLoading]   = useState(false);
    const [trend,            setTrend]            = useState<PmixTrendPoint[]>([]);
    const [trendLoading,     setTrendLoading]     = useState(false);
    const [expandedRows,     setExpandedRows]     = useState<Set<string>>(new Set());
    const [parData,          setParData]          = useState<ParSuggestion[]>([]);
    const [parLoading,       setParLoading]       = useState(false);
    const [parSelected,      setParSelected]      = useState<Set<string>>(new Set());
    const [parApplying,      setParApplying]      = useState(false);
    const [parApplied,       setParApplied]       = useState<number | null>(null);
    const [catFilter,        setCatFilter]        = useState<string>("All");

    // Ingredient Summary state
    const [ingSum,         setIngSum]         = useState<IngredientSummaryResult | null>(null);
    const [ingLoading,     setIngLoading]     = useState(false);
    const [ingCatFilter,   setIngCatFilter]   = useState<"main" | "extra" | "dessert" | "beverage" | "curry" | "uncategorized">("main");
    const [autoFilling,    setAutoFilling]    = useState(false);
    const [autoFillResult, setAutoFillResult] = useState<{
        created: number; skipped: number; missing: string[]; portionSize: number; portionUnit: string;
        ingredientsCreated: string[];
    } | null>(null);

    // Sync dialog state
    const [syncOpen,      setSyncOpen]      = useState(false);
    const [syncDate,      setSyncDate]      = useState(() => new Date().toISOString().slice(0, 10));
    const [syncReplace,   setSyncReplace]   = useState(true);
    const [syncDeplete,   setSyncDeplete]   = useState(true);
    const [syncing,       setSyncing]       = useState(false);
    const [syncResult,    setSyncResult]    = useState<{ synced: number; date: string; depleted?: number } | null>(null);
    const [syncedDates,   setSyncedDates]   = useState<string[]>([]);

    // ── History / Calendar / Range state ─────────────────────────────────────
    const [historyOpen,    setHistoryOpen]    = useState(false);
    const [historyMode,    setHistoryMode]    = useState<"single" | "range">("single");
    const [calendarMonth,  setCalendarMonth]  = useState(() => new Date().toISOString().slice(0, 7));
    const [calendarDays,   setCalendarDays]   = useState<PmixCalendarDay[]>([]);
    const [calLoading,     setCalLoading]     = useState(false);
    const [rangeFrom,      setRangeFrom]      = useState(() => new Date().toISOString().slice(0, 10));
    const [rangeTo,        setRangeTo]        = useState(() => new Date().toISOString().slice(0, 10));
    const [rangeData,      setRangeData]      = useState<PmixRangeResult | null>(null);
    const [rangeLoading,   setRangeLoading]   = useState(false);
    const [rangeTab, setRangeTab] = useState<Tab>("summary");   // tabbed range analytics
    const [uploadDate,     setUploadDate]     = useState(() => new Date().toISOString().slice(0, 10));
    const [autoSync,       setAutoSync]       = useState(true);   // auto sync→sales+inventory after upload
    const [uploadMsg,      setUploadMsg]      = useState<string | null>(null);

    // ── Protein calendar modal ──
    const [proteinCalOpen,    setProteinCalOpen]    = useState(false);
    const [proteinCalTarget,  setProteinCalTarget]  = useState<{ protein: string; portionUnit: string | null } | null>(null);

    // ── Dessert calendar modal ──
    const [dessertCalOpen,    setDessertCalOpen]    = useState(false);
    const [dessertCalItem,    setDessertCalItem]    = useState<string | null>(null);

    // ── Beverage calendar modal ──
    const [beverageCalOpen,   setBeverageCalOpen]   = useState(false);
    const [beverageCalGroup,  setBeverageCalGroup]  = useState<string | null>(null);

    // ── Curry calendar modal ──
    const [curryCalOpen,      setCurryCalOpen]      = useState(false);
    const [curryCalGroup,     setCurryCalGroup]     = useState<string | null>(null);

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

    // ── Load calendar days for a month ──
    const loadCalendar = useCallback(async (month: string) => {
        setCalLoading(true);
        try {
            const days = await pmixApi.calendar(month);
            setCalendarDays(days);
        } catch { /* ignore */ }
        finally { setCalLoading(false); }
    }, []);

    useEffect(() => {
        if (historyOpen) loadCalendar(calendarMonth);
    }, [historyOpen, calendarMonth, loadCalendar]);

    // ── Switch between Single Day ↔ Date Range mode (clears stale state) ──
    function changeHistoryMode(mode: "single" | "range") {
        if (mode === historyMode) return;
        setHistoryMode(mode);
        if (mode === "range") {
            // Hide any cached single-day data so it doesn't flash through
            setIngSum(null);
            setSummary(null);
            setPortionCalc(null);
            setRangeData(null);    // start with a clean empty-state until "Load Analytics"
        } else {
            // Switching back to single — drop any cached range data
            setRangeData(null);
        }
    }

    // ── Load range analytics ──
    async function loadRangeAnalytics() {
        if (!rangeFrom || !rangeTo) return;
        setRangeLoading(true);
        setRangeData(null);
        // Defensive clear: ensure no single-day data is around to confuse the view
        setIngSum(null);
        setSummary(null);
        setPortionCalc(null);
        try {
            setRangeData(await pmixApi.rangeAnalytics(rangeFrom, rangeTo));
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load range analytics");
        } finally { setRangeLoading(false); }
    }

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

    // ── Load sync status ──
    const loadSyncStatus = useCallback(async (id: string) => {
        if (!id) return;
        try {
            const s = await pmixApi.syncStatus(id);
            setSyncedDates(s.syncedDates);
        } catch { setSyncedDates([]); }
    }, []);

    useEffect(() => { if (selectedId) loadSyncStatus(selectedId); }, [selectedId, loadSyncStatus]);

    // ── Load portion calc ──
    useEffect(() => {
        if (selectedId && activeTab === "portion") {
            setPortionLoading(true);
            setPortionCalc(null);
            setPortionExpanded(new Set());
            pmixApi.portionCalc(selectedId)
                .then(setPortionCalc)
                .catch(() => {})
                .finally(() => setPortionLoading(false));
        }
    }, [selectedId, activeTab]);

    // ── Load Ingredient Summary ──
    useEffect(() => {
        if (selectedId && activeTab === "ingsum") {
            setIngLoading(true);
            setIngSum(null);
            pmixApi.ingredientSummary(selectedId)
                .then(setIngSum)
                .catch(() => {})
                .finally(() => setIngLoading(false));
        }
    }, [selectedId, activeTab]);

    // ── Auto-fill Portion Standards for every detected protein ──
    async function handleAutoFillPortions(scope: "main" | "extra" | "both", createMissing: boolean) {
        if (!selectedId) return;
        const proteinCount = scope === "main"
            ? (ingSum?.mainProtein.byType.length ?? 0)
            : scope === "extra"
                ? (ingSum?.extraProtein.byType.length ?? 0)
                : (ingSum?.mainProtein.byType.length ?? 0) + (ingSum?.extraProtein.byType.length ?? 0);
        const ok = confirm(
            `Auto-create Portion Standards (6 oz) for ${proteinCount} detected ${scope === "both" ? "protein/add-on" : scope === "main" ? "main protein" : "extra add-on"} types?\n\n` +
            (createMissing
                ? `Proteins with no matching ingredient will be created as placeholder ingredients (you can edit them later in /ingredients).`
                : `Each will be matched to an existing Ingredient by name (partial match supported). Unmatched proteins will be listed for review.`)
        );
        if (!ok) return;
        setAutoFilling(true);
        setAutoFillResult(null);
        try {
            const r = await pmixApi.autoFillPortions({
                uploadId:    selectedId,
                portionSize: 6,
                portionUnit: "oz",
                scope,
                createMissingIngredients: createMissing,
            });
            setAutoFillResult({
                created:            r.created,
                skipped:            r.skippedExisting,
                missing:            r.missingIngredients,
                portionSize:        r.portionSize,
                portionUnit:        r.portionUnit,
                ingredientsCreated: r.ingredientsCreated ?? [],
            });
            // Refresh summary so Total We Use column repopulates
            const fresh = await pmixApi.ingredientSummary(selectedId);
            setIngSum(fresh);
        } catch (e) {
            alert("Auto-fill failed: " + (e instanceof Error ? e.message : "Unknown error"));
        } finally {
            setAutoFilling(false);
        }
    }

    // ── Export Ingredient Summary CSV ──
    function handleIngSumExportCSV() {
        if (!ingSum) return;
        const label = ingSum.periodLabel ?? selectedId;
        // Sheet 1: Main Protein totals
        const mainRows: string[][] = [
            [`Main Protein by Type — ${label}`],
            ["Protein Type", "Total Orders", "Portion Standard", "Total We Use (incl. Extra)", "Unit", "% of Total"],
        ];
        for (const r of ingSum.mainProtein.byType) {
            const pct = ingSum.mainProtein.total > 0 ? ((r.qty / ingSum.mainProtein.total) * 100).toFixed(1) : "0.0";
            const combinedUsed = r.totalUsed !== null ? r.totalUsed + (r.extraUsed ?? 0) : null;
            mainRows.push([
                r.proteinType,
                String(r.qty),
                r.portionSize !== null ? `${r.portionSize} ${r.portionUnit ?? ""}` : "—",
                combinedUsed !== null ? String(+combinedUsed.toFixed(3)) : "—",
                r.portionUnit ?? "",
                `${pct}%`,
            ]);
        }
        mainRows.push(["TOTAL", String(ingSum.mainProtein.total), "", "", "", "100%"]);
        mainRows.push([]);
        mainRows.push([`Extra Add-on Totals — ${label}`]);
        mainRows.push(["Extra Add-on", "Total Orders", "Portion Standard", "Total We Use", "Unit"]);
        for (const r of ingSum.extraProtein.byType) {
            mainRows.push([
                r.proteinType,
                String(r.qty),
                r.portionSize !== null ? `${r.portionSize} ${r.portionUnit ?? ""}` : "—",
                r.totalUsed   !== null ? String(r.totalUsed) : "—",
                r.portionUnit ?? "",
            ]);
        }
        mainRows.push([]);
        mainRows.push([`Main Protein by Dish — ${label}`]);
        mainRows.push(["Category", "Dish", "Protein Choice", "Qty Ordered"]);
        for (const r of ingSum.mainProtein.byDish) {
            mainRows.push([r.category, r.dish, r.proteinType, String(r.qty)]);
        }
        mainRows.push([]);
        mainRows.push([`Extra Protein by Dish — ${label}`]);
        mainRows.push(["Category", "Dish", "Extra Add-on", "Qty"]);
        for (const r of ingSum.extraProtein.byDish) {
            mainRows.push([r.category, r.dish, r.proteinType, String(r.qty)]);
        }
        const csv  = mainRows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
        const blob = new Blob([csv], { type: "text/csv" });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement("a");
        a.href     = url;
        a.download = `ingredient-summary-${label}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    // ── Export Portion CSV ──
    function handlePortionExportCSV() {
        if (!portionCalc) return;
        const rows: string[][] = [
            ["Category", "Ingredient", "Unit", "Total Qty", "Contributions"],
        ];
        for (const ing of portionCalc.ingredients) {
            rows.push([
                ing.categoryName,
                ing.ingredientName,
                ing.unit,
                String(ing.totalQty),
                ing.contributions.map(c => `${c.source}(${c.qtySold}×${c.portionSize}=${c.totalQty})`).join("; "),
            ]);
        }
        const csv  = rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
        const blob = new Blob([csv], { type: "text/csv" });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement("a");
        a.href     = url;
        a.download = `portion-calc-${portionCalc.periodLabel ?? selectedId}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    // ── Load daily summary ──
    useEffect(() => {
        if (selectedId && activeTab === "summary") {
            setSummaryLoading(true);
            setSummary(null);
            setExpandedRows(new Set());
            pmixApi.dailySummary(selectedId)
                .then(setSummary)
                .catch(() => {})
                .finally(() => setSummaryLoading(false));
        }
    }, [selectedId, activeTab]);

    // ── Load trend (once, when summary tab is first opened) ──
    useEffect(() => {
        if (activeTab === "summary" && trend.length === 0) {
            setTrendLoading(true);
            pmixApi.trend(10)
                .then(r => setTrend(r.trend))
                .catch(() => {})
                .finally(() => setTrendLoading(false));
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab]);

    // ── Load PAR suggestions ──
    // Initial load when summary tab opens OR a calendar popup opens.
    // Re-fetch every time a calendar opens so suggestions reflect the latest
    // PMIX uploads / inventory transactions (live recompute).
    useEffect(() => {
        const shouldLoadInitial = activeTab === "summary" && parData.length === 0;
        const shouldRefresh     = proteinCalOpen || dessertCalOpen;
        if (!shouldLoadInitial && !shouldRefresh) return;

        setParLoading(true);
        pmixApi.parSuggestions(7)
            .then(r => setParData(r.suggestions))
            .catch(() => {})
            .finally(() => setParLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, proteinCalOpen, dessertCalOpen]);

    // ── Apply PAR suggestions (bulk, from Summary tab) ──
    async function handleApplyPar() {
        const toApply = parData
            .filter(s => parSelected.has(s.inventoryItemId) && s.suggestedParMin !== null)
            .map(s => ({
                inventoryItemId: s.inventoryItemId,
                parMin:          s.suggestedParMin!,
                parMax:          s.suggestedParMax ?? s.currentParMax,
                reorderPoint:    s.suggestedROP    ?? s.currentROP,
            }));
        if (toApply.length === 0) return;
        setParApplying(true);
        try {
            const r = await pmixApi.applyParSuggestions(toApply);
            setParApplied(r.applied);
            setParSelected(new Set());
            // Refresh PAR data
            const fresh = await pmixApi.parSuggestions(7);
            setParData(fresh.suggestions);
        } catch { /* ignore */ }
        finally { setParApplying(false); }
    }

    // ── Apply PAR suggestion for a single item (from calendar popup) ──
    async function handleApplyParSingle(item: { inventoryItemId: string; parMin: number; parMax: number; reorderPoint: number }) {
        await pmixApi.applyParSuggestions([item]);
        // Refresh PAR cache so the summary tab stays in sync
        const fresh = await pmixApi.parSuggestions(7);
        setParData(fresh.suggestions);
    }

    // ── Fuzzy match a PAR suggestion by name (protein or dessert name ↔ ingredient name) ──
    function findParMatch(name: string) {
        const n = name.toLowerCase().trim();
        return parData.find(s =>
            s.ingredientName.toLowerCase().includes(n) ||
            n.includes(s.ingredientName.toLowerCase())
        ) ?? null;
    }

    // ── Export Daily Summary CSV ──
    function handleExportCSV() {
        if (!summary) return;
        const rows: string[][] = [
            ["Category", "SKU", "Ingredient", "Unit", "Daily Required Qty", "Top Consuming Menu", "Current Stock", "Below PAR?"],
        ];
        for (const cat of summary.categories) {
            for (const ing of cat.ingredients) {
                rows.push([
                    cat.categoryName,
                    ing.sku ?? "",
                    ing.ingredientName,
                    ing.unit,
                    String(ing.totalRequiredQty),
                    ing.topConsumingMenu ? `${ing.topConsumingMenu.name} (${ing.topConsumingMenu.qty} ${ing.unit})` : "",
                    ing.currentStock !== null ? String(ing.currentStock) : "Not tracked",
                    ing.isBelowPar ? "YES" : "no",
                ]);
            }
        }
        const csv = rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
        const blob = new Blob([csv], { type: "text/csv" });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement("a");
        a.href     = url;
        a.download = `daily-summary-${summary.periodLabel ?? selectedId}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    // ── Handle file ──
    async function handleFile(file: File, replaceExisting = false) {
        setUploading(true); setError(null); setUploadMsg(null);
        try {
            const res = await pmixApi.upload(file, file.name.replace(/\.[^.]+$/, ""), uploadDate, replaceExisting);

            // Duplicate-date guard → confirm replace, then retry
            if (res.status === 409 && res.duplicate) {
                const ok = window.confirm(
                    `A PMIX report for ${res.businessDate ?? uploadDate} already exists (${res.existingCount} file${res.existingCount === 1 ? "" : "s"}).\n\n` +
                    `Click OK to replace it, or Cancel to abort.`
                );
                setUploading(false);
                if (ok) await handleFile(file, true);
                return;
            }
            if (!res.uploadId) {
                setError(res.error || "Upload failed");
                return;
            }

            await loadUploads();
            await loadCalendar(calendarMonth);
            setSelectedId(res.uploadId);
            changeHistoryMode("single");

            let msg = `Upload successful — ${res.totalItems ?? 0} items`;
            if (res.replaced) msg += ` (replaced ${res.replaced} existing file${res.replaced === 1 ? "" : "s"})`;

            // One-step daily flow: auto sync → Daily Sales + deplete inventory
            if (autoSync && uploadDate) {
                try {
                    const r = await pmixApi.syncSales(res.uploadId, uploadDate, true);
                    let depleted: number | undefined;
                    try { depleted = (await pmixApi.depleteInventory(res.uploadId, uploadDate)).depleted; } catch { /* best-effort */ }
                    await loadSyncStatus(res.uploadId);
                    msg += ` · synced ${r.synced} sales record${r.synced === 1 ? "" : "s"}`;
                    if (depleted != null) msg += depleted > 0 ? ` · depleted ${depleted} ingredient${depleted === 1 ? "" : "s"}` : ` · (no stock depleted — link recipes / track ingredients first)`;
                } catch {
                    msg += " · ⚠ Auto-sync failed — you can run Sync manually";
                }
            }
            setUploadMsg(msg);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Upload failed");
        } finally {
            setUploading(false);
        }
    }

    // ── Sync to Daily Sales ──
    async function handleSync() {
        if (!selectedId || !syncDate) return;
        setSyncing(true); setError(null); setSyncResult(null);
        try {
            const r = await pmixApi.syncSales(selectedId, syncDate, syncReplace);
            let depleted: number | undefined;
            if (syncDeplete) {
                try {
                    const d = await pmixApi.depleteInventory(selectedId, syncDate);
                    depleted = d.depleted;
                } catch { /* depletion is best-effort; don't fail the whole sync */ }
            }
            setSyncResult({ synced: r.synced, date: r.date, depleted });
            await loadSyncStatus(selectedId);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Sync failed");
        } finally {
            setSyncing(false);
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

            {/* ── HISTORY PANEL ───────────────────────────────────────── */}
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
                {/* Header toggle */}
                <button
                    onClick={() => setHistoryOpen(v => !v)}
                    className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-muted/40 transition-colors text-left">
                    <CalendarDays className="w-4 h-4 text-primary shrink-0" />
                    <span className="font-semibold text-sm flex-1">PMIX History</span>
                    <Badge variant="secondary" className="text-[10px] px-2 py-0 h-5">
                        {uploads.length}
                    </Badge>
                    {historyOpen
                        ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        : <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    }
                </button>

                {historyOpen && (
                    <div className="border-t border-border px-4 pb-4 pt-3 space-y-4">
                        {/* Mode toggle */}
                        <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-xl w-full sm:w-fit">
                            {(["single", "range"] as const).map(m => (
                                <button key={m}
                                    onClick={() => changeHistoryMode(m)}
                                    className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-semibold transition-all
                                        ${historyMode === m ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                                    {m === "single" ? "📅 Single Day" : "📊 Date Range"}
                                </button>
                            ))}
                        </div>
                        {/* Mode hint */}
                        <p className="text-[11px] text-muted-foreground -mt-1">
                            {historyMode === "single"
                                ? "Viewing analytics for one Sale Date — pick a day below."
                                : "Viewing aggregated analytics across a date range — pick From/To then click Load Analytics."}
                        </p>

                        {historyMode === "single" && (
                            <div className="space-y-3">
                                {/* Mini calendar */}
                                <PmixMiniCalendar
                                    month={calendarMonth}
                                    onMonthChange={setCalendarMonth}
                                    days={calendarDays}
                                    loading={calLoading}
                                    selectedUploadId={selectedId}
                                    onDayClick={(day) => {
                                        // Pick the latest upload for that day
                                        const first = day.uploadIds[0];
                                        if (first) { setSelectedId(first); changeHistoryMode("single"); }
                                    }}
                                />
                                {/* Upload list with inline date editor */}
                                {uploads.length > 0 && (
                                    <div className="space-y-2 max-h-72 overflow-y-auto border-t border-border pt-2">
                                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                                            All Uploads ({uploads.length}) · tap date to fix Sale Date
                                        </p>
                                        {uploads.map(u => (
                                            <div key={u.id}
                                                className={`flex flex-col sm:flex-row sm:items-center gap-2 p-2 rounded-xl border text-xs transition-all
                                                    ${u.id === selectedId
                                                        ? "bg-primary/10 border-primary/40"
                                                        : "bg-muted/20 border-border hover:bg-muted/40"}`}>
                                                {/* Top row (mobile): name + price + select; (desktop: middle) */}
                                                <button
                                                    onClick={() => setSelectedId(u.id)}
                                                    className="flex items-center gap-2 flex-1 min-w-0 text-left">
                                                    <FileSpreadsheet className={`w-3.5 h-3.5 shrink-0 ${u.id === selectedId ? "text-primary" : "text-muted-foreground"}`} />
                                                    <span className="flex-1 truncate font-medium">
                                                        {u.periodLabel ?? u.fileName.replace(/\.[^.]+$/, "")}
                                                    </span>
                                                    <span className="text-muted-foreground shrink-0">
                                                        {u.totalItems} items
                                                    </span>
                                                    <span className="font-semibold shrink-0">
                                                        ${Number(u.totalSales).toLocaleString("en-CA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                                    </span>
                                                </button>
                                                {/* Date editor row */}
                                                <div className="flex items-center gap-2 sm:shrink-0">
                                                    <Label className="text-[10px] text-muted-foreground sm:hidden">Sale Date</Label>
                                                    <Input
                                                        type="date"
                                                        value={typeof u.businessDate === "string" ? u.businessDate.slice(0, 10) : ""}
                                                        onChange={async (e) => {
                                                            const v = e.target.value || null;
                                                            try {
                                                                await pmixApi.updateUpload(u.id, { businessDate: v });
                                                                await loadUploads();
                                                                await loadCalendar(calendarMonth);
                                                            } catch (err) {
                                                                alert("Failed to update date: " + (err instanceof Error ? err.message : "Unknown"));
                                                            }
                                                        }}
                                                        className="h-9 rounded-lg flex-1 sm:w-40 sm:flex-none text-xs px-2"
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {historyMode === "range" && (
                            <div className="space-y-3">
                                {/* Date pickers — 2 columns on mobile, inline on desktop */}
                                <div className="grid grid-cols-2 sm:flex sm:items-end gap-2 sm:gap-3">
                                    <div className="space-y-1">
                                        <Label className="text-xs">From</Label>
                                        <Input type="date" value={rangeFrom} onChange={e => setRangeFrom(e.target.value)}
                                            className="h-10 rounded-xl w-full sm:w-40 text-sm" />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs">To</Label>
                                        <Input type="date" value={rangeTo} onChange={e => setRangeTo(e.target.value)}
                                            className="h-10 rounded-xl w-full sm:w-40 text-sm" />
                                    </div>
                                    <Button onClick={loadRangeAnalytics} disabled={rangeLoading}
                                        className="h-10 rounded-xl gap-2 bg-primary col-span-2 sm:col-span-1">
                                        {rangeLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <BarChart3 className="w-4 h-4" />}
                                        Load Analytics
                                    </Button>
                                </div>

                                {/* Quick presets */}
                                <div className="flex gap-1.5 flex-wrap">
                                    {[
                                        { label: "Today",    from: new Date().toISOString().slice(0, 10), to: new Date().toISOString().slice(0, 10) },
                                        { label: "7 days",   from: new Date(Date.now() - 6*86400000).toISOString().slice(0, 10), to: new Date().toISOString().slice(0, 10) },
                                        { label: "30 days",  from: new Date(Date.now() - 29*86400000).toISOString().slice(0, 10), to: new Date().toISOString().slice(0, 10) },
                                        { label: "This month", from: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10), to: new Date().toISOString().slice(0, 10) },
                                    ].map(p => (
                                        <button key={p.label}
                                            onClick={() => { setRangeFrom(p.from); setRangeTo(p.to); }}
                                            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-muted/50 hover:bg-muted border border-border transition-colors">
                                            {p.label}
                                        </button>
                                    ))}
                                </div>

                                {rangeData && !rangeLoading && (
                                    <p className="text-xs text-muted-foreground">
                                        Found <strong>{rangeData.uploadCount}</strong> uploads across <strong>{rangeData.dayCount}</strong> day{rangeData.dayCount !== 1 ? "s" : ""} ({rangeData.periodFrom} → {rangeData.periodTo})
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ── UPLOAD CONTROLS ─────────────────────────────────────────── */}
            <div className="flex flex-col gap-2">
                {/* Date picker + upload */}
                <div className="flex flex-col sm:flex-row gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Label className="text-xs text-muted-foreground shrink-0">Sale Date</Label>
                        <Input type="date" value={uploadDate} onChange={e => setUploadDate(e.target.value)}
                            className="h-10 rounded-xl flex-1 sm:w-40 sm:flex-none text-sm" />
                    </div>
                    <Button variant="outline" className="h-10 rounded-xl gap-1.5 w-full sm:w-auto"
                        onClick={() => document.getElementById("pmix-file-input")?.click()}
                        disabled={uploading}>
                        {uploading
                            ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</>
                            : <><Upload className="w-4 h-4" /> Upload Report</>
                        }
                    </Button>
                    <input id="pmix-file-input" type="file" accept=".xlsx,.xls,.csv" className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) { handleFile(f); e.target.value = ""; } }} />
                </div>

                {/* Auto-sync toggle — makes daily upload a one-step task */}
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                    <input type="checkbox" checked={autoSync} onChange={e => setAutoSync(e.target.checked)}
                        className="h-3.5 w-3.5 rounded border-border accent-primary" />
                    <span>
                        <Zap className="w-3 h-3 inline mr-0.5 text-emerald-500" />
                        After upload, auto-sync to Daily Sales + deplete stock (for {uploadDate})
                    </span>
                </label>

                {/* Upload result banner */}
                {uploadMsg && (
                    <div className="flex items-start gap-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-300">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span>{uploadMsg}</span>
                        <button onClick={() => setUploadMsg(null)} className="ml-auto text-emerald-600/60 hover:text-emerald-700 shrink-0">✕</button>
                    </div>
                )}

                {/* Selector row */}
                {uploads.length > 0 && historyMode === "single" && (
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
                                            {typeof u.businessDate === "string" && u.businessDate.length >= 10
                                                ? <span className="font-mono text-xs">{u.businessDate.slice(0, 10)}</span>
                                                : null}
                                            <span>{u.periodLabel ?? u.fileName}</span>
                                            <span className="text-muted-foreground text-xs">· {u.totalItems} items</span>
                                        </span>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <div className="flex gap-2 shrink-0">
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
                            {analytics && selectedId && (
                                <Button
                                    onClick={() => { setSyncResult(null); setSyncOpen(true); }}
                                    className="h-10 rounded-xl gap-2 bg-emerald-600 hover:bg-emerald-700 text-white flex-1 sm:flex-none">
                                    <Zap className="w-3.5 h-3.5" />
                                    <span className="hidden sm:inline">Sync to Daily Sales</span>
                                    <span className="sm:hidden">Sync</span>
                                </Button>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* ── EMPTY STATE ─────────────────────────────────────────── */}
            {!selectedId && !uploading && historyMode === "single" && (
                <UploadZone onFile={handleFile} uploading={uploading} />
            )}

            {/* ── LOADING ──────────────────────────────────────────────── */}
            {loading && historyMode === "single" && <DashboardSkeleton />}

            {/* ── DASHBOARD ────────────────────────────────────────────── */}
            {analytics && !loading && historyMode === "single" && (
                <>
                    {/* ─ Report meta ─ */}
                    <div className="flex items-center flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
                        <span className="font-medium text-foreground">{selectedUpload?.periodLabel ?? selectedUpload?.fileName}</span>
                        <span>·</span>
                        <span>Uploaded {fmtD(selectedUpload?.uploadedAt ?? "")}</span>
                        {syncedDates.length > 0 && (
                            <>
                                <span>·</span>
                                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                                    <CheckCircle2 className="w-3 h-3" />
                                    Synced to {syncedDates.map(d => {
                                        const dt = new Date(d + "T00:00:00");
                                        return dt.toLocaleDateString("en-CA", { month: "short", day: "numeric" });
                                    }).join(", ")}
                                </span>
                            </>
                        )}
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
                        DAILY SUMMARY TAB (CR 2.2, 2.3, 2.4, 2.5)
                    ══════════════════════════════════════════════════════ */}
                    {activeTab === "summary" && (
                        <div className="space-y-5">

                            {/* ─ Header actions ─ */}
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                                <p className="text-sm text-muted-foreground">
                                    Aggregated ingredient consumption from BOM linkage — all stations
                                </p>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 rounded-lg gap-1.5 text-xs"
                                    onClick={handleExportCSV}
                                    disabled={!summary || summary.totalIngredients === 0}
                                >
                                    <Download className="w-3.5 h-3.5" /> Export CSV
                                </Button>
                            </div>

                            {/* ─ Trend chart ─ */}
                            <Card className="overflow-hidden">
                                <CardHeader className="pb-1 pt-4 px-5">
                                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                                        <TrendingUp className="w-4 h-4 text-blue-500" />
                                        Ingredient Consumption Trend
                                    </CardTitle>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        Total estimated ingredient volume used (recipe units) across recent PMIX uploads
                                    </p>
                                </CardHeader>
                                <CardContent className="pt-2 pb-4">
                                    {trendLoading ? (
                                        <Skeleton className="h-40" />
                                    ) : trend.length < 2 ? (
                                        <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
                                            <Info className="w-5 h-5" />
                                            <p className="text-sm">Need at least 2 uploads with BOM links for trend data</p>
                                        </div>
                                    ) : (
                                        <ResponsiveContainer width="100%" height={180}>
                                            <AreaChart data={trend} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
                                                <defs>
                                                    <linearGradient id="ingGradient" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.25} />
                                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                                                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                                                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }}
                                                    label={{ value: "Units", angle: -90, position: "insideLeft", fontSize: 9, fill: "#94a3b8" }} />
                                                <Tooltip
                                                    formatter={(v) => [(Number(v ?? 0)).toLocaleString(), "Total Ing. Units"]}
                                                    contentStyle={{ fontSize: 12 }}
                                                />
                                                <Area
                                                    type="monotone"
                                                    dataKey="totalIngQty"
                                                    stroke="#3b82f6"
                                                    strokeWidth={2}
                                                    fill="url(#ingGradient)"
                                                    dot={{ fill: "#3b82f6", r: 3 }}
                                                    activeDot={{ r: 5 }}
                                                />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    )}
                                </CardContent>
                            </Card>

                            {/* ─ Summary loading / no-data states ─ */}
                            {summaryLoading && <DashboardSkeleton />}

                            {!summaryLoading && summary && summary.totalIngredients === 0 && (
                                <Card>
                                    <CardContent className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                                        <div className="p-4 rounded-2xl bg-muted/40">
                                            <Link2 className="w-8 h-8 text-muted-foreground/40" />
                                        </div>
                                        <p className="font-semibold">No BOM-linked items in this upload</p>
                                        <p className="text-sm text-muted-foreground max-w-xs">
                                            Link BOH recipes to PMIX items in the BOM Linkage tab to see ingredient consumption here.
                                        </p>
                                    </CardContent>
                                </Card>
                            )}

                            {/* ─ Category filter ─ */}
                            {!summaryLoading && summary && summary.categories.length > 0 && (() => {
                                const cats = summary.categories.map(c => c.categoryName);
                                const filteredCats = catFilter === "All"
                                    ? summary.categories
                                    : summary.categories.filter(c => c.categoryName === catFilter);
                                const totalBelowPar = summary.categories.flatMap(c => c.ingredients).filter(i => i.isBelowPar).length;

                                return (
                                    <>
                                        {/* KPI row */}
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                            <KpiCard label="Ingredients"     value={summary.totalIngredients} icon={Package}        />
                                            <KpiCard label="Categories"      value={summary.categories.length} icon={Layers}        />
                                            <KpiCard label="Linked Menus"    value={summary.linkedCount}       icon={Link2}         />
                                            <KpiCard label="Below PAR"       value={totalBelowPar}             icon={CircleAlert}
                                                valueClass={totalBelowPar > 0 ? "text-red-600" : "text-muted-foreground"}
                                                sub={totalBelowPar > 0 ? "need restocking" : "all ok"} />
                                        </div>

                                        {/* Category filter pills */}
                                        <div className="flex gap-2 flex-wrap">
                                            <button
                                                onClick={() => setCatFilter("All")}
                                                className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all
                                                    ${catFilter === "All" ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}
                                            >All · {summary.totalIngredients}</button>
                                            {cats.map(cat => {
                                                const catData = summary.categories.find(c => c.categoryName === cat);
                                                return (
                                                    <button key={cat}
                                                        onClick={() => setCatFilter(catFilter === cat ? "All" : cat)}
                                                        className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all
                                                            ${catFilter === cat ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}
                                                    >{cat} · {catData?.ingredients.length ?? 0}</button>
                                                );
                                            })}
                                        </div>

                                        {/* Category sections */}
                                        {filteredCats.map(cat => (
                                            <Card key={cat.categoryId ?? cat.categoryName} className="overflow-hidden">
                                                <CardHeader className="pb-2 pt-4 px-5">
                                                    <div className="flex items-center gap-2">
                                                        <div className="flex-1">
                                                            <CardTitle className="text-sm font-semibold">{cat.categoryName}</CardTitle>
                                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                                {cat.ingredients.length} ingredient{cat.ingredients.length !== 1 ? "s" : ""}
                                                            </p>
                                                        </div>
                                                        {cat.ingredients.some(i => i.isBelowPar) && (
                                                            <Badge variant="destructive" className="text-[10px]">
                                                                {cat.ingredients.filter(i => i.isBelowPar).length} below PAR
                                                            </Badge>
                                                        )}
                                                    </div>
                                                </CardHeader>
                                                <CardContent className="p-0">
                                                    {/* Desktop table */}
                                                    <div className="hidden md:block overflow-x-auto">
                                                        <table className="w-full text-sm">
                                                            <thead>
                                                                <tr className="border-b bg-muted/30">
                                                                    <th className="text-left px-5 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ingredient</th>
                                                                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Required</th>
                                                                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Top Menu</th>
                                                                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Stock</th>
                                                                    <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                                                                    <th className="px-2 py-2.5 w-8"></th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y">
                                                                {cat.ingredients.map(ing => {
                                                                    const isExpanded = expandedRows.has(ing.ingredientId);
                                                                    return (
                                                                        <>
                                                                            <tr key={ing.ingredientId}
                                                                                className={`hover:bg-muted/20 transition-colors ${ing.isBelowPar ? "bg-red-50/30 dark:bg-red-950/10" : ""}`}>
                                                                                <td className="px-5 py-3">
                                                                                    <div className="font-medium truncate max-w-[200px]">{ing.ingredientName}</div>
                                                                                    {ing.sku && <div className="text-[10px] text-muted-foreground font-mono">{ing.sku}</div>}
                                                                                </td>
                                                                                <td className="px-4 py-3 text-right">
                                                                                    <span className="font-bold tabular-nums">
                                                                                        {ing.totalRequiredQty.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                                                                    </span>
                                                                                    <span className="text-xs text-muted-foreground ml-1">{ing.unit}</span>
                                                                                </td>
                                                                                <td className="px-4 py-3 text-sm text-muted-foreground max-w-[180px]">
                                                                                    {ing.topConsumingMenu ? (
                                                                                        <div className="truncate">
                                                                                            <span className="text-foreground font-medium">{ing.topConsumingMenu.name}</span>
                                                                                            <span className="text-xs ml-1">
                                                                                                ({ing.topConsumingMenu.qty.toFixed(2)} {ing.unit})
                                                                                            </span>
                                                                                        </div>
                                                                                    ) : "—"}
                                                                                </td>
                                                                                <td className="px-4 py-3 text-right">
                                                                                    {ing.currentStock !== null ? (
                                                                                        <span className={`font-medium tabular-nums ${ing.isBelowPar ? "text-red-600 dark:text-red-400" : "text-foreground"}`}>
                                                                                            {Number(ing.currentStock).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                                                                            <span className="text-xs text-muted-foreground ml-1">{ing.unit}</span>
                                                                                        </span>
                                                                                    ) : (
                                                                                        <span className="text-xs text-muted-foreground">Not tracked</span>
                                                                                    )}
                                                                                </td>
                                                                                <td className="px-4 py-3">
                                                                                    {ing.currentStock !== null ? (
                                                                                        ing.isBelowPar ? (
                                                                                            <Badge variant="destructive" className="text-[10px]">
                                                                                                <CircleAlert className="w-3 h-3 mr-1" />Below PAR
                                                                                            </Badge>
                                                                                        ) : (
                                                                                            <Badge variant="secondary" className="text-[10px] text-green-700 dark:text-green-400">
                                                                                                <CircleCheck className="w-3 h-3 mr-1" />OK
                                                                                            </Badge>
                                                                                        )
                                                                                    ) : (
                                                                                        <Badge variant="outline" className="text-[10px]">Untracked</Badge>
                                                                                    )}
                                                                                </td>
                                                                                <td className="px-2 py-3 text-right">
                                                                                    {ing.menuBreakdown.length > 1 && (
                                                                                        <button
                                                                                            onClick={() => setExpandedRows(prev => {
                                                                                                const next = new Set(prev);
                                                                                                if (next.has(ing.ingredientId)) next.delete(ing.ingredientId);
                                                                                                else next.add(ing.ingredientId);
                                                                                                return next;
                                                                                            })}
                                                                                            className="p-1 rounded hover:bg-muted/50 text-muted-foreground"
                                                                                        >
                                                                                            <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                                                                                        </button>
                                                                                    )}
                                                                                </td>
                                                                            </tr>
                                                                            {/* Drill-down row */}
                                                                            {isExpanded && (
                                                                                <tr key={`${ing.ingredientId}-drill`} className="bg-muted/20">
                                                                                    <td colSpan={6} className="px-5 pb-3 pt-1">
                                                                                        <div className="pl-4 border-l-2 border-primary/30 space-y-1.5">
                                                                                            <p className="text-xs font-semibold text-muted-foreground mb-2">Breakdown by Menu Item:</p>
                                                                                            {ing.menuBreakdown.map(m => {
                                                                                                const pct = ing.totalRequiredQty > 0 ? (m.ingredientQty / ing.totalRequiredQty) * 100 : 0;
                                                                                                return (
                                                                                                    <div key={m.menuName} className="flex items-center gap-3">
                                                                                                        <span className="text-xs text-muted-foreground w-32 truncate shrink-0">{m.menuName}</span>
                                                                                                        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                                                                                            <div className="h-full rounded-full bg-blue-500" style={{ width: `${pct}%` }} />
                                                                                                        </div>
                                                                                                        <span className="text-xs font-medium tabular-nums w-24 text-right shrink-0">
                                                                                                            {m.ingredientQty.toFixed(2)} {ing.unit}
                                                                                                        </span>
                                                                                                        <span className="text-xs text-muted-foreground w-16 text-right shrink-0">
                                                                                                            ({m.qtySold} covers)
                                                                                                        </span>
                                                                                                    </div>
                                                                                                );
                                                                                            })}
                                                                                        </div>
                                                                                    </td>
                                                                                </tr>
                                                                            )}
                                                                        </>
                                                                    );
                                                                })}
                                                            </tbody>
                                                        </table>
                                                    </div>

                                                    {/* Mobile cards */}
                                                    <div className="md:hidden divide-y">
                                                        {cat.ingredients.map(ing => {
                                                            const isExpanded = expandedRows.has(ing.ingredientId);
                                                            return (
                                                                <div key={ing.ingredientId} className={`px-4 py-3 ${ing.isBelowPar ? "bg-red-50/30 dark:bg-red-950/10" : ""}`}>
                                                                    <div className="flex items-start justify-between gap-2">
                                                                        <div className="flex-1 min-w-0">
                                                                            <p className="text-sm font-medium truncate">{ing.ingredientName}</p>
                                                                            {ing.sku && <p className="text-[10px] text-muted-foreground font-mono">{ing.sku}</p>}
                                                                        </div>
                                                                        <div className="text-right shrink-0">
                                                                            <p className="text-sm font-bold tabular-nums">
                                                                                {ing.totalRequiredQty.toLocaleString(undefined, { maximumFractionDigits: 2 })} {ing.unit}
                                                                            </p>
                                                                            {ing.isBelowPar
                                                                                ? <Badge variant="destructive" className="text-[10px]">Below PAR</Badge>
                                                                                : ing.currentStock !== null
                                                                                    ? <span className="text-xs text-green-600">OK</span>
                                                                                    : <span className="text-xs text-muted-foreground">Untracked</span>
                                                                            }
                                                                        </div>
                                                                    </div>
                                                                    {ing.topConsumingMenu && (
                                                                        <p className="text-xs text-muted-foreground mt-1">
                                                                            Top: <span className="text-foreground">{ing.topConsumingMenu.name}</span>
                                                                        </p>
                                                                    )}
                                                                    {ing.menuBreakdown.length > 1 && (
                                                                        <button
                                                                            onClick={() => setExpandedRows(prev => {
                                                                                const next = new Set(prev);
                                                                                if (next.has(ing.ingredientId)) next.delete(ing.ingredientId);
                                                                                else next.add(ing.ingredientId);
                                                                                return next;
                                                                            })}
                                                                            className="flex items-center gap-1 text-xs text-blue-600 mt-1.5"
                                                                        >
                                                                            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                                                                            {isExpanded ? "Hide" : "Show"} breakdown ({ing.menuBreakdown.length} menus)
                                                                        </button>
                                                                    )}
                                                                    {isExpanded && (
                                                                        <div className="mt-2 pl-3 border-l-2 border-primary/30 space-y-1">
                                                                            {ing.menuBreakdown.map(m => (
                                                                                <div key={m.menuName} className="flex justify-between text-xs">
                                                                                    <span className="text-muted-foreground truncate max-w-[55%]">{m.menuName}</span>
                                                                                    <span className="font-medium tabular-nums">
                                                                                        {m.ingredientQty.toFixed(2)} {ing.unit}
                                                                                    </span>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        ))}

                                        {/* ── PAR Suggestions Widget (CR 2.4) ── */}
                                        <Card className="overflow-hidden border-blue-200 dark:border-blue-800">
                                            <CardHeader className="pb-2 pt-4 px-5 bg-blue-50/50 dark:bg-blue-950/20">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <div className="p-1.5 rounded-lg bg-blue-100 dark:bg-blue-900/40">
                                                        <Brain className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <CardTitle className="text-sm font-semibold">Automated PAR / ROP Suggestions</CardTitle>
                                                        <p className="text-xs text-muted-foreground mt-0.5">
                                                            Based on 7-day ADU from inventory transactions · ROP = (ADU × Lead Time) + Safety Stock
                                                        </p>
                                                    </div>
                                                    {parSelected.size > 0 && (
                                                        <Button
                                                            size="sm"
                                                            className="h-8 gap-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg shrink-0"
                                                            onClick={handleApplyPar}
                                                            disabled={parApplying}
                                                        >
                                                            {parApplying
                                                                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Applying…</>
                                                                : <><CheckCircle2 className="w-3.5 h-3.5" /> Accept & Apply ({parSelected.size})</>
                                                            }
                                                        </Button>
                                                    )}
                                                </div>
                                                {parApplied !== null && (
                                                    <div className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg px-3 py-2 mt-2">
                                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                                        {parApplied} inventory items updated with suggested PAR / ROP values
                                                    </div>
                                                )}
                                            </CardHeader>
                                            <CardContent className="p-0">
                                                {parLoading ? (
                                                    <div className="p-5 space-y-2">
                                                        {[1,2,3].map(i => <Skeleton key={i} className="h-12" />)}
                                                    </div>
                                                ) : parData.filter(s => s.hasHistory).length === 0 ? (
                                                    <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground text-sm">
                                                        <Info className="w-5 h-5" />
                                                        No consumption history found. Record inventory "Out" transactions to enable suggestions.
                                                    </div>
                                                ) : (
                                                    <>
                                                        {/* Select all */}
                                                        <div className="flex items-center gap-2 px-5 py-2.5 border-b bg-muted/20">
                                                            <input
                                                                type="checkbox"
                                                                className="rounded"
                                                                checked={parSelected.size === parData.filter(s => s.hasHistory).length && parSelected.size > 0}
                                                                onChange={e => {
                                                                    if (e.target.checked) setParSelected(new Set(parData.filter(s => s.hasHistory).map(s => s.inventoryItemId)));
                                                                    else setParSelected(new Set());
                                                                }}
                                                            />
                                                            <span className="text-xs text-muted-foreground">
                                                                Select all ({parData.filter(s => s.hasHistory).length} with history) · {parSelected.size} selected
                                                            </span>
                                                        </div>

                                                        {/* Table header */}
                                                        <div className="hidden md:grid grid-cols-[24px_1fr_80px_repeat(3,_100px)_repeat(3,_100px)] gap-2 px-5 py-2 border-b bg-muted/10 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                                            <span></span>
                                                            <span>Ingredient</span>
                                                            <span className="text-right">ADU</span>
                                                            <span className="text-right">Curr. PAR Min</span>
                                                            <span className="text-right">Curr. ROP</span>
                                                            <span className="text-right">Curr. PAR Max</span>
                                                            <span className="text-right text-blue-600">Sug. PAR Min</span>
                                                            <span className="text-right text-blue-600">Sug. ROP</span>
                                                            <span className="text-right text-blue-600">Sug. PAR Max</span>
                                                        </div>

                                                        <div className="divide-y max-h-80 overflow-y-auto">
                                                            {parData.filter(s => s.hasHistory).map(s => (
                                                                <div key={s.inventoryItemId}
                                                                    className="hidden md:grid grid-cols-[24px_1fr_80px_repeat(3,_100px)_repeat(3,_100px)] gap-2 px-5 py-2.5 items-center hover:bg-muted/20 text-sm"
                                                                >
                                                                    <input
                                                                        type="checkbox"
                                                                        className="rounded"
                                                                        checked={parSelected.has(s.inventoryItemId)}
                                                                        onChange={e => {
                                                                            setParSelected(prev => {
                                                                                const next = new Set(prev);
                                                                                if (e.target.checked) next.add(s.inventoryItemId);
                                                                                else next.delete(s.inventoryItemId);
                                                                                return next;
                                                                            });
                                                                        }}
                                                                    />
                                                                    <div className="min-w-0">
                                                                        <p className="font-medium truncate">{s.ingredientName}</p>
                                                                        <p className="text-[10px] text-muted-foreground">
                                                                            {s.categoryName} · {s.unit} · {s.adu.toFixed(2)}/day
                                                                        </p>
                                                                        {(s.supplierName || s.scheduleBasedLeadDays != null) && (
                                                                            <p className={`text-[10px] mt-0.5 ${s.scheduleFallback ? "text-muted-foreground italic" : "text-amber-700 dark:text-amber-400"}`}>
                                                                                {s.supplierName ?? "No supplier"} · Lead {s.scheduleBasedLeadDays ?? s.leadTimeDays}d{s.scheduleFallback ? " (fallback)" : ""}
                                                                                {s.nextDeliveryDate && !s.scheduleFallback && (
                                                                                    <> · next {new Date(s.nextDeliveryDate).toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" })}</>
                                                                                )}
                                                                            </p>
                                                                        )}
                                                                    </div>
                                                                    <span className="text-right tabular-nums text-muted-foreground">{s.adu.toFixed(2)}</span>
                                                                    <span className="text-right tabular-nums">{s.currentParMin.toFixed(2)}</span>
                                                                    <span className="text-right tabular-nums">{s.currentROP.toFixed(2)}</span>
                                                                    <span className="text-right tabular-nums">{s.currentParMax.toFixed(2)}</span>
                                                                    <span className="text-right tabular-nums font-semibold text-blue-600 dark:text-blue-400">
                                                                        {s.suggestedParMin?.toFixed(2) ?? "—"}
                                                                    </span>
                                                                    <span className="text-right tabular-nums font-semibold text-blue-600 dark:text-blue-400">
                                                                        {s.suggestedROP?.toFixed(2) ?? "—"}
                                                                    </span>
                                                                    <span className="text-right tabular-nums font-semibold text-blue-600 dark:text-blue-400">
                                                                        {s.suggestedParMax?.toFixed(2) ?? "—"}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                            {/* Mobile PAR rows */}
                                                            {parData.filter(s => s.hasHistory).map(s => (
                                                                <div key={`mob-${s.inventoryItemId}`}
                                                                    className="md:hidden flex items-start gap-3 px-4 py-3"
                                                                >
                                                                    <input
                                                                        type="checkbox"
                                                                        className="rounded mt-0.5"
                                                                        checked={parSelected.has(s.inventoryItemId)}
                                                                        onChange={e => {
                                                                            setParSelected(prev => {
                                                                                const next = new Set(prev);
                                                                                if (e.target.checked) next.add(s.inventoryItemId);
                                                                                else next.delete(s.inventoryItemId);
                                                                                return next;
                                                                            });
                                                                        }}
                                                                    />
                                                                    <div className="flex-1 min-w-0">
                                                                        <p className="text-sm font-medium truncate">{s.ingredientName}</p>
                                                                        <p className="text-xs text-muted-foreground">ADU: {s.adu.toFixed(2)} {s.unit}/day</p>
                                                                        <div className="grid grid-cols-3 gap-1 mt-2 text-xs">
                                                                            {[
                                                                                ["PAR Min", s.currentParMin, s.suggestedParMin],
                                                                                ["ROP",     s.currentROP,    s.suggestedROP],
                                                                                ["PAR Max", s.currentParMax, s.suggestedParMax],
                                                                            ].map(([label, curr, sugg]) => (
                                                                                <div key={String(label)} className="bg-muted/30 rounded p-1.5 text-center">
                                                                                    <p className="text-[10px] text-muted-foreground">{label}</p>
                                                                                    <p className="tabular-nums">{Number(curr).toFixed(1)}</p>
                                                                                    {sugg !== null && <p className="text-blue-600 font-semibold tabular-nums">→ {Number(sugg).toFixed(1)}</p>}
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </>
                                                )}
                                            </CardContent>
                                        </Card>
                                    </>
                                );
                            })()}
                        </div>
                    )}

                    {/* ══════════════════════════════════════════════════════
                        PORTION CALC TAB
                    ══════════════════════════════════════════════════════ */}
                    {activeTab === "portion" && (
                        <div className="space-y-5">

                            {/* Header actions */}
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                                <p className="text-sm text-muted-foreground">
                                    Ingredient usage calculated from standard portions — no BOM linkage required
                                </p>
                                <div className="flex gap-2 shrink-0">
                                    <Button variant="outline" size="sm" className="h-8 rounded-lg gap-1.5 text-xs"
                                        onClick={handlePortionExportCSV}
                                        disabled={!portionCalc || portionCalc.ingredients.length === 0}
                                    >
                                        <Download className="w-3.5 h-3.5" /> Export CSV
                                    </Button>
                                    <Button variant="outline" size="sm" className="h-8 rounded-lg gap-1.5 text-xs"
                                        onClick={() => window.open("/settings/portion-standards", "_blank")}
                                    >
                                        <Package className="w-3.5 h-3.5" /> Manage Standards
                                    </Button>
                                </div>
                            </div>

                            {portionLoading && <DashboardSkeleton />}

                            {!portionLoading && portionCalc && (() => {
                                if (!portionCalc.hasStandards) {
                                    return (
                                        <Card>
                                            <CardContent className="flex flex-col items-center justify-center py-14 gap-4 text-center">
                                                <div className="p-4 rounded-2xl bg-violet-50 dark:bg-violet-950/30">
                                                    <Package className="w-8 h-8 text-violet-500" />
                                                </div>
                                                <div>
                                                    <p className="font-semibold">No portion standards configured</p>
                                                    <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                                                        Set up standard portions in Settings to calculate ingredient usage without BOM linkage.
                                                    </p>
                                                </div>
                                                <Button className="gap-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white"
                                                    onClick={() => window.open("/settings/portion-standards", "_blank")}>
                                                    <Plus className="w-4 h-4" /> Set Up Portion Standards
                                                </Button>
                                            </CardContent>
                                        </Card>
                                    );
                                }

                                // Filter ingredients
                                const allIngs = portionCalc.ingredients.filter(ing => {
                                    const q = portionSearch.toLowerCase();
                                    const matchSearch = !q || ing.ingredientName.toLowerCase().includes(q) ||
                                        ing.categoryName.toLowerCase().includes(q);
                                    const matchCat = portionCatFilter === "All" || ing.categoryName === portionCatFilter;
                                    return matchSearch && matchCat;
                                });

                                const catNames = [...new Set(portionCalc.ingredients.map(i => i.categoryName))];

                                return (
                                    <>
                                        {/* KPI row */}
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                            <KpiCard label="Ingredients"   value={portionCalc.ingredients.length}         icon={Package}       />
                                            <KpiCard label="Items Matched" value={portionCalc.coverage.matched}            icon={CheckCircle2}  />
                                            <KpiCard label="Standards"     value={portionCalc.totalStandards}              icon={Layers}        />
                                            <KpiCard label="No Standard"   value={portionCalc.coverage.unmatched.length}   icon={AlertTriangle}
                                                valueClass={portionCalc.coverage.unmatched.length > 0 ? "text-amber-600" : "text-muted-foreground"}
                                                sub={portionCalc.coverage.unmatched.length > 0 ? "items unmatched" : "all matched"}
                                            />
                                        </div>

                                        {/* Search + filter */}
                                        <div className="flex gap-2 flex-col sm:flex-row">
                                            <div className="relative flex-1">
                                                <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                                                <input
                                                    type="text"
                                                    value={portionSearch}
                                                    onChange={e => setPortionSearch(e.target.value)}
                                                    placeholder="Search ingredient or category…"
                                                    className="w-full pl-9 pr-3 h-10 rounded-xl border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                                                />
                                            </div>
                                            <div className="flex gap-1.5 flex-wrap">
                                                <button onClick={() => setPortionCatFilter("All")}
                                                    className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all whitespace-nowrap
                                                        ${portionCatFilter === "All" ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground hover:bg-muted/50"}`}
                                                >All</button>
                                                {catNames.map(cat => (
                                                    <button key={cat} onClick={() => setPortionCatFilter(portionCatFilter === cat ? "All" : cat)}
                                                        className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all whitespace-nowrap
                                                            ${portionCatFilter === cat ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-muted/50"}`}
                                                    >{cat}</button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Main ingredient table */}
                                        <Card className="overflow-hidden">
                                            <CardHeader className="px-5 py-3 border-b bg-muted/20 flex flex-row items-center justify-between gap-2">
                                                <CardTitle className="text-sm font-semibold">
                                                    {allIngs.length} ingredient{allIngs.length !== 1 ? "s" : ""}
                                                    {portionCatFilter !== "All" ? ` · ${portionCatFilter}` : ""}
                                                </CardTitle>
                                                <p className="text-xs text-muted-foreground">Click ▶ to drill down by menu item</p>
                                            </CardHeader>

                                            {/* Desktop */}
                                            <div className="hidden md:block">
                                                <table className="w-full text-sm">
                                                    <thead>
                                                        <tr className="border-b bg-muted/10">
                                                            <th className="text-left px-5 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-8"></th>
                                                            <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ingredient</th>
                                                            <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Category</th>
                                                            <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Total Used</th>
                                                            <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Top Source</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y">
                                                        {allIngs.map(ing => {
                                                            const isExp = portionExpanded.has(ing.ingredientId);
                                                            const maxQty = allIngs[0]?.totalQty ?? 1;
                                                            const pct = maxQty > 0 ? (ing.totalQty / maxQty) * 100 : 0;
                                                            return (
                                                                <>
                                                                    <tr key={ing.ingredientId}
                                                                        className="hover:bg-muted/20 transition-colors cursor-pointer"
                                                                        onClick={() => setPortionExpanded(prev => {
                                                                            const next = new Set(prev);
                                                                            if (next.has(ing.ingredientId)) next.delete(ing.ingredientId);
                                                                            else next.add(ing.ingredientId);
                                                                            return next;
                                                                        })}
                                                                    >
                                                                        <td className="pl-5 py-3">
                                                                            <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${isExp ? "rotate-90" : ""}`} />
                                                                        </td>
                                                                        <td className="px-4 py-3">
                                                                            <div className="font-medium">{ing.ingredientName}</div>
                                                                            {ing.sku && <div className="text-[10px] text-muted-foreground font-mono">{ing.sku}</div>}
                                                                            <div className="mt-1 h-1 bg-muted rounded-full overflow-hidden w-28">
                                                                                <div className="h-full rounded-full bg-violet-500" style={{ width: `${pct}%` }} />
                                                                            </div>
                                                                        </td>
                                                                        <td className="px-4 py-3">
                                                                            <span className="text-xs text-muted-foreground">{ing.categoryName}</span>
                                                                        </td>
                                                                        <td className="px-4 py-3 text-right">
                                                                            <span className="text-lg font-bold tabular-nums">{ing.totalQty.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                                                                            <span className="text-xs text-muted-foreground ml-1">{ing.unit}</span>
                                                                        </td>
                                                                        <td className="px-4 py-3 text-sm text-muted-foreground max-w-[200px]">
                                                                            {ing.contributions[0] ? (
                                                                                <div className="truncate">
                                                                                    <span className="text-foreground font-medium">{ing.contributions[0].source}</span>
                                                                                    <span className="text-xs ml-1">
                                                                                        ({ing.contributions[0].qtySold} × {ing.contributions[0].portionSize} {ing.contributions[0].portionUnit})
                                                                                    </span>
                                                                                </div>
                                                                            ) : "—"}
                                                                        </td>
                                                                    </tr>
                                                                    {/* Drill-down */}
                                                                    {isExp && (
                                                                        <tr key={`${ing.ingredientId}-drill`}>
                                                                            <td colSpan={5} className="bg-violet-50/30 dark:bg-violet-950/10 px-5 pb-3 pt-1">
                                                                                <div className="pl-4 border-l-2 border-violet-400/40 space-y-2">
                                                                                    <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-4 gap-y-1.5 text-xs">
                                                                                        <span className="text-muted-foreground font-semibold uppercase tracking-wide">Source</span>
                                                                                        <span className="text-muted-foreground font-semibold uppercase tracking-wide text-right">Type</span>
                                                                                        <span className="text-muted-foreground font-semibold uppercase tracking-wide text-right">Sold</span>
                                                                                        <span className="text-muted-foreground font-semibold uppercase tracking-wide text-right">× Portion</span>
                                                                                        <span className="text-muted-foreground font-semibold uppercase tracking-wide text-right">= Total</span>
                                                                                        {ing.contributions.map(c => (
                                                                                            <>
                                                                                                <span key={`n-${c.source}`} className="font-medium truncate pr-2">{c.source}</span>
                                                                                                <span key={`t-${c.source}`} className={`text-right rounded-full px-1.5 py-0.5 text-[10px] font-medium
                                                                                                    ${c.sourceType === "modifier"
                                                                                                        ? "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300"
                                                                                                        : "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                                                                                                    }`}>{c.sourceType === "modifier" ? "modifier" : "base"}</span>
                                                                                                <span key={`q-${c.source}`} className="tabular-nums text-right">{c.qtySold.toLocaleString()}</span>
                                                                                                <span key={`p-${c.source}`} className="tabular-nums text-right">{c.portionSize} {c.portionUnit}</span>
                                                                                                <span key={`tot-${c.source}`} className="tabular-nums text-right font-semibold text-violet-700 dark:text-violet-400">
                                                                                                    {c.totalQty.toLocaleString(undefined, { maximumFractionDigits: 2 })} {c.portionUnit}
                                                                                                </span>
                                                                                            </>
                                                                                        ))}
                                                                                    </div>
                                                                                </div>
                                                                            </td>
                                                                        </tr>
                                                                    )}
                                                                </>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>

                                            {/* Mobile */}
                                            <div className="md:hidden divide-y">
                                                {allIngs.map(ing => {
                                                    const isExp = portionExpanded.has(ing.ingredientId);
                                                    return (
                                                        <div key={ing.ingredientId} className="px-4 py-3">
                                                            <button className="w-full flex items-start gap-3 text-left"
                                                                onClick={() => setPortionExpanded(prev => {
                                                                    const next = new Set(prev);
                                                                    if (next.has(ing.ingredientId)) next.delete(ing.ingredientId);
                                                                    else next.add(ing.ingredientId);
                                                                    return next;
                                                                })}
                                                            >
                                                                <ChevronRight className={`w-4 h-4 mt-0.5 text-muted-foreground transition-transform shrink-0 ${isExp ? "rotate-90" : ""}`} />
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="flex items-start justify-between gap-2">
                                                                        <div>
                                                                            <p className="text-sm font-medium">{ing.ingredientName}</p>
                                                                            <p className="text-xs text-muted-foreground">{ing.categoryName}</p>
                                                                        </div>
                                                                        <div className="text-right shrink-0">
                                                                            <p className="text-base font-bold tabular-nums">{ing.totalQty.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
                                                                            <p className="text-xs text-muted-foreground">{ing.unit}</p>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </button>
                                                            {isExp && (
                                                                <div className="mt-2 pl-7 space-y-1.5">
                                                                    {ing.contributions.map(c => (
                                                                        <div key={c.source} className="flex items-center justify-between text-xs gap-2">
                                                                            <span className="text-muted-foreground truncate flex-1">{c.source}</span>
                                                                            <span className="text-muted-foreground tabular-nums shrink-0">{c.qtySold} × {c.portionSize} {c.portionUnit}</span>
                                                                            <span className="font-semibold tabular-nums text-violet-700 dark:text-violet-400 shrink-0 w-20 text-right">
                                                                                = {c.totalQty.toFixed(2)} {c.portionUnit}
                                                                            </span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </Card>

                                        {/* Unmatched items */}
                                        {portionCalc.coverage.unmatched.length > 0 && (
                                            <Card className="overflow-hidden border-amber-200 dark:border-amber-800">
                                                <CardHeader className="px-5 py-3 border-b bg-amber-50/50 dark:bg-amber-950/20">
                                                    <button
                                                        className="flex items-center gap-2 w-full text-left"
                                                        onClick={() => setPortionShowUnmatched(v => !v)}
                                                    >
                                                        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                                                        <CardTitle className="text-sm font-semibold flex-1">
                                                            {portionCalc.coverage.unmatched.length} items with no portion standard
                                                        </CardTitle>
                                                        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${portionShowUnmatched ? "rotate-180" : ""}`} />
                                                    </button>
                                                    <p className="text-xs text-muted-foreground mt-0.5 pl-6">
                                                        These PMIX items were not matched to any portion standard — add standards to include them.
                                                    </p>
                                                </CardHeader>
                                                {portionShowUnmatched && (
                                                    <CardContent className="px-5 pt-3 pb-4">
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                                            {portionCalc.coverage.unmatched.map(name => (
                                                                <div key={name} className="flex items-center gap-2 text-sm text-muted-foreground">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                                                                    {name}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </CardContent>
                                                )}
                                            </Card>
                                        )}
                                    </>
                                );
                            })()}
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
                                                {(() => {
                                                    const maxQty = Math.max(1, ...bomData.consumption.map(c => c.totalQty));
                                                    const grouped = groupConsumptionByCategory(bomData.consumption);
                                                    return grouped.map(g => (
                                                        <div key={g.label}>
                                                            <div className="flex items-center gap-2 px-5 py-2 bg-muted/40 border-y border-border sticky top-0 z-[1]">
                                                                <span className={`w-2 h-2 rounded-full ${g.dot}`} />
                                                                <span className="text-xs font-bold uppercase tracking-wide">{g.label}</span>
                                                                <span className="text-[10px] text-muted-foreground">{g.items.length}</span>
                                                            </div>
                                                            <div className="divide-y">
                                                                {g.items.map(c => (
                                                                    <div key={c.ingredientId} className="flex items-center gap-3 px-5 py-3">
                                                                        <div className="flex-1 min-w-0 space-y-1">
                                                                            <div className="flex items-center justify-between gap-2">
                                                                                <p className="text-sm font-medium truncate">{c.ingredientName}
                                                                                    {c.category && <span className="text-[10px] text-muted-foreground ml-1.5">· {c.category}</span>}
                                                                                </p>
                                                                                <div className="flex items-center gap-1.5 shrink-0">
                                                                                    <span className="text-sm font-bold tabular-nums">{c.totalQty.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                                                                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">{c.unit}</Badge>
                                                                                </div>
                                                                            </div>
                                                                            <ProgressBar value={c.totalQty} max={maxQty} color={g.bar} />
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    ));
                                                })()}
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
                INGREDIENT USE SUMMARY TAB
            ══════════════════════════════════════════════════════════ */}
            {activeTab === "ingsum" && (
                <>
                    {/* Header bar */}
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex-1 min-w-0">
                            <h2 className="text-base font-semibold flex items-center gap-2">
                                <Table2 className="w-4 h-4 text-teal-600" />
                                Ingredient Use Summary
                            </h2>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                Protein choices extracted directly from POS modifier data
                            </p>
                        </div>
                        {ingSum && ingSum.hasProteinData && (
                            <>
                                <Button size="sm" variant="outline"
                                    disabled={autoFilling}
                                    onClick={() => handleAutoFillPortions("both", false)}
                                    className="gap-1.5 rounded-xl h-8 text-xs border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950/30">
                                    {autoFilling
                                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        : <Zap className="w-3.5 h-3.5" />}
                                    Auto-fill 6 oz (match only)
                                </Button>
                                <Button size="sm"
                                    disabled={autoFilling}
                                    onClick={() => handleAutoFillPortions("both", true)}
                                    className="gap-1.5 rounded-xl h-8 text-xs bg-teal-600 hover:bg-teal-700 text-white">
                                    {autoFilling
                                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        : <Plus className="w-3.5 h-3.5" />}
                                    Auto-fill + create missing
                                </Button>
                            </>
                        )}
                        {ingSum && (
                            <Button size="sm" variant="outline" className="gap-1.5 rounded-xl h-8 text-xs"
                                onClick={handleIngSumExportCSV}>
                                <Download className="w-3.5 h-3.5" /> Export CSV
                            </Button>
                        )}
                    </div>

                    {autoFillResult && (
                        <Card className={`border-2 ${autoFillResult.created > 0
                            ? "border-teal-200 dark:border-teal-800 bg-teal-50/50 dark:bg-teal-950/20"
                            : "border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20"}`}>
                            <CardContent className="pt-4 pb-4 px-5">
                                <div className="flex items-start gap-3">
                                    {autoFillResult.created > 0
                                        ? <CircleCheck className="w-5 h-5 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
                                        : <CircleAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold">
                                            {autoFillResult.created > 0
                                                ? `Created ${autoFillResult.created} new Portion Standard${autoFillResult.created === 1 ? "" : "s"} at ${autoFillResult.portionSize} ${autoFillResult.portionUnit}`
                                                : "No new Portion Standards created"}
                                        </p>
                                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs text-muted-foreground">
                                            <span><strong className="text-teal-700 dark:text-teal-300">{autoFillResult.created}</strong> standards created</span>
                                            <span><strong className="text-foreground">{autoFillResult.skipped}</strong> already existed</span>
                                            {autoFillResult.ingredientsCreated.length > 0 && (
                                                <span><strong className="text-emerald-700 dark:text-emerald-400">{autoFillResult.ingredientsCreated.length}</strong> placeholder ingredients created</span>
                                            )}
                                            <span><strong className="text-amber-700 dark:text-amber-400">{autoFillResult.missing.length}</strong> still missing</span>
                                        </div>
                                        {autoFillResult.ingredientsCreated.length > 0 && (
                                            <div className="mt-2 flex flex-wrap gap-1">
                                                {autoFillResult.ingredientsCreated.map(n => (
                                                    <Badge key={n} variant="outline" className="text-[10px] border-emerald-300 text-emerald-700 dark:text-emerald-300">+{n}</Badge>
                                                ))}
                                            </div>
                                        )}
                                        {autoFillResult.missing.length > 0 && (
                                            <div className="mt-2.5">
                                                <p className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-1">
                                                    Couldn't match these to an Ingredient — add them in <a href="/ingredients" className="underline">Ingredients</a> first:
                                                </p>
                                                <div className="flex flex-wrap gap-1">
                                                    {autoFillResult.missing.map(n => (
                                                        <Badge key={n} variant="outline" className="text-[10px] border-amber-300 text-amber-700 dark:text-amber-300">{n}</Badge>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <button onClick={() => setAutoFillResult(null)}
                                        className="text-muted-foreground hover:text-foreground shrink-0">
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {ingLoading && (
                        <div className="flex justify-center py-16">
                            <Loader2 className="w-7 h-7 animate-spin text-muted-foreground" />
                        </div>
                    )}

                    {!ingLoading && ingSum && !ingSum.hasProteinData && (
                        <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
                            <CardContent className="pt-5 pb-5 px-5">
                                <div className="flex items-start gap-3">
                                    <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-sm font-medium text-amber-800 dark:text-amber-300">No protein modifier data found</p>
                                        <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                                            This PMIX upload has no modifiers with "protein" in the group name. Check that your POS
                                            modifier groups (e.g. "Choice of Protein", "Extra Protein") are named correctly.
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {!ingLoading && ingSum && ingSum.hasProteinData && (
                        <div className="space-y-6">
                            {/* ── KPI row ── */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <KpiCard label="Total Orders" value={fmtN(ingSum.mainProtein.total + ingSum.extraProtein.total)}
                                    sub="main + extras" icon={Beef} />
                                <KpiCard label="Protein Types" value={ingSum.mainProtein.byType.length}
                                    sub="main protein choices" icon={Table2} />
                                <KpiCard label="Extra Add-ons" value={ingSum.extraProtein.byType.length}
                                    sub="extra modifier types" icon={Plus} />
                                <KpiCard label="Dishes w/ Protein" value={new Set(ingSum.mainProtein.byDish.map(d => d.dish)).size}
                                    sub="unique menu items" icon={ChefHat} />
                            </div>

                            {/* ── Toggle: Main / Extra / Desserts / Uncategorized ── */}
                            <div className="flex flex-wrap gap-2">
                                <button
                                    onClick={() => setIngCatFilter("main")}
                                    className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                                        ingCatFilter === "main"
                                            ? "bg-teal-600 text-white border-teal-600 shadow-sm"
                                            : "bg-muted/30 border-border text-muted-foreground hover:text-foreground hover:bg-muted/60"
                                    }`}
                                >
                                    🥩 Main Protein ({ingSum.mainProtein.byType.length} types · {fmtN(ingSum.mainProtein.total)} total)
                                </button>
                                <button
                                    onClick={() => setIngCatFilter("extra")}
                                    className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                                        ingCatFilter === "extra"
                                            ? "bg-violet-600 text-white border-violet-600 shadow-sm"
                                            : "bg-muted/30 border-border text-muted-foreground hover:text-foreground hover:bg-muted/60"
                                    }`}
                                >
                                    ➕ Extra Add-ons ({ingSum.extraProtein.byType.length} types · {fmtN(ingSum.extraProtein.total)} total)
                                </button>
                                {(ingSum.desserts?.byItem.length ?? 0) > 0 && (
                                    <button
                                        onClick={() => setIngCatFilter("dessert")}
                                        className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                                            ingCatFilter === "dessert"
                                                ? "bg-pink-600 text-white border-pink-600 shadow-sm"
                                                : "bg-muted/30 border-border text-muted-foreground hover:text-foreground hover:bg-muted/60"
                                        }`}
                                    >
                                        🍮 Desserts ({ingSum.desserts?.byItem.length ?? 0} items · {fmtN(ingSum.desserts?.total ?? 0)} orders)
                                    </button>
                                )}
                                {(ingSum.beverages?.byGroup.length ?? 0) > 0 && (
                                    <button
                                        onClick={() => setIngCatFilter("beverage")}
                                        className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                                            ingCatFilter === "beverage"
                                                ? "bg-purple-600 text-white border-purple-600 shadow-sm"
                                                : "bg-muted/30 border-border text-muted-foreground hover:text-foreground hover:bg-muted/60"
                                        }`}
                                    >
                                        🍹 Beverages ({ingSum.beverages?.byGroup.length ?? 0} groups · {fmtN(ingSum.beverages?.total ?? 0)} orders)
                                    </button>
                                )}
                                {(ingSum.curries?.byGroup.length ?? 0) > 0 && (
                                    <button
                                        onClick={() => setIngCatFilter("curry")}
                                        className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                                            ingCatFilter === "curry"
                                                ? "bg-amber-600 text-white border-amber-600 shadow-sm"
                                                : "bg-muted/30 border-border text-muted-foreground hover:text-foreground hover:bg-muted/60"
                                        }`}
                                    >
                                        🍛 Main Curry ({ingSum.curries?.byGroup.length ?? 0} groups · {fmtN(ingSum.curries?.total ?? 0)} orders)
                                    </button>
                                )}
                                {(ingSum.uncategorized?.length ?? 0) > 0 && (
                                    <button
                                        onClick={() => setIngCatFilter("uncategorized")}
                                        className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                                            ingCatFilter === "uncategorized"
                                                ? "bg-amber-600 text-white border-amber-600 shadow-sm"
                                                : "bg-amber-100 border-amber-300 text-amber-800 hover:bg-amber-200 dark:bg-amber-950/30 dark:border-amber-700 dark:text-amber-300"
                                        }`}
                                    >
                                        ⚠ Uncategorized ({ingSum.uncategorized?.length ?? 0} items)
                                    </button>
                                )}
                            </div>

                            {ingCatFilter === "main" && (
                                <div className="space-y-4">
                                    {/* ── Main Protein: type totals (summary card) ── */}
                                    <div className="grid sm:grid-cols-2 gap-4">
                                        {/* Left: protein type totals */}
                                        <Card>
                                            <CardHeader className="pb-2 pt-4 px-5">
                                                <CardTitle className="text-sm flex items-center gap-2">
                                                    <Beef className="w-4 h-4 text-teal-600" />
                                                    Main Protein Totals
                                                    {ingSum.mainProtein.groupNames.length > 0 && (
                                                        <Badge variant="secondary" className="text-[10px] ml-auto font-normal">
                                                            {ingSum.mainProtein.groupNames[0]}
                                                        </Badge>
                                                    )}
                                                </CardTitle>
                                            </CardHeader>
                                            <CardContent className="px-5 pb-4">
                                                <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 gap-y-2 text-sm items-center">
                                                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Protein Type</div>
                                                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-right">Total Orders</div>
                                                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-right">Total We Use<span className="text-orange-500 normal-case font-normal"> +extra</span></div>
                                                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-right">Total We Use (lb)</div>
                                                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-right w-12">%</div>

                                                    {ingSum.mainProtein.byType.map(row => {
                                                        const pct = ingSum.mainProtein.total > 0
                                                            ? Math.round((row.qty / ingSum.mainProtein.total) * 100)
                                                            : 0;
                                                        const max = ingSum.mainProtein.byType[0]?.qty ?? 1;
                                                        const extraUsed = row.extraUsed ?? 0;
                                                        const combinedUsed = row.totalUsed !== null ? row.totalUsed + extraUsed : null;
                                                        const lbValue = combinedUsed !== null && row.portionUnit === "oz"
                                                            ? (combinedUsed / 16).toFixed(2)
                                                            : null;
                                                        return (
                                                            <div key={row.proteinType} className="contents">
                                                                <div className="font-medium truncate flex items-center gap-2 min-w-0">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-teal-600 shrink-0" />
                                                                    <span className="truncate">{row.proteinType}</span>
                                                                </div>
                                                                <div className="tabular-nums font-bold text-teal-700 dark:text-teal-300 text-right">{fmtN(row.qty)}</div>
                                                                <div className="text-right">
                                                                    {combinedUsed !== null ? (
                                                                        <div>
                                                                            <div className="tabular-nums font-bold text-foreground">
                                                                                {fmtN(combinedUsed)} <span className="text-xs font-medium text-muted-foreground">{row.portionUnit}</span>
                                                                            </div>
                                                                            <div className="text-[10px] text-muted-foreground tabular-nums">
                                                                                {extraUsed > 0
                                                                                    ? <>{fmtN(row.totalUsed!)} main + <span className="text-orange-500">{fmtN(extraUsed)} extra</span></>
                                                                                    : <>{row.qty} × {row.portionSize} {row.portionUnit}</>}
                                                                            </div>
                                                                        </div>
                                                                    ) : (
                                                                        <span className="text-xs text-muted-foreground italic">No standard</span>
                                                                    )}
                                                                </div>
                                                                <div className="text-right">
                                                                    {lbValue !== null ? (
                                                                        <div className="tabular-nums font-bold text-foreground">
                                                                            {lbValue} <span className="text-xs font-medium text-muted-foreground">lb</span>
                                                                        </div>
                                                                    ) : (
                                                                        <span className="text-xs text-muted-foreground">—</span>
                                                                    )}
                                                                </div>
                                                                <div className="tabular-nums text-xs text-muted-foreground text-right">{pct}%</div>
                                                                <div className="col-span-5 -mt-1">
                                                                    <ProgressBar value={row.qty} max={max} color="#0d9488" />
                                                                </div>
                                                            </div>
                                                        );
                                                    })}

                                                    <div className="font-bold border-t border-border pt-2 mt-1">TOTAL</div>
                                                    <div className="tabular-nums font-bold text-teal-700 dark:text-teal-300 border-t border-border pt-2 mt-1 text-right">{fmtN(ingSum.mainProtein.total)}</div>
                                                    <div className="border-t border-border pt-2 mt-1 text-right text-[10px] text-muted-foreground">per unit shown</div>
                                                    <div className="border-t border-border pt-2 mt-1 text-right">
                                                        {ingSum.mainProtein.byType.every(r => r.portionUnit === "oz" && r.totalUsed !== null) ? (
                                                            <span className="tabular-nums font-bold text-foreground text-sm">
                                                                {(ingSum.mainProtein.byType.reduce((s, r) => s + (r.totalUsed ?? 0) + (r.extraUsed ?? 0), 0) / 16).toFixed(2)} <span className="text-xs font-medium text-muted-foreground">lb</span>
                                                            </span>
                                                        ) : (
                                                            <span className="text-[10px] text-muted-foreground">—</span>
                                                        )}
                                                    </div>
                                                    <div className="tabular-nums text-xs text-muted-foreground border-t border-border pt-2 mt-1 text-right">100%</div>
                                                </div>

                                                {ingSum.mainProtein.byType.some(r => r.totalUsed === null) && (
                                                    <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-3 flex items-center gap-1.5">
                                                        <Info className="w-3 h-3 shrink-0" />
                                                        Some proteins have no Portion Standard. <a href="/settings/portion-standards" className="underline ml-1">Add standards →</a>
                                                    </p>
                                                )}
                                            </CardContent>
                                        </Card>

                                        {/* Right: extra add-on totals (preview) */}
                                        <Card>
                                            <CardHeader className="pb-2 pt-4 px-5">
                                                <CardTitle className="text-sm flex items-center gap-2">
                                                    <Plus className="w-4 h-4 text-violet-600" />
                                                    Extra Add-on Overview
                                                </CardTitle>
                                            </CardHeader>
                                            <CardContent className="px-5 pb-4">
                                                {ingSum.extraProtein.byType.length === 0 ? (
                                                    <p className="text-sm text-muted-foreground italic">No extra add-ons found</p>
                                                ) : (
                                                    <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 text-sm items-center">
                                                        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Add-on</div>
                                                        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-right">Total Orders</div>
                                                        {ingSum.extraProtein.byType.map(row => (
                                                            <div key={row.proteinType} className="contents">
                                                                <div className="font-medium truncate flex items-center gap-2">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-violet-600 shrink-0" />
                                                                    <span className="truncate">{row.proteinType}</span>
                                                                </div>
                                                                <div className="tabular-nums font-bold text-violet-700 dark:text-violet-300 text-right">{fmtN(row.qty)}</div>
                                                            </div>
                                                        ))}
                                                        <div className="font-bold border-t border-border pt-2 mt-1">TOTAL</div>
                                                        <div className="tabular-nums font-bold text-violet-700 dark:text-violet-300 border-t border-border pt-2 mt-1 text-right">{fmtN(ingSum.extraProtein.total)}</div>
                                                        <button
                                                            className="col-span-2 text-xs text-violet-600 dark:text-violet-400 underline mt-1 text-left"
                                                            onClick={() => setIngCatFilter("extra")}
                                                        >
                                                            View extra detail →
                                                        </button>
                                                    </div>
                                                )}
                                            </CardContent>
                                        </Card>
                                    </div>

                                    {/* ── Main Protein by Dish table ── */}
                                    <Card className="overflow-hidden">
                                        <CardHeader className="pb-2 pt-4 px-5">
                                            <CardTitle className="text-sm flex items-center gap-2">
                                                Main Protein by Dish
                                                <Badge variant="secondary" className="text-[10px] ml-1">{ingSum.mainProtein.byDish.length} rows</Badge>
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent className="p-0">
                                            {/* Desktop */}
                                            <div className="hidden sm:block overflow-x-auto">
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow className="bg-muted/30">
                                                            <TableHead className="text-xs font-semibold pl-5">Category</TableHead>
                                                            <TableHead className="text-xs font-semibold">Dish</TableHead>
                                                            <TableHead className="text-xs font-semibold">Protein Choice</TableHead>
                                                            <TableHead className="text-xs font-semibold text-right pr-5">Qty Ordered</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {ingSum.mainProtein.byDish.map((row, i) => (
                                                            <TableRow key={i} className="hover:bg-muted/20">
                                                                <TableCell className="text-xs text-muted-foreground pl-5">{row.category || "—"}</TableCell>
                                                                <TableCell className="text-sm font-medium">{row.dish}</TableCell>
                                                                <TableCell>
                                                                    <Badge variant="outline" className="text-xs">{row.proteinType}</Badge>
                                                                </TableCell>
                                                                <TableCell className="text-right font-bold tabular-nums pr-5">{fmtN(row.qty)}</TableCell>
                                                            </TableRow>
                                                        ))}
                                                    </TableBody>
                                                </Table>
                                            </div>
                                            {/* Mobile */}
                                            <div className="sm:hidden divide-y">
                                                {ingSum.mainProtein.byDish.map((row, i) => (
                                                    <div key={i} className="px-4 py-3 flex items-center gap-3">
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-sm font-medium truncate">{row.dish}</p>
                                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                                {row.category && <span className="text-[10px] text-muted-foreground">{row.category}</span>}
                                                                <Badge variant="outline" className="text-[10px] h-4 px-1.5 py-0">{row.proteinType}</Badge>
                                                            </div>
                                                        </div>
                                                        <span className="text-base font-bold tabular-nums shrink-0">{fmtN(row.qty)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </CardContent>
                                    </Card>
                                </div>
                            )}

                            {ingCatFilter === "extra" && (
                                <div className="space-y-4">
                                    {/* ── Extra totals card ── */}
                                    <div className="grid sm:grid-cols-2 gap-4">
                                        <Card>
                                            <CardHeader className="pb-2 pt-4 px-5">
                                                <CardTitle className="text-sm flex items-center gap-2">
                                                    <Plus className="w-4 h-4 text-violet-600" />
                                                    Extra Add-on Totals
                                                </CardTitle>
                                            </CardHeader>
                                            <CardContent className="px-5 pb-4">
                                                {ingSum.extraProtein.byType.length === 0 ? (
                                                    <p className="text-sm text-muted-foreground italic">No extra add-ons found in this upload.</p>
                                                ) : (
                                                    <>
                                                    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 gap-y-2 text-sm items-center">
                                                        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Add-on</div>
                                                        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-right">Total Orders</div>
                                                        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-right">Total We Use</div>
                                                        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-right w-12">%</div>

                                                        {ingSum.extraProtein.byType.map(row => {
                                                            const pct = ingSum.extraProtein.total > 0
                                                                ? Math.round((row.qty / ingSum.extraProtein.total) * 100)
                                                                : 0;
                                                            const max = ingSum.extraProtein.byType[0]?.qty ?? 1;
                                                            return (
                                                                <div key={row.proteinType} className="contents">
                                                                    <div className="font-medium truncate flex items-center gap-2 min-w-0">
                                                                        <span className="w-1.5 h-1.5 rounded-full bg-violet-600 shrink-0" />
                                                                        <span className="truncate">{row.proteinType}</span>
                                                                    </div>
                                                                    <div className="tabular-nums font-bold text-violet-700 dark:text-violet-300 text-right">{fmtN(row.qty)}</div>
                                                                    <div className="text-right">
                                                                        {row.totalUsed !== null ? (
                                                                            <div>
                                                                                <div className="tabular-nums font-bold text-foreground">
                                                                                    {fmtN(row.totalUsed)} <span className="text-xs font-medium text-muted-foreground">{row.portionUnit}</span>
                                                                                </div>
                                                                                <div className="text-[10px] text-muted-foreground tabular-nums">
                                                                                    {row.qty} × {row.portionSize} {row.portionUnit}
                                                                                </div>
                                                                            </div>
                                                                        ) : (
                                                                            <span className="text-xs text-muted-foreground italic">No standard</span>
                                                                        )}
                                                                    </div>
                                                                    <div className="tabular-nums text-xs text-muted-foreground text-right">{pct}%</div>
                                                                    <div className="col-span-4 -mt-1">
                                                                        <ProgressBar value={row.qty} max={max} color="#7c3aed" />
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}

                                                        <div className="font-bold border-t border-border pt-2 mt-1">TOTAL</div>
                                                        <div className="tabular-nums font-bold text-violet-700 dark:text-violet-300 border-t border-border pt-2 mt-1 text-right">{fmtN(ingSum.extraProtein.total)}</div>
                                                        <div className="border-t border-border pt-2 mt-1 text-right text-[10px] text-muted-foreground">per unit shown</div>
                                                        <div className="tabular-nums text-xs text-muted-foreground border-t border-border pt-2 mt-1 text-right">100%</div>
                                                    </div>

                                                    {ingSum.extraProtein.byType.some(r => r.totalUsed === null) && (
                                                        <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-3 flex items-center gap-1.5">
                                                            <Info className="w-3 h-3 shrink-0" />
                                                            Some add-ons have no Portion Standard. <a href="/settings/portion-standards" className="underline ml-1">Add standards →</a>
                                                        </p>
                                                    )}
                                                    </>
                                                )}
                                            </CardContent>
                                        </Card>

                                        {/* Right: hint */}
                                        <Card className="bg-violet-50/50 dark:bg-violet-950/20 border-violet-200 dark:border-violet-800">
                                            <CardContent className="pt-5 pb-5 px-5">
                                                <p className="text-xs text-violet-700 dark:text-violet-300 font-medium mb-2 flex items-center gap-1.5">
                                                    <Info className="w-3.5 h-3.5" /> How extras are detected
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    Modifiers are classified as "Extra" when the modifier group name contains "extra" (case-insensitive)
                                                    or the modifier name begins with "Extra ".
                                                </p>
                                                {ingSum.extraProtein.groupNames.length > 0 && (
                                                    <div className="mt-3 flex flex-wrap gap-1">
                                                        {ingSum.extraProtein.groupNames.map(g => (
                                                            <Badge key={g} variant="outline" className="text-[10px]">{g}</Badge>
                                                        ))}
                                                    </div>
                                                )}
                                            </CardContent>
                                        </Card>
                                    </div>

                                    {/* ── Extra by Dish table ── */}
                                    {ingSum.extraProtein.byDish.length > 0 && (
                                        <Card className="overflow-hidden">
                                            <CardHeader className="pb-2 pt-4 px-5">
                                                <CardTitle className="text-sm flex items-center gap-2">
                                                    Extra Add-on by Dish
                                                    <Badge variant="secondary" className="text-[10px] ml-1">{ingSum.extraProtein.byDish.length} rows</Badge>
                                                </CardTitle>
                                            </CardHeader>

                                            <CardContent className="p-0">
                                                {/* Desktop */}
                                                <div className="hidden sm:block overflow-x-auto">
                                                    <Table>
                                                        <TableHeader>
                                                            <TableRow className="bg-muted/30">
                                                                <TableHead className="text-xs font-semibold pl-5">Category</TableHead>
                                                                <TableHead className="text-xs font-semibold">Dish</TableHead>
                                                                <TableHead className="text-xs font-semibold">Extra Add-on</TableHead>
                                                                <TableHead className="text-xs font-semibold text-right pr-5">Qty</TableHead>
                                                            </TableRow>
                                                        </TableHeader>
                                                        <TableBody>
                                                            {ingSum.extraProtein.byDish.map((row, i) => (
                                                                <TableRow key={i} className="hover:bg-muted/20">
                                                                    <TableCell className="text-xs text-muted-foreground pl-5">{row.category || "—"}</TableCell>
                                                                    <TableCell className="text-sm font-medium">{row.dish}</TableCell>
                                                                    <TableCell>
                                                                        <Badge variant="outline" className="text-xs border-violet-300 text-violet-700 dark:text-violet-300">{row.proteinType}</Badge>
                                                                    </TableCell>
                                                                    <TableCell className="text-right font-bold tabular-nums pr-5">{fmtN(row.qty)}</TableCell>
                                                                </TableRow>
                                                            ))}
                                                        </TableBody>
                                                    </Table>
                                                </div>
                                                {/* Mobile */}
                                                <div className="sm:hidden divide-y">
                                                    {ingSum.extraProtein.byDish.map((row, i) => (
                                                        <div key={i} className="px-4 py-3 flex items-center gap-3">
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-sm font-medium truncate">{row.dish}</p>
                                                                <div className="flex items-center gap-1.5 mt-0.5">
                                                                    {row.category && <span className="text-[10px] text-muted-foreground">{row.category}</span>}
                                                                    <Badge variant="outline" className="text-[10px] h-4 px-1.5 py-0 border-violet-300 text-violet-700 dark:text-violet-300">{row.proteinType}</Badge>
                                                                </div>
                                                            </div>
                                                            <span className="text-base font-bold tabular-nums shrink-0">{fmtN(row.qty)}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </CardContent>
                                        </Card>
                                    )}
                                </div>
                            )}

                            {/* ══ Desserts tab ══════════════════════════════════════════ */}
                            {ingCatFilter === "dessert" && (
                                <div className="space-y-4">
                                    <Card>
                                        <CardHeader className="pb-2 pt-4 px-5">
                                            <CardTitle className="text-sm flex items-center gap-2">
                                                <span className="text-lg leading-none">🍮</span>
                                                Main Desserts Totals
                                                <Badge variant="secondary" className="text-[10px] ml-auto font-normal">{ingSum.desserts?.byItem.length ?? 0} items</Badge>
                                            </CardTitle>
                                            <p className="text-[10px] text-muted-foreground mt-0.5">
                                                Click any dessert to view daily calendar
                                            </p>
                                        </CardHeader>
                                        <CardContent className="px-3 sm:px-5 pb-4">
                                            {(ingSum.desserts?.byItem.length ?? 0) === 0 ? (
                                                <p className="text-sm text-muted-foreground italic">No dessert items found. Add classification rules to tag desserts.</p>
                                            ) : (
                                                <div className="overflow-x-auto -mx-3 sm:mx-0">
                                                <div className="grid grid-cols-[minmax(90px,1fr)_auto_auto] gap-x-3 sm:gap-x-4 gap-y-1 text-sm items-center min-w-[260px] px-3 sm:px-0">
                                                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground py-1">Dessert Item</div>
                                                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-right py-1">Orders</div>
                                                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-right py-1 w-12">%</div>

                                                    {(ingSum.desserts?.byItem ?? []).map((item, idx) => {
                                                        const pct = (ingSum.desserts?.total ?? 0) > 0
                                                            ? Math.round((item.qty / (ingSum.desserts?.total ?? 1)) * 100)
                                                            : 0;
                                                        const max = ingSum.desserts?.byItem[0]?.qty ?? 1;
                                                        return (
                                                            <div key={idx} className="contents">
                                                                <button
                                                                    onClick={() => { setDessertCalItem(item.itemName); setDessertCalOpen(true); }}
                                                                    className="py-1.5 text-left flex items-center gap-1.5 rounded-lg active:bg-pink-50 dark:active:bg-pink-950/30 hover:bg-pink-50 dark:hover:bg-pink-950/30 transition-colors touch-manipulation min-w-0"
                                                                >
                                                                    <span className="text-pink-500 text-[10px] shrink-0">📅</span>
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-pink-500 shrink-0" />
                                                                    <span className="font-medium truncate">{item.itemName}</span>
                                                                </button>
                                                                <div className="tabular-nums font-bold text-pink-700 dark:text-pink-300 text-right self-center">{fmtN(item.qty)}</div>
                                                                <div className="tabular-nums text-xs text-muted-foreground text-right self-center">{pct}%</div>
                                                                <div className="col-span-3 -mt-1 px-0">
                                                                    <ProgressBar value={item.qty} max={max} color="#ec4899" />
                                                                </div>
                                                            </div>
                                                        );
                                                    })}

                                                    <div className="font-bold border-t border-border pt-2 mt-1">TOTAL</div>
                                                    <div className="tabular-nums font-bold text-pink-700 dark:text-pink-300 border-t border-border pt-2 mt-1 text-right">{fmtN(ingSum.desserts?.total ?? 0)}</div>
                                                    <div className="tabular-nums text-xs text-muted-foreground border-t border-border pt-2 mt-1 text-right">100%</div>
                                                </div>
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>

                                    <Card className="bg-pink-50/50 dark:bg-pink-950/20 border-pink-200 dark:border-pink-800">
                                        <CardContent className="pt-4 pb-4 px-5">
                                            <p className="text-xs text-pink-700 dark:text-pink-300 font-medium mb-1.5 flex items-center gap-1.5">
                                                <Info className="w-3.5 h-3.5" /> How desserts are detected
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                Items are classified as desserts using the <strong>Item Classification Rules</strong> engine. Any item name
                                                matching a rule with category &quot;Dessert&quot; is counted here by number of orders (no portion standard required).
                                            </p>
                                            <a href="/settings/pmix-rules" className="text-xs text-pink-600 dark:text-pink-400 underline mt-2 inline-block">
                                                Manage classification rules →
                                            </a>
                                        </CardContent>
                                    </Card>
                                </div>
                            )}

                            {/* ══ Beverages tab ═════════════════════════════════════════ */}
                            {ingCatFilter === "beverage" && (
                                <div className="space-y-4">
                                    <Card>
                                        <CardHeader className="pb-2">
                                            <CardTitle className="text-sm flex items-center gap-2">
                                                <span className="text-base leading-none">🍹</span>
                                                Beverage Totals
                                                <Badge variant="secondary" className="text-[10px] ml-auto font-normal">{ingSum.beverages?.byGroup.length ?? 0} groups</Badge>
                                            </CardTitle>
                                            <p className="text-[10px] text-muted-foreground mt-0.5">
                                                Click any beverage group to view daily calendar
                                            </p>
                                        </CardHeader>
                                        <CardContent className="px-3 sm:px-6">
                                            {(ingSum.beverages?.byGroup.length ?? 0) === 0 ? (
                                                <p className="text-sm text-muted-foreground italic">No beverage items found in this upload.</p>
                                            ) : (
                                                <div className="grid grid-cols-[minmax(90px,1fr)_auto_auto] gap-x-3 sm:gap-x-5 gap-y-0.5 text-xs">
                                                    <div className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px] py-1">Group</div>
                                                    <div className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px] text-right py-1">Orders</div>
                                                    <div className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px] text-right py-1">%</div>
                                                    {(ingSum.beverages?.byGroup ?? []).map((b, i) => {
                                                        const pct = (ingSum.beverages?.total ?? 0) > 0
                                                            ? Math.round((b.qty / (ingSum.beverages?.total ?? 1)) * 100)
                                                            : 0;
                                                        const max = ingSum.beverages?.byGroup[0]?.qty ?? 1;
                                                        return (
                                                            <div key={i} className="contents group">
                                                                <button
                                                                    onClick={() => { setBeverageCalGroup(b.group); setBeverageCalOpen(true); }}
                                                                    className="py-2 text-left flex items-center gap-1.5 rounded-lg active:bg-purple-50 dark:active:bg-purple-950/30 hover:bg-purple-50 dark:hover:bg-purple-950/30 transition-colors touch-manipulation"
                                                                >
                                                                    <span className="text-purple-500 text-[10px] shrink-0 sm:opacity-0 sm:group-hover:opacity-100">📅</span>
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0" />
                                                                    <span className="font-medium text-foreground truncate">{b.group}</span>
                                                                </button>
                                                                <div className="self-center text-right py-2 tabular-nums">
                                                                    <div className="font-bold text-purple-600 dark:text-purple-300">{fmtN(b.qty)}</div>
                                                                    <div className="w-full bg-muted rounded-full h-1 mt-0.5">
                                                                        <div className="bg-purple-500 h-1 rounded-full" style={{ width: `${Math.round((b.qty / max) * 100)}%` }} />
                                                                    </div>
                                                                </div>
                                                                <div className="self-center text-right py-2 tabular-nums text-muted-foreground text-[11px]">{pct}%</div>
                                                            </div>
                                                        );
                                                    })}
                                                    <div className="border-t border-border pt-2 mt-1 font-bold text-xs">TOTAL</div>
                                                    <div className="border-t border-border pt-2 mt-1 font-bold text-purple-600 dark:text-purple-300 text-right tabular-nums">{fmtN(ingSum.beverages?.total ?? 0)}</div>
                                                    <div className="border-t border-border pt-2 mt-1 text-right text-muted-foreground text-[11px]">100%</div>
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>
                                </div>
                            )}

                            {/* ══ Curries tab ═══════════════════════════════════════════ */}
                            {ingCatFilter === "curry" && (
                                <div className="space-y-4">
                                    <Card>
                                        <CardHeader className="pb-2">
                                            <CardTitle className="text-sm flex items-center gap-2">
                                                <span className="text-base leading-none">🍛</span>
                                                Main Curry Totals
                                                <Badge variant="secondary" className="text-[10px] ml-auto font-normal">{ingSum.curries?.byGroup.length ?? 0} groups</Badge>
                                            </CardTitle>
                                            <p className="text-[10px] text-muted-foreground mt-0.5">
                                                Click any curry group to view daily calendar · Panang Curry bundles Duck Panang, Panang Curry &amp; Malay Curry
                                            </p>
                                        </CardHeader>
                                        <CardContent className="px-3 sm:px-6">
                                            {(ingSum.curries?.byGroup.length ?? 0) === 0 ? (
                                                <p className="text-sm text-muted-foreground italic">No curry items found in this upload.</p>
                                            ) : (
                                                <div className="grid grid-cols-[minmax(90px,1fr)_auto_auto] gap-x-3 sm:gap-x-5 gap-y-0.5 text-xs">
                                                    <div className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px] py-1">Group</div>
                                                    <div className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px] text-right py-1">Orders</div>
                                                    <div className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px] text-right py-1">%</div>
                                                    {(ingSum.curries?.byGroup ?? []).map((c, i) => {
                                                        const pct = (ingSum.curries?.total ?? 0) > 0
                                                            ? Math.round((c.qty / (ingSum.curries?.total ?? 1)) * 100)
                                                            : 0;
                                                        const max = ingSum.curries?.byGroup[0]?.qty ?? 1;
                                                        return (
                                                            <div key={i} className="contents group">
                                                                <button
                                                                    onClick={() => { setCurryCalGroup(c.group); setCurryCalOpen(true); }}
                                                                    className="py-2 text-left flex items-center gap-1.5 rounded-lg active:bg-amber-50 dark:active:bg-amber-950/30 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors touch-manipulation"
                                                                >
                                                                    <span className="text-amber-500 text-[10px] shrink-0 sm:opacity-0 sm:group-hover:opacity-100">📅</span>
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                                                                    <span className="font-medium text-foreground truncate">{c.group}</span>
                                                                </button>
                                                                <div className="self-center text-right py-2 tabular-nums">
                                                                    <div className="font-bold text-amber-600 dark:text-amber-300">{fmtN(c.qty)}</div>
                                                                    <div className="w-full bg-muted rounded-full h-1 mt-0.5">
                                                                        <div className="bg-amber-500 h-1 rounded-full" style={{ width: `${Math.round((c.qty / max) * 100)}%` }} />
                                                                    </div>
                                                                </div>
                                                                <div className="self-center text-right py-2 tabular-nums text-muted-foreground text-[11px]">{pct}%</div>
                                                            </div>
                                                        );
                                                    })}
                                                    <div className="border-t border-border pt-2 mt-1 font-bold text-xs">TOTAL</div>
                                                    <div className="border-t border-border pt-2 mt-1 font-bold text-amber-600 dark:text-amber-300 text-right tabular-nums">{fmtN(ingSum.curries?.total ?? 0)}</div>
                                                    <div className="border-t border-border pt-2 mt-1 text-right text-muted-foreground text-[11px]">100%</div>
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>
                                </div>
                            )}

                            {/* ══ Uncategorized tab ═════════════════════════════════════ */}
                            {ingCatFilter === "uncategorized" && (
                                <div className="space-y-4">
                                    <Card className="border-amber-300 dark:border-amber-700">
                                        <CardHeader className="pb-2 pt-4 px-5">
                                            <CardTitle className="text-sm flex items-center gap-2">
                                                <span className="text-base leading-none">⚠</span>
                                                Uncategorized Items
                                                <Badge className="bg-amber-100 text-amber-800 border-amber-300 border text-[10px] ml-auto font-normal">{ingSum.uncategorized?.length ?? 0} items</Badge>
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent className="px-5 pb-4">
                                            <p className="text-xs text-amber-700 dark:text-amber-400 mb-4">
                                                These items had no protein modifiers and did not match any classification rule. Add a rule to automatically categorize them in future uploads.
                                            </p>
                                            {(ingSum.uncategorized?.length ?? 0) === 0 ? (
                                                <p className="text-sm text-muted-foreground italic">All items are classified — nothing to review.</p>
                                            ) : (
                                                <div className="border rounded-md overflow-x-auto">
                                                    <Table>
                                                        <TableHeader>
                                                            <TableRow className="bg-muted/30">
                                                                <TableHead className="text-xs pl-4">Item Name</TableHead>
                                                                <TableHead className="text-xs">POS Category</TableHead>
                                                                <TableHead className="text-xs text-right pr-4">Orders</TableHead>
                                                                <TableHead className="text-xs text-right pr-4">Action</TableHead>
                                                            </TableRow>
                                                        </TableHeader>
                                                        <TableBody>
                                                            {(ingSum.uncategorized ?? []).map((item, i) => (
                                                                <TableRow key={i}>
                                                                    <TableCell className="font-medium pl-4 text-sm">{item.itemName}</TableCell>
                                                                    <TableCell className="text-xs text-muted-foreground">{item.category || "—"}</TableCell>
                                                                    <TableCell className="text-right font-bold tabular-nums pr-4">{fmtN(item.qty)}</TableCell>
                                                                    <TableCell className="text-right pr-4">
                                                                        <a
                                                                            href={`/settings/pmix-rules`}
                                                                            className="text-xs text-primary underline"
                                                                        >
                                                                            Add rule →
                                                                        </a>
                                                                    </TableCell>
                                                                </TableRow>
                                                            ))}
                                                        </TableBody>
                                                    </Table>
                                                </div>
                                            )}
                                            <div className="mt-4">
                                                <a href="/settings/pmix-rules" className="text-xs text-primary underline font-medium">
                                                    Open Classification Rules Manager →
                                                </a>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </div>
                            )}

                        </div>
                    )}
                </>
            )}

            {/* ══════════════════════════════════════════════════════════
                RANGE ANALYTICS VIEW
            ══════════════════════════════════════════════════════════ */}
            {historyMode === "range" && (
                <div className="space-y-5">
                    {rangeLoading && (
                        <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
                            <Loader2 className="w-5 h-5 animate-spin" /> Loading range analytics…
                        </div>
                    )}
                    {!rangeLoading && !rangeData && (
                        <div className="text-center py-12 text-muted-foreground text-sm">
                            <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-30" />
                            Choose a date range above and click <strong>Load Analytics</strong>
                        </div>
                    )}
                    {rangeData && !rangeLoading && (
                        <>
                            {/* KPI row */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <KpiCard label="Days" value={rangeData.dayCount ?? 0} sub={`${rangeData.periodFrom} → ${rangeData.periodTo}`} icon={CalendarDays} />
                                <KpiCard label="Total Net Sales" value={`$${Number(rangeData.totals?.netSales ?? 0).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} sub={`Avg $${Number(rangeData.totals?.avgSalesPerDay ?? 0).toLocaleString("en-CA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}/day`} icon={TrendingUp} valueClass="text-emerald-600" />
                                <KpiCard label="Total Items Sold" value={(rangeData.totals?.qty ?? 0).toLocaleString()} sub={`Avg ${rangeData.totals?.avgQtyPerDay ?? 0}/day`} icon={ShoppingBag} />
                                <KpiCard label="Refunds" value={`$${Number(rangeData.totals?.refundAmount ?? 0).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} sub={`${rangeData.totals?.refundQty ?? 0} items`} icon={RotateCcw} valueClass="text-rose-500" />
                            </div>

                            {/* ── Range tab bar ─────────────────────────────────────── */}
                            <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1">
                                {TABS.map(t => (
                                    <button key={t.key} onClick={() => setRangeTab(t.key)}
                                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all shrink-0 border
                                            ${rangeTab === t.key ? "bg-primary text-primary-foreground border-primary shadow-sm" : "bg-card border-border text-muted-foreground hover:text-foreground"}`}>
                                        <span className={rangeTab === t.key ? "opacity-100" : t.color}>{t.icon}</span>
                                        <span className="hidden sm:inline">{t.label}</span>
                                        <span className="sm:hidden">{t.short}</span>
                                    </button>
                                ))}
                            </div>

                            {/* ════ MENU ENGINEERING (BCG matrix) ════ */}
                            {rangeTab === "bcg" && (
                                <Card>
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="w-4 h-4 text-rose-600" /> Menu Engineering — BCG Matrix ({rangeData.dayCount}-day)</CardTitle>
                                        <p className="text-[10px] text-muted-foreground mt-0.5">
                                            Popularity (qty vs avg {rangeData.bcg?.summary.avgQty ?? 0}) × Profitability (net/unit vs avg ${rangeData.bcg?.summary.avgPrice ?? 0})
                                        </p>
                                    </CardHeader>
                                    <CardContent className="px-2 sm:px-6 space-y-3">
                                        {/* Quadrant summary */}
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                            {([
                                                { q: "Star",      desc: "High vol · High $", cls: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800" },
                                                { q: "Plowhorse",  desc: "High vol · Low $",  cls: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800" },
                                                { q: "Puzzle",     desc: "Low vol · High $",  cls: "bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800" },
                                                { q: "Dog",        desc: "Low vol · Low $",   cls: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:border-slate-700" },
                                            ] as const).map(({ q, desc, cls }) => (
                                                <div key={q} className={`rounded-xl border p-2.5 ${cls}`}>
                                                    <p className="text-lg font-bold tabular-nums leading-none">{rangeData.bcg?.summary[q] ?? 0}</p>
                                                    <p className="text-[11px] font-semibold mt-0.5">{q}</p>
                                                    <p className="text-[9px] opacity-80">{desc}</p>
                                                </div>
                                            ))}
                                        </div>
                                        {/* Item table */}
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-xs min-w-[460px]">
                                                <thead><tr className="text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border">
                                                    <th className="text-left py-2 pl-2">Item</th><th className="text-left py-2 px-2">Class</th>
                                                    <th className="text-right py-2 px-2">Qty</th><th className="text-right py-2 px-2">Net/Unit</th><th className="text-right py-2 pr-2">Net Sales</th>
                                                </tr></thead>
                                                <tbody className="divide-y divide-border/40">
                                                    {(rangeData.bcg?.items ?? []).map((it, i) => {
                                                        const qc: Record<string, string> = {
                                                            Star: "text-amber-600 dark:text-amber-400", Plowhorse: "text-blue-600 dark:text-blue-400",
                                                            Puzzle: "text-violet-600 dark:text-violet-400", Dog: "text-slate-500",
                                                        };
                                                        return (
                                                            <tr key={i} className="hover:bg-muted/20">
                                                                <td className="py-1.5 pl-2"><span className="font-medium">{it.itemName}</span><span className="block text-[10px] text-muted-foreground">{it.category}</span></td>
                                                                <td className={`py-1.5 px-2 font-semibold ${qc[it.quadrant]}`}>{it.quadrant}</td>
                                                                <td className="py-1.5 px-2 text-right tabular-nums font-semibold">{it.qtySold.toLocaleString()}</td>
                                                                <td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground">${it.unitPrice.toFixed(2)}</td>
                                                                <td className="py-1.5 pr-2 text-right tabular-nums text-emerald-600 dark:text-emerald-400">${it.netSales.toLocaleString("en-CA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</td>
                                                            </tr>
                                                        );
                                                    })}
                                                    {(rangeData.bcg?.items.length ?? 0) === 0 && <tr><td colSpan={5} className="py-8 text-center text-muted-foreground italic">No items in this range</td></tr>}
                                                </tbody>
                                            </table>
                                        </div>
                                    </CardContent>
                                </Card>
                            )}

                            {/* ════ KITCHEN PREP (modifier mise-en-place) ════ */}
                            {rangeTab === "prep" && (
                                <Card>
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-sm flex items-center gap-2"><ClipboardList className="w-4 h-4 text-orange-500" /> Kitchen Prep — Mise en Place ({rangeData.dayCount}-day)</CardTitle>
                                        <p className="text-[10px] text-muted-foreground mt-0.5">Total modifier volume across the range, grouped by modifier group</p>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        {(() => {
                                            const groups = [...new Set((rangeData.modifierPrep ?? []).map(m => m.group))];
                                            if (groups.length === 0) return <p className="text-sm text-muted-foreground italic text-center py-6">No modifiers in this range</p>;
                                            return groups.map(g => (
                                                <div key={g}>
                                                    <p className="text-xs font-semibold text-foreground mb-1.5">{g}</p>
                                                    <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-1 text-xs">
                                                        {(rangeData.modifierPrep ?? []).filter(m => m.group === g).map((m, i) => (
                                                            <div key={i} className="contents">
                                                                <div className="truncate">{m.modifier}</div>
                                                                <div className="text-right tabular-nums font-semibold text-orange-600 dark:text-orange-400">{m.qty.toLocaleString()}</div>
                                                                <div className="text-right tabular-nums text-muted-foreground">{m.avgQtyPerDay}/day</div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ));
                                        })()}
                                    </CardContent>
                                </Card>
                            )}

                            {/* ════ QUALITY & LOSS ════ */}
                            {rangeTab === "qc" && (
                                <Card>
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-sm flex items-center gap-2"><PieIcon className="w-4 h-4 text-yellow-600" /> Quality &amp; Loss ({rangeData.dayCount}-day)</CardTitle>
                                        <p className="text-[10px] text-muted-foreground mt-0.5">
                                            Total refunds: <strong className="text-rose-500">${Number(rangeData.lossTotals?.refundAmount ?? 0).toLocaleString("en-CA", { minimumFractionDigits: 2 })}</strong> across {rangeData.lossTotals?.refundQty ?? 0} item(s)
                                        </p>
                                    </CardHeader>
                                    <CardContent className="px-2 sm:px-6">
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-xs min-w-[420px]">
                                                <thead><tr className="text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border">
                                                    <th className="text-left py-2 pl-2">Item</th><th className="text-right py-2 px-2">Sold</th>
                                                    <th className="text-right py-2 px-2">Refund Qty</th><th className="text-right py-2 px-2">Refund $</th><th className="text-right py-2 pr-2">Discount $</th>
                                                </tr></thead>
                                                <tbody className="divide-y divide-border/40">
                                                    {(rangeData.lossItems ?? []).map((l, i) => (
                                                        <tr key={i} className="hover:bg-muted/20">
                                                            <td className="py-1.5 pl-2"><span className="font-medium">{l.itemName}</span><span className="block text-[10px] text-muted-foreground">{l.category}</span></td>
                                                            <td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground">{l.qtySold}</td>
                                                            <td className="py-1.5 px-2 text-right tabular-nums">{l.refundQty}</td>
                                                            <td className="py-1.5 px-2 text-right tabular-nums text-rose-500">${l.refundAmount.toLocaleString("en-CA", { minimumFractionDigits: 2 })}</td>
                                                            <td className="py-1.5 pr-2 text-right tabular-nums text-amber-600">${l.discountAmount.toLocaleString("en-CA", { minimumFractionDigits: 2 })}</td>
                                                        </tr>
                                                    ))}
                                                    {(rangeData.lossItems?.length ?? 0) === 0 && <tr><td colSpan={5} className="py-8 text-center text-muted-foreground italic">No refunds or discounts in this range 🎉</td></tr>}
                                                </tbody>
                                            </table>
                                        </div>
                                    </CardContent>
                                </Card>
                            )}

                            {/* ════ BOM LINKAGE (recipe-level ingredient consumption) ════ */}
                            {rangeTab === "bom" && (
                                <Card>
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-sm flex items-center gap-2"><Link2 className="w-4 h-4 text-emerald-600" /> BOM Linkage — Ingredient Consumption ({rangeData.dayCount}-day)</CardTitle>
                                        <p className="text-[10px] text-muted-foreground mt-0.5">
                                            {(rangeData.bom?.linkedRecipes ?? 0) > 0
                                                ? `Estimated ingredient usage from ${rangeData.bom?.linkedRecipes} linked recipe(s) across the range`
                                                : "No PMIX items are linked to recipes yet — showing dish → protein mapping instead"}
                                        </p>
                                    </CardHeader>
                                    <CardContent className="px-2 sm:px-6">
                                        {(rangeData.bom?.consumption.length ?? 0) > 0 ? (
                                            <div className="overflow-x-auto max-h-[30rem] overflow-y-auto">
                                                <table className="w-full text-xs min-w-[420px]">
                                                    <thead><tr className="text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border sticky top-0 bg-card">
                                                        <th className="text-left py-2 pl-2">Ingredient</th><th className="text-right py-2 px-2">Total Used</th><th className="text-right py-2 pr-2">Avg/Day</th>
                                                    </tr></thead>
                                                    <tbody className="divide-y divide-border/40">
                                                        {(rangeData.bom?.consumption ?? []).map((c, i) => (
                                                            <tr key={i} className="hover:bg-muted/20">
                                                                <td className="py-1.5 pl-2 font-medium">{c.ingredientName}</td>
                                                                <td className="py-1.5 px-2 text-right tabular-nums font-semibold">{c.totalQty.toLocaleString()} <span className="text-muted-foreground text-[10px]">{c.unit}</span></td>
                                                                <td className="py-1.5 pr-2 text-right tabular-nums text-muted-foreground">{c.avgPerDay}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        ) : (
                                            <div className="overflow-x-auto max-h-[30rem] overflow-y-auto">
                                                <table className="w-full text-xs min-w-[420px]">
                                                    <thead><tr className="text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border sticky top-0 bg-card">
                                                        <th className="text-left py-2 pl-2">Dish</th><th className="text-right py-2 px-2">Protein</th><th className="text-right py-2 pr-2">Qty</th>
                                                    </tr></thead>
                                                    <tbody className="divide-y divide-border/40">
                                                        {(rangeData.ingredientSummary?.mainProtein.byDish ?? []).map((d, i) => (
                                                            <tr key={i} className="hover:bg-muted/20">
                                                                <td className="py-1.5 pl-2"><span className="text-muted-foreground text-[10px] mr-1">{d.category}</span>{d.dish}</td>
                                                                <td className="py-1.5 px-2 text-right text-muted-foreground">{d.proteinType}</td>
                                                                <td className="py-1.5 pr-2 text-right tabular-nums font-semibold">{d.qty}</td>
                                                            </tr>
                                                        ))}
                                                        {(rangeData.ingredientSummary?.mainProtein.byDish.length ?? 0) === 0 && <tr><td colSpan={3} className="py-8 text-center text-muted-foreground italic">No linked dishes in this range</td></tr>}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            )}

                            {/* ════ PORTION CALC (protein portions) ════ */}
                            {rangeTab === "portion" && (
                                <Card>
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-sm flex items-center gap-2"><Package className="w-4 h-4 text-violet-600" /> Portion Calc ({rangeData.dayCount}-day)</CardTitle>
                                        <p className="text-[10px] text-muted-foreground mt-0.5">Orders × portion standard = total we use (incl. matching Extra add-ons)</p>
                                    </CardHeader>
                                    <CardContent className="px-2 sm:px-6">
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-xs min-w-[420px]">
                                                <thead><tr className="text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border">
                                                    <th className="text-left py-2 pl-2">Protein</th><th className="text-right py-2 px-2">Orders</th>
                                                    <th className="text-right py-2 px-2">Portion</th><th className="text-right py-2 pr-2">Total We Use</th>
                                                </tr></thead>
                                                <tbody className="divide-y divide-border/40">
                                                    {(rangeData.ingredientSummary?.mainProtein.byType ?? []).map((p, i) => {
                                                        const used = p.totalUsed !== null ? p.totalUsed + (p.extraUsed ?? 0) : null;
                                                        return (
                                                            <tr key={i} className="hover:bg-muted/20">
                                                                <td className="py-1.5 pl-2 font-medium">{p.proteinType}</td>
                                                                <td className="py-1.5 px-2 text-right tabular-nums">{p.qty.toLocaleString()}</td>
                                                                <td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground">{p.portionSize !== null ? `${p.portionSize} ${p.portionUnit}` : "—"}</td>
                                                                <td className="py-1.5 pr-2 text-right tabular-nums font-semibold">{used !== null ? <>{used.toLocaleString()} <span className="text-muted-foreground text-[10px]">{p.portionUnit}</span></> : <span className="text-muted-foreground italic">No std</span>}</td>
                                                            </tr>
                                                        );
                                                    })}
                                                    {(rangeData.ingredientSummary?.mainProtein.byType.length ?? 0) === 0 && <tr><td colSpan={4} className="py-8 text-center text-muted-foreground italic">No protein data in this range</td></tr>}
                                                </tbody>
                                            </table>
                                        </div>
                                    </CardContent>
                                </Card>
                            )}

                            {/* Daily trend chart (Summary tab) */}
                            {rangeTab === "summary" && rangeData.dailyTrend.length > 1 && (
                                <Card>
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-sm flex items-center gap-2">
                                            <TrendingUp className="w-4 h-4 text-emerald-500" />
                                            Daily Sales Trend
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <ResponsiveContainer width="100%" height={180}>
                                            <AreaChart data={rangeData.dailyTrend}>
                                                <defs>
                                                    <linearGradient id="rangeGrad" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={d => d.slice(5)} />
                                                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${v}`} width={55} />
                                                <Tooltip
                                                    formatter={(v: number | undefined) => [`$${(v ?? 0).toLocaleString("en-CA", { minimumFractionDigits: 2 })}`, "Net Sales"]}
                                                    labelFormatter={(l) => String(l ?? "")}
                                                    contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                                                <Area dataKey="netSales" stroke="#10b981" fill="url(#rangeGrad)" strokeWidth={2} dot={{ r: 3, fill: "#10b981" }} />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    </CardContent>
                                </Card>
                            )}

                            {/* ── Daily Summary table (Summary tab) ──────────────── */}
                            {rangeTab === "summary" && (
                                <Card>
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-sm flex items-center gap-2"><LayoutList className="w-4 h-4 text-blue-600" /> Daily Summary</CardTitle>
                                    </CardHeader>
                                    <CardContent className="px-2 sm:px-6">
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-xs min-w-[320px]">
                                                <thead><tr className="text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border">
                                                    <th className="text-left py-2 pl-2">Date</th><th className="text-right py-2 px-2">Items Sold</th><th className="text-right py-2 pr-2">Net Sales</th>
                                                </tr></thead>
                                                <tbody className="divide-y divide-border/40">
                                                    {rangeData.dailyTrend.map((d, i) => (
                                                        <tr key={i} className="hover:bg-muted/20">
                                                            <td className="py-1.5 pl-2 font-medium">{d.date}</td>
                                                            <td className="py-1.5 px-2 text-right tabular-nums">{d.qtySold.toLocaleString()}</td>
                                                            <td className="py-1.5 pr-2 text-right tabular-nums text-emerald-600 dark:text-emerald-400">${Number(d.netSales).toLocaleString("en-CA", { minimumFractionDigits: 2 })}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                                <tfoot><tr className="border-t-2 border-border font-bold">
                                                    <td className="py-2 pl-2">TOTAL</td>
                                                    <td className="py-2 px-2 text-right tabular-nums">{(rangeData.totals?.qty ?? 0).toLocaleString()}</td>
                                                    <td className="py-2 pr-2 text-right tabular-nums text-emerald-600 dark:text-emerald-400">${Number(rangeData.totals?.netSales ?? 0).toLocaleString("en-CA", { minimumFractionDigits: 2 })}</td>
                                                </tr></tfoot>
                                            </table>
                                        </div>
                                    </CardContent>
                                </Card>
                            )}

                            {/* ── Aggregated ingredient consumption (BOM, all stations) — Summary tab ── */}
                            {rangeTab === "summary" && (
                                <Card>
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-sm flex items-center gap-2">
                                            <Link2 className="w-4 h-4 text-emerald-600" />
                                            Ingredient Consumption ({rangeData.dayCount}-day)
                                        </CardTitle>
                                        <p className="text-[10px] text-muted-foreground mt-0.5">
                                            Aggregated ingredient consumption from BOM linkage — all stations
                                            {(rangeData.bom?.linkedRecipes ?? 0) > 0 ? ` · ${rangeData.bom?.linkedRecipes} linked recipe(s)` : ""}
                                        </p>
                                    </CardHeader>
                                    <CardContent className="px-2 sm:px-6">
                                        {(rangeData.bom?.consumption.length ?? 0) > 0 ? (
                                            <div className="overflow-x-auto max-h-[26rem] overflow-y-auto">
                                                <table className="w-full text-xs min-w-[360px]">
                                                    <thead><tr className="text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border sticky top-0 bg-card">
                                                        <th className="text-left py-2 pl-2">Ingredient</th><th className="text-right py-2 px-2">Total Used</th><th className="text-right py-2 pr-2">Avg/Day</th>
                                                    </tr></thead>
                                                    <tbody className="divide-y divide-border/40">
                                                        {(rangeData.bom?.consumption ?? []).map((c, i) => (
                                                            <tr key={i} className="hover:bg-muted/20">
                                                                <td className="py-1.5 pl-2 font-medium">{c.ingredientName}</td>
                                                                <td className="py-1.5 px-2 text-right tabular-nums font-semibold">{c.totalQty.toLocaleString()} <span className="text-muted-foreground text-[10px]">{c.unit}</span></td>
                                                                <td className="py-1.5 pr-2 text-right tabular-nums text-muted-foreground">{c.avgPerDay}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col items-center justify-center py-8 gap-2 text-center text-muted-foreground">
                                                <Link2 className="w-6 h-6 opacity-40" />
                                                <p className="text-sm">No BOM-linked items in this range.</p>
                                                <p className="text-[11px] max-w-xs">Link BOH recipes to PMIX items so their ingredient usage rolls up here.</p>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            )}

                            {/* ── Category breakdown (Summary tab) ──────────────────── */}
                            {rangeTab === "summary" && (
                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-sm flex items-center gap-2">
                                        <Layers className="w-4 h-4 text-indigo-500" />
                                        Sales by Category
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-1.5 max-h-72 overflow-y-auto">
                                    {rangeData.categoryBreakdown.map((cat, i) => {
                                        const maxSales = Number(rangeData.categoryBreakdown[0]?.netSales ?? 1);
                                        return (
                                            <div key={i} className="space-y-0.5">
                                                <div className="flex items-center justify-between text-xs gap-2">
                                                    <span className="truncate">{cat.category}</span>
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        <span className="text-muted-foreground">{cat.qtySold} sold</span>
                                                        <span className="font-bold">${Number(cat.netSales).toLocaleString("en-CA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                                                    </div>
                                                </div>
                                                <ProgressBar value={Number(cat.netSales)} max={maxSales} color="#6366f1" />
                                            </div>
                                        );
                                    })}
                                </CardContent>
                            </Card>
                            )}

                            {/* ════ INGREDIENT SUMMARY tab ════ */}
                            {rangeTab === "ingsum" && rangeData.ingredientSummary?.hasProteinData && (
                                <>
                                    {/* Main Protein totals */}
                                    {rangeData.ingredientSummary.mainProtein.byType.length > 0 && (
                                        <Card>
                                            <CardHeader className="pb-2">
                                                <CardTitle className="text-sm flex items-center gap-2">
                                                    <Beef className="w-4 h-4 text-teal-500" />
                                                    Main Protein Usage ({rangeData.dayCount}-day total)
                                                </CardTitle>
                                                <p className="text-[10px] text-muted-foreground mt-0.5">
                                                    Click any protein to view daily calendar · <span className="text-orange-500">Total We Use</span> includes matching Extra add-ons
                                                </p>
                                            </CardHeader>
                                            <CardContent className="px-3 sm:px-6">
                                                {/* Horizontal scroll on narrow screens */}
                                                <div className="overflow-x-auto -mx-3 sm:mx-0">
                                                <div className="grid grid-cols-[minmax(90px,1fr)_auto_auto_auto_auto] gap-x-3 sm:gap-x-5 gap-y-0.5 text-xs min-w-[360px] px-3 sm:px-0">
                                                    <div className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px] py-1">Protein</div>
                                                    <div className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px] text-right py-1">Orders</div>
                                                    <div className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px] text-right py-1">Avg/Day</div>
                                                    <div className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px] text-right py-1">Total We Use</div>
                                                    <div className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px] text-right py-1">%</div>
                                                    {rangeData.ingredientSummary.mainProtein.byType.map((p, i) => {
                                                        const pct = rangeData.ingredientSummary!.mainProtein.total > 0
                                                            ? (p.qty / rangeData.ingredientSummary!.mainProtein.total) * 100
                                                            : 0;
                                                        const extraUsed = p.extraUsed ?? 0;
                                                        const combinedUsed = p.totalUsed !== null ? p.totalUsed + extraUsed : null;
                                                        return (
                                                            <div key={i} className="contents">
                                                                {/* Protein name — tap/click → calendar popup
                                                                    📅 icon always visible on mobile (no hover on touch),
                                                                    hidden on desktop until hover */}
                                                                <button
                                                                    onClick={() => {
                                                                        setProteinCalTarget({ protein: p.proteinType, portionUnit: p.portionUnit });
                                                                        setProteinCalOpen(true);
                                                                    }}
                                                                    className="py-2 text-left flex items-center gap-1 rounded-lg active:bg-teal-50 dark:active:bg-teal-950/30 hover:bg-teal-50 dark:hover:bg-teal-950/30 transition-colors touch-manipulation"
                                                                >
                                                                    {/* Always visible on mobile; opacity-0 on desktop until hover */}
                                                                    <span className="text-teal-500 text-[10px] shrink-0 sm:opacity-0 sm:group-hover:opacity-100">📅</span>
                                                                    <span className="font-medium text-foreground truncate">{p.proteinType}</span>
                                                                </button>
                                                                <div className="font-bold text-teal-600 text-right py-2 tabular-nums self-center">{p.qty.toLocaleString()}</div>
                                                                <div className="text-muted-foreground text-right py-2 tabular-nums self-center">{p.avgQtyPerDay}</div>
                                                                <div className="text-right py-2 tabular-nums self-center">
                                                                    {combinedUsed !== null
                                                                        ? <span className="font-semibold" title={extraUsed > 0 ? `Main ${p.totalUsed!.toLocaleString()} + Extra ${extraUsed.toLocaleString()} ${p.portionUnit}` : undefined}>
                                                                            {combinedUsed.toLocaleString()} <span className="text-muted-foreground text-[10px]">{p.portionUnit}</span>
                                                                            {extraUsed > 0 && <span className="text-orange-500 text-[9px] ml-0.5">+ex</span>}
                                                                          </span>
                                                                        : <span className="text-muted-foreground italic text-[10px]">No std</span>}
                                                                </div>
                                                                <div className="text-muted-foreground text-right py-2 tabular-nums text-[11px] self-center">{pct.toFixed(1)}%</div>
                                                            </div>
                                                        );
                                                    })}
                                                    <div className="border-t border-border pt-2 mt-1 font-bold text-xs">TOTAL</div>
                                                    <div className="border-t border-border pt-2 mt-1 font-bold text-teal-600 text-right tabular-nums">{rangeData.ingredientSummary.mainProtein.total.toLocaleString()}</div>
                                                    <div className="border-t border-border pt-2 mt-1" />
                                                    <div className="border-t border-border pt-2 mt-1" />
                                                    <div className="border-t border-border pt-2 mt-1 text-right text-muted-foreground text-[11px]">100%</div>
                                                </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    )}

                                    {/* ── 7-Day Usage Heatmap ────────────────────────────── */}
                                    {rangeData.topItems.length > 0 && (
                                        <Card>
                                            <CardHeader className="pb-2">
                                                <CardTitle className="text-sm flex items-center gap-2">
                                                    <Star className="w-4 h-4 text-amber-500" />
                                                    7-Day Usage Trend — Top {rangeData.topItems.length} Important Items
                                                </CardTitle>
                                                <p className="text-[10px] text-muted-foreground mt-0.5">
                                                    Qty sold by day of week · aggregated across the selected date range · darker cell = higher volume
                                                </p>
                                            </CardHeader>
                                            <CardContent className="px-3 sm:px-5 pb-4">
                                                <ItemUsageHeatmap
                                                    items={rangeData.topItems}
                                                    dayCount={rangeData.dayCount}
                                                />
                                            </CardContent>
                                        </Card>
                                    )}

                                    {/* Extra Add-on totals */}
                                    {rangeData.ingredientSummary.extraProtein.byType.length > 0 && (
                                        <Card>
                                            <CardHeader className="pb-2">
                                                <CardTitle className="text-sm flex items-center gap-2">
                                                    <Plus className="w-4 h-4 text-orange-500" />
                                                    Extra Add-ons ({rangeData.dayCount}-day total)
                                                </CardTitle>
                                            </CardHeader>
                                            <CardContent>
                                                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 sm:gap-x-4 gap-y-1.5 text-xs">
                                                    <div className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px]">Add-on</div>
                                                    <div className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px] text-right">Orders</div>
                                                    <div className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px] text-right">Avg/Day</div>
                                                    <div className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px] text-right">Total We Use</div>
                                                    {rangeData.ingredientSummary.extraProtein.byType.map((p, i) => (
                                                        <div key={i} className="contents">
                                                            <div className="py-1 truncate">{p.proteinType}</div>
                                                            <div className="font-bold text-orange-600 text-right py-1 tabular-nums">{p.qty.toLocaleString()}</div>
                                                            <div className="text-muted-foreground text-right py-1 tabular-nums">{p.avgQtyPerDay}</div>
                                                            <div className="text-right py-1 tabular-nums">
                                                                {p.totalUsed !== null
                                                                    ? <span className="font-semibold">{p.totalUsed.toLocaleString()} <span className="text-muted-foreground text-[10px]">{p.portionUnit}</span></span>
                                                                    : <span className="text-muted-foreground italic">No std</span>}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </CardContent>
                                        </Card>
                                    )}

                                    {/* Desserts — range view */}
                                    {(rangeData.ingredientSummary.desserts?.byItem.length ?? 0) > 0 && (
                                        <Card>
                                            <CardHeader className="pb-2">
                                                <CardTitle className="text-sm flex items-center gap-2">
                                                    <span className="text-base leading-none">🍮</span>
                                                    Main Desserts ({rangeData.dayCount}-day total)
                                                </CardTitle>
                                                <p className="text-[10px] text-muted-foreground mt-0.5">
                                                    Click any dessert to view daily calendar
                                                </p>
                                            </CardHeader>
                                            <CardContent className="px-3 sm:px-6">
                                                <div className="overflow-x-auto -mx-3 sm:mx-0">
                                                <div className="grid grid-cols-[minmax(90px,1fr)_auto_auto] gap-x-3 sm:gap-x-5 gap-y-0.5 text-xs min-w-[280px] px-3 sm:px-0">
                                                    <div className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px] py-1">Item</div>
                                                    <div className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px] text-right py-1">Orders</div>
                                                    <div className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px] text-right py-1">Avg/Day</div>
                                                    {(rangeData.ingredientSummary.desserts?.byItem ?? []).map((d, i) => (
                                                        <div key={i} className="contents">
                                                            <button
                                                                onClick={() => { setDessertCalItem(d.itemName); setDessertCalOpen(true); }}
                                                                className="py-2 text-left flex items-center gap-1.5 rounded-lg active:bg-pink-50 dark:active:bg-pink-950/30 hover:bg-pink-50 dark:hover:bg-pink-950/30 transition-colors touch-manipulation"
                                                            >
                                                                <span className="text-pink-500 text-[10px] shrink-0 sm:opacity-0 sm:group-hover:opacity-100">📅</span>
                                                                <span className="w-1.5 h-1.5 rounded-full bg-pink-500 shrink-0" />
                                                                <span className="font-medium text-foreground truncate">{d.itemName}</span>
                                                            </button>
                                                            <div className="font-bold text-pink-600 dark:text-pink-300 text-right py-2 tabular-nums self-center">{d.qty.toLocaleString()}</div>
                                                            <div className="text-muted-foreground text-right py-2 tabular-nums self-center">{d.avgQtyPerDay ?? (rangeData.dayCount > 0 ? (d.qty / rangeData.dayCount).toFixed(1) : "—")}</div>
                                                        </div>
                                                    ))}
                                                    <div className="border-t border-border pt-2 mt-1 font-bold text-xs">TOTAL</div>
                                                    <div className="border-t border-border pt-2 mt-1 font-bold text-pink-600 dark:text-pink-300 text-right tabular-nums">
                                                        {(rangeData.ingredientSummary.desserts?.total ?? 0).toLocaleString()}
                                                    </div>
                                                    <div className="border-t border-border pt-2 mt-1 text-right text-muted-foreground tabular-nums">
                                                        {rangeData.dayCount > 0 ? ((rangeData.ingredientSummary.desserts?.total ?? 0) / rangeData.dayCount).toFixed(1) : "—"}
                                                    </div>
                                                </div>
                                                </div>{/* /overflow-x-auto */}
                                            </CardContent>
                                        </Card>
                                    )}

                                    {/* Beverages — range view */}
                                    {(rangeData.ingredientSummary.beverages?.byGroup.length ?? 0) > 0 && (
                                        <Card>
                                            <CardHeader className="pb-2">
                                                <CardTitle className="text-sm flex items-center gap-2">
                                                    <span className="text-base leading-none">🍹</span>
                                                    Beverages ({rangeData.dayCount}-day total)
                                                </CardTitle>
                                                <p className="text-[10px] text-muted-foreground mt-0.5">
                                                    Click any group to view daily calendar
                                                </p>
                                            </CardHeader>
                                            <CardContent className="px-3 sm:px-6">
                                                <div className="grid grid-cols-[minmax(90px,1fr)_auto_auto] gap-x-3 sm:gap-x-5 gap-y-0.5 text-xs">
                                                    <div className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px] py-1">Group</div>
                                                    <div className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px] text-right py-1">Orders</div>
                                                    <div className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px] text-right py-1">Avg/Day</div>
                                                    {(rangeData.ingredientSummary.beverages?.byGroup ?? []).map((b, i) => (
                                                        <div key={i} className="contents">
                                                            <button
                                                                onClick={() => { setBeverageCalGroup(b.group); setBeverageCalOpen(true); }}
                                                                className="py-2 text-left flex items-center gap-1.5 rounded-lg active:bg-purple-50 dark:active:bg-purple-950/30 hover:bg-purple-50 dark:hover:bg-purple-950/30 transition-colors touch-manipulation"
                                                            >
                                                                <span className="text-purple-500 text-[10px] shrink-0 sm:opacity-0">📅</span>
                                                                <span className="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0" />
                                                                <span className="font-medium text-foreground truncate">{b.group}</span>
                                                            </button>
                                                            <div className="font-bold text-purple-600 dark:text-purple-300 text-right py-2 tabular-nums self-center">{b.qty.toLocaleString()}</div>
                                                            <div className="text-muted-foreground text-right py-2 tabular-nums self-center">{b.avgQtyPerDay ?? (rangeData.dayCount > 0 ? (b.qty / rangeData.dayCount).toFixed(1) : "—")}</div>
                                                        </div>
                                                    ))}
                                                    <div className="border-t border-border pt-2 mt-1 font-bold text-xs">TOTAL</div>
                                                    <div className="border-t border-border pt-2 mt-1 font-bold text-purple-600 dark:text-purple-300 text-right tabular-nums">
                                                        {(rangeData.ingredientSummary.beverages?.total ?? 0).toLocaleString()}
                                                    </div>
                                                    <div className="border-t border-border pt-2 mt-1 text-right text-muted-foreground tabular-nums">
                                                        {rangeData.dayCount > 0 ? ((rangeData.ingredientSummary.beverages?.total ?? 0) / rangeData.dayCount).toFixed(1) : "—"}
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    )}

                                    {/* Curries — range view */}
                                    {(rangeData.ingredientSummary.curries?.byGroup.length ?? 0) > 0 && (
                                        <Card>
                                            <CardHeader className="pb-2">
                                                <CardTitle className="text-sm flex items-center gap-2">
                                                    <span className="text-base leading-none">🍛</span>
                                                    Main Curry ({rangeData.dayCount}-day total)
                                                </CardTitle>
                                                <p className="text-[10px] text-muted-foreground mt-0.5">
                                                    Click any group to view daily calendar
                                                </p>
                                            </CardHeader>
                                            <CardContent className="px-3 sm:px-6">
                                                <div className="grid grid-cols-[minmax(90px,1fr)_auto_auto] gap-x-3 sm:gap-x-5 gap-y-0.5 text-xs">
                                                    <div className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px] py-1">Group</div>
                                                    <div className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px] text-right py-1">Orders</div>
                                                    <div className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px] text-right py-1">Avg/Day</div>
                                                    {(rangeData.ingredientSummary.curries?.byGroup ?? []).map((c, i) => (
                                                        <div key={i} className="contents">
                                                            <button
                                                                onClick={() => { setCurryCalGroup(c.group); setCurryCalOpen(true); }}
                                                                className="py-2 text-left flex items-center gap-1.5 rounded-lg active:bg-amber-50 dark:active:bg-amber-950/30 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors touch-manipulation"
                                                            >
                                                                <span className="text-amber-500 text-[10px] shrink-0 sm:opacity-0">📅</span>
                                                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                                                                <span className="font-medium text-foreground truncate">{c.group}</span>
                                                            </button>
                                                            <div className="font-bold text-amber-600 dark:text-amber-300 text-right py-2 tabular-nums self-center">{c.qty.toLocaleString()}</div>
                                                            <div className="text-muted-foreground text-right py-2 tabular-nums self-center">{c.avgQtyPerDay ?? (rangeData.dayCount > 0 ? (c.qty / rangeData.dayCount).toFixed(1) : "—")}</div>
                                                        </div>
                                                    ))}
                                                    <div className="border-t border-border pt-2 mt-1 font-bold text-xs">TOTAL</div>
                                                    <div className="border-t border-border pt-2 mt-1 font-bold text-amber-600 dark:text-amber-300 text-right tabular-nums">
                                                        {(rangeData.ingredientSummary.curries?.total ?? 0).toLocaleString()}
                                                    </div>
                                                    <div className="border-t border-border pt-2 mt-1 text-right text-muted-foreground tabular-nums">
                                                        {rangeData.dayCount > 0 ? ((rangeData.ingredientSummary.curries?.total ?? 0) / rangeData.dayCount).toFixed(1) : "—"}
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    )}

                                    {/* By-Dish breakdown */}
                                    {rangeData.ingredientSummary.mainProtein.byDish.length > 0 && (
                                        <Card>
                                            <CardHeader className="pb-2">
                                                <CardTitle className="text-sm flex items-center gap-2">
                                                    <UtensilsCrossed className="w-4 h-4 text-indigo-500" />
                                                    Main Protein by Dish (top 30)
                                                </CardTitle>
                                            </CardHeader>
                                            <CardContent>
                                                <div className="space-y-1 max-h-96 overflow-y-auto">
                                                    <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 text-[10px] font-semibold uppercase text-muted-foreground sticky top-0 bg-card py-1">
                                                        <div>Dish</div>
                                                        <div className="text-right">Protein</div>
                                                        <div className="text-right">Qty</div>
                                                    </div>
                                                    {rangeData.ingredientSummary.mainProtein.byDish.slice(0, 30).map((d, i) => (
                                                        <div key={i} className="grid grid-cols-[1fr_auto_auto] gap-x-3 text-xs py-1 border-b border-border/40">
                                                            <div className="truncate">
                                                                <span className="text-muted-foreground text-[10px] mr-1">{d.category}</span>
                                                                {d.dish}
                                                            </div>
                                                            <div className="text-right text-muted-foreground">{d.proteinType}</div>
                                                            <div className="text-right font-semibold tabular-nums">{d.qty}</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </CardContent>
                                        </Card>
                                    )}
                                </>
                            )}
                        </>
                    )}
                </div>
            )}

            {/* ── Protein Daily Calendar Modal ──────────────────────── */}
            {proteinCalTarget && (
                <ProteinCalendarModal
                    protein={proteinCalTarget.protein}
                    portionUnit={proteinCalTarget.portionUnit}
                    rangeFrom={rangeFrom}
                    rangeTo={rangeTo}
                    open={proteinCalOpen}
                    onClose={() => setProteinCalOpen(false)}
                    parSuggestion={findParMatch(proteinCalTarget.protein)}
                    onApplyPar={handleApplyParSingle}
                />
            )}

            {/* ── Dessert Daily Calendar Modal ──────────────────────── */}
            {dessertCalItem && (
                <DailyCalendarModal
                    itemName={dessertCalItem}
                    unitLabel="orders / day"
                    color="pink"
                    rangeFrom={rangeFrom}
                    rangeTo={rangeTo}
                    open={dessertCalOpen}
                    onClose={() => setDessertCalOpen(false)}
                    fetchFn={pmixApi.dessertDaily}
                    showLb={false}
                    parSuggestion={findParMatch(dessertCalItem)}
                    onApplyPar={handleApplyParSingle}
                />
            )}

            {/* ── Beverage Daily Calendar Modal ─────────────────────── */}
            {beverageCalGroup && (
                <BeverageCalendarModal
                    group={beverageCalGroup}
                    rangeFrom={rangeFrom}
                    rangeTo={rangeTo}
                    open={beverageCalOpen}
                    onClose={() => setBeverageCalOpen(false)}
                />
            )}

            {/* ── Curry Daily Calendar Modal ────────────────────────── */}
            {curryCalGroup && (
                <GroupCalendarModal
                    group={curryCalGroup}
                    rangeFrom={rangeFrom}
                    rangeTo={rangeTo}
                    open={curryCalOpen}
                    onClose={() => setCurryCalOpen(false)}
                    fetchFn={pmixApi.curryDaily}
                    color="amber"
                    exportPrefix="curry"
                />
            )}

            {/* ══════════════════════════════════════════════════════════
                SYNC TO DAILY SALES DIALOG
            ══════════════════════════════════════════════════════════ */}
            <Dialog open={syncOpen} onOpenChange={open => { if (!open) { setSyncOpen(false); setSyncResult(null); } }}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Zap className="w-4 h-4 text-emerald-600" />
                            Sync to Daily Sales
                        </DialogTitle>
                    </DialogHeader>

                    {syncResult ? (
                        /* ── Success state ── */
                        <div className="space-y-4 py-2">
                            <div className="flex flex-col items-center justify-center py-6 gap-3 text-center">
                                <div className="p-4 rounded-full bg-emerald-100 dark:bg-emerald-900/40">
                                    <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
                                </div>
                                <div>
                                    <p className="text-lg font-bold">Sync complete!</p>
                                    <p className="text-sm text-muted-foreground mt-1">
                                        <strong>{syncResult.synced}</strong> items synced to Daily Sales for{" "}
                                        <strong>{new Date(syncResult.date + "T00:00:00").toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric" })}</strong>
                                    </p>
                                    {syncResult.depleted != null && (
                                        <p className="text-sm text-muted-foreground mt-1.5 flex items-center justify-center gap-1.5">
                                            <Package className="w-3.5 h-3.5 text-blue-500" />
                                            {syncResult.depleted > 0
                                                ? <><strong>{syncResult.depleted}</strong> ingredient{syncResult.depleted !== 1 ? "s" : ""} deducted from inventory</>
                                                : <span className="text-amber-600 dark:text-amber-400">No inventory deducted — link recipes &amp; track ingredients first</span>}
                                        </p>
                                    )}
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setSyncOpen(false)}>
                                    Close
                                </Button>
                                <Button className="flex-1 rounded-xl gap-2" asChild>
                                    <a href={`/daily-sales?date=${syncResult.date}`}>
                                        View Daily Sales <ArrowRight className="w-3.5 h-3.5" />
                                    </a>
                                </Button>
                            </div>
                        </div>
                    ) : (
                        /* ── Form state ── */
                        <div className="space-y-5 py-2">
                            <p className="text-sm text-muted-foreground">
                                All <strong>{analytics?.totalItems ?? 0} menu items</strong> from this PMIX report will be written
                                into Daily Sales for the date you choose.
                            </p>

                            {/* Date picker */}
                            <div className="space-y-1.5">
                                <Label className="flex items-center gap-1.5 text-sm font-medium">
                                    <CalendarDays className="w-3.5 h-3.5" /> Sales Date
                                </Label>
                                <Input
                                    type="date"
                                    value={syncDate}
                                    onChange={e => setSyncDate(e.target.value)}
                                    className="rounded-xl h-10"
                                    max={new Date().toISOString().slice(0, 10)}
                                />
                                <p className="text-xs text-muted-foreground">
                                    Choose the date this PMIX data represents
                                </p>
                            </div>

                            {/* Replace toggle */}
                            <div className="flex items-center justify-between rounded-xl bg-muted/40 px-4 py-3 gap-3">
                                <div>
                                    <p className="text-sm font-medium flex items-center gap-1.5">
                                        <RotateCcw className="w-3.5 h-3.5 text-amber-500" /> Replace existing data
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        Remove previously synced PMIX entries for this date before re-syncing
                                    </p>
                                </div>
                                <Switch checked={syncReplace} onCheckedChange={setSyncReplace} />
                            </div>

                            {/* Auto-deplete inventory toggle */}
                            <div className="flex items-center justify-between rounded-xl bg-muted/40 px-4 py-3 gap-3">
                                <div>
                                    <p className="text-sm font-medium flex items-center gap-1.5">
                                        <Package className="w-3.5 h-3.5 text-blue-500" /> Deduct ingredients from inventory
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        Auto-create &quot;Out&quot; transactions from each dish&apos;s recipe BOM and lower on-hand stock
                                    </p>
                                </div>
                                <Switch checked={syncDeplete} onCheckedChange={setSyncDeplete} />
                            </div>

                            {/* Already synced warning */}
                            {syncedDates.includes(syncDate) && (
                                <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs">
                                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                    <span>
                                        This report was already synced to <strong>{syncDate}</strong>.{" "}
                                        {syncReplace ? "Existing PMIX entries will be replaced." : "New entries will be added on top."}
                                    </span>
                                </div>
                            )}

                            {error && (
                                <div className="flex items-center gap-2 p-3 rounded-xl bg-destructive/10 text-destructive text-xs border border-destructive/20">
                                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {error}
                                </div>
                            )}

                            <div className="flex gap-2 pt-1">
                                <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setSyncOpen(false)} disabled={syncing}>
                                    Cancel
                                </Button>
                                <Button
                                    onClick={handleSync}
                                    disabled={syncing || !syncDate}
                                    className="flex-1 rounded-xl gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
                                    {syncing
                                        ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Syncing…</>
                                        : <><Zap className="w-3.5 h-3.5" /> Sync Now</>
                                    }
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

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
