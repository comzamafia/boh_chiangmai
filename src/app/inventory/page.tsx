"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
    inventoryApi, ingredientsApi, suppliersApi, storageAreasApi, ingredientSuppliersApi,
    pmixApi,
    InventoryItem, InventoryTransaction, InventoryAlert,
    Ingredient, Supplier, StorageArea, IngredientSupplier,
    type IngredientTrendResult, type ProteinHeatmapResult,
} from "@/lib/api";
import IngredientUsageHeatmap from "@/components/inventory/IngredientUsageHeatmap";
import { useCurrency } from "@/components/currency-context";
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
    DollarSign, TrendingUp, RefreshCw,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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

    // Storage area drill-down (null = show area cards, id = show ingredients in area, "unassigned" = show unassigned)
    const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);

    // Receive goods — linked suppliers for selected ingredient
    const [rcvIngSuppliers, setRcvIngSuppliers]   = useState<IngredientSupplier[]>([]);
    const [rcvSupplierId,   setRcvSupplierId]     = useState<string>("");

    // Add to tracking dialog
    const [addOpen,     setAddOpen]     = useState(false);
    const [addForm,     setAddForm]     = useState({ ingredientId: "", parMin: "", parMax: "", reorderPoint: "", leadTimeDays: "1" });
    const [addSearch,   setAddSearch]   = useState("");

    // Receive goods form
    const [rcvForm,     setRcvForm]     = useState({ ingredientId: "", purchaseQty: "", purchasePrice: "", date: today(), note: "" });
    const [rcvResult,   setRcvResult]   = useState<{ stockAdded: number; priceAlert: boolean; priceChangePct: number } | null>(null);

    // Waste log form
    const [wasteForm,   setWasteForm]   = useState({ inventoryItemId: "", ingredientId: "", qty: "", reason: "Spoiled", note: "", date: today() });

    // Stock count state (map id → physical count string)
    const [countMap,    setCountMap]    = useState<Record<string, string>>({});
    const [countSaving, setCountSaving] = useState(false);
    // "purchase" = user enters in purchaseUnit; "recipe" = user enters in recipeUnit
    const [countUnit,   setCountUnit]   = useState<"purchase" | "recipe">("purchase");

    // Txn filter
    const [txnType,     setTxnType]     = useState("all");

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

    // Load protein heatmap when trend tab opens (always 7 days = Mon–Sun latest)
    useEffect(() => {
        if (activeTab !== "trend") return;
        setProteinHeatmapLoading(true);
        pmixApi.proteinHeatmap(7)
            .then(setProteinHeatmap)
            .catch(() => setProteinHeatmap(null))
            .finally(() => setProteinHeatmapLoading(false));
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

    async function handleStockCount() {
        if (Object.keys(countMap).length === 0) return;
        setCountSaving(true);
        try {
            await Promise.all(
                Object.entries(countMap).map(([id, countStr]) => {
                    const item = items.find(i => i.id === id);
                    if (!item || countStr === "") return Promise.resolve();
                    const enteredQty = Number(countStr);
                    // Convert purchase units → recipe units if needed
                    const conv = Number(item.ingredient.conversionRate);
                    const qtyInRecipeUnits =
                        countUnit === "purchase" && conv > 0
                            ? enteredQty * conv
                            : enteredQty;
                    const noteText =
                        countUnit === "purchase"
                            ? `Physical count: ${enteredQty} ${item.ingredient.purchaseUnit} → ${qtyInRecipeUnits.toFixed(3)} ${item.ingredient.recipeUnit}`
                            : "Physical count";
                    return inventoryApi.logTransaction({
                        inventoryItemId: id,
                        ingredientId:    item.ingredientId,
                        type:            "Stocktake",
                        qty:             qtyInRecipeUnits,
                        unit:            item.ingredient.recipeUnit,
                        date:            today(),
                        note:            noteText,
                    });
                })
            );
            await loadData();
            setCountMap({});
        } catch (e) { console.error(e); } finally { setCountSaving(false); }
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
                                                {Number(item.currentStock).toFixed(1)}
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums">
                                                <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                                                    {format(itemStockValue(item))}
                                                </span>
                                            </TableCell>
                                            <TableCell className="hidden md:table-cell">
                                                <StockBar item={item} />
                                            </TableCell>
                                            <TableCell className="hidden lg:table-cell text-right text-xs text-muted-foreground tabular-nums">
                                                {Number(item.parMin).toFixed(0)} / {Number(item.reorderPoint).toFixed(0)} / {Number(item.parMax).toFixed(0)}
                                            </TableCell>
                                            <TableCell><StatusBadge status={status} /></TableCell>
                                            <TableCell>
                                                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => handleRemove(item.id)}>
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
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

                {/* ══ STOCK COUNT (STOCKTAKE) ══════════════════════════════════════ */}
                <TabsContent value="stocktake" className="mt-4 space-y-4">
                    <Card>
                        <CardHeader>
                            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                                <div>
                                    <CardTitle>Physical Stock Count</CardTitle>
                                    <CardDescription className="mt-1">
                                        Enter the physical count for each ingredient. Stock will be updated and a Stocktake transaction logged.
                                    </CardDescription>
                                </div>
                                {/* Unit mode toggle */}
                                <div className="flex items-center gap-1 rounded-lg border p-1 self-start shrink-0">
                                    <button
                                        onClick={() => { setCountUnit("purchase"); setCountMap({}); }}
                                        className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${countUnit === "purchase" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                                    >
                                        Purchase Unit
                                    </button>
                                    <button
                                        onClick={() => { setCountUnit("recipe"); setCountMap({}); }}
                                        className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${countUnit === "recipe" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                                    >
                                        Recipe Unit
                                    </button>
                                </div>
                            </div>
                            {countUnit === "purchase" && (
                                <p className="mt-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md px-3 py-2">
                                    Count in purchase units (e.g. kg, litre, bag). The system will automatically convert to recipe units using the conversion rate.
                                </p>
                            )}
                        </CardHeader>
                        <CardContent>
                            <div className="border rounded-md overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Ingredient</TableHead>
                                            <TableHead className="text-right hidden sm:table-cell">
                                                {countUnit === "purchase" ? "System Stock" : "System Stock"}
                                            </TableHead>
                                            <TableHead className="text-right">
                                                Count ({countUnit === "purchase" ? "Purchase Unit" : "Recipe Unit"})
                                            </TableHead>
                                            {countUnit === "purchase" && (
                                                <TableHead className="text-right hidden md:table-cell">Converted (Recipe)</TableHead>
                                            )}
                                            <TableHead className="text-right hidden md:table-cell">Variance</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {items.map(item => {
                                            const conv          = Number(item.ingredient.conversionRate);
                                            const currentRecipe = Number(item.currentStock);
                                            // Current stock expressed in purchase units
                                            const currentPurch  = conv > 0 ? currentRecipe / conv : null;
                                            const physical      = countMap[item.id];
                                            const enteredQty    = physical !== undefined && physical !== "" ? Number(physical) : null;
                                            // Convert entered qty to recipe units for variance
                                            const enteredRecipe =
                                                enteredQty !== null
                                                    ? countUnit === "purchase" && conv > 0
                                                        ? enteredQty * conv
                                                        : enteredQty
                                                    : null;
                                            const variance = enteredRecipe !== null ? enteredRecipe - currentRecipe : null;
                                            // Display helpers
                                            const sysStockLabel =
                                                countUnit === "purchase" && currentPurch !== null
                                                    ? `${currentPurch.toFixed(3)} ${item.ingredient.purchaseUnit}`
                                                    : `${currentRecipe.toFixed(3)} ${item.ingredient.recipeUnit}`;
                                            const inputUnit =
                                                countUnit === "purchase"
                                                    ? item.ingredient.purchaseUnit
                                                    : item.ingredient.recipeUnit;
                                            const inputStep =
                                                countUnit === "purchase" ? "0.001" : "0.01";
                                            const inputPlaceholder =
                                                countUnit === "purchase" && currentPurch !== null
                                                    ? currentPurch.toFixed(3)
                                                    : currentRecipe.toFixed(2);

                                            return (
                                                <TableRow key={item.id}>
                                                    <TableCell className="font-medium">
                                                        {item.ingredient.name}
                                                        <span className="block text-xs text-muted-foreground">
                                                            {countUnit === "purchase"
                                                                ? `${item.ingredient.purchaseUnit} → ${item.ingredient.recipeUnit} (×${conv})`
                                                                : item.ingredient.recipeUnit}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="text-right hidden sm:table-cell tabular-nums text-sm">
                                                        {sysStockLabel}
                                                        {countUnit === "purchase" && (
                                                            <span className="block text-xs text-muted-foreground">
                                                                = {currentRecipe.toFixed(2)} {item.ingredient.recipeUnit}
                                                            </span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <div className="flex items-center justify-end gap-1.5">
                                                            <Input
                                                                type="number" min={0} step={inputStep}
                                                                placeholder={inputPlaceholder}
                                                                value={countMap[item.id] ?? ""}
                                                                onChange={e => setCountMap(m => ({ ...m, [item.id]: e.target.value }))}
                                                                className="w-28 text-right h-8"
                                                            />
                                                            <span className="text-xs text-muted-foreground whitespace-nowrap">{inputUnit}</span>
                                                        </div>
                                                    </TableCell>
                                                    {countUnit === "purchase" && (
                                                        <TableCell className="text-right hidden md:table-cell tabular-nums text-sm text-muted-foreground">
                                                            {enteredRecipe !== null
                                                                ? `${enteredRecipe.toFixed(2)} ${item.ingredient.recipeUnit}`
                                                                : "—"}
                                                        </TableCell>
                                                    )}
                                                    <TableCell className="text-right hidden md:table-cell tabular-nums">
                                                        {variance !== null && (
                                                            <div>
                                                                <span className={`font-medium text-sm ${variance < 0 ? "text-red-600" : variance > 0 ? "text-green-600" : "text-muted-foreground"}`}>
                                                                    {variance > 0 ? "+" : ""}{variance.toFixed(2)}
                                                                    <span className="text-xs font-normal ml-0.5">{item.ingredient.recipeUnit}</span>
                                                                </span>
                                                                {countUnit === "purchase" && conv > 0 && (
                                                                    <span className={`block text-xs ${variance < 0 ? "text-red-500" : variance > 0 ? "text-green-500" : "text-muted-foreground"}`}>
                                                                        ({variance > 0 ? "+" : ""}{(variance / conv).toFixed(3)} {item.ingredient.purchaseUnit})
                                                                    </span>
                                                                )}
                                                            </div>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                        {items.length === 0 && (
                                            <TableRow>
                                                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                                    No ingredients tracked yet.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                            <div className="flex items-center justify-between mt-4 gap-3 flex-wrap">
                                <p className="text-xs text-muted-foreground">
                                    {Object.values(countMap).filter(v => v !== "").length} of {items.length} items counted
                                </p>
                                <div className="flex gap-2">
                                    {Object.values(countMap).some(v => v !== "") && (
                                        <Button variant="outline" size="sm" onClick={() => setCountMap({})}>
                                            Clear All
                                        </Button>
                                    )}
                                    <Button
                                        onClick={handleStockCount}
                                        disabled={countSaving || Object.values(countMap).every(v => v === "")}
                                    >
                                        {countSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        <ClipboardList className="mr-2 h-4 w-4" /> Save Stock Count
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ══ TRANSACTION HISTORY ═════════════════════════════════════════ */}
                <TabsContent value="history" className="mt-4 space-y-4">
                    <div className="flex items-center gap-3 flex-wrap">
                        <Select value={txnType} onValueChange={setTxnType}>
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
                                {txns.filter(t => txnType === "all" || t.type === txnType).slice(0, 100).map(t => {
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
                                    }))}
                                    days={proteinHeatmap.days}
                                />
                            ) : (
                                <p className="text-sm text-muted-foreground text-center py-10">
                                    No PMIX data found for the last 7 days.
                                    Upload a PMIX report in <a href="/analysis/pmix" className="underline text-primary">PMIX Analytics</a>.
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
