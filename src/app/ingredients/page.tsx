"use client";

import { useState, useEffect, useMemo } from "react";
import { ingredientsApi, suppliersApi, ingredientCategoriesApi, Ingredient, Supplier, IngredientCategory } from "@/lib/api";

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
import { Plus, Search, Edit, Trash2, ShoppingCart, Loader2, ImageIcon, Wand2, Info } from "lucide-react";
import Link from "next/link";
import { useCurrency } from "@/components/currency-context";
import { CURRENCIES } from "@/lib/currency";

type FormState = Omit<Ingredient, "id" | "createdAt" | "updatedAt" | "supplier" | "category">;

function emptyForm(suppliers: Supplier[]): FormState {
    return {
        name: "", supplierId: suppliers[0]?.id ?? "",
        purchaseUnit: "kg", purchasePrice: 0,
        recipeUnit: "g", yieldPercent: 100,
        conversionRate: 1000, groupId: "Weight", imageUrl: "",
        categoryId: null,
    };
}

export default function IngredientsPage() {
    const [ingredients, setIngredients] = useState<Ingredient[]>([]);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [categories, setCategories] = useState<IngredientCategory[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [groupFilter, setGroupFilter] = useState("all");
    const [categoryFilter, setCategoryFilter] = useState("all");
    const [dialogOpen, setDialogOpen] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [editTarget, setEditTarget] = useState<Ingredient | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<Ingredient | null>(null);
    const [form, setForm] = useState<FormState>(emptyForm([]));

    const { format, symbol, currency } = useCurrency();
    // rate: 1 THB = X display-currency  (e.g. 0.037 for CAD)
    const rate = CURRENCIES[currency].rateFromTHB;
    // show: format a value that is ALREADY in display currency (no THB conversion)
    const show = (amt: number, dec = 2) => `${symbol}${amt.toFixed(dec)}`;

    useEffect(() => {
        Promise.all([ingredientsApi.list(), suppliersApi.list(), ingredientCategoriesApi.list()])
            .then(([ings, sups, cats]) => {
                setIngredients(ings);
                setSuppliers(sups);
                setCategories(cats);
                setForm(emptyForm(sups));
            })
            .finally(() => setLoading(false));
    }, []);

    const filtered = useMemo(() => ingredients.filter(i => {
        const matchSearch = i.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (i.supplier?.name ?? "").toLowerCase().includes(searchTerm.toLowerCase());
        const matchGroup    = groupFilter === "all" || i.groupId === groupFilter;
        const matchCategory = categoryFilter === "all"
            ? true
            : categoryFilter === "none"
                ? !i.categoryId
                : i.categoryId === categoryFilter;
        return matchSearch && matchGroup && matchCategory;
    }), [ingredients, searchTerm, groupFilter, categoryFilter]);

    // ─── Derived cost values ───────────────────────────────────────────────────
    const ingEffCost = (item: Ingredient) =>
        effectiveCost(Number(item.purchasePrice), Number(item.conversionRate), Number(item.yieldPercent));

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
        setForm(emptyForm(suppliers));
        setDialogOpen(true);
    };

    const openEdit = (item: Ingredient) => {
        setEditTarget(item);
        setForm({
            name: item.name, supplierId: item.supplierId,
            purchaseUnit: item.purchaseUnit,
            // DB stores in THB — convert to display currency so the label matches what user sees
            purchasePrice: Number(item.purchasePrice) * rate,
            recipeUnit: item.recipeUnit, yieldPercent: Number(item.yieldPercent),
            conversionRate: Number(item.conversionRate),
            groupId: item.groupId, imageUrl: item.imageUrl ?? "",
            categoryId: item.categoryId ?? null,
        });
        setDialogOpen(true);
    };

    // ─── Save / Delete ────────────────────────────────────────────────────────
    const handleSave = async () => {
        if (!form.name.trim() || !form.supplierId) return;
        setSaving(true);
        try {
            // form.purchasePrice is in display currency — convert back to THB for storage
            const payload = { ...form, purchasePrice: form.purchasePrice / rate };
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
                <div className="flex gap-2">
                    <Link href="/import-ingredients">
                        <Button variant="outline">Import CSV</Button>
                    </Link>
                    <Button onClick={openAdd}>
                        <Plus className="mr-2 h-4 w-4" /> Add Ingredient
                    </Button>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="rounded-xl border bg-card px-4 py-3 flex items-center gap-3">
                    <ShoppingCart className="h-7 w-7 text-primary opacity-70" />
                    <div>
                        <p className="text-xl font-bold text-primary">{ingredients.length}</p>
                        <p className="text-xs text-muted-foreground">Total</p>
                    </div>
                </div>
                {(["Weight", "Volume", "Count"] as const).map(g => (
                    <div key={g}
                        className="rounded-xl border bg-card px-4 py-3 cursor-pointer hover:border-primary/50 transition-colors"
                        onClick={() => setGroupFilter(groupFilter === g ? "all" : g)}>
                        <p className="text-xl font-bold">{ingredients.filter(i => i.groupId === g).length}</p>
                        <p className="text-xs text-muted-foreground">{g} {groupFilter === g ? "✓" : ""}</p>
                    </div>
                ))}
            </div>

            {/* Search / filter */}
            <div className="flex items-center gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Search ingredients or supplier…" className="pl-8"
                        value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                </div>
                <Select value={groupFilter} onValueChange={setGroupFilter}>
                    <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Groups</SelectItem>
                        <SelectItem value="Weight">Weight</SelectItem>
                        <SelectItem value="Volume">Volume</SelectItem>
                        <SelectItem value="Count">Count</SelectItem>
                    </SelectContent>
                </Select>
                {categories.length > 0 && (
                    <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                        <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Categories</SelectItem>
                            <SelectItem value="none">Uncategorised</SelectItem>
                            {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                )}
                <p className="text-sm text-muted-foreground">{filtered.length} result{filtered.length !== 1 ? "s" : ""}</p>
            </div>

            {/* Table */}
            <div className="border rounded-lg overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-14 hidden sm:table-cell">Image</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead className="hidden sm:table-cell">Supplier</TableHead>
                            <TableHead className="hidden lg:table-cell">Category</TableHead>
                            <TableHead className="hidden md:table-cell">Group</TableHead>
                            <TableHead>Purchase Price</TableHead>
                            <TableHead className="hidden lg:table-cell">
                                <span className="flex items-center gap-1">
                                    Unit Conversion
                                    <span title="How many recipe units are in 1 purchase unit" className="cursor-help">
                                        <Info className="h-3.5 w-3.5 text-muted-foreground" />
                                    </span>
                                </span>
                            </TableHead>
                            <TableHead className="hidden md:table-cell">Yield %</TableHead>
                            <TableHead>
                                <span className="flex items-center gap-1">
                                    Eff. Cost
                                    <span title="Cost per usable recipe unit after yield loss. Formula: (Purchase Price ÷ Conversion Rate) ÷ (Yield% ÷ 100)" className="cursor-help">
                                        <Info className="h-3.5 w-3.5 text-muted-foreground" />
                                    </span>
                                </span>
                            </TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filtered.map(item => {
                            const rawCostPerRecipeUnit = Number(item.purchasePrice) / Number(item.conversionRate);
                            const effCost = ingEffCost(item);
                            const hasYieldLoss = Number(item.yieldPercent) < 100;
                            return (
                                <TableRow key={item.id}>
                                    <TableCell className="hidden sm:table-cell">
                                        {item.imageUrl ? (
                                            <img src={item.imageUrl} alt={item.name}
                                                className="h-10 w-10 rounded-md object-cover border" />
                                        ) : (
                                            <div className="h-10 w-10 rounded-md border bg-muted flex items-center justify-center">
                                                <ImageIcon className="h-5 w-5 text-muted-foreground" />
                                            </div>
                                        )}
                                    </TableCell>
                                    <TableCell className="font-medium">
                                        {item.name}
                                        {item.supplier?.name === "Owner Sauce" && (
                                            <Badge variant="secondary" className="ml-2 text-[10px]">House-made</Badge>
                                        )}
                                        {/* Supplier shown inline on mobile */}
                                        <p className="sm:hidden text-xs text-muted-foreground mt-0.5">
                                            {item.supplier?.name ?? suppliers.find(s => s.id === item.supplierId)?.name ?? "—"}
                                        </p>
                                    </TableCell>
                                    <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                                        {item.supplier?.name ?? suppliers.find(s => s.id === item.supplierId)?.name ?? "—"}
                                    </TableCell>
                                    <TableCell className="hidden lg:table-cell text-sm">
                                        {item.category
                                            ? <Badge variant="secondary">{item.category.name}</Badge>
                                            : <span className="text-muted-foreground text-xs">—</span>}
                                    </TableCell>
                                    <TableCell className="hidden md:table-cell">
                                        <Badge variant="outline">{item.groupId}</Badge>
                                    </TableCell>
                                    <TableCell className="tabular-nums text-sm">
                                        {format(Number(item.purchasePrice))} / {item.purchaseUnit}
                                    </TableCell>
                                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground tabular-nums">
                                        1 {item.purchaseUnit} = {Number(item.conversionRate)} {item.recipeUnit}
                                    </TableCell>
                                    <TableCell className="hidden md:table-cell">
                                        <span className={Number(item.yieldPercent) < 90 ? "text-yellow-600 font-semibold" : ""}>
                                            {Number(item.yieldPercent)}%
                                        </span>
                                    </TableCell>
                                    <TableCell>
                                        <div className="cursor-help" title={
                                            `1 ${item.purchaseUnit} @ ${format(Number(item.purchasePrice))} = ${Number(item.conversionRate)} ${item.recipeUnit} → raw ${format(rawCostPerRecipeUnit, 4)}/${item.recipeUnit}` +
                                            (hasYieldLoss ? ` ÷ ${Number(item.yieldPercent)}% yield → usable ${format(effCost, 4)}/${item.recipeUnit}` : "")
                                        }>
                                            <span className="font-semibold text-primary tabular-nums">
                                                {format(effCost, 4)}
                                            </span>
                                            <span className="text-xs text-muted-foreground ml-1">/ {item.recipeUnit}</span>
                                            {hasYieldLoss && (
                                                <span className="ml-1 text-[10px] text-yellow-600 font-medium">
                                                    (yield adj.)
                                                </span>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button variant="ghost" size="icon" onClick={() => openEdit(item)}>
                                            <Edit className="h-4 w-4" />
                                        </Button>
                                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive"
                                            onClick={() => { setDeleteTarget(item); setDeleteDialogOpen(true); }}>
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                        {filtered.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                                    No ingredients found.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* ─── Add / Edit Dialog ─────────────────────────────────────────── */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="w-full sm:max-w-2xl max-h-[92dvh] flex flex-col p-0 gap-0">
                    {/* Fixed header */}
                    <DialogHeader className="px-5 pt-5 pb-3 border-b shrink-0">
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

                            {categories.length > 0 && (
                                <div className="space-y-1.5">
                                    <Label>Category <span className="text-xs text-muted-foreground">(optional)</span></Label>
                                    <Select
                                        value={form.categoryId ?? "none"}
                                        onValueChange={v => setForm(f => ({ ...f, categoryId: v === "none" ? null : v }))}>
                                        <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">— None —</SelectItem>
                                            {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}

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
        </div>
    );
}
