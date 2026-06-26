"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
    ingredientsApi, suppliersApi, ingredientCategoriesApi,
    storageAreasApi, ingredientSuppliersApi,
    Ingredient, Supplier, IngredientCategory, StorageArea, IngredientSupplier,
} from "@/lib/api";

// ─── Unit definitions per group ──────────────────────────────────────────────
const GROUP_UNITS: Record<string, string[]> = {
    Weight: ["kg", "g", "lb", "oz"],
    Volume: ["L", "ml", "fl oz", "cup", "tbsp", "tsp"],
    Count:  ["piece", "pc", "dozen", "pack", "bottle", "can", "box", "bag"],
};

// ─── Graph-based unit conversion ──────────────────────────────────────────────
// Each group has a "base unit". Any pair can be computed as:
//   rate(pu → ru) = baseValue[pu] / baseValue[ru]
// Adding a new unit = 1 line. All cross-pairs work automatically.

/** Weight: base unit = gram (g) */
const WEIGHT_TO_G: Record<string, number> = {
    g:   1,
    kg:  1000,
    lb:  453.59237,
    oz:  28.349523,
};

/** Volume: base unit = millilitre (ml) */
const VOLUME_TO_ML: Record<string, number> = {
    ml:       1,
    L:        1000,
    "fl oz":  29.5735,
    cup:      240,        // US cup
    tbsp:     15,         // US tablespoon
    tsp:      5,          // US teaspoon
};

/** Count: base unit = piece. Only units with a fixed piece-count are listed.
 *  pack / bottle / can / box / bag → always "custom" (depends on the product). */
const COUNT_TO_PIECE: Record<string, number> = {
    piece: 1,
    pc:    1,
    dozen: 12,
};

/** Custom-count units (no fixed piece count — user must enter manually). */
const CUSTOM_COUNT_UNITS = new Set(["pack", "bottle", "can", "box", "bag"]);

/**
 * Returns the standard conversion rate: how many `ru` are in 1 `pu`.
 * Returns null when no standard rate exists (cross-group or custom-count units).
 */
function getKnownRate(pu: string, ru: string): number | null {
    if (pu === ru) return 1;
    // Weight ↔ Weight  (any pair, computed via grams)
    if (WEIGHT_TO_G[pu] !== undefined && WEIGHT_TO_G[ru] !== undefined)
        return WEIGHT_TO_G[pu] / WEIGHT_TO_G[ru];
    // Volume ↔ Volume  (any pair, computed via ml)
    if (VOLUME_TO_ML[pu] !== undefined && VOLUME_TO_ML[ru] !== undefined)
        return VOLUME_TO_ML[pu] / VOLUME_TO_ML[ru];
    // Count ↔ Count  (only for units with a known piece count)
    if (COUNT_TO_PIECE[pu] !== undefined && COUNT_TO_PIECE[ru] !== undefined)
        return COUNT_TO_PIECE[pu] / COUNT_TO_PIECE[ru];
    return null; // custom / cross-group — user must enter manually
}

/** True when the conversion rate between two units is always 1 (same unit). */
const isSameUnit = (pu: string, ru: string) => pu === ru;

/** True when the pair has no fixed standard rate (user must define it). */
const isCustomRate = (pu: string, ru: string) =>
    CUSTOM_COUNT_UNITS.has(pu) || CUSTOM_COUNT_UNITS.has(ru);

// ─── Effective cost = (price / conversionRate) / (yieldPercent / 100) ────────
// i.e. cost per USABLE recipe unit, accounting for waste
function effectiveCost(price: number, rate: number, yieldPct: number): number {
    if (!rate || !yieldPct) return 0;
    return (price / rate) / (yieldPct / 100);
}

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Table, TableBody, TableCell, TableHead,
    TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
    Dialog, DialogContent, DialogDescription,
    DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
    Select, SelectContent, SelectItem,
    SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Search, Edit, Trash2, ShoppingCart, Loader2, ImageIcon, Wand2, Info, Warehouse, Star, X as XIcon, PackageCheck, TrendingDown } from "lucide-react";
import Link from "next/link";
import { useCurrency } from "@/components/currency-context";
import { CURRENCIES } from "@/lib/currency";
import { DataPagination, paginate } from "@/components/ui/data-pagination";

type FormState = Omit<Ingredient, "id" | "createdAt" | "updatedAt" | "supplier" | "category" | "storageArea" | "ingredientSuppliers">;

function emptyForm(suppliers: Supplier[]): FormState {
    return {
        name: "", supplierId: suppliers[0]?.id ?? "",
        purchaseUnit: "kg", purchasePrice: 0,
        recipeUnit: "g", yieldPercent: 100,
        conversionRate: 1000, groupId: "Weight", imageUrl: "",
        categoryId: null, sku: "", storageAreaId: null,
    };
}

export default function IngredientsPage() {
    const [ingredients, setIngredients] = useState<Ingredient[]>([]);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [categories, setCategories] = useState<IngredientCategory[]>([]);
    const [storageAreas, setStorageAreas] = useState<StorageArea[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [groupFilter, setGroupFilter] = useState("all");
    const [categoryFilter, setCategoryFilter] = useState("all");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [editTarget, setEditTarget] = useState<Ingredient | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<Ingredient | null>(null);
    const [form, setForm] = useState<FormState>(emptyForm([]));

    // ─── Auto-categorize state ────────────────────────────────────────────────
    const [autoAssigning, setAutoAssigning]       = useState(false);
    const [autoResult, setAutoResult]             = useState<{ assigned: number; skipped: number; details: string[]; unmatched: string[] } | null>(null);
    const [autoResultOpen, setAutoResultOpen]     = useState(false);

    // ─── Multi-supplier panel state ───────────────────────────────────────────
    const [ingSuppliers, setIngSuppliers]       = useState<IngredientSupplier[]>([]);
    const [suppPanelOpen, setSuppPanelOpen]     = useState(false);
    const [suppForm, setSuppForm]               = useState({ supplierId: "", purchasePrice: 0, purchaseUnit: "kg", conversionRate: 1, isPreferred: false, notes: "" });
    const [suppSaving, setSuppSaving]           = useState(false);
    const [suppError, setSuppError]             = useState<string | null>(null);

    const { format, symbol, currency } = useCurrency();
    // rate: 1 THB = X display-currency  (e.g. 0.037 for CAD)
    const rate = CURRENCIES[currency].rateFromTHB;
    // show: format a value that is ALREADY in display currency (no THB conversion)
    const show = (amt: number, dec = 2) => `${symbol}${amt.toFixed(dec)}`;

    useEffect(() => {
        Promise.all([ingredientsApi.list(), suppliersApi.list(), ingredientCategoriesApi.list(), storageAreasApi.list()])
            .then(([ings, sups, cats, areas]) => {
                setIngredients(ings);
                setSuppliers(sups);
                setCategories(cats);
                setStorageAreas(areas.filter((a: StorageArea) => a.isActive));
                setForm(emptyForm(sups));
            })
            .finally(() => setLoading(false));
    }, []);

    const loadIngSuppliers = useCallback(async (ingredientId: string) => {
        try {
            const links = await ingredientSuppliersApi.listForIngredient(ingredientId);
            setIngSuppliers(links);
        } catch { setIngSuppliers([]); }
    }, []);

    const filtered = useMemo(() => {
        const result = ingredients.filter(i => {
            const matchSearch = i.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (i.supplier?.name ?? "").toLowerCase().includes(searchTerm.toLowerCase());
            const matchGroup    = groupFilter === "all" || i.groupId === groupFilter;
            const matchCategory = categoryFilter === "all"
                ? true
                : categoryFilter === "none"
                    ? !i.categoryId
                    : i.categoryId === categoryFilter;
            return matchSearch && matchGroup && matchCategory;
        });
        return result;
    }, [ingredients, searchTerm, groupFilter, categoryFilter]);

    // Reset to page 1 whenever filters change
    useEffect(() => { setPage(1); }, [searchTerm, groupFilter, categoryFilter]);

    const paged = useMemo(() => paginate(filtered, page, pageSize), [filtered, page, pageSize]);

    // ─── Derived cost values ───────────────────────────────────────────────────
    const ingEffCost = (item: Ingredient) =>
        effectiveCost(Number(item.purchasePrice), Number(item.conversionRate), Number(item.yieldPercent));

    /** Cost per recipe unit (no yield adjustment) — for stock value calculation
     *  Stock is already received as usable quantity so we use raw cost/recipe-unit */
    const ingRawCostPerRU = (item: Ingredient) =>
        Number(item.conversionRate) > 0
            ? Number(item.purchasePrice) / Number(item.conversionRate)
            : 0;

    /** Total value of current stock = currentStock (recipe units) × cost per recipe unit */
    const ingStockValue = (item: Ingredient): number => {
        const stock = Number(item.inventoryItem?.currentStock ?? 0);
        return stock * ingRawCostPerRU(item);
    };

    /** Total portfolio value across all ingredients with inventory */
    const totalStockValue = ingredients.reduce((s, i) => s + ingStockValue(i), 0);
    const trackedCount = ingredients.filter(i => i.inventoryItem != null).length;
    const lowStockCount = ingredients.filter(i => {
        const stock = Number(i.inventoryItem?.currentStock ?? 0);
        const parMin = Number(i.inventoryItem?.parMin ?? 0);
        return i.inventoryItem != null && stock < parMin;
    }).length;

    // ─── Form helpers ──────────────────────────────────────────────────────────
    const purchaseUnits = GROUP_UNITS[form.groupId] ?? [];
    const recipeUnits   = form.groupId === "Count"
        ? [...GROUP_UNITS.Count, ...GROUP_UNITS.Weight] // Count items may be portioned by weight
        : GROUP_UNITS[form.groupId] ?? [];

    const knownRate    = getKnownRate(form.purchaseUnit, form.recipeUnit);
    const sameUnit     = isSameUnit(form.purchaseUnit, form.recipeUnit);
    const customRate   = isCustomRate(form.purchaseUnit, form.recipeUnit);
    // Rate is considered "standard match" when it equals the computed known rate (rounded to 6dp)
    const rateMatchesStandard = knownRate != null &&
        Math.abs(form.conversionRate - knownRate) < 0.000001;

    const autoFillRate = () => {
        if (knownRate != null) setForm(f => ({ ...f, conversionRate: knownRate }));
    };

    // Live preview values
    const prevRawCost    = form.purchasePrice / (form.conversionRate || 1);
    const prevUsableQty  = (form.conversionRate || 1) * ((form.yieldPercent || 100) / 100);
    const prevEffCost    = effectiveCost(form.purchasePrice, form.conversionRate, form.yieldPercent);

    // When group changes: reset units to first sensible pair and auto-fill rate
    const handleGroupChange = (g: string) => {
        const pu = GROUP_UNITS[g]?.[0] ?? "kg";
        const ru = GROUP_UNITS[g]?.[1] ?? GROUP_UNITS[g]?.[0] ?? "g";
        const rate = getKnownRate(pu, ru) ?? 1;
        setForm(f => ({ ...f, groupId: g as Ingredient["groupId"], purchaseUnit: pu, recipeUnit: ru, conversionRate: rate }));
    };

    // When purchase unit changes: auto-fill if known
    const handlePurchaseUnitChange = (pu: string) => {
        const rate = getKnownRate(pu, form.recipeUnit);
        setForm(f => ({ ...f, purchaseUnit: pu, ...(rate != null ? { conversionRate: rate } : {}) }));
    };

    // When recipe unit changes: auto-fill if known
    const handleRecipeUnitChange = (ru: string) => {
        const rate = getKnownRate(form.purchaseUnit, ru);
        setForm(f => ({ ...f, recipeUnit: ru, ...(rate != null ? { conversionRate: rate } : {}) }));
    };

    // ─── Dialog open ───────────────────────────────────────────────────────────
    const openAdd = () => {
        setEditTarget(null);
        setIngSuppliers([]);
        setSuppPanelOpen(false);
        setSuppError(null);
        setForm(emptyForm(suppliers));
        setDialogOpen(true);
    };

    const openEdit = (item: Ingredient) => {
        setEditTarget(item);
        setIngSuppliers(item.ingredientSuppliers ?? []);
        setSuppPanelOpen(false);
        setSuppError(null);
        setForm({
            name: item.name, supplierId: item.supplierId,
            purchaseUnit: item.purchaseUnit,
            // DB stores in THB — convert to display currency so the label matches what user sees
            purchasePrice: Number(item.purchasePrice) * rate,
            recipeUnit: item.recipeUnit, yieldPercent: Number(item.yieldPercent),
            conversionRate: Number(item.conversionRate),
            groupId: item.groupId, imageUrl: item.imageUrl ?? "",
            categoryId: item.categoryId ?? null,
            sku: item.sku ?? "",
            storageAreaId: item.storageAreaId ?? null,
        });
        setDialogOpen(true);
    };

    // ─── Supplier link handlers ───────────────────────────────────────────────
    const handleAddIngSupplier = async () => {
        if (!editTarget || !suppForm.supplierId || suppForm.purchasePrice <= 0) {
            setSuppError("Supplier, price and unit are required"); return;
        }
        setSuppSaving(true); setSuppError(null);
        try {
            const link = await ingredientSuppliersApi.create({
                ingredientId:  editTarget.id,
                supplierId:    suppForm.supplierId,
                purchasePrice: suppForm.purchasePrice / rate,  // store in THB
                purchaseUnit:  suppForm.purchaseUnit,
                conversionRate: suppForm.conversionRate,
                isPreferred:   suppForm.isPreferred || ingSuppliers.length === 0,
                notes:         suppForm.notes || undefined,
            });
            setIngSuppliers(prev => ingSuppliers.length === 0 ? [{ ...link, isPreferred: true }] : [...prev, link]);
            setSuppPanelOpen(false);
            setSuppForm({ supplierId: "", purchasePrice: 0, purchaseUnit: "kg", conversionRate: 1, isPreferred: false, notes: "" });
        } catch (e: unknown) {
            setSuppError(e instanceof Error ? e.message : "Failed to add supplier");
        } finally { setSuppSaving(false); }
    };

    const handleDeleteIngSupplier = async (linkId: string) => {
        try {
            await ingredientSuppliersApi.delete(linkId);
            setIngSuppliers(prev => prev.filter(s => s.id !== linkId));
        } catch (e: unknown) {
            setSuppError(e instanceof Error ? e.message : "Failed to remove supplier");
        }
    };

    const handleSetPreferred = async (linkId: string) => {
        try {
            await ingredientSuppliersApi.update(linkId, { isPreferred: true });
            if (editTarget) await loadIngSuppliers(editTarget.id);
        } catch (e: unknown) {
            setSuppError(e instanceof Error ? e.message : "Failed to set preferred");
        }
    };

    // ─── Save / Delete ────────────────────────────────────────────────────────
    const handleSave = async () => {
        if (!form.name.trim() || !form.supplierId) return;
        setSaving(true);
        try {
            // form.purchasePrice is in display currency — convert back to THB for storage
            const payload = {
                ...form,
                purchasePrice: form.purchasePrice / rate,
                sku: form.sku?.trim() || undefined,
                storageAreaId: form.storageAreaId || undefined,
            };
            if (editTarget) {
                const updated = await ingredientsApi.update(editTarget.id, payload);
                setIngredients(prev => prev.map(i => i.id === updated.id ? updated : i));
            } else {
                const created = await ingredientsApi.create(payload);
                setIngredients(prev => [...prev, created]);
            }
            setDialogOpen(false);
        } catch (err) { console.error(err); }
        finally { setSaving(false); }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setSaving(true);
        try {
            await ingredientsApi.delete(deleteTarget.id);
            setIngredients(prev => prev.filter(i => i.id !== deleteTarget.id));
            setDeleteDialogOpen(false);
            setDeleteTarget(null);
        } catch (err) { console.error(err); }
        finally { setSaving(false); }
    };

    const handleAutoAssign = async (overwrite = false) => {
        setAutoAssigning(true);
        try {
            const res = await fetch("/api/ingredients/auto-categorize", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ overwrite }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? "Failed");
            setAutoResult(data);
            setAutoResultOpen(true);
            // Refresh ingredient list so new categories appear
            const refreshed = await ingredientsApi.list();
            setIngredients(refreshed);
        } catch (err) {
            alert(err instanceof Error ? err.message : "Auto-assign failed");
        } finally {
            setAutoAssigning(false);
        }
    };

    if (loading) return (
        <div className="flex justify-center items-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
    );

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex justify-between items-start flex-wrap gap-3">
                <div>
                    <h2 className="text-3xl font-bold font-playfair tracking-tight text-primary">Ingredients</h2>
                    <p className="text-muted-foreground">Manage raw materials, unit conversions and effective costs.</p>
                </div>
                <div className="flex gap-2 flex-wrap justify-end">
                    <Link href="/import-ingredients">
                        <Button variant="outline" className="text-xs sm:text-sm px-3 sm:px-4">
                            Import CSV
                        </Button>
                    </Link>
                    <Button
                        variant="outline"
                        className="text-xs sm:text-sm px-3 sm:px-4"
                        onClick={() => handleAutoAssign(false)}
                        disabled={autoAssigning || categories.length === 0}
                        title={categories.length === 0 ? "Create categories first (Admin → Ing. Categories)" : "Auto-assign categories to unassigned ingredients"}
                    >
                        {autoAssigning
                            ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Assigning…</>
                            : <><Wand2 className="mr-2 h-4 w-4" /> Auto-Assign Categories</>}
                    </Button>
                    {/* Hidden on mobile — FAB handles Add on small screens */}
                    <Button onClick={openAdd} className="hidden sm:flex">
                        <Plus className="mr-2 h-4 w-4" /> Add Ingredient
                    </Button>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {/* Total count */}
                <div className="rounded-xl border bg-card px-4 py-3 flex items-center gap-3">
                    <ShoppingCart className="h-6 w-6 text-primary opacity-70" />
                    <div>
                        <p className="text-xl font-bold text-primary">{ingredients.length}</p>
                        <p className="text-xs text-muted-foreground">Ingredients</p>
                    </div>
                </div>
                {/* Group filters */}
                {(["Weight", "Volume", "Count"] as const).map(g => (
                    <div key={g}
                        className={`rounded-xl border bg-card px-4 py-3 cursor-pointer hover:border-primary/50 transition-colors ${groupFilter === g ? "border-primary bg-primary/5" : ""}`}
                        onClick={() => setGroupFilter(groupFilter === g ? "all" : g)}>
                        <p className="text-xl font-bold">{ingredients.filter(i => i.groupId === g).length}</p>
                        <p className="text-xs text-muted-foreground">{g} {groupFilter === g ? "✓" : ""}</p>
                    </div>
                ))}
                {/* Total stock value */}
                <div className="rounded-xl border bg-card px-4 py-3 flex items-center gap-3 lg:col-span-1">
                    <PackageCheck className="h-6 w-6 text-emerald-600 opacity-80 shrink-0" />
                    <div className="min-w-0">
                        <p className="text-lg font-bold text-emerald-700 tabular-nums truncate">{format(totalStockValue)}</p>
                        <p className="text-xs text-muted-foreground">Stock Value</p>
                        <p className="text-[10px] text-muted-foreground">{trackedCount} tracked</p>
                    </div>
                </div>
                {/* Low stock alert */}
                <div className={`rounded-xl border px-4 py-3 flex items-center gap-3 ${lowStockCount > 0 ? "border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900" : "bg-card"}`}>
                    <TrendingDown className={`h-6 w-6 shrink-0 ${lowStockCount > 0 ? "text-red-500" : "text-muted-foreground opacity-50"}`} />
                    <div>
                        <p className={`text-xl font-bold ${lowStockCount > 0 ? "text-red-600" : "text-muted-foreground"}`}>{lowStockCount}</p>
                        <p className="text-xs text-muted-foreground">Low Stock</p>
                    </div>
                </div>
            </div>

            {/* Search / filter */}
            <div className="space-y-2 sm:space-y-0 sm:flex sm:items-center sm:gap-3 sm:flex-wrap">
                {/* Search — always full-width on mobile */}
                <div className="relative flex-1 min-w-0 sm:min-w-[200px] sm:max-w-sm">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Search ingredients or supplier…" className="pl-8 w-full"
                        value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                </div>
                {/* Filters — inline row on mobile */}
                <div className="flex items-center gap-2 flex-wrap">
                    <Select value={groupFilter} onValueChange={setGroupFilter}>
                        <SelectTrigger className="w-32 sm:w-36 h-9 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Groups</SelectItem>
                            <SelectItem value="Weight">Weight</SelectItem>
                            <SelectItem value="Volume">Volume</SelectItem>
                            <SelectItem value="Count">Count</SelectItem>
                        </SelectContent>
                    </Select>
                    {categories.length > 0 && (
                        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                            <SelectTrigger className="w-36 sm:w-40 h-9 text-sm"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Categories</SelectItem>
                                <SelectItem value="none">Uncategorised</SelectItem>
                                {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    )}
                    <p className="text-sm text-muted-foreground whitespace-nowrap">
                        {filtered.length} result{filtered.length !== 1 ? "s" : ""}
                    </p>
                </div>
            </div>

            {/* ─── Pagination bar ────────────────────────────────────────────── */}
            <DataPagination
                total={filtered.length}
                page={page}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={size => { setPageSize(size); setPage(1); }}
            />

            {/* ─── Mobile card list (sm and below) ──────────────────────────── */}
            <div className="sm:hidden space-y-2">
                {paged.length === 0 && (
                    <p className="text-center py-10 text-sm text-muted-foreground">No ingredients found.</p>
                )}
                {paged.map(item => {
                    const effCost = ingEffCost(item);
                    return (
                        <div key={item.id}
                            className="flex items-center gap-3 rounded-xl border bg-card p-3 shadow-xs">
                            {/* Thumbnail */}
                            {item.imageUrl ? (
                                <img src={item.imageUrl} alt={item.name}
                                    className="h-12 w-12 rounded-lg object-cover border shrink-0" />
                            ) : (
                                <div className="h-12 w-12 rounded-lg border bg-muted flex items-center justify-center shrink-0">
                                    <ImageIcon className="h-5 w-5 text-muted-foreground" />
                                </div>
                            )}

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    <p className="font-semibold text-sm leading-tight truncate">{item.name}</p>
                                    {item.category && (
                                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 shrink-0">
                                            {item.category.name}
                                        </Badge>
                                    )}
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                    {item.supplier?.name ?? "—"}&ensp;·&ensp;{item.groupId}
                                </p>
                                <div className="flex items-center gap-3 mt-1 flex-wrap">
                                    <span className="text-xs text-muted-foreground tabular-nums">
                                        {format(Number(item.purchasePrice))} / {item.purchaseUnit}
                                    </span>
                                    <span className="text-xs font-semibold text-primary tabular-nums">
                                        {format(effCost, 4)} / {item.recipeUnit}
                                    </span>
                                    {Number(item.yieldPercent) < 100 && (
                                        <span className="text-[10px] text-yellow-600 font-medium">
                                            yield {Number(item.yieldPercent)}%
                                        </span>
                                    )}
                                </div>
                                {/* Stock row */}
                                {item.inventoryItem != null && (() => {
                                    const stock = Number(item.inventoryItem!.currentStock);
                                    const parMin = Number(item.inventoryItem!.parMin);
                                    const val = ingStockValue(item);
                                    const isLow = stock < parMin;
                                    return (
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className={`text-xs tabular-nums font-medium ${isLow ? "text-red-600" : "text-foreground"}`}>
                                                {stock % 1 === 0 ? stock : stock.toFixed(2)} {item.recipeUnit}
                                                {isLow && <span className="ml-1 text-[10px] text-red-500">⚠ low</span>}
                                            </span>
                                            <span className="text-[10px] text-muted-foreground">·</span>
                                            <span className="text-xs text-emerald-700 font-semibold tabular-nums">{format(val)}</span>
                                        </div>
                                    );
                                })()}
                            </div>

                            {/* Actions */}
                            <div className="flex flex-col gap-0.5 shrink-0">
                                <Button variant="ghost" size="icon" className="h-9 w-9"
                                    onClick={() => openEdit(item)}>
                                    <Edit className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive hover:text-destructive"
                                    onClick={() => { setDeleteTarget(item); setDeleteDialogOpen(true); }}>
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* ─── Desktop table — 6 columns, no horizontal scroll ──────────── */}
            <div className="hidden sm:block border rounded-lg overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow>
                            {/* 1 – thumbnail */}
                            <TableHead className="w-12 pl-3 pr-0" />
                            {/* 2 – name block (name + category + supplier + group) */}
                            <TableHead>Ingredient</TableHead>
                            {/* 2b – location + tracking */}
                            <TableHead className="w-28">Location</TableHead>
                            {/* 3 – purchase price + conversion */}
                            <TableHead className="w-40">
                                <span className="flex items-center gap-1">
                                    Purchase
                                    <span title="Price per purchase unit. Conversion rate shown below." className="cursor-help">
                                        <Info className="h-3.5 w-3.5 text-muted-foreground" />
                                    </span>
                                </span>
                            </TableHead>
                            {/* 4 – effective cost */}
                            <TableHead className="w-36">
                                <span className="flex items-center gap-1">
                                    Eff. Cost
                                    <span title="Cost per usable recipe unit: (Price ÷ Conversion Rate) ÷ Yield%" className="cursor-help">
                                        <Info className="h-3.5 w-3.5 text-muted-foreground" />
                                    </span>
                                </span>
                            </TableHead>
                            {/* 5 – stock + value combined */}
                            <TableHead className="w-36">
                                <span className="flex items-center gap-1">
                                    Stock
                                    <span title="Current stock level and total cost value." className="cursor-help">
                                        <Info className="h-3.5 w-3.5 text-muted-foreground" />
                                    </span>
                                </span>
                            </TableHead>
                            {/* 6 – actions */}
                            <TableHead className="w-20 text-right pr-3">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {paged.map(item => {
                            const effCost        = ingEffCost(item);
                            const hasYieldLoss   = Number(item.yieldPercent) < 100;
                            const supplierName   = item.supplier?.name ?? suppliers.find(s => s.id === item.supplierId)?.name ?? "—";
                            const rawCostPerRU   = Number(item.purchasePrice) / Number(item.conversionRate);

                            return (
                                <TableRow key={item.id} className="align-top">

                                    {/* 1 ─ Thumbnail */}
                                    <TableCell className="pl-3 pr-0 pt-3 w-12">
                                        {item.imageUrl ? (
                                            <img src={item.imageUrl} alt={item.name}
                                                className="h-9 w-9 rounded-md object-cover border shrink-0" />
                                        ) : (
                                            <div className="h-9 w-9 rounded-md border bg-muted flex items-center justify-center shrink-0">
                                                <ImageIcon className="h-4 w-4 text-muted-foreground" />
                                            </div>
                                        )}
                                    </TableCell>

                                    {/* 2 ─ Ingredient info block */}
                                    <TableCell className="py-2.5">
                                        <p className="font-semibold text-sm leading-tight">
                                            {item.name}
                                            {supplierName === "Owner Sauce" && (
                                                <Badge variant="secondary" className="ml-1.5 text-[10px]">House-made</Badge>
                                            )}
                                        </p>
                                        {/* Category + Group badges */}
                                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                            {item.category && (
                                                <Badge variant="secondary" className="text-[10px] px-1.5 h-4 font-normal">
                                                    {item.category.name}
                                                </Badge>
                                            )}
                                            <Badge variant="outline" className="text-[10px] px-1.5 h-4 font-normal">
                                                {item.groupId}
                                            </Badge>
                                        </div>
                                        {/* Supplier + SKU */}
                                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                            {supplierName}
                                            {item.sku && (
                                                <span className="ml-1.5 font-mono opacity-60">{item.sku}</span>
                                            )}
                                        </p>
                                    </TableCell>

                                    {/* 2b ─ Location + tracking status */}
                                    <TableCell className="py-2.5">
                                        {item.storageArea ? (
                                            <span className="text-xs font-medium">{item.storageArea.name}</span>
                                        ) : (
                                            <span className="text-[10px] text-amber-600">⚠ No area</span>
                                        )}
                                        <div className="mt-0.5">
                                            {item.inventoryItem != null
                                                ? <Badge variant="outline" className="text-[9px] py-0 text-emerald-600 border-emerald-300">Tracked</Badge>
                                                : <Badge variant="outline" className="text-[9px] py-0 text-muted-foreground">Not tracked</Badge>}
                                        </div>
                                    </TableCell>

                                    {/* 3 ─ Purchase price + conversion */}
                                    <TableCell className="py-2.5 tabular-nums">
                                        <p className="text-sm font-medium">
                                            {format(Number(item.purchasePrice))}
                                            <span className="text-muted-foreground font-normal text-xs ml-1">/ {item.purchaseUnit}</span>
                                        </p>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            1 {item.purchaseUnit} = {Number(item.conversionRate)} {item.recipeUnit}
                                        </p>
                                        {hasYieldLoss && (
                                            <p className="text-[10px] text-yellow-600 font-medium mt-0.5">
                                                yield {Number(item.yieldPercent)}%
                                            </p>
                                        )}
                                    </TableCell>

                                    {/* 4 ─ Effective cost */}
                                    <TableCell className="py-2.5 tabular-nums">
                                        <div className="cursor-help" title={
                                            `${format(Number(item.purchasePrice))} ÷ ${Number(item.conversionRate)} = ${format(rawCostPerRU, 4)}/${item.recipeUnit}` +
                                            (hasYieldLoss ? ` ÷ ${Number(item.yieldPercent)}% = ${format(effCost, 4)}/${item.recipeUnit}` : "")
                                        }>
                                            <p className="font-semibold text-primary text-sm">
                                                {format(effCost, 4)}
                                                <span className="text-xs font-normal text-muted-foreground ml-1">/ {item.recipeUnit}</span>
                                            </p>
                                            {hasYieldLoss && (
                                                <p className="text-[10px] text-yellow-600 mt-0.5">yield adj.</p>
                                            )}
                                        </div>
                                    </TableCell>

                                    {/* 5 ─ Stock + value */}
                                    <TableCell className="py-2.5 tabular-nums">
                                        {item.inventoryItem != null ? (() => {
                                            const stock  = Number(item.inventoryItem!.currentStock);
                                            const parMin = Number(item.inventoryItem!.parMin);
                                            const val    = ingStockValue(item);
                                            const isLow  = stock < parMin;
                                            return (
                                                <div>
                                                    <p className={`text-sm font-medium ${isLow ? "text-red-600" : ""}`}>
                                                        {stock % 1 === 0 ? stock.toLocaleString() : stock.toFixed(2)}
                                                        <span className="text-xs font-normal text-muted-foreground ml-1">{item.recipeUnit}</span>
                                                    </p>
                                                    <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mt-0.5">
                                                        {format(val)}
                                                    </p>
                                                    {isLow && (
                                                        <p className="text-[10px] text-red-500 font-medium mt-0.5">⚠ below par</p>
                                                    )}
                                                </div>
                                            );
                                        })() : (
                                            <span className="text-muted-foreground text-xs">—</span>
                                        )}
                                    </TableCell>

                                    {/* 6 ─ Actions */}
                                    <TableCell className="py-2 text-right pr-2">
                                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(item)}>
                                            <Edit className="h-4 w-4" />
                                        </Button>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
                                            onClick={() => { setDeleteTarget(item); setDeleteDialogOpen(true); }}>
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                        {paged.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                    No ingredients found.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>{/* end desktop table */}

            {/* ─── Mobile FAB ── visible only on small screens ──────────────── */}
            <button
                type="button"
                onClick={openAdd}
                aria-label="Add Ingredient"
                className="sm:hidden fixed bottom-6 right-5 z-40 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-xl flex items-center justify-center active:scale-95 transition-transform"
            >
                <Plus className="h-6 w-6" />
            </button>

            {/* ─── Add / Edit Dialog ─────────────────────────────────────────── */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                {/*
                  Mobile  → bottom sheet (slides up, full width, rounded top corners)
                  Desktop → centred modal (sm:max-w-2xl)
                */}
                <DialogContent className={[
                    "flex flex-col p-0 gap-0 max-h-[92dvh]",
                    // mobile: anchor to bottom, full width
                    "top-auto bottom-0 left-0 right-0 translate-x-0 translate-y-0",
                    "w-full max-w-none rounded-t-2xl rounded-b-none",
                    "data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom",
                    // desktop: centred modal
                    "sm:bottom-auto sm:left-[50%] sm:top-[50%]",
                    "sm:translate-x-[-50%] sm:translate-y-[-50%]",
                    "sm:max-w-2xl sm:rounded-xl",
                    "sm:data-[state=open]:slide-in-from-bottom-0 sm:data-[state=open]:zoom-in-95",
                    "sm:data-[state=closed]:zoom-out-95 sm:data-[state=closed]:slide-out-to-bottom-0",
                ].join(" ")}>

                    {/* Drag handle — mobile only */}
                    <div className="sm:hidden flex justify-center pt-3 pb-1 shrink-0">
                        <div className="h-1 w-10 rounded-full bg-muted-foreground/25" />
                    </div>

                    {/* Fixed header */}
                    <DialogHeader className="px-5 pt-3 sm:pt-5 pb-3 border-b shrink-0">
                        <DialogTitle>{editTarget ? "Edit Ingredient" : "Add Ingredient"}</DialogTitle>
                        <DialogDescription>
                            {editTarget ? `Editing ${editTarget.name}` : "Add a raw material with pricing and unit conversion."}
                        </DialogDescription>
                    </DialogHeader>

                    {/* Scrollable body */}
                    <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

                        {/* ── Section: Basic Info ── */}
                        <div className="space-y-3">
                            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Basic Info</p>

                            <div className="space-y-1.5">
                                <Label>Ingredient Name <span className="text-destructive">*</span></Label>
                                <Input placeholder="e.g. Tiger Shrimp"
                                    value={form.name}
                                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label>Supplier <span className="text-destructive">*</span></Label>
                                    <Select value={form.supplierId}
                                        onValueChange={v => setForm(f => ({ ...f, supplierId: v }))}>
                                        <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                                        <SelectContent>
                                            {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-1.5">
                                    <Label>Unit Group</Label>
                                    <Select value={form.groupId} onValueChange={handleGroupChange}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Weight">Weight (kg, g, lb, oz)</SelectItem>
                                            <SelectItem value="Volume">Volume (L, ml, cup…)</SelectItem>
                                            <SelectItem value="Count">Count (piece, pack, dozen…)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <Label>Category <span className="text-xs text-muted-foreground">(optional)</span></Label>
                                {categories.length === 0 ? (
                                    <div className="flex items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
                                        No categories yet —&nbsp;
                                        <a
                                            href="/settings/categories"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-primary underline underline-offset-2 hover:opacity-80"
                                        >
                                            create categories
                                        </a>
                                        &nbsp;first.
                                    </div>
                                ) : (
                                    <Select
                                        value={form.categoryId ?? "none"}
                                        onValueChange={v => setForm(f => ({ ...f, categoryId: v === "none" ? null : v }))}>
                                        <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">— None —</SelectItem>
                                            {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                )}
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label>SKU <span className="text-xs text-muted-foreground">(optional — auto-generated if blank)</span></Label>
                                    <Input
                                        placeholder="e.g. SEA-WGT-TGRSHR"
                                        className="font-mono text-sm"
                                        value={form.sku ?? ""}
                                        onChange={e => setForm(f => ({ ...f, sku: e.target.value }))}
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <Label>
                                        <span className="flex items-center gap-1">
                                            <Warehouse className="h-3.5 w-3.5" />
                                            Storage Area <span className="text-xs text-muted-foreground font-normal">(optional)</span>
                                        </span>
                                    </Label>
                                    <Select
                                        value={form.storageAreaId ?? "__none__"}
                                        onValueChange={v => setForm(f => ({ ...f, storageAreaId: v === "__none__" ? null : v }))}>
                                        <SelectTrigger><SelectValue placeholder="Select area…" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="__none__">— None —</SelectItem>
                                            {storageAreas.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <Label>Image URL <span className="text-xs text-muted-foreground">(optional)</span></Label>
                                <div className="flex items-center gap-3">
                                    <Input placeholder="https://example.com/image.jpg"
                                        className="flex-1"
                                        value={form.imageUrl ?? ""}
                                        onChange={e => setForm(f => ({ ...f, imageUrl: e.target.value }))} />
                                    {form.imageUrl && (
                                        <img src={form.imageUrl} alt="preview"
                                            className="h-10 w-10 rounded-lg object-cover border shrink-0" />
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* ── Section: Purchasing ── */}
                        <div className="space-y-3">
                            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Purchasing</p>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label>Purchase Unit</Label>
                                    <Select value={form.purchaseUnit} onValueChange={handlePurchaseUnitChange}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {purchaseUnits.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-1.5">
                                    <Label>Price / {form.purchaseUnit} ({symbol})</Label>
                                    <Input type="number" min={0} step={0.01}
                                        value={form.purchasePrice}
                                        onChange={e => setForm(f => ({ ...f, purchasePrice: parseFloat(e.target.value) || 0 }))} />
                                </div>
                            </div>
                        </div>

                        {/* ── Section: Recipe Unit & Conversion ── */}
                        <div className="space-y-3">
                            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Recipe Unit & Conversion</p>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label>Recipe Unit</Label>
                                    <Select value={form.recipeUnit} onValueChange={handleRecipeUnitChange}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {recipeUnits.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-1.5">
                                    <Label>
                                        Yield %
                                        <span className="text-xs text-muted-foreground ml-1">100% = no waste</span>
                                    </Label>
                                    <Input type="number" min={1} max={100} step={1}
                                        value={form.yieldPercent}
                                        onChange={e => setForm(f => ({ ...f, yieldPercent: parseFloat(e.target.value) || 100 }))} />
                                </div>
                            </div>

                            {/* Conversion Rate */}
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <Label className="leading-none">
                                        Conversion Rate
                                        {!sameUnit && (
                                            <span className="text-xs text-muted-foreground ml-1.5 font-normal">
                                                1 {form.purchaseUnit} = ? {form.recipeUnit}
                                            </span>
                                        )}
                                    </Label>
                                    {!sameUnit && !customRate && knownRate != null && !rateMatchesStandard && (
                                        <button
                                            type="button"
                                            onClick={autoFillRate}
                                            className="flex items-center gap-1 text-xs text-primary hover:underline shrink-0"
                                        >
                                            <Wand2 className="h-3 w-3" />
                                            Auto-fill ({knownRate})
                                        </button>
                                    )}
                                </div>

                                {sameUnit ? (
                                    <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                                        <span className="tabular-nums font-medium text-foreground">1</span>
                                        <span>— same unit, rate is always 1</span>
                                    </div>
                                ) : (
                                    <Input type="number" min={0.0001} step="any"
                                        value={form.conversionRate}
                                        onChange={e => setForm(f => ({ ...f, conversionRate: parseFloat(e.target.value) || 1 }))} />
                                )}

                                {sameUnit ? null : customRate ? (
                                    <p className="text-xs text-muted-foreground">
                                        Enter how many <strong>{form.recipeUnit}</strong> are in 1 <strong>{form.purchaseUnit}</strong>.
                                        e.g. 1 bag = 500 g → recipe unit: g, enter 500.
                                    </p>
                                ) : knownRate != null ? (
                                    <p className="text-xs">
                                        <span className="text-muted-foreground">1 {form.purchaseUnit} = {form.conversionRate} {form.recipeUnit}</span>
                                        {rateMatchesStandard
                                            ? <span className="ml-1.5 text-green-600 font-medium">✓ standard</span>
                                            : <span className="ml-1.5 text-yellow-600">(standard: {knownRate})</span>
                                        }
                                    </p>
                                ) : (
                                    <p className="text-xs text-muted-foreground">
                                        1 {form.purchaseUnit} = {form.conversionRate} {form.recipeUnit}
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* ── Section: Linked Suppliers (edit mode only) ── */}
                        {editTarget && (
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Linked Suppliers</p>
                                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                                        onClick={() => { setSuppPanelOpen(p => !p); setSuppError(null); }}>
                                        <Plus className="h-3 w-3" />
                                        Add Supplier
                                    </Button>
                                </div>

                                {suppError && (
                                    <p className="text-xs text-destructive">{suppError}</p>
                                )}

                                {/* Add Supplier inline form */}
                                {suppPanelOpen && (
                                    <div className="rounded-lg border p-3 space-y-2 bg-muted/20">
                                        <p className="text-xs font-semibold text-muted-foreground">New Supplier Link</p>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="space-y-1 col-span-2">
                                                <Label className="text-xs">Supplier</Label>
                                                <Select value={suppForm.supplierId}
                                                    onValueChange={v => setSuppForm(f => ({ ...f, supplierId: v }))}>
                                                    <SelectTrigger className="h-8 text-sm">
                                                        <SelectValue placeholder="Select supplier…" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {suppliers
                                                            .filter(s => !ingSuppliers.some(l => l.supplierId === s.id))
                                                            .map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-xs">Purchase Unit</Label>
                                                <Input className="h-8 text-sm" value={suppForm.purchaseUnit}
                                                    onChange={e => setSuppForm(f => ({ ...f, purchaseUnit: e.target.value }))} />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-xs">Price / unit ({symbol})</Label>
                                                <Input type="number" min={0} step={0.01} className="h-8 text-sm"
                                                    value={suppForm.purchasePrice}
                                                    onChange={e => setSuppForm(f => ({ ...f, purchasePrice: parseFloat(e.target.value) || 0 }))} />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-xs">Conversion Rate</Label>
                                                <Input type="number" min={0.0001} step="any" className="h-8 text-sm"
                                                    value={suppForm.conversionRate}
                                                    onChange={e => setSuppForm(f => ({ ...f, conversionRate: parseFloat(e.target.value) || 1 }))} />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-xs">Notes</Label>
                                                <Input className="h-8 text-sm" placeholder="optional"
                                                    value={suppForm.notes}
                                                    onChange={e => setSuppForm(f => ({ ...f, notes: e.target.value }))} />
                                            </div>
                                        </div>
                                        <div className="flex justify-end gap-2 pt-1">
                                            <Button size="sm" variant="ghost" className="h-7 text-xs"
                                                onClick={() => setSuppPanelOpen(false)}>Cancel</Button>
                                            <Button size="sm" className="h-7 text-xs" onClick={handleAddIngSupplier}
                                                disabled={suppSaving || !suppForm.supplierId}>
                                                {suppSaving && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                                                Add Link
                                            </Button>
                                        </div>
                                    </div>
                                )}

                                {/* Linked supplier list */}
                                {ingSuppliers.length === 0 ? (
                                    <p className="text-xs text-muted-foreground italic">No supplier links yet. Add one to enable supplier selection in Receive Goods.</p>
                                ) : (
                                    <div className="space-y-1">
                                        {ingSuppliers.map(link => (
                                            <div key={link.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm bg-card">
                                                <div className="flex-1 min-w-0">
                                                    <span className="font-medium truncate">{link.supplier?.name ?? "—"}</span>
                                                    <span className="ml-2 text-xs text-muted-foreground tabular-nums">
                                                        {symbol}{(Number(link.purchasePrice) * rate).toFixed(2)} / {link.purchaseUnit}
                                                        &ensp;·&ensp;1 {link.purchaseUnit} = {link.conversionRate} {form.recipeUnit}
                                                    </span>
                                                </div>
                                                {link.isPreferred ? (
                                                    <Badge variant="secondary" className="text-[10px] shrink-0 gap-0.5">
                                                        <Star className="h-2.5 w-2.5 fill-current" /> Preferred
                                                    </Badge>
                                                ) : (
                                                    <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0"
                                                        title="Set as preferred"
                                                        onClick={() => handleSetPreferred(link.id)}>
                                                        <Star className="h-3 w-3" />
                                                    </Button>
                                                )}
                                                <Button size="icon" variant="ghost"
                                                    className="h-6 w-6 shrink-0 text-destructive hover:text-destructive"
                                                    onClick={() => handleDeleteIngSupplier(link.id)}>
                                                    <XIcon className="h-3 w-3" />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ── Live Cost Preview ── */}
                        <div className="rounded-lg border bg-muted/30 p-3 space-y-2 text-sm">
                            <p className="text-xs font-semibold uppercase tracking-widest text-primary">Cost Preview</p>

                            <div className="space-y-1 text-sm">
                                <div className="flex justify-between gap-2">
                                    <span className="text-muted-foreground truncate">Buy price</span>
                                    <span className="tabular-nums font-medium shrink-0">
                                        {show(form.purchasePrice)} / {form.purchaseUnit}
                                    </span>
                                </div>
                                <div className="flex justify-between gap-2">
                                    <span className="text-muted-foreground truncate">÷ Conversion ({form.conversionRate || 1})</span>
                                    <span className="tabular-nums shrink-0">
                                        = {show(prevRawCost, 4)} / {form.recipeUnit}
                                    </span>
                                </div>
                                {form.yieldPercent < 100 && (
                                    <div className="flex justify-between gap-2">
                                        <span className="text-muted-foreground truncate">÷ Yield ({form.yieldPercent}%)</span>
                                        <span className="tabular-nums text-yellow-600 shrink-0">
                                            = {show(prevEffCost, 4)} / {form.recipeUnit}
                                        </span>
                                    </div>
                                )}
                            </div>

                            <div className="border-t pt-2 flex items-center justify-between gap-2">
                                <span className="font-semibold text-sm">Effective Cost</span>
                                <span className="font-bold text-base text-primary tabular-nums shrink-0">
                                    {show(prevEffCost, 4)} / {form.recipeUnit || "unit"}
                                </span>
                            </div>

                            {form.yieldPercent < 100 && (
                                <p className="text-xs text-muted-foreground">
                                    1 {form.purchaseUnit} yields only {prevUsableQty.toFixed(2)} {form.recipeUnit} usable.
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Fixed footer */}
                    <div className="px-5 py-4 border-t shrink-0 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                        <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
                        <Button onClick={handleSave} disabled={!form.name.trim() || !form.supplierId || saving}>
                            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {editTarget ? "Save Changes" : "Add Ingredient"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* ─── Delete Dialog ─────────────────────────────────────────────── */}
            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Delete Ingredient</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={saving}>Cancel</Button>
                        <Button variant="destructive" onClick={handleDelete} disabled={saving}>
                            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ─── Auto-Assign Results Dialog ────────────────────────────────── */}
            <Dialog open={autoResultOpen} onOpenChange={setAutoResultOpen}>
                <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col p-0 gap-0">
                    <DialogHeader className="px-5 pt-5 pb-3 border-b shrink-0">
                        <DialogTitle className="flex items-center gap-2">
                            <Wand2 className="h-5 w-5 text-primary" /> Auto-Assign Results
                        </DialogTitle>
                        <DialogDescription>
                            {autoResult && (
                                <span>
                                    <span className="text-green-600 font-semibold">{autoResult.assigned} ingredient{autoResult.assigned !== 1 ? "s" : ""} assigned</span>
                                    {autoResult.skipped > 0 && <span className="text-muted-foreground"> · {autoResult.skipped} could not be matched</span>}
                                </span>
                            )}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 text-sm">
                        {autoResult && autoResult.assigned > 0 && (
                            <div>
                                <p className="font-semibold text-green-700 dark:text-green-400 mb-2">✓ Assigned ({autoResult.assigned})</p>
                                <div className="space-y-1 max-h-48 overflow-y-auto border rounded-md p-2 bg-green-50 dark:bg-green-950/20">
                                    {autoResult.details.map((d, i) => (
                                        <p key={i} className="text-xs text-green-800 dark:text-green-300">{d}</p>
                                    ))}
                                </div>
                            </div>
                        )}
                        {autoResult && autoResult.unmatched.length > 0 && (
                            <div>
                                <p className="font-semibold text-muted-foreground mb-2">— No match found ({autoResult.unmatched.length})</p>
                                <div className="space-y-1 max-h-40 overflow-y-auto border rounded-md p-2 bg-muted/30">
                                    {autoResult.unmatched.map((n, i) => (
                                        <p key={i} className="text-xs text-muted-foreground">{n}</p>
                                    ))}
                                </div>
                                <p className="text-xs text-muted-foreground mt-2">
                                    Assign these manually or click <strong>Re-run (all)</strong> after adding more keyword rules.
                                </p>
                            </div>
                        )}
                    </div>

                    <div className="px-5 py-4 border-t shrink-0 flex flex-col sm:flex-row justify-between gap-2">
                        <Button
                            variant="outline" size="sm"
                            onClick={() => { setAutoResultOpen(false); handleAutoAssign(true); }}
                            disabled={autoAssigning}
                        >
                            Re-run (overwrite all)
                        </Button>
                        <Button onClick={() => setAutoResultOpen(false)}>Done</Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
