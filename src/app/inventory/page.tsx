"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
    inventoryApi, ingredientsApi, suppliersApi, storageAreasApi, ingredientSuppliersApi,
    pmixApi,
    InventoryItem, InventoryTransaction, InventoryAlert,
    Ingredient, Supplier, StorageArea, IngredientSupplier,
    type IngredientTrendResult, type ProteinHeatmapResult,
    type DessertHeatmapResult, type BeverageHeatmapResult, type CurryHeatmapResult,
    type ParSuggestion,
    type SetupAuditResult,
} from "@/lib/api";
import IngredientUsageHeatmap from "@/components/inventory/IngredientUsageHeatmap";
import { exportProteinHeatmapToPDF } from "@/lib/protein-pdf-export";
import { exportHeatmapToPDF } from "@/lib/heatmap-pdf-export";
import { useCurrency } from "@/components/currency-context";
import {
    hasPack, recipeUnitsPerPack, recipeUnitsPerPurchase, recipeToPacks, type StockUnitConfig,
} from "@/lib/stock-units";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
    Table, TableBody, TableCell, TableHead,
    TableHeader, TableRow,
} from "@/components/ui/table";
import {
    Dialog, DialogContent, DialogDescription,
    DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
    Select, SelectContent, SelectItem,
    SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
    AlertCircle, PackagePlus, Warehouse, History, Search,
    Trash2, Loader2, Plus, ClipboardList, AlertTriangle,
    CheckCircle2, TrendingDown, BarChart2, ChevronLeft, Thermometer,
    DollarSign, TrendingUp, RefreshCw, FileDown, SlidersHorizontal, Sparkles,
    ShieldCheck, ChevronDown, ChevronRight, MapPin, Clock, Link2,
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DataPagination, paginate } from "@/components/ui/data-pagination";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";

// ─── Helpers ──────────────────────────────────────────────────────────────────

type StockStatus = "critical" | "low" | "ok";

function stockStatus(item: InventoryItem): StockStatus {
    const cur = Number(item.currentStock);
    if (cur <= Number(item.parMin))       return "critical";
    if (cur <= Number(item.reorderPoint)) return "low";
    return "ok";
}

const STATUS_CONFIG: Record<StockStatus, { label: string; badge: string }> = {
    critical: { label: "Critical",  badge: "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800" },
    low:      { label: "Reorder",   badge: "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-400 dark:border-yellow-800" },
    ok:       { label: "OK",        badge: "bg-green-100 text-green-800 border-green-200 dark:bg-green-950/40 dark:text-green-400 dark:border-green-800" },
};

const TXN_CONFIG: Record<string, { label: string; badge: string; sign: string }> = {
    In:        { label: "Received",  badge: "bg-green-100 text-green-800 border-green-200",  sign: "+" },
    Out:       { label: "Used",      badge: "bg-blue-100 text-blue-800 border-blue-200",     sign: "−" },
    Waste:     { label: "Waste",     badge: "bg-red-100 text-red-800 border-red-200",        sign: "−" },
    Adjust:    { label: "Adjust",    badge: "bg-purple-100 text-purple-800 border-purple-200", sign: "±" },
    Stocktake: { label: "Stocktake", badge: "bg-slate-100 text-slate-800 border-slate-200",  sign: "=" },
};

const WASTE_REASONS = ["Spoiled", "Overcooked", "Staff Meal", "Dropped", "Over-prep", "Other"];

const PIE_COLORS = ["#b8860b", "#e07b39", "#4a9e6b", "#6366f1", "#f43f5e", "#94a3b8"];

function today() { return new Date().toISOString().split("T")[0]; }

/** Cost value of current stock for one inventory item.
 *  currentStock is in recipe units; purchasePrice / conversionRate = cost per recipe unit (THB). */
function itemStockValue(item: InventoryItem): number {
    const stock = Number(item.currentStock);
    const price = Number(item.ingredient.purchasePrice);
    const conv  = Number(item.ingredient.conversionRate);
    return conv > 0 ? stock * (price / conv) : 0;
}

// ─── Status Badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: StockStatus }) {
    const cfg = STATUS_CONFIG[status];
    return (
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${cfg.badge}`}>
            {status === "critical" && <AlertCircle className="h-3 w-3" />}
            {status === "low"      && <AlertTriangle className="h-3 w-3" />}
            {status === "ok"       && <CheckCircle2 className="h-3 w-3" />}
            {cfg.label}
        </span>
    );
}

// ─── Stock Progress Bar ────────────────────────────────────────────────────────

function StockBar({ item }: { item: InventoryItem }) {
    const cur = Number(item.currentStock);
    const max = Number(item.parMax);
    const pct = max > 0 ? Math.min(100, Math.round((cur / max) * 100)) : 0;
    const status = stockStatus(item);
    const color = status === "critical" ? "bg-red-500" : status === "low" ? "bg-yellow-500" : "bg-green-500";
    return (
        <div className="flex items-center gap-2 min-w-[120px]">
            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs text-muted-foreground tabular-nums w-8 text-right">{pct}%</span>
        </div>
    );
}

// ─── Setup Health Banner ──────────────────────────────────────────────────────

function SetupHealthBanner({ onFixed }: { onFixed: () => void }) {
    const [audit, setAudit] = useState<SetupAuditResult | null>(null);
    const [loading, setLoading] = useState(true);
    const [open, setOpen] = useState(false);
    const [expanded, setExpanded] = useState<string | null>(null);
    const [assignArea, setAssignArea] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        inventoryApi.setupAudit().then(setAudit).catch(() => setAudit(null)).finally(() => setLoading(false));
    }, []);

    if (loading || !audit) return null;

    const issues = audit.issues;
    const totalIssues = issues.noStorageArea.count + issues.notTracked.count + issues.noPar.count
        + issues.noSupplier.count + issues.suspectConversion.count + issues.neverCounted.count + issues.staleCount.count;
    if (totalIssues === 0) return (
        <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-lg px-4 py-2.5">
            <ShieldCheck className="w-4 h-4" /> Setup Health: All {audit.totalTracked} tracked ingredients are properly configured.
        </div>
    );

    const cards: { key: string; label: string; count: number; icon: React.ElementType; color: string }[] = [
        { key: "noStorageArea",     label: "No Location",       count: issues.noStorageArea.count,     icon: MapPin,          color: "text-red-600" },
        { key: "notTracked",        label: "Not Tracked",       count: issues.notTracked.count,        icon: Link2,           color: "text-amber-600" },
        { key: "noPar",             label: "No PAR",            count: issues.noPar.count,             icon: SlidersHorizontal, color: "text-orange-600" },
        { key: "neverCounted",      label: "Never Counted",     count: issues.neverCounted.count,      icon: ClipboardList,   color: "text-blue-600" },
        { key: "staleCount",        label: "Stale Count",       count: issues.staleCount.count,        icon: Clock,           color: "text-purple-600" },
        { key: "suspectConversion", label: "Check Conversion",  count: issues.suspectConversion.count, icon: AlertTriangle,   color: "text-yellow-600" },
        { key: "noSupplier",        label: "No Supplier",       count: issues.noSupplier.count,        icon: PackagePlus,     color: "text-slate-500" },
    ].filter(c => c.count > 0);

    async function bulkAssignArea() {
        const entries = Object.entries(assignArea).filter(([, v]) => v);
        if (entries.length === 0) return;
        setSaving(true);
        const byArea = new Map<string, string[]>();
        for (const [ingId, areaId] of entries) {
            byArea.set(areaId, [...(byArea.get(areaId) ?? []), ingId]);
        }
        for (const [areaId, ids] of byArea) {
            await ingredientsApi.bulkAssignArea(ids, areaId);
        }
        setSaving(false); setAssignArea({});
        inventoryApi.setupAudit().then(setAudit);
        onFixed();
    }

    async function quickTrack(ingredientId: string) {
        await inventoryApi.create({ ingredientId });
        inventoryApi.setupAudit().then(setAudit);
        onFixed();
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const issueItems = (key: string) => (issues as any)[key]?.items ?? [];

    return (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
            <button onClick={() => setOpen(!open)}
                className="w-full flex items-center justify-between px-4 py-3 text-left">
                <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-amber-600" />
                    <span className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                        Setup Health — {totalIssues} issue{totalIssues !== 1 ? "s" : ""} found
                    </span>
                </div>
                {open ? <ChevronDown className="w-4 h-4 text-amber-600" /> : <ChevronRight className="w-4 h-4 text-amber-600" />}
            </button>

            {open && (
                <div className="px-4 pb-4 space-y-3">
                    <div className="flex flex-wrap gap-2">
                        {cards.map(c => {
                            const Icon = c.icon;
                            const active = expanded === c.key;
                            return (
                                <button key={c.key} onClick={() => setExpanded(active ? null : c.key)}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all
                                        ${active ? "bg-card border-primary shadow-sm" : "bg-background border-border hover:border-foreground/30"}`}>
                                    <Icon className={`w-3.5 h-3.5 ${c.color}`} />
                                    {c.label} <span className="tabular-nums font-bold">{c.count}</span>
                                </button>
                            );
                        })}
                    </div>

                    {expanded && (
                        <div className="rounded-lg border bg-card p-3 max-h-[300px] overflow-y-auto space-y-1">
                            {expanded === "noStorageArea" && (
                                <>
                                    <div className="flex items-center justify-between mb-2">
                                        <p className="text-xs font-semibold text-muted-foreground">Tracked but no storage area assigned</p>
                                        {Object.values(assignArea).some(Boolean) && (
                                            <Button size="sm" className="h-7 text-xs" onClick={bulkAssignArea} disabled={saving}>
                                                {saving ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <MapPin className="w-3 h-3 mr-1" />}
                                                Assign Selected
                                            </Button>
                                        )}
                                    </div>
                                    {issueItems("noStorageArea").map((item: { id: string; name: string; category: string | null }) => (
                                        <div key={item.id} className="flex items-center justify-between gap-2 text-sm py-1 border-b border-border/40 last:border-0">
                                            <div className="min-w-0">
                                                <span className="font-medium">{item.name}</span>
                                                {item.category && <span className="text-xs text-muted-foreground ml-2">{item.category}</span>}
                                            </div>
                                            <select value={assignArea[item.id] ?? ""}
                                                onChange={e => setAssignArea(p => ({ ...p, [item.id]: e.target.value }))}
                                                className="text-xs border rounded px-2 py-1 bg-background w-[140px]">
                                                <option value="">— Area —</option>
                                                {audit.areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                            </select>
                                        </div>
                                    ))}
                                </>
                            )}

                            {expanded === "notTracked" && (
                                <>
                                    <p className="text-xs font-semibold text-muted-foreground mb-2">Ingredients not yet added to inventory tracking</p>
                                    {issueItems("notTracked").map((item: { id: string; name: string; category: string | null }) => (
                                        <div key={item.id} className="flex items-center justify-between gap-2 text-sm py-1 border-b border-border/40 last:border-0">
                                            <div className="min-w-0">
                                                <span className="font-medium">{item.name}</span>
                                                {item.category && <span className="text-xs text-muted-foreground ml-2">{item.category}</span>}
                                            </div>
                                            <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={() => quickTrack(item.id)}>
                                                <Plus className="w-3 h-3 mr-1" /> Track
                                            </Button>
                                        </div>
                                    ))}
                                </>
                            )}

                            {expanded === "noPar" && (
                                <>
                                    <p className="text-xs font-semibold text-muted-foreground mb-2">Tracked but PAR Min & Reorder Point both = 0</p>
                                    {issueItems("noPar").map((item: { id: string; name: string; area: string | null }) => (
                                        <div key={item.id} className="flex items-center justify-between gap-2 text-sm py-1 border-b border-border/40 last:border-0">
                                            <span className="font-medium">{item.name}</span>
                                            <span className="text-xs text-muted-foreground">{item.area ?? "No area"}</span>
                                        </div>
                                    ))}
                                    <p className="text-[11px] text-muted-foreground mt-2">
                                        Set PAR levels in the Stock Levels tab → click any item → edit PAR Min/ROP/Max, or use Auto-fill from PMIX.
                                    </p>
                                </>
                            )}

                            {(expanded === "neverCounted" || expanded === "staleCount") && (
                                <>
                                    <p className="text-xs font-semibold text-muted-foreground mb-2">
                                        {expanded === "neverCounted" ? "Never physically counted" : "Last count >14 days ago"}
                                    </p>
                                    {issueItems(expanded).map((item: { id: string; name: string; area: string | null; lastCountDate?: string }) => (
                                        <div key={item.id} className="flex items-center justify-between gap-2 text-sm py-1 border-b border-border/40 last:border-0">
                                            <span className="font-medium">{item.name}</span>
                                            <span className="text-xs text-muted-foreground">
                                                {item.lastCountDate ?? "Never"} · {item.area ?? "No area"}
                                            </span>
                                        </div>
                                    ))}
                                    <p className="text-[11px] text-muted-foreground mt-2">
                                        Go to <a href="/stock-count" className="underline text-primary">Stock Count</a> to run a physical count.
                                    </p>
                                </>
                            )}

                            {expanded === "suspectConversion" && (
                                <>
                                    <p className="text-xs font-semibold text-muted-foreground mb-2">Conversion rate = 1 but purchase ≠ recipe unit (may be wrong)</p>
                                    {issueItems("suspectConversion").map((item: { id: string; name: string; purchaseUnit: string; recipeUnit: string }) => (
                                        <div key={item.id} className="flex items-center justify-between gap-2 text-sm py-1 border-b border-border/40 last:border-0">
                                            <span className="font-medium">{item.name}</span>
                                            <span className="text-xs text-muted-foreground">
                                                1 {item.purchaseUnit} = 1 {item.recipeUnit} ❓
                                            </span>
                                        </div>
                                    ))}
                                    <p className="text-[11px] text-muted-foreground mt-2">
                                        Edit each ingredient in <a href="/ingredients" className="underline text-primary">Ingredients</a> to fix conversion rates.
                                    </p>
                                </>
                            )}

                            {expanded === "noSupplier" && (
                                <>
                                    <p className="text-xs font-semibold text-muted-foreground mb-2">No supplier assigned</p>
                                    {issueItems("noSupplier").map((item: { id: string; name: string }) => (
                                        <div key={item.id} className="text-sm py-1 border-b border-border/40 last:border-0 font-medium">{item.name}</div>
                                    ))}
                                </>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function InventoryPage() {
    const { format } = useCurrency();

    // Core data
    const [items,       setItems]       = useState<InventoryItem[]>([]);
    const [allIngr,     setAllIngr]     = useState<Ingredient[]>([]);
    const [suppliers,   setSuppliers]   = useState<Supplier[]>([]);
    const [alerts,      setAlerts]      = useState<InventoryAlert[]>([]);
    const [txns,        setTxns]        = useState<InventoryTransaction[]>([]);
    const [storageAreas, setStorageAreas] = useState<StorageArea[]>([]);
    const [loading,     setLoading]     = useState(true);
    const [saving,      setSaving]      = useState(false);

    // Search / filter
    const [search,      setSearch]      = useState("");
    const [activeTab,   setActiveTab]   = useState("stock");

    // 7-day ingredient usage trend (from inventory transactions)
    const [trendData,    setTrendData]    = useState<IngredientTrendResult | null>(null);
    const [trendLoading, setTrendLoading] = useState(false);
    const [trendDays,    setTrendDays]    = useState(7);

    // Main Protein heatmap (from PMIX sales)
    const [proteinHeatmap,        setProteinHeatmap]        = useState<ProteinHeatmapResult | null>(null);
    const [proteinHeatmapLoading, setProteinHeatmapLoading] = useState(false);

    // Dessert heatmap
    const [dessertHeatmap,        setDessertHeatmap]        = useState<DessertHeatmapResult | null>(null);
    const [dessertHeatmapLoading, setDessertHeatmapLoading] = useState(false);

    // Beverage heatmap (each menu item)
    const [beverageHeatmap,        setBeverageHeatmap]        = useState<BeverageHeatmapResult | null>(null);
    const [beverageHeatmapLoading, setBeverageHeatmapLoading] = useState(false);

    // Curry heatmap (by group)
    const [curryHeatmap,        setCurryHeatmap]        = useState<CurryHeatmapResult | null>(null);
    const [curryHeatmapLoading, setCurryHeatmapLoading] = useState(false);

    // Storage area drill-down (null = show area cards, id = show ingredients in area, "unassigned" = show unassigned)
    const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);

    // Receive goods — linked suppliers for selected ingredient
    const [rcvIngSuppliers, setRcvIngSuppliers]   = useState<IngredientSupplier[]>([]);
    const [rcvSupplierId,   setRcvSupplierId]     = useState<string>("");

    // Add to tracking dialog
    const [addOpen,     setAddOpen]     = useState(false);
    const [addForm,     setAddForm]     = useState({ ingredientId: "", parMin: "", parMax: "", reorderPoint: "", leadTimeDays: "1" });
    const [addSearch,   setAddSearch]   = useState("");

    // Edit PAR Min / ROP / Max dialog (values entered in the selected `unit`)
    const [parEdit,   setParEdit]   = useState<InventoryItem | null>(null);
    const [parForm,   setParForm]   = useState({ unit: "", parMin: "", reorderPoint: "", parMax: "", leadTimeDays: "1", packUnit: "", packSize: "" });
    const [parSaving, setParSaving] = useState(false);
    const [parError,  setParError]  = useState<string | null>(null);

    // Auto-fill PAR from PMIX usage
    const [parDays,     setParDays]     = useState(30);
    const [parSug,      setParSug]      = useState<ParSuggestion[] | null>(null);
    const [autoFilling, setAutoFilling] = useState(false);

    // Receive goods form
    const [rcvForm,     setRcvForm]     = useState({ ingredientId: "", purchaseQty: "", purchasePrice: "", date: today(), note: "" });
    const [rcvResult,   setRcvResult]   = useState<{ stockAdded: number; priceAlert: boolean; priceChangePct: number } | null>(null);

    // Waste log form
    const [wasteForm,   setWasteForm]   = useState({ inventoryItemId: "", ingredientId: "", qty: "", reason: "Spoiled", note: "", date: today() });


    // Txn filter
    const [txnType,     setTxnType]     = useState("all");
    const [txnPage,     setTxnPage]     = useState(1);
    const [txnPageSize, setTxnPageSize] = useState(25);

    // mounted for charts
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    // Load data
    const loadData = useCallback(async () => {
        try {
            const [inv, ingr, sup, alrt, t, areas] = await Promise.all([
                inventoryApi.list(),
                ingredientsApi.list(),
                suppliersApi.list(),
                inventoryApi.alerts(),
                inventoryApi.transactions({ limit: 300 }),
                storageAreasApi.list(),
            ]);
            setItems(inv);
            setAllIngr(ingr);
            setSuppliers(sup);
            setAlerts(alrt);
            setTxns(t);
            setStorageAreas(areas.filter((a: StorageArea) => a.isActive));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    // Load trend when trend tab is opened or days changes
    useEffect(() => {
        if (activeTab !== "trend") return;
        setTrendLoading(true);
        inventoryApi.ingredientTrend(trendDays, "Out,Waste", 30)
            .then(setTrendData)
            .catch(() => setTrendData(null))
            .finally(() => setTrendLoading(false));
    }, [activeTab, trendDays]);

    // Load PMIX heatmaps (protein/dessert/beverage/curry) when trend tab opens.
    // Always 7-day window = Mon–Sun latest.
    useEffect(() => {
        if (activeTab !== "trend") return;

        setProteinHeatmapLoading(true);
        pmixApi.proteinHeatmap(7)
            .then(setProteinHeatmap).catch(() => setProteinHeatmap(null))
            .finally(() => setProteinHeatmapLoading(false));

        setDessertHeatmapLoading(true);
        pmixApi.dessertHeatmap(7)
            .then(setDessertHeatmap).catch(() => setDessertHeatmap(null))
            .finally(() => setDessertHeatmapLoading(false));

        setBeverageHeatmapLoading(true);
        pmixApi.beverageHeatmap(7, 30)
            .then(setBeverageHeatmap).catch(() => setBeverageHeatmap(null))
            .finally(() => setBeverageHeatmapLoading(false));

        setCurryHeatmapLoading(true);
        pmixApi.curryHeatmap(7)
            .then(setCurryHeatmap).catch(() => setCurryHeatmap(null))
            .finally(() => setCurryHeatmapLoading(false));
    }, [activeTab]);

    // Untracked ingredients (not yet in InventoryItem)
    const trackedIds    = new Set(items.map(i => i.ingredientId));
    const untrackedIngr = allIngr.filter(i => !trackedIds.has(i.id));

    // Filtered stock table
    const filteredItems = items.filter(i =>
        i.ingredient.name.toLowerCase().includes(search.toLowerCase()) ||
        i.ingredient.groupId?.toLowerCase().includes(search.toLowerCase())
    );

    // Waste analytics (from txns)
    const wasteTxns = txns.filter(t => t.type === "Waste");
    const wasteByIngr = wasteTxns.reduce<Record<string, { name: string; cost: number }>>((acc, t) => {
        const name = t.ingredient?.name ?? t.ingredientId;
        if (!acc[name]) acc[name] = { name, cost: 0 };
        acc[name].cost += Number(t.qty) * Number(t.costPerUnit ?? 0);
        return acc;
    }, {});
    const top5Waste = Object.values(wasteByIngr).sort((a, b) => b.cost - a.cost).slice(0, 5);

    const wasteByReason = wasteTxns.reduce<Record<string, number>>((acc, t) => {
        const r = t.reason ?? "Other";
        acc[r] = (acc[r] ?? 0) + 1;
        return acc;
    }, {});
    const wasteReasonData = Object.entries(wasteByReason).map(([name, value]) => ({ name, value }));

    const totalWasteCost = wasteTxns.reduce((s, t) => s + Number(t.qty) * Number(t.costPerUnit ?? 0), 0);

    // Counts
    const critCount = alerts.filter(a => a.status === "critical").length;
    const lowCount  = alerts.filter(a => a.status === "low").length;

    // ── Handlers ────────────────────────────────────────────────────────────────

    async function handleAddToTracking() {
        if (!addForm.ingredientId) return;
        setSaving(true);
        try {
            const item = await inventoryApi.create({
                ingredientId: addForm.ingredientId,
                currentStock: 0,
                parMin:       Number(addForm.parMin || 0),
                parMax:       Number(addForm.parMax || 0),
                reorderPoint: Number(addForm.reorderPoint || 0),
                leadTimeDays: Number(addForm.leadTimeDays || 1),
            });
            setItems(prev => [...prev, item]);
            setAddOpen(false);
            setAddSearch("");
            setAddForm({ ingredientId: "", parMin: "", parMax: "", reorderPoint: "", leadTimeDays: "1" });
        } catch (e) { console.error(e); } finally { setSaving(false); }
    }

    async function handleRemove(id: string) {
        if (!confirm("Remove this ingredient from inventory tracking?")) return;
        await inventoryApi.delete(id);
        setItems(prev => prev.filter(i => i.id !== id));
    }

    // ── Inline PAR Min / ROP / Max editing (in recipe / purchase / pack units) ──
    function cfgFor(ing: Ingredient, packUnit: string | null, packSize: number | null): StockUnitConfig {
        return {
            recipeUnit:     ing.recipeUnit,
            purchaseUnit:   ing.purchaseUnit,
            conversionRate: Number(ing.conversionRate || 1),
            packUnit:       packUnit?.trim() || null,
            packSize:       packSize && packSize > 0 ? packSize : null,
        };
    }
    function unitToRecipe(qty: number, unit: string, cfg: StockUnitConfig): number {
        if (unit === cfg.packUnit)     return qty * recipeUnitsPerPack(cfg);
        if (unit === cfg.purchaseUnit) return qty * recipeUnitsPerPurchase(cfg);
        return qty; // recipe unit
    }
    function recipeToUnit(recipeQty: number, unit: string, cfg: StockUnitConfig): number {
        if (unit === cfg.packUnit)     { const p = recipeUnitsPerPack(cfg);     return p > 0 ? recipeQty / p : recipeQty; }
        if (unit === cfg.purchaseUnit) { const p = recipeUnitsPerPurchase(cfg); return p > 0 ? recipeQty / p : recipeQty; }
        return recipeQty;
    }
    const trimN = (n: number) => Number.isFinite(n) ? String(Math.round(n * 1000) / 1000) : "0";
    function parUnitOptions(cfg: StockUnitConfig): string[] {
        const opts = [cfg.recipeUnit];
        if (cfg.purchaseUnit && cfg.purchaseUnit !== cfg.recipeUnit) opts.push(cfg.purchaseUnit);
        if (hasPack(cfg) && cfg.packUnit) opts.push(cfg.packUnit);
        return [...new Set(opts)];
    }

    function openParEdit(item: InventoryItem) {
        const cfg  = cfgFor(item.ingredient, item.packUnit ?? null, item.packSize ?? null);
        const unit = hasPack(cfg) && cfg.packUnit ? cfg.packUnit : cfg.recipeUnit;
        setParForm({
            unit,
            parMin:       trimN(recipeToUnit(Number(item.parMin), unit, cfg)),
            reorderPoint: trimN(recipeToUnit(Number(item.reorderPoint), unit, cfg)),
            parMax:       trimN(recipeToUnit(Number(item.parMax), unit, cfg)),
            leadTimeDays: Number(item.leadTimeDays ?? 1).toString(),
            packUnit:     item.packUnit ?? "",
            packSize:     item.packSize != null ? String(item.packSize) : "",
        });
        setParError(null);
        setParEdit(item);
    }
    // Re-express the current PAR inputs when the entry unit changes (keep amount equal)
    function changeParUnit(newUnit: string) {
        if (!parEdit) return;
        const cfg = cfgFor(parEdit.ingredient, parForm.packUnit || null, parForm.packSize ? Number(parForm.packSize) : null);
        const old = parForm.unit;
        const re = (v: string) => trimN(recipeToUnit(unitToRecipe(Number(v || 0), old, cfg), newUnit, cfg));
        setParForm(f => ({ ...f, unit: newUnit, parMin: re(f.parMin), reorderPoint: re(f.reorderPoint), parMax: re(f.parMax) }));
    }
    async function saveParEdit() {
        if (!parEdit) return;
        const packUnit = parForm.packUnit.trim() || null;
        const packSize = parForm.packSize ? Number(parForm.packSize) : null;
        const cfg = cfgFor(parEdit.ingredient, packUnit, packSize);
        // Guard: entering values in a pack unit that isn't configured
        if (parForm.unit === packUnit && !hasPack(cfg)) { setParError("Set the pack size first to use this unit."); return; }
        const toR = (v: string) => Math.round(unitToRecipe(Number(v || 0), parForm.unit, cfg) * 10000) / 10000;
        const parMin = toR(parForm.parMin), reorderPoint = toR(parForm.reorderPoint), parMax = toR(parForm.parMax);
        if (parMax > 0 && parMin > parMax) { setParError("PAR Min cannot exceed PAR Max."); return; }
        setParError(null);
        setParSaving(true);
        try {
            const updated = await inventoryApi.update(parEdit.id, {
                parMin, reorderPoint, parMax,
                leadTimeDays: Number(parForm.leadTimeDays || 1),
                packUnit, packSize,
            });
            setItems(prev => prev.map(i => i.id === parEdit.id ? { ...i, ...updated } : i));
            setParEdit(null);
        } finally { setParSaving(false); }
    }

    // ── Auto-fill PAR Min / ROP / Max from PMIX-derived demand ──────────────────
    async function fetchParSuggestions(days: number): Promise<ParSuggestion[]> {
        const res = await pmixApi.parSuggestions(days);
        setParSug(res.suggestions);
        return res.suggestions;
    }
    async function autoFillAllPar() {
        setAutoFilling(true);
        try {
            const sugg = await fetchParSuggestions(parDays);
            const toApply = sugg
                .filter(s => s.hasHistory && s.suggestedParMin != null && s.suggestedROP != null && s.suggestedParMax != null)
                .map(s => ({ inventoryItemId: s.inventoryItemId, parMin: s.suggestedParMin!, parMax: s.suggestedParMax!, reorderPoint: s.suggestedROP! }));
            if (toApply.length === 0) {
                alert("No PMIX usage history found in the selected window. Upload PMIX reports and link menu items to recipes first.");
                return;
            }
            if (!confirm(`Auto-fill PAR Min / ROP / Max for ${toApply.length} ingredient(s) from the last ${parDays} days of PMIX usage?\n\nThis overwrites the current PAR values for those items.`)) return;
            const r = await pmixApi.applyParSuggestions(toApply);
            await loadData();
            alert(`Updated PAR levels for ${r.applied} ingredient(s) based on PMIX demand.`);
        } finally { setAutoFilling(false); }
    }
    // Fill the open PAR dialog from this item's PMIX suggestion (review before save)
    async function autoFillOnePar() {
        if (!parEdit) return;
        setParSaving(true);
        try {
            const sugg = parSug ?? await fetchParSuggestions(parDays);
            const s = sugg.find(x => x.inventoryItemId === parEdit.id);
            if (!s || !s.hasHistory || s.suggestedParMin == null) {
                setParError(`No PMIX usage history for this item in the last ${parDays} days.`);
                return;
            }
            const cfg = cfgFor(parEdit.ingredient, parForm.packUnit || null, parForm.packSize ? Number(parForm.packSize) : null);
            setParForm(f => ({
                ...f,
                parMin:       trimN(recipeToUnit(s.suggestedParMin!, f.unit, cfg)),
                reorderPoint: trimN(recipeToUnit(s.suggestedROP!,    f.unit, cfg)),
                parMax:       trimN(recipeToUnit(s.suggestedParMax!, f.unit, cfg)),
            }));
            setParError(null);
        } finally { setParSaving(false); }
    }

    async function handleReceive() {
        if (!rcvForm.ingredientId || !rcvForm.purchaseQty || !rcvForm.purchasePrice || !rcvForm.date) return;
        setSaving(true);
        try {
            const result = await inventoryApi.receive({
                ingredientId:        rcvForm.ingredientId,
                purchaseQty:         Number(rcvForm.purchaseQty),
                purchasePrice:       Number(rcvForm.purchasePrice),
                date:                rcvForm.date,
                note:                rcvForm.note || undefined,
                ingredientSupplierId: rcvSupplierId || undefined,
            });
            setRcvResult({ stockAdded: result.stockAdded, priceAlert: result.priceAlert, priceChangePct: result.priceChangePct });
            setItems(prev => prev.map(i => i.ingredientId === rcvForm.ingredientId ? result.inventoryItem : i));
            await loadData(); // refresh alerts + txns
            setRcvForm({ ingredientId: "", purchaseQty: "", purchasePrice: "", date: today(), note: "" });
            setRcvSupplierId("");
            setRcvIngSuppliers([]);
            setTimeout(() => setRcvResult(null), 6000);
        } catch (e) { console.error(e); } finally { setSaving(false); }
    }

    // Load suppliers when receive ingredient changes
    const handleRcvIngredientChange = useCallback(async (ingredientId: string) => {
        setRcvForm(f => ({ ...f, ingredientId }));
        setRcvSupplierId("");
        if (ingredientId) {
            try {
                const links = await ingredientSuppliersApi.listForIngredient(ingredientId);
                setRcvIngSuppliers(links);
                // Auto-select preferred supplier
                const preferred = links.find(l => l.isPreferred);
                if (preferred) setRcvSupplierId(preferred.id);
            } catch { setRcvIngSuppliers([]); }
        } else {
            setRcvIngSuppliers([]);
        }
    }, []);

    async function handleWaste() {
        if (!wasteForm.inventoryItemId || !wasteForm.qty || !wasteForm.date) return;
        setSaving(true);
        try {
            const item  = items.find(i => i.id === wasteForm.inventoryItemId);
            const ingr  = item?.ingredient;
            const cpUnit = ingr
                ? Number(ingr.purchasePrice) / (Number(ingr.conversionRate) * (Number(ingr.yieldPercent) / 100))
                : 0;

            await inventoryApi.logTransaction({
                inventoryItemId: wasteForm.inventoryItemId,
                ingredientId:    wasteForm.ingredientId,
                type:            "Waste",
                qty:             Number(wasteForm.qty),
                unit:            ingr?.recipeUnit ?? "",
                costPerUnit:     cpUnit,
                reason:          wasteForm.reason,
                note:            wasteForm.note || undefined,
                date:            wasteForm.date,
            });
            await loadData();
            setWasteForm({ inventoryItemId: "", ingredientId: "", qty: "", reason: "Spoiled", note: "", date: today() });
        } catch (e) { console.error(e); } finally { setSaving(false); }
    }


    // Receive goods — selected ingredient details
    const rcvIngredient = rcvForm.ingredientId
        ? (items.find(i => i.ingredientId === rcvForm.ingredientId)?.ingredient ?? null)
        : null;

    if (loading) return (
        <div className="flex justify-center items-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
    );

    return (
        <div className="space-y-6 animate-in fade-in duration-500">

            {/* ── Header ── */}
            <div className="flex flex-wrap gap-3 justify-between items-start">
                <div>
                    <h2 className="text-3xl font-bold font-playfair tracking-tight text-primary">Inventory</h2>
                    <p className="text-muted-foreground">Live stock tracking, waste logging & stocktake.</p>
                </div>
                <Button onClick={() => setAddOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" /> Track Ingredient
                </Button>
            </div>

            {/* ── Alert Banner ── */}
            {(critCount + lowCount) > 0 && (
                <Alert variant="destructive" className="bg-destructive/10 border-destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Stock Alerts</AlertTitle>
                    <AlertDescription>
                        {critCount > 0 && <span><strong>{critCount}</strong> item(s) below safety stock. </span>}
                        {lowCount  > 0 && <span><strong>{lowCount}</strong> item(s) at reorder point.</span>}
                    </AlertDescription>
                </Alert>
            )}

            {/* ── Setup Health ── */}
            <SetupHealthBanner onFixed={loadData} />

            {/* ── Stat Cards ── */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                <div className="rounded-xl border bg-card px-4 py-3 flex items-center gap-3">
                    <Warehouse className="h-7 w-7 text-primary opacity-70 shrink-0" />
                    <div>
                        <p className="text-2xl font-bold text-primary">{items.length}</p>
                        <p className="text-xs text-muted-foreground">Tracked Items</p>
                    </div>
                </div>
                {/* Total stock value */}
                <div className="rounded-xl border bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800 px-4 py-3 flex items-center gap-3 sm:col-span-2 lg:col-span-1">
                    <DollarSign className="h-7 w-7 text-emerald-600 opacity-80 shrink-0" />
                    <div className="min-w-0">
                        <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400 tabular-nums truncate">
                            {format(items.reduce((s, i) => s + itemStockValue(i), 0))}
                        </p>
                        <p className="text-xs text-muted-foreground">Stock Value</p>
                    </div>
                </div>
                <div className="rounded-xl border bg-card px-4 py-3 flex items-center gap-3">
                    <CheckCircle2 className="h-7 w-7 text-green-500 opacity-70 shrink-0" />
                    <div>
                        <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                            {items.filter(i => stockStatus(i) === "ok").length}
                        </p>
                        <p className="text-xs text-muted-foreground">OK</p>
                    </div>
                </div>
                <button
                    onClick={() => setActiveTab("stock")}
                    className="rounded-xl border bg-card px-4 py-3 flex items-center gap-3 text-left hover:border-yellow-400"
                >
                    <AlertTriangle className="h-7 w-7 text-yellow-500 opacity-70 shrink-0" />
                    <div>
                        <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{lowCount}</p>
                        <p className="text-xs text-muted-foreground">Reorder</p>
                    </div>
                </button>
                <button
                    onClick={() => setActiveTab("stock")}
                    className="rounded-xl border bg-card px-4 py-3 flex items-center gap-3 text-left hover:border-red-400"
                >
                    <AlertCircle className="h-7 w-7 text-red-500 opacity-70 shrink-0" />
                    <div>
                        <p className="text-2xl font-bold text-red-600 dark:text-red-400">{critCount}</p>
                        <p className="text-xs text-muted-foreground">Critical</p>
                    </div>
                </button>
            </div>

            {/* ── Tabs ── */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <div className="overflow-x-auto pb-1">
                    <TabsList className="w-max sm:w-auto">
                        <TabsTrigger value="stock"     className="flex-1 sm:flex-none"><Warehouse    className="mr-1.5 h-4 w-4" />Stock Levels</TabsTrigger>
                        <TabsTrigger value="receive"   className="flex-1 sm:flex-none"><PackagePlus  className="mr-1.5 h-4 w-4" />Receive Goods</TabsTrigger>
                        <TabsTrigger value="waste"     className="flex-1 sm:flex-none"><TrendingDown className="mr-1.5 h-4 w-4" />Waste Log</TabsTrigger>
                        <TabsTrigger value="stocktake" className="flex-1 sm:flex-none"><ClipboardList className="mr-1.5 h-4 w-4" />Stock Count</TabsTrigger>
                        <TabsTrigger value="history"   className="flex-1 sm:flex-none"><History      className="mr-1.5 h-4 w-4" />History</TabsTrigger>
                        <TabsTrigger value="trend"     className="flex-1 sm:flex-none"><TrendingUp   className="mr-1.5 h-4 w-4" />Usage Trend</TabsTrigger>
                    </TabsList>
                </div>

                {/* ══ STOCK LEVELS ═══════════════════════════════════════════════ */}
                <TabsContent value="stock" className="space-y-4 mt-4">

                    {/* Auto-fill PAR from PMIX demand */}
                    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/20 px-3 py-2">
                        <Sparkles className="w-4 h-4 text-primary shrink-0" />
                        <span className="text-xs text-muted-foreground mr-auto">Set PAR Min / ROP / Max automatically from PMIX usage (qty sold × recipe BOM).</span>
                        <Select value={String(parDays)} onValueChange={v => setParDays(Number(v))}>
                            <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                            <SelectContent>{[7, 14, 30, 60].map(d => <SelectItem key={d} value={String(d)}>{d} days</SelectItem>)}</SelectContent>
                        </Select>
                        <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={autoFillAllPar} disabled={autoFilling}>
                            {autoFilling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Auto-fill PAR
                        </Button>
                    </div>

                    {/* Level 1: Area Cards (when no area is selected AND storage areas exist) */}
                    {selectedAreaId === null && storageAreas.length > 0 ? (
                        <div className="space-y-4">
                            <p className="text-sm text-muted-foreground">Select a storage area to view its inventory, or search all below.</p>
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                                {storageAreas.map(area => {
                                    const areaItems = items.filter(i => (i.ingredient as Ingredient & { storageAreaId?: string | null }).storageAreaId === area.id);
                                    const criticalCount = areaItems.filter(i => stockStatus(i) === "critical").length;
                                    const areaValue = areaItems.reduce((s, i) => s + itemStockValue(i), 0);
                                    return (
                                        <button key={area.id}
                                            onClick={() => setSelectedAreaId(area.id)}
                                            className="rounded-xl border bg-card p-4 text-left hover:border-primary/50 hover:shadow-sm transition-all space-y-2">
                                            <div className="flex items-start justify-between gap-1">
                                                <div className="flex items-center gap-1.5">
                                                    <Warehouse className="h-4 w-4 text-amber-600 shrink-0" />
                                                    <span className="font-semibold text-sm leading-tight">{area.name}</span>
                                                </div>
                                                {criticalCount > 0 && (
                                                    <Badge className="bg-red-100 text-red-700 border-red-200 text-[10px] px-1.5 shrink-0">
                                                        {criticalCount} ⚠
                                                    </Badge>
                                                )}
                                            </div>
                                            {area.temperature && (
                                                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                                    <Thermometer className="h-3 w-3" />{area.temperature}
                                                </div>
                                            )}
                                            <p className="text-2xl font-bold text-primary">{areaItems.length}</p>
                                            <p className="text-xs text-muted-foreground">ingredients</p>
                                            {areaValue > 0 && (
                                                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                                                    {format(areaValue)}
                                                </p>
                                            )}
                                        </button>
                                    );
                                })}
                                {/* Unassigned card */}
                                {(() => {
                                    const assignedAreaIds = new Set(storageAreas.map(a => a.id));
                                    const unassigned = items.filter(i => {
                                        const areaId = (i.ingredient as Ingredient & { storageAreaId?: string | null }).storageAreaId;
                                        return !areaId || !assignedAreaIds.has(areaId);
                                    });
                                    return unassigned.length > 0 ? (
                                        <button onClick={() => setSelectedAreaId("unassigned")}
                                            className="rounded-xl border bg-card p-4 text-left hover:border-primary/50 hover:shadow-sm transition-all space-y-2">
                                            <div className="flex items-center gap-1.5">
                                                <Warehouse className="h-4 w-4 text-muted-foreground shrink-0" />
                                                <span className="font-semibold text-sm">Unassigned</span>
                                            </div>
                                            <p className="text-2xl font-bold">{unassigned.length}</p>
                                            <p className="text-xs text-muted-foreground">no area set</p>
                                        </button>
                                    ) : null;
                                })()}
                            </div>
                            <div className="border-t pt-4">
                                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">All Ingredients</p>
                            </div>
                        </div>
                    ) : selectedAreaId !== null ? (
                        /* Level 2 breadcrumb */
                        <div className="flex items-center gap-2">
                            <Button variant="ghost" size="sm" className="gap-1" onClick={() => setSelectedAreaId(null)}>
                                <ChevronLeft className="h-4 w-4" /> Storage Areas
                            </Button>
                            <span className="text-muted-foreground">/</span>
                            <span className="font-medium text-sm">
                                {selectedAreaId === "unassigned"
                                    ? "Unassigned"
                                    : storageAreas.find(a => a.id === selectedAreaId)?.name ?? selectedAreaId}
                            </span>
                        </div>
                    ) : null}

                    <div className="relative max-w-sm">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="Search ingredient..." className="pl-8" value={search} onChange={e => setSearch(e.target.value)} />
                    </div>

                    <div className="border rounded-lg overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Ingredient</TableHead>
                                    <TableHead className="hidden sm:table-cell">Unit</TableHead>
                                    <TableHead className="text-right">Current Stock</TableHead>
                                    <TableHead className="text-right text-emerald-700 dark:text-emerald-400">Stock Value</TableHead>
                                    <TableHead className="hidden md:table-cell">Level</TableHead>
                                    <TableHead className="hidden lg:table-cell text-right">PAR Min / ROP / Max</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="w-10"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredItems
                                    .filter(item => {
                                        if (selectedAreaId === null) return true;
                                        const areaId = (item.ingredient as Ingredient & { storageAreaId?: string | null }).storageAreaId;
                                        if (selectedAreaId === "unassigned") {
                                            const assignedAreaIds = new Set(storageAreas.map(a => a.id));
                                            return !areaId || !assignedAreaIds.has(areaId);
                                        }
                                        return areaId === selectedAreaId;
                                    })
                                    .map(item => {
                                    const status = stockStatus(item);
                                    return (
                                        <TableRow key={item.id} className={status === "critical" ? "bg-destructive/5" : status === "low" ? "bg-yellow-500/5" : ""}>
                                            <TableCell className="font-medium">
                                                {item.ingredient.name}
                                                <span className="sm:hidden block text-xs text-muted-foreground">{item.ingredient.recipeUnit}</span>
                                            </TableCell>
                                            <TableCell className="hidden sm:table-cell text-muted-foreground">{item.ingredient.recipeUnit}</TableCell>
                                            <TableCell className="text-right tabular-nums font-semibold">
                                                {(() => {
                                                    const cfg = cfgFor(item.ingredient, item.packUnit ?? null, item.packSize ?? null);
                                                    if (hasPack(cfg)) {
                                                        const p = recipeToPacks(Number(item.currentStock), cfg);
                                                        return <>
                                                            {p != null ? trimN(p) : "—"} <span className="text-xs font-normal text-muted-foreground">{cfg.packUnit}</span>
                                                            <span className="block text-[10px] font-normal text-muted-foreground/70">{Number(item.currentStock).toFixed(1)} {cfg.recipeUnit}</span>
                                                        </>;
                                                    }
                                                    return Number(item.currentStock).toFixed(1);
                                                })()}
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums">
                                                <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                                                    {format(itemStockValue(item))}
                                                </span>
                                            </TableCell>
                                            <TableCell className="hidden md:table-cell">
                                                <StockBar item={item} />
                                            </TableCell>
                                            <TableCell className="hidden lg:table-cell text-right text-xs tabular-nums">
                                                <button onClick={() => openParEdit(item)}
                                                    className="text-muted-foreground hover:text-primary hover:underline decoration-dotted underline-offset-2 transition-colors"
                                                    title="Edit PAR Min / ROP / Max">
                                                    {(() => {
                                                        const cfg = cfgFor(item.ingredient, item.packUnit ?? null, item.packSize ?? null);
                                                        const packed = hasPack(cfg);
                                                        const fmt = (r: number) => { const p = packed ? recipeToPacks(r, cfg) : null; return p != null ? trimN(p) : Number(r).toFixed(0); };
                                                        const unit = packed ? cfg.packUnit : item.ingredient.recipeUnit;
                                                        return `${fmt(Number(item.parMin))} / ${fmt(Number(item.reorderPoint))} / ${fmt(Number(item.parMax))} ${unit ?? ""}`;
                                                    })()}
                                                </button>
                                            </TableCell>
                                            <TableCell>
                                                <StatusBadge status={status} />
                                                {status !== "ok" && (() => {
                                                    const cfg  = cfgFor(item.ingredient, item.packUnit ?? null, item.packSize ?? null);
                                                    const need = Math.max(0, Number(item.parMax) - Number(item.currentStock)); // recipe units to reach PAR Max
                                                    if (need <= 0) return null;
                                                    let qty: number, unit: string;
                                                    if (hasPack(cfg))                 { qty = Math.ceil(need / recipeUnitsPerPack(cfg));     unit = cfg.packUnit!; }
                                                    else if (cfg.conversionRate > 1)  { qty = Math.ceil(need / recipeUnitsPerPurchase(cfg)); unit = cfg.purchaseUnit; }
                                                    else                              { qty = Math.ceil(need);                               unit = cfg.recipeUnit; }
                                                    return <div className="text-[10px] text-amber-600 dark:text-amber-400 font-medium mt-0.5 whitespace-nowrap">Order ~{qty} {unit}</div>;
                                                })()}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center justify-end gap-0.5">
                                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary" title="Edit PAR Min / ROP / Max" onClick={() => openParEdit(item)}>
                                                        <SlidersHorizontal className="h-3.5 w-3.5" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" title="Remove from tracking" onClick={() => handleRemove(item.id)}>
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                                {filteredItems.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                                            {items.length === 0 ? 'No ingredients tracked yet. Click "Track Ingredient" to begin.' : "No results match your search."}
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>

                    <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Critical — at or below Safety Stock (PAR Min)</span>
                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" /> Reorder — at or below Reorder Point</span>
                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> OK</span>
                    </div>
                </TabsContent>

                {/* ══ RECEIVE GOODS ══════════════════════════════════════════════ */}
                <TabsContent value="receive" className="mt-4">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                        <Card>
                            <CardHeader>
                                <CardTitle>Goods Receipt</CardTitle>
                                <CardDescription>Record incoming stock. Stock is auto-converted to recipe units.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {rcvResult && (
                                    <Alert className={rcvResult.priceAlert ? "bg-yellow-50 border-yellow-400 dark:bg-yellow-950/30" : "bg-green-50 border-green-400 dark:bg-green-950/30"}>
                                        {rcvResult.priceAlert ? <AlertTriangle className="h-4 w-4 text-yellow-600" /> : <CheckCircle2 className="h-4 w-4 text-green-600" />}
                                        <AlertTitle>{rcvResult.priceAlert ? `Price Alert: +${rcvResult.priceChangePct}% increase` : "Receipt Confirmed"}</AlertTitle>
                                        <AlertDescription>
                                            {rcvResult.stockAdded.toFixed(2)} {rcvIngredient?.recipeUnit ?? ""} added to stock.
                                            {rcvResult.priceAlert && " Consider switching supplier or updating menu prices."}
                                        </AlertDescription>
                                    </Alert>
                                )}

                                <div className="space-y-1.5">
                                    <Label>Ingredient <span className="text-destructive">*</span></Label>
                                    <Select value={rcvForm.ingredientId} onValueChange={handleRcvIngredientChange}>
                                        <SelectTrigger><SelectValue placeholder="Select tracked ingredient..." /></SelectTrigger>
                                        <SelectContent>
                                            {items.map(i => (
                                                <SelectItem key={i.ingredientId} value={i.ingredientId}>
                                                    {i.ingredient.name} <span className="text-muted-foreground ml-1">({i.ingredient.purchaseUnit})</span>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Supplier Select (V3: multi-supplier) */}
                                {rcvIngredient && rcvIngSuppliers.length > 0 && (
                                    <div className="space-y-1.5">
                                        <Label>Supplier</Label>
                                        <Select value={rcvSupplierId} onValueChange={v => {
                                            setRcvSupplierId(v);
                                            const link = rcvIngSuppliers.find(l => l.id === v);
                                            if (link) {
                                                setRcvForm(f => ({ ...f, purchasePrice: "" }));
                                            }
                                        }}>
                                            <SelectTrigger><SelectValue placeholder="Select supplier…" /></SelectTrigger>
                                            <SelectContent>
                                                {rcvIngSuppliers.map(link => (
                                                    <SelectItem key={link.id} value={link.id}>
                                                        {link.supplier?.name ?? "—"}
                                                        {link.isPreferred && " ★"}
                                                        {" — "}{link.purchaseUnit} @ ฿{Number(link.purchasePrice).toFixed(2)}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                )}

                                {rcvIngredient && (
                                    <div className="rounded-lg bg-muted/40 border px-3 py-2 text-xs text-muted-foreground space-y-0.5">
                                        <p><strong>Purchase unit:</strong> {rcvIngredient.purchaseUnit} → <strong>Recipe unit:</strong> {rcvIngredient.recipeUnit}</p>
                                        <p><strong>Conversion rate:</strong> {Number(rcvIngredient.conversionRate)} · <strong>Yield:</strong> {Number(rcvIngredient.yieldPercent)}%</p>
                                        {(() => {
                                            const avgCost = Number((rcvIngredient as Ingredient & { averageCostPerBaseUnit?: number | null }).averageCostPerBaseUnit ?? 0);
                                            return avgCost > 0 ? (
                                                <p><strong>MAC:</strong> ฿{avgCost.toFixed(4)} / {rcvIngredient.recipeUnit}</p>
                                            ) : null;
                                        })()}
                                    </div>
                                )}

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <Label>Qty Received <span className="text-destructive">*</span></Label>
                                        <div className="flex items-center gap-1.5">
                                            <Input type="number" min={0} step={0.01} placeholder="25" value={rcvForm.purchaseQty} onChange={e => setRcvForm(f => ({ ...f, purchaseQty: e.target.value }))} />
                                            <span className="text-sm text-muted-foreground shrink-0">{rcvIngredient?.purchaseUnit ?? "units"}</span>
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label>Total Price <span className="text-destructive">*</span></Label>
                                        <Input type="number" min={0} step={0.01} placeholder="0.00" value={rcvForm.purchasePrice} onChange={e => setRcvForm(f => ({ ...f, purchasePrice: e.target.value }))} />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <Label>Date <span className="text-destructive">*</span></Label>
                                        <Input type="date" value={rcvForm.date} onChange={e => setRcvForm(f => ({ ...f, date: e.target.value }))} />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label>Note</Label>
                                        <Input placeholder="optional" value={rcvForm.note} onChange={e => setRcvForm(f => ({ ...f, note: e.target.value }))} />
                                    </div>
                                </div>

                                {rcvIngredient && rcvForm.purchaseQty && (
                                    <div className="rounded-lg bg-primary/5 border border-primary/20 px-3 py-2 text-sm">
                                        <p className="text-muted-foreground text-xs mb-1">Will add to stock:</p>
                                        <p className="font-bold text-primary">
                                            {(Number(rcvForm.purchaseQty) * Number(rcvIngredient.conversionRate) * (Number(rcvIngredient.yieldPercent) / 100)).toFixed(2)} {rcvIngredient.recipeUnit}
                                        </p>
                                    </div>
                                )}

                                <Button
                                    className="w-full"
                                    onClick={handleReceive}
                                    disabled={saving || !rcvForm.ingredientId || !rcvForm.purchaseQty || !rcvForm.purchasePrice}
                                >
                                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    <PackagePlus className="mr-2 h-4 w-4" /> Confirm Receipt
                                </Button>
                            </CardContent>
                        </Card>

                        {/* Suggested reorders from alerts */}
                        {alerts.length > 0 && (
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <AlertTriangle className="h-5 w-5 text-yellow-500" /> Items to Reorder
                                    </CardTitle>
                                    <CardDescription>Click an ingredient to pre-fill the receipt form</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-2">
                                        {alerts.map(a => (
                                            <button
                                                key={a.id}
                                                onClick={() => setRcvForm(f => ({ ...f, ingredientId: a.ingredientId }))}
                                                className={`w-full text-left rounded-lg border px-3 py-2 text-sm flex justify-between items-center hover:border-primary/40 transition-colors ${rcvForm.ingredientId === a.ingredientId ? "border-primary/60 bg-primary/5" : ""}`}
                                            >
                                                <span className="font-medium">{a.ingredient.name}</span>
                                                <span className="flex items-center gap-2">
                                                    <StatusBadge status={a.status} />
                                                    <span className="text-xs text-muted-foreground">
                                                        {Number(a.currentStock).toFixed(1)} / {Number(a.parMax).toFixed(1)} {a.ingredient.recipeUnit}
                                                    </span>
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                    </div>
                </TabsContent>

                {/* ══ WASTE LOG ═══════════════════════════════════════════════════ */}
                <TabsContent value="waste" className="mt-4">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                        {/* Entry form */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Log Waste</CardTitle>
                                <CardDescription>Record spoilage, overcooking, or any ingredient loss.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-1.5">
                                    <Label>Ingredient <span className="text-destructive">*</span></Label>
                                    <Select
                                        value={wasteForm.inventoryItemId}
                                        onValueChange={v => {
                                            const item = items.find(i => i.id === v);
                                            setWasteForm(f => ({ ...f, inventoryItemId: v, ingredientId: item?.ingredientId ?? "" }));
                                        }}
                                    >
                                        <SelectTrigger><SelectValue placeholder="Select ingredient..." /></SelectTrigger>
                                        <SelectContent>
                                            {items.map(i => (
                                                <SelectItem key={i.id} value={i.id}>
                                                    {i.ingredient.name} — {Number(i.currentStock).toFixed(1)} {i.ingredient.recipeUnit} in stock
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <Label>Qty Wasted <span className="text-destructive">*</span></Label>
                                        <div className="flex items-center gap-1.5">
                                            <Input type="number" min={0} step={0.01} placeholder="0" value={wasteForm.qty} onChange={e => setWasteForm(f => ({ ...f, qty: e.target.value }))} />
                                            <span className="text-sm text-muted-foreground shrink-0">
                                                {items.find(i => i.id === wasteForm.inventoryItemId)?.ingredient.recipeUnit ?? ""}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label>Reason</Label>
                                        <Select value={wasteForm.reason} onValueChange={v => setWasteForm(f => ({ ...f, reason: v }))}>
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                {WASTE_REASONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <Label>Date</Label>
                                        <Input type="date" value={wasteForm.date} onChange={e => setWasteForm(f => ({ ...f, date: e.target.value }))} />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label>Note</Label>
                                        <Input placeholder="optional" value={wasteForm.note} onChange={e => setWasteForm(f => ({ ...f, note: e.target.value }))} />
                                    </div>
                                </div>

                                <Button
                                    variant="destructive"
                                    className="w-full"
                                    onClick={handleWaste}
                                    disabled={saving || !wasteForm.inventoryItemId || !wasteForm.qty}
                                >
                                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    <TrendingDown className="mr-2 h-4 w-4" /> Log Waste
                                </Button>
                            </CardContent>
                        </Card>

                        {/* Waste summary */}
                        <div className="space-y-4">
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <BarChart2 className="h-5 w-5 text-primary" /> Waste Summary
                                    </CardTitle>
                                    <CardDescription>Total waste cost tracked: <strong>{format(totalWasteCost)}</strong></CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    {top5Waste.length > 0 ? (
                                        <>
                                            <div>
                                                <p className="text-xs font-medium text-muted-foreground mb-2">Top 5 Waste Items (by cost)</p>
                                                {mounted && (
                                                    <ResponsiveContainer width="100%" height={160}>
                                                        <BarChart data={top5Waste} layout="vertical" margin={{ left: 10, right: 20 }}>
                                                            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                                            <XAxis type="number" tickFormatter={v => format(Number(v), 0)} tick={{ fontSize: 11 }} />
                                                            <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 11 }} />
                                                            <Tooltip formatter={v => [format(Number(v)), "Cost"]} />
                                                            <Bar dataKey="cost" fill="#ef4444" radius={[0, 4, 4, 0]} barSize={16} />
                                                        </BarChart>
                                                    </ResponsiveContainer>
                                                )}
                                            </div>

                                            {wasteReasonData.length > 0 && (
                                                <div>
                                                    <p className="text-xs font-medium text-muted-foreground mb-2">Waste by Reason</p>
                                                    {mounted && (
                                                        <ResponsiveContainer width="100%" height={160}>
                                                            <PieChart>
                                                                <Pie data={wasteReasonData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60} label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                                                                    {wasteReasonData.map((_, i) => (
                                                                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                                                                    ))}
                                                                </Pie>
                                                                <Tooltip />
                                                                <Legend />
                                                            </PieChart>
                                                        </ResponsiveContainer>
                                                    )}
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <p className="text-sm text-muted-foreground text-center py-4">No waste logged yet.</p>
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                    </div>

                    {/* Recent waste log table */}
                    {wasteTxns.length > 0 && (
                        <Card className="mt-4">
                            <CardHeader>
                                <CardTitle>Recent Waste Entries</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="border rounded-md overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Date</TableHead>
                                                <TableHead>Ingredient</TableHead>
                                                <TableHead className="text-right">Qty</TableHead>
                                                <TableHead>Reason</TableHead>
                                                <TableHead className="text-right hidden sm:table-cell">Est. Cost</TableHead>
                                                <TableHead className="hidden md:table-cell">Note</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {wasteTxns.slice(0, 20).map(t => (
                                                <TableRow key={t.id}>
                                                    <TableCell className="text-sm">{t.date}</TableCell>
                                                    <TableCell className="font-medium">{t.ingredient?.name ?? "—"}</TableCell>
                                                    <TableCell className="text-right tabular-nums">{Number(t.qty).toFixed(2)} {t.unit}</TableCell>
                                                    <TableCell>
                                                        <Badge variant="outline" className="text-xs">{t.reason ?? "—"}</Badge>
                                                    </TableCell>
                                                    <TableCell className="text-right hidden sm:table-cell tabular-nums">
                                                        {format(Number(t.qty) * Number(t.costPerUnit ?? 0))}
                                                    </TableCell>
                                                    <TableCell className="hidden md:table-cell text-muted-foreground text-sm">{t.note ?? "—"}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </TabsContent>

                {/* ══ STOCK COUNT — moved to its own page ══════════════════════════ */}
                <TabsContent value="stocktake" className="mt-4 space-y-4">
                    <Card>
                        <CardContent className="py-12 flex flex-col items-center text-center gap-3">
                            <ClipboardList className="w-8 h-8 text-muted-foreground/40" />
                            <p className="font-semibold">Physical Stock Count has moved</p>
                            <p className="text-sm text-muted-foreground max-w-sm">
                                Counting is now organised by storage area for faster work. Open the new
                                <strong> Stock Count</strong> page from the sidebar.
                            </p>
                            <a href="/stock-count"><Button size="sm"><ClipboardList className="w-4 h-4 mr-1.5" /> Go to Stock Count</Button></a>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ══ TRANSACTION HISTORY ═════════════════════════════════════════ */}
                <TabsContent value="history" className="mt-4 space-y-4">
                    <div className="flex items-center gap-3 flex-wrap">
                        <Select value={txnType} onValueChange={(v) => { setTxnType(v); setTxnPage(1); }}>
                            <SelectTrigger className="w-40"><SelectValue placeholder="All types" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Types</SelectItem>
                                {["In", "Out", "Waste", "Adjust", "Stocktake"].map(t => (
                                    <SelectItem key={t} value={t}>{TXN_CONFIG[t]?.label ?? t}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="text-sm text-muted-foreground">
                            {txns.filter(t => txnType === "all" || t.type === txnType).length} records
                        </p>
                    </div>

                    <div className="border rounded-lg overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Ingredient</TableHead>
                                    <TableHead className="text-right">Qty</TableHead>
                                    <TableHead className="hidden sm:table-cell text-right">Unit Cost</TableHead>
                                    <TableHead className="hidden md:table-cell">Reason / Note</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {paginate(txns.filter(t => txnType === "all" || t.type === txnType), txnPage, txnPageSize).map(t => {
                                    const cfg  = TXN_CONFIG[t.type] ?? { label: t.type, badge: "", sign: "?" };
                                    return (
                                        <TableRow key={t.id}>
                                            <TableCell className="text-sm text-muted-foreground">{t.date}</TableCell>
                                            <TableCell>
                                                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${cfg.badge}`}>
                                                    {cfg.label}
                                                </span>
                                            </TableCell>
                                            <TableCell className="font-medium">{t.ingredient?.name ?? "—"}</TableCell>
                                            <TableCell className="text-right tabular-nums">
                                                <span className={t.type === "In" ? "text-green-600" : t.type === "Out" || t.type === "Waste" ? "text-red-600" : ""}>
                                                    {cfg.sign}{Number(t.qty).toFixed(2)}
                                                </span>
                                                <span className="text-xs text-muted-foreground ml-1">{t.unit}</span>
                                            </TableCell>
                                            <TableCell className="hidden sm:table-cell text-right tabular-nums text-muted-foreground text-sm">
                                                {t.costPerUnit != null ? format(Number(t.costPerUnit)) : "—"}
                                            </TableCell>
                                            <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                                                {t.reason ? <Badge variant="outline" className="text-xs mr-1">{t.reason}</Badge> : null}
                                                {t.note ?? ""}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                                {txns.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                                            No transactions yet. Receive goods or log waste to see history.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                    {(() => {
                        const total = txns.filter(t => txnType === "all" || t.type === txnType).length;
                        return total > 0 ? (
                            <DataPagination
                                total={total} page={txnPage} pageSize={txnPageSize}
                                onPageChange={setTxnPage} onPageSizeChange={setTxnPageSize}
                            />
                        ) : null;
                    })()}
                </TabsContent>

                {/* ══ USAGE TREND ═══════════════════════════════════════════════ */}
                <TabsContent value="trend" className="mt-4 space-y-4">

                    {/* ── Main Protein Usage (from PMIX, last 7 days) ─────────── */}
                    <Card className="border-teal-200 dark:border-teal-800">
                        <CardHeader className="pb-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                    <CardTitle className="text-sm flex items-center gap-2">
                                        <span className="text-base leading-none">🥩</span>
                                        Main Protein Usage — Last 7 Days (from PMIX Sales)
                                    </CardTitle>
                                    <p className="text-[11px] text-muted-foreground mt-1">
                                        Orders classified as Main Protein from PMIX · lb for oz-portioned items · orders otherwise
                                    </p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <button
                                        onClick={() => proteinHeatmap && exportProteinHeatmapToPDF(proteinHeatmap)}
                                        disabled={!proteinHeatmap || proteinHeatmap.items.length === 0 || proteinHeatmapLoading}
                                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-xs font-medium touch-manipulation"
                                        title="Export to PDF"
                                    >
                                        <FileDown className="w-4 h-4" />
                                        <span className="hidden sm:inline">Export PDF</span>
                                    </button>
                                    <button
                                        onClick={() => {
                                            setProteinHeatmapLoading(true);
                                            pmixApi.proteinHeatmap(7)
                                                .then(setProteinHeatmap)
                                                .catch(() => setProteinHeatmap(null))
                                                .finally(() => setProteinHeatmapLoading(false));
                                        }}
                                        disabled={proteinHeatmapLoading}
                                        className="p-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors disabled:opacity-50"
                                        title="Refresh"
                                    >
                                        <RefreshCw className={`w-4 h-4 ${proteinHeatmapLoading ? "animate-spin" : ""}`} />
                                    </button>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="px-3 sm:px-5 pb-5">
                            {proteinHeatmapLoading ? (
                                <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    <span className="text-sm">Loading protein data…</span>
                                </div>
                            ) : proteinHeatmap && proteinHeatmap.items.length > 0 ? (
                                <IngredientUsageHeatmap
                                    dates={proteinHeatmap.dates}
                                    items={proteinHeatmap.items.map(p => ({
                                        ingredientId:   p.proteinType,
                                        ingredientName: p.proteinType,
                                        unit:           p.unit,
                                        recipeUnit:     p.unit,
                                        purchaseUnit:   p.unit,
                                        conversionRate: 1,
                                        category:       p.ingredientName !== p.proteinType
                                            ? p.ingredientName
                                            : "Main Protein",
                                        totalQty:       p.totalQty,
                                        avgPerDay:      p.avgPerDay,
                                        byDate:         p.byDate,
                                        currentStock:   p.currentStock,
                                        parMin:         p.parMin,
                                        inventoryTracked: p.inventoryTracked,
                                    }))}
                                    days={proteinHeatmap.days}
                                    latestDataDate={proteinHeatmap.latestDataDate}
                                />
                            ) : (
                                <p className="text-sm text-muted-foreground text-center py-10">
                                    No PMIX data found for the last 7 days.
                                    Upload a PMIX report in <a href="/analysis/pmix" className="underline text-primary">PMIX Analytics</a>.
                                </p>
                            )}
                        </CardContent>
                    </Card>

                    {/* ── Main Dessert Usage (from PMIX, last 7 days) ─────────── */}
                    <Card className="border-pink-200 dark:border-pink-800">
                        <CardHeader className="pb-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                    <CardTitle className="text-sm flex items-center gap-2">
                                        <span className="text-base leading-none">🍮</span>
                                        Main Dessert Usage — Last 7 Days (from PMIX Sales)
                                    </CardTitle>
                                    <p className="text-[11px] text-muted-foreground mt-1">
                                        Orders classified as Dessert in PMIX · qty in purchase unit when inventory linked
                                    </p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <button
                                        onClick={() => dessertHeatmap && exportHeatmapToPDF({
                                            title:    "Main Dessert Usage — Last 7 Days",
                                            subtitle: "from PMIX Sales",
                                            dates:    dessertHeatmap.dates,
                                            days:     dessertHeatmap.days,
                                            latestDataDate: dessertHeatmap.latestDataDate,
                                            items:    dessertHeatmap.items.map(d => ({
                                                name: d.itemName, subLabel: `(${d.unit})`, unit: d.unit,
                                                byDate: d.byDate, totalQty: d.totalQty, avgPerDay: d.avgPerDay,
                                                currentStock: d.currentStock, parMin: d.parMin,
                                            })),
                                            filenamePrefix: "MainDessertUsage",
                                        })}
                                        disabled={!dessertHeatmap || dessertHeatmap.items.length === 0 || dessertHeatmapLoading}
                                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-pink-300 dark:border-pink-700 text-pink-700 dark:text-pink-300 hover:bg-pink-50 dark:hover:bg-pink-950/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-xs font-medium touch-manipulation"
                                        title="Export to PDF"
                                    >
                                        <FileDown className="w-4 h-4" />
                                        <span className="hidden sm:inline">Export PDF</span>
                                    </button>
                                    <button
                                        onClick={() => {
                                            setDessertHeatmapLoading(true);
                                            pmixApi.dessertHeatmap(7)
                                                .then(setDessertHeatmap).catch(() => setDessertHeatmap(null))
                                                .finally(() => setDessertHeatmapLoading(false));
                                        }}
                                        disabled={dessertHeatmapLoading}
                                        className="p-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors disabled:opacity-50"
                                        title="Refresh"
                                    >
                                        <RefreshCw className={`w-4 h-4 ${dessertHeatmapLoading ? "animate-spin" : ""}`} />
                                    </button>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="px-3 sm:px-5 pb-5">
                            {dessertHeatmapLoading ? (
                                <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    <span className="text-sm">Loading dessert data…</span>
                                </div>
                            ) : dessertHeatmap && dessertHeatmap.items.length > 0 ? (
                                <IngredientUsageHeatmap
                                    dates={dessertHeatmap.dates}
                                    days={dessertHeatmap.days}
                                    latestDataDate={dessertHeatmap.latestDataDate}
                                    items={dessertHeatmap.items.map(d => ({
                                        ingredientId:   d.inventoryItemId ?? d.itemName,
                                        ingredientName: d.itemName,
                                        unit:           d.unit,
                                        recipeUnit:     d.unit,
                                        purchaseUnit:   d.unit,
                                        conversionRate: 1,
                                        category:       "Dessert",
                                        totalQty:       d.totalQty,
                                        avgPerDay:      d.avgPerDay,
                                        byDate:         d.byDate,
                                        currentStock:   d.currentStock,
                                        parMin:         d.parMin,
                                        inventoryTracked: d.inventoryTracked,
                                    }))}
                                />
                            ) : (
                                <p className="text-sm text-muted-foreground text-center py-10">
                                    No dessert sales found in the last 7 days.
                                </p>
                            )}
                        </CardContent>
                    </Card>

                    {/* ── Beverages Usage (every menu item, from PMIX) ────────── */}
                    <Card className="border-purple-200 dark:border-purple-800">
                        <CardHeader className="pb-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                    <CardTitle className="text-sm flex items-center gap-2">
                                        <span className="text-base leading-none">🍹</span>
                                        Beverages Usage — Last 7 Days (every menu item)
                                    </CardTitle>
                                    <p className="text-[11px] text-muted-foreground mt-1">
                                        Top 30 individual beverage items (not group totals) · POS categories: Beer / Wine / Spirits / Cocktails
                                    </p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <button
                                        onClick={() => beverageHeatmap && exportHeatmapToPDF({
                                            title:    "Beverages Usage — Last 7 Days",
                                            subtitle: "every menu item · from PMIX Sales",
                                            dates:    beverageHeatmap.dates,
                                            days:     beverageHeatmap.days,
                                            latestDataDate: beverageHeatmap.latestDataDate,
                                            items:    beverageHeatmap.items.map(b => ({
                                                name: b.itemName, subLabel: b.category, unit: b.unit,
                                                byDate: b.byDate, totalQty: b.totalQty, avgPerDay: b.avgPerDay,
                                                currentStock: b.currentStock, parMin: b.parMin,
                                            })),
                                            filenamePrefix: "BeveragesUsage",
                                        })}
                                        disabled={!beverageHeatmap || beverageHeatmap.items.length === 0 || beverageHeatmapLoading}
                                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-xs font-medium touch-manipulation"
                                        title="Export to PDF"
                                    >
                                        <FileDown className="w-4 h-4" />
                                        <span className="hidden sm:inline">Export PDF</span>
                                    </button>
                                    <button
                                        onClick={() => {
                                            setBeverageHeatmapLoading(true);
                                            pmixApi.beverageHeatmap(7, 30)
                                                .then(setBeverageHeatmap).catch(() => setBeverageHeatmap(null))
                                                .finally(() => setBeverageHeatmapLoading(false));
                                        }}
                                        disabled={beverageHeatmapLoading}
                                        className="p-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors disabled:opacity-50"
                                        title="Refresh"
                                    >
                                        <RefreshCw className={`w-4 h-4 ${beverageHeatmapLoading ? "animate-spin" : ""}`} />
                                    </button>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="px-3 sm:px-5 pb-5">
                            {beverageHeatmapLoading ? (
                                <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    <span className="text-sm">Loading beverage data…</span>
                                </div>
                            ) : beverageHeatmap && beverageHeatmap.items.length > 0 ? (
                                <IngredientUsageHeatmap
                                    dates={beverageHeatmap.dates}
                                    days={beverageHeatmap.days}
                                    latestDataDate={beverageHeatmap.latestDataDate}
                                    items={beverageHeatmap.items.map(b => ({
                                        ingredientId:   b.inventoryItemId ?? b.itemName,
                                        ingredientName: b.itemName,
                                        unit:           b.unit,
                                        recipeUnit:     b.unit,
                                        purchaseUnit:   b.unit,
                                        conversionRate: 1,
                                        category:       b.category,
                                        totalQty:       b.totalQty,
                                        avgPerDay:      b.avgPerDay,
                                        byDate:         b.byDate,
                                        currentStock:   b.currentStock,
                                        parMin:         b.parMin,
                                        inventoryTracked: b.inventoryTracked,
                                    }))}
                                />
                            ) : (
                                <p className="text-sm text-muted-foreground text-center py-10">
                                    No beverage sales found in the last 7 days.
                                </p>
                            )}
                        </CardContent>
                    </Card>

                    {/* ── Main Curry Usage (by group, from PMIX) ──────────────── */}
                    <Card className="border-amber-200 dark:border-amber-800">
                        <CardHeader className="pb-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                    <CardTitle className="text-sm flex items-center gap-2">
                                        <span className="text-base leading-none">🍛</span>
                                        Main Curry Usage — Last 7 Days (by group)
                                    </CardTitle>
                                    <p className="text-[11px] text-muted-foreground mt-1">
                                        Khao Soi · Green / Panang / Massaman / Tom Kha · Islamic Noodles · Panang group bundles Duck Panang + Malay Curry
                                    </p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <button
                                        onClick={() => curryHeatmap && exportHeatmapToPDF({
                                            title:    "Main Curry Usage — Last 7 Days",
                                            subtitle: "by group · from PMIX Sales",
                                            dates:    curryHeatmap.dates,
                                            days:     curryHeatmap.days,
                                            latestDataDate: curryHeatmap.latestDataDate,
                                            items:    curryHeatmap.items.map(c => ({
                                                name: c.group, subLabel: `(${c.unit})`, unit: c.unit,
                                                byDate: c.byDate, totalQty: c.totalQty, avgPerDay: c.avgPerDay,
                                                currentStock: c.currentStock, parMin: c.parMin,
                                            })),
                                            filenamePrefix: "MainCurryUsage",
                                        })}
                                        disabled={!curryHeatmap || curryHeatmap.items.length === 0 || curryHeatmapLoading}
                                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-xs font-medium touch-manipulation"
                                        title="Export to PDF"
                                    >
                                        <FileDown className="w-4 h-4" />
                                        <span className="hidden sm:inline">Export PDF</span>
                                    </button>
                                    <button
                                        onClick={() => {
                                            setCurryHeatmapLoading(true);
                                            pmixApi.curryHeatmap(7)
                                                .then(setCurryHeatmap).catch(() => setCurryHeatmap(null))
                                                .finally(() => setCurryHeatmapLoading(false));
                                        }}
                                        disabled={curryHeatmapLoading}
                                        className="p-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors disabled:opacity-50"
                                        title="Refresh"
                                    >
                                        <RefreshCw className={`w-4 h-4 ${curryHeatmapLoading ? "animate-spin" : ""}`} />
                                    </button>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="px-3 sm:px-5 pb-5">
                            {curryHeatmapLoading ? (
                                <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    <span className="text-sm">Loading curry data…</span>
                                </div>
                            ) : curryHeatmap && curryHeatmap.items.length > 0 ? (
                                <IngredientUsageHeatmap
                                    dates={curryHeatmap.dates}
                                    days={curryHeatmap.days}
                                    latestDataDate={curryHeatmap.latestDataDate}
                                    items={curryHeatmap.items.map(c => ({
                                        ingredientId:   c.inventoryItemId ?? c.group,
                                        ingredientName: c.group,
                                        unit:           c.unit,
                                        recipeUnit:     c.unit,
                                        purchaseUnit:   c.unit,
                                        conversionRate: 1,
                                        category:       "Main Curry",
                                        totalQty:       c.totalQty,
                                        avgPerDay:      c.avgPerDay,
                                        byDate:         c.byDate,
                                        currentStock:   c.currentStock,
                                        parMin:         c.parMin,
                                        inventoryTracked: c.inventoryTracked,
                                    }))}
                                />
                            ) : (
                                <p className="text-sm text-muted-foreground text-center py-10">
                                    No curry sales found in the last 7 days.
                                </p>
                            )}
                        </CardContent>
                    </Card>

                    {/* ── Inventory Transaction Trend ─────────────────────────── */}
                    <Card>
                        <CardHeader className="pb-3">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <CardTitle className="text-sm flex items-center gap-2">
                                        <TrendingUp className="w-4 h-4 text-red-500" />
                                        7-Day Usage Trend — Top 30 Important Ingredients
                                    </CardTitle>
                                    <p className="text-[11px] text-muted-foreground mt-1">
                                        Qty used (Out + Waste transactions) per day · darker cell = higher usage · intensity is per-ingredient
                                    </p>
                                </div>
                                {/* Controls: window picker + refresh */}
                                <div className="flex items-center gap-2 shrink-0">
                                    <div className="flex items-center gap-1 p-0.5 bg-muted/50 rounded-lg">
                                        {[7, 14, 30].map(d => (
                                            <button key={d}
                                                onClick={() => setTrendDays(d)}
                                                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all
                                                    ${trendDays === d
                                                        ? "bg-background shadow-sm text-foreground"
                                                        : "text-muted-foreground hover:text-foreground"}`}>
                                                {d}d
                                            </button>
                                        ))}
                                    </div>
                                    <button
                                        onClick={() => {
                                            setTrendLoading(true);
                                            inventoryApi.ingredientTrend(trendDays, "Out,Waste", 30)
                                                .then(setTrendData)
                                                .catch(() => setTrendData(null))
                                                .finally(() => setTrendLoading(false));
                                        }}
                                        disabled={trendLoading}
                                        className="p-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors disabled:opacity-50"
                                        title="Refresh"
                                    >
                                        <RefreshCw className={`w-4 h-4 ${trendLoading ? "animate-spin" : ""}`} />
                                    </button>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="px-3 sm:px-5 pb-5">
                            {trendLoading ? (
                                <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    <span className="text-sm">Loading usage data…</span>
                                </div>
                            ) : trendData ? (
                                <IngredientUsageHeatmap
                                    dates={trendData.dates}
                                    items={trendData.items}
                                    days={trendData.days}
                                />
                            ) : (
                                <p className="text-sm text-muted-foreground text-center py-12">
                                    No usage data found. Record &quot;Out&quot; or &quot;Waste&quot; transactions to see the trend.
                                </p>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* ══ EDIT PAR LEVELS DIALOG ════════════════════════════════════════ */}
            <Dialog open={!!parEdit} onOpenChange={v => { if (!v) { setParEdit(null); setParError(null); } }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Edit PAR Levels</DialogTitle>
                        <DialogDescription>
                            {parEdit?.ingredient.name}
                            {(parEdit?.ingredient as (Ingredient & { storageArea?: { name: string } | null }))?.storageArea?.name
                                ? ` · ${(parEdit?.ingredient as Ingredient & { storageArea?: { name: string } | null }).storageArea!.name}`
                                : ""}
                            {" "}— values in {parEdit?.ingredient.recipeUnit}
                        </DialogDescription>
                    </DialogHeader>
                    {parEdit && (() => {
                        const cfg = cfgFor(parEdit.ingredient, parForm.packUnit || null, parForm.packSize ? Number(parForm.packSize) : null);
                        const opts = parUnitOptions(cfg);
                        const previewRecipe = (v: string) => {
                            const r = unitToRecipe(Number(v || 0), parForm.unit, cfg);
                            return parForm.unit === cfg.recipeUnit ? null : `≈ ${trimN(r)} ${cfg.recipeUnit}`;
                        };
                        return (
                            <div className="space-y-4 py-1">
                                {/* Pack config */}
                                <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
                                    <Label className="text-xs font-semibold">Pack / Case size <span className="font-normal text-muted-foreground">(so you can plan in boxes)</span></Label>
                                    <div className="flex items-end gap-2 flex-wrap text-sm">
                                        <span className="text-muted-foreground pb-2">1</span>
                                        <div className="space-y-1">
                                            <Label className="text-[10px] text-muted-foreground">Pack name</Label>
                                            <Input value={parForm.packUnit} placeholder="Case / Box / Pack" className="h-9 w-32"
                                                onChange={e => setParForm(f => ({ ...f, packUnit: e.target.value }))} />
                                        </div>
                                        <span className="text-muted-foreground pb-2">=</span>
                                        <div className="space-y-1">
                                            <Label className="text-[10px] text-muted-foreground">Size</Label>
                                            <Input type="number" min={0} value={parForm.packSize} placeholder="e.g. 50" className="h-9 w-24"
                                                onChange={e => setParForm(f => ({ ...f, packSize: e.target.value }))} />
                                        </div>
                                        <span className="text-muted-foreground pb-2">{parEdit.ingredient.purchaseUnit}</span>
                                    </div>
                                    {hasPack(cfg) && (
                                        <p className="text-[11px] text-muted-foreground">1 {cfg.packUnit} = {trimN(recipeUnitsPerPack(cfg))} {cfg.recipeUnit}</p>
                                    )}
                                </div>

                                {/* Entry unit + auto-fill */}
                                <div className="flex items-end justify-between gap-2 flex-wrap">
                                    <div className="space-y-1">
                                        <Label className="text-xs">Enter PAR levels in</Label>
                                        <Select value={opts.includes(parForm.unit) ? parForm.unit : cfg.recipeUnit} onValueChange={changeParUnit}>
                                            <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                {opts.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs" onClick={autoFillOnePar} disabled={parSaving}>
                                        <Sparkles className="w-3.5 h-3.5 text-primary" /> Auto-fill from PMIX ({parDays}d)
                                    </Button>
                                </div>

                                {/* PAR inputs */}
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="space-y-1">
                                        <Label className="text-xs">Safety (PAR Min)</Label>
                                        <Input type="number" min={0} value={parForm.parMin} autoFocus
                                            onChange={e => setParForm(f => ({ ...f, parMin: e.target.value }))} />
                                        {previewRecipe(parForm.parMin) && <p className="text-[10px] text-muted-foreground tabular-nums">{previewRecipe(parForm.parMin)}</p>}
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs">Reorder (ROP)</Label>
                                        <Input type="number" min={0} value={parForm.reorderPoint}
                                            onChange={e => setParForm(f => ({ ...f, reorderPoint: e.target.value }))} />
                                        {previewRecipe(parForm.reorderPoint) && <p className="text-[10px] text-muted-foreground tabular-nums">{previewRecipe(parForm.reorderPoint)}</p>}
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs">Max (PAR Max)</Label>
                                        <Input type="number" min={0} value={parForm.parMax}
                                            onChange={e => setParForm(f => ({ ...f, parMax: e.target.value }))} />
                                        {previewRecipe(parForm.parMax) && <p className="text-[10px] text-muted-foreground tabular-nums">{previewRecipe(parForm.parMax)}</p>}
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <Label className="text-xs">Lead Time (days)</Label>
                                    <Input type="number" min={1} value={parForm.leadTimeDays} className="w-28"
                                        onChange={e => setParForm(f => ({ ...f, leadTimeDays: e.target.value }))} />
                                </div>
                                {parError && <p className="text-xs text-destructive">{parError}</p>}
                            </div>
                        );
                    })()}
                    <DialogFooter>
                        <Button variant="outline" size="sm" onClick={() => setParEdit(null)} disabled={parSaving}>Cancel</Button>
                        <Button size="sm" onClick={saveParEdit} disabled={parSaving}>
                            {parSaving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />} Save
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ══ ADD TO TRACKING DIALOG ════════════════════════════════════════ */}
            <Dialog open={addOpen} onOpenChange={v => { setAddOpen(v); if (!v) { setAddSearch(""); setAddForm({ ingredientId: "", parMin: "", parMax: "", reorderPoint: "", leadTimeDays: "1" }); } }}>
                <DialogContent className="w-full sm:max-w-lg max-h-[92dvh] flex flex-col p-0 gap-0">
                    <DialogHeader className="px-5 pt-5 pb-3 border-b shrink-0">
                        <DialogTitle>Track Ingredient</DialogTitle>
                        <DialogDescription>Search and select an ingredient to add to live inventory tracking.</DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

                        {/* ── Searchable ingredient picker ── */}
                        <div className="space-y-1.5">
                            <Label>Ingredient <span className="text-destructive">*</span></Label>

                            {untrackedIngr.length === 0 ? (
                                <p className="text-sm text-muted-foreground py-2">All ingredients are already tracked.</p>
                            ) : (() => {
                                const selectedIngr = untrackedIngr.find(i => i.id === addForm.ingredientId);
                                const searchLower  = addSearch.toLowerCase();
                                const filtered     = addSearch.trim()
                                    ? untrackedIngr.filter(i =>
                                        i.name.toLowerCase().includes(searchLower) ||
                                        (i.supplier?.name ?? "").toLowerCase().includes(searchLower) ||
                                        (i.category?.name ?? "").toLowerCase().includes(searchLower) ||
                                        (i.sku ?? "").toLowerCase().includes(searchLower)
                                      )
                                    : untrackedIngr;

                                // Group by category name (or "Uncategorised")
                                const grouped: Record<string, typeof filtered> = {};
                                for (const i of filtered) {
                                    const cat = i.category?.name ?? "Uncategorised";
                                    if (!grouped[cat]) grouped[cat] = [];
                                    grouped[cat].push(i);
                                }
                                const groups = Object.entries(grouped).sort(([a], [b]) =>
                                    a === "Uncategorised" ? 1 : b === "Uncategorised" ? -1 : a.localeCompare(b)
                                );

                                return (
                                    <div className="space-y-2">
                                        {/* Search box */}
                                        <div className="relative">
                                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                            <Input
                                                placeholder="Search by name, category, supplier or SKU…"
                                                className="pl-8 h-9 text-sm"
                                                value={addSearch}
                                                onChange={e => setAddSearch(e.target.value)}
                                                autoFocus
                                            />
                                            {addSearch && (
                                                <button
                                                    type="button"
                                                    className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                                                    onClick={() => setAddSearch("")}
                                                >
                                                    ×
                                                </button>
                                            )}
                                        </div>

                                        {/* Selected chip */}
                                        {selectedIngr && (
                                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-sm">
                                                <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                                                <span className="font-medium text-primary flex-1">{selectedIngr.name}</span>
                                                <span className="text-xs text-muted-foreground">{selectedIngr.recipeUnit}</span>
                                                <button
                                                    type="button"
                                                    className="ml-1 text-muted-foreground hover:text-destructive text-xs"
                                                    onClick={() => setAddForm(f => ({ ...f, ingredientId: "" }))}
                                                >×</button>
                                            </div>
                                        )}

                                        {/* Scrollable grouped list */}
                                        <div className="border rounded-lg overflow-hidden">
                                            <div className="max-h-52 overflow-y-auto">
                                                {filtered.length === 0 ? (
                                                    <p className="text-sm text-muted-foreground text-center py-6">No ingredients match &ldquo;{addSearch}&rdquo;</p>
                                                ) : (
                                                    groups.map(([catName, items]) => (
                                                        <div key={catName}>
                                                            <div className="sticky top-0 bg-muted/80 backdrop-blur-sm px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-b">
                                                                {catName} <span className="font-normal">({items.length})</span>
                                                            </div>
                                                            {items.map(i => {
                                                                const isSelected = addForm.ingredientId === i.id;
                                                                return (
                                                                    <button
                                                                        key={i.id}
                                                                        type="button"
                                                                        onClick={() => { setAddForm(f => ({ ...f, ingredientId: i.id })); setAddSearch(""); }}
                                                                        className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-accent/60 transition-colors text-sm border-b border-border/40 last:border-0 ${isSelected ? "bg-primary/8 font-medium" : ""}`}
                                                                    >
                                                                        {/* Group badge */}
                                                                        <span className={`shrink-0 w-1.5 h-5 rounded-full ${
                                                                            i.groupId === "Weight" ? "bg-amber-400" :
                                                                            i.groupId === "Volume" ? "bg-blue-400" : "bg-purple-400"
                                                                        }`} />
                                                                        <div className="flex-1 min-w-0">
                                                                            <p className="font-medium truncate">{i.name}</p>
                                                                            <p className="text-xs text-muted-foreground truncate">
                                                                                {i.supplier?.name ?? "—"}&ensp;·&ensp;{i.recipeUnit}
                                                                                {i.sku && <span className="ml-1 font-mono opacity-60">{i.sku}</span>}
                                                                            </p>
                                                                        </div>
                                                                        {isSelected && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                            <div className="px-3 py-1.5 bg-muted/30 border-t text-[11px] text-muted-foreground">
                                                {filtered.length} of {untrackedIngr.length} untracked ingredient{untrackedIngr.length !== 1 ? "s" : ""}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label>Safety Stock (PAR Min)</Label>
                                <Input type="number" min={0} placeholder="e.g. 500" value={addForm.parMin} onChange={e => setAddForm(f => ({ ...f, parMin: e.target.value }))} />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Reorder Point</Label>
                                <Input type="number" min={0} placeholder="e.g. 1000" value={addForm.reorderPoint} onChange={e => setAddForm(f => ({ ...f, reorderPoint: e.target.value }))} />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Max Stock (PAR Max)</Label>
                                <Input type="number" min={0} placeholder="e.g. 5000" value={addForm.parMax} onChange={e => setAddForm(f => ({ ...f, parMax: e.target.value }))} />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Lead Time (days)</Label>
                                <Input type="number" min={1} placeholder="1" value={addForm.leadTimeDays} onChange={e => setAddForm(f => ({ ...f, leadTimeDays: e.target.value }))} />
                            </div>
                        </div>

                        <p className="text-xs text-muted-foreground">
                            Stock levels are in the ingredient&apos;s recipe unit. You can update PAR levels later by editing them inline.
                        </p>
                    </div>

                    <div className="px-5 py-4 border-t shrink-0 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                        <Button variant="outline" onClick={() => setAddOpen(false)} disabled={saving}>Cancel</Button>
                        <Button onClick={handleAddToTracking} disabled={saving || !addForm.ingredientId}>
                            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Start Tracking
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
