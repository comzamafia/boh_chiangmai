"use client";

import { useState, useEffect, useMemo } from "react";
import { ingredientsApi, suppliersApi, Ingredient, Supplier } from "@/lib/api";

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

type FormState = Omit<Ingredient, "id" | "createdAt" | "updatedAt" | "supplier">;

function emptyForm(suppliers: Supplier[]): FormState {
    return {
        name: "", supplierId: suppliers[0]?.id ?? "",
        purchaseUnit: "kg", purchasePrice: 0,
        recipeUnit: "g", yieldPercent: 100,
        conversionRate: 1000, groupId: "Weight", imageUrl: "",
    };
}

export default function IngredientsPage() {
    const [ingredients, setIngredients] = useState<Ingredient[]>([]);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [groupFilter, setGroupFilter] = useState("all");
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
        Promise.all([ingredientsApi.list(), suppliersApi.list()])
            .then(([ings, sups]) => {
                setIngredients(ings);
                setSuppliers(sups);
                setForm(emptyForm(sups));
            })
            .finally(() => setLoading(false));
    }, []);

    const filtered = useMemo(() => ingredients.filter(i => {
        const matchSearch = i.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (i.supplier?.name ?? "").toLowerCase().includes(searchTerm.toLowerCase());
        const matchGroup = groupFilter === "all" || i.groupId === groupFilter;
        return matchSearch && matchGroup;
    }), [ingredients, searchTerm, groupFilter]);

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
                <p className="text-sm text-muted-foreground">{filtered.length} result{filtered.length !== 1 ? "s" : ""}</p>
            </div>

            {/* Table */}
            <div className="border rounded-lg overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-14">Image</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>Supplier</TableHead>
                            <TableHead>Group</TableHead>
                            <TableHead>Purchase Price</TableHead>
                            <TableHead>
                                <span className="flex items-center gap-1">
                                    Unit Conversion
                                    <span title="How many recipe units are in 1 purchase unit" className="cursor-help">
                                        <Info className="h-3.5 w-3.5 text-muted-foreground" />
                                    </span>
                                </span>
                            </TableHead>
                            <TableHead>Yield %</TableHead>
                            <TableHead>
                                <span className="flex items-center gap-1">
                                    Effective Cost
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
                                    <TableCell>
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
                                    </TableCell>
                                    <TableCell className="text-muted-foreground text-sm">
                                        {item.supplier?.name ?? suppliers.find(s => s.id === item.supplierId)?.name ?? "—"}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline">{item.groupId}</Badge>
                                    </TableCell>
                                    <TableCell className="tabular-nums">
                                        {format(Number(item.purchasePrice))} / {item.purchaseUnit}
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground tabular-nums">
                                        1 {item.purchaseUnit} = {Number(item.conversionRate)} {item.recipeUnit}
                                    </TableCell>
                                    <TableCell>
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
                                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                                    No ingredients found.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* ─── Add / Edit Dialog ─────────────────────────────────────────── */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{editTarget ? "Edit Ingredient" : "Add Ingredient"}</DialogTitle>
                        <DialogDescription>
                            {editTarget ? `Editing ${editTarget.name}` : "Add a raw material with pricing and unit conversion."}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
                        {/* Name */}
                        <div className="col-span-2 space-y-1.5">
                            <Label>Ingredient Name *</Label>
                            <Input placeholder="e.g. Tiger Shrimp"
                                value={form.name}
                                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                        </div>

                        {/* Image URL */}
                        <div className="col-span-2 space-y-1.5">
                            <Label>Image URL <span className="text-muted-foreground text-xs">(optional)</span></Label>
                            <Input placeholder="https://example.com/image.jpg"
                                value={form.imageUrl ?? ""}
                                onChange={e => setForm(f => ({ ...f, imageUrl: e.target.value }))} />
                            {form.imageUrl && (
                                <img src={form.imageUrl} alt="preview"
                                    className="mt-1 h-20 w-20 rounded-lg object-cover border" />
                            )}
                        </div>

                        {/* Supplier */}
                        <div className="space-y-1.5">
                            <Label>Supplier</Label>
                            <Select value={form.supplierId}
                                onValueChange={v => setForm(f => ({ ...f, supplierId: v }))}>
                                <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                                <SelectContent>
                                    {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Unit Group */}
                        <div className="space-y-1.5">
                            <Label>Unit Group</Label>
                            <Select value={form.groupId} onValueChange={handleGroupChange}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Weight">Weight (kg, g, lb, oz)</SelectItem>
                                    <SelectItem value="Volume">Volume (L, ml)</SelectItem>
                                    <SelectItem value="Count">Count (piece, pack, dozen…)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Purchase Unit + Price */}
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
                            <Label>Purchase Price ({symbol} per {form.purchaseUnit})</Label>
                            <Input type="number" min={0} step={0.01}
                                value={form.purchasePrice}
                                onChange={e => setForm(f => ({ ...f, purchasePrice: parseFloat(e.target.value) || 0 }))} />
                        </div>

                        {/* Recipe Unit */}
                        <div className="space-y-1.5">
                            <Label>Recipe Unit</Label>
                            <Select value={form.recipeUnit} onValueChange={handleRecipeUnitChange}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {recipeUnits.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Conversion Rate */}
                        <div className="space-y-1.5">
                            <Label className="flex items-center justify-between">
                                <span>
                                    Conversion Rate
                                    {!sameUnit && (
                                        <span className="text-xs text-muted-foreground ml-1">
                                            1 {form.purchaseUnit} → ? {form.recipeUnit}
                                        </span>
                                    )}
                                </span>
                                {!sameUnit && !customRate && knownRate != null && !rateMatchesStandard && (
                                    <button
                                        type="button"
                                        onClick={autoFillRate}
                                        className="flex items-center gap-1 text-xs text-primary hover:underline"
                                    >
                                        <Wand2 className="h-3 w-3" />
                                        Auto-fill ({knownRate})
                                    </button>
                                )}
                            </Label>

                            {sameUnit ? (
                                /* Same unit — lock to 1 */
                                <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                                    <span className="tabular-nums font-medium text-foreground">1</span>
                                    <span>— same unit, rate is always 1</span>
                                </div>
                            ) : (
                                <Input type="number" min={0.0001} step="any"
                                    value={form.conversionRate}
                                    onChange={e => setForm(f => ({ ...f, conversionRate: parseFloat(e.target.value) || 1 }))} />
                            )}

                            {/* Guidance / validation text */}
                            {sameUnit ? null : customRate ? (
                                <p className="text-xs text-muted-foreground">
                                    Enter how many <strong>{form.recipeUnit}</strong> are in 1 <strong>{form.purchaseUnit}</strong>.
                                    <br />
                                    e.g. 1 bag = 500 g → set recipe unit to <em>g</em> and enter <em>500</em>.
                                </p>
                            ) : knownRate != null ? (
                                <p className="text-xs">
                                    <span className="text-muted-foreground">
                                        1 {form.purchaseUnit} = {form.conversionRate} {form.recipeUnit}
                                    </span>
                                    {rateMatchesStandard ? (
                                        <span className="ml-1.5 text-green-600 font-medium">✓ matches standard</span>
                                    ) : (
                                        <span className="ml-1.5 text-yellow-600">
                                            (standard: {knownRate})
                                        </span>
                                    )}
                                </p>
                            ) : (
                                <p className="text-xs text-muted-foreground">
                                    1 {form.purchaseUnit} = {form.conversionRate} {form.recipeUnit}
                                </p>
                            )}
                        </div>

                        {/* Yield % */}
                        <div className="col-span-2 sm:col-span-1 space-y-1.5">
                            <Label>
                                Yield %
                                <span className="text-xs text-muted-foreground ml-1">(100% = no waste)</span>
                            </Label>
                            <Input type="number" min={1} max={100} step={1}
                                value={form.yieldPercent}
                                onChange={e => setForm(f => ({ ...f, yieldPercent: parseFloat(e.target.value) || 100 }))} />
                        </div>

                        {/* ─── Live cost breakdown ─────────────────────────── */}
                        <div className="col-span-2 rounded-lg border bg-muted/30 p-4 space-y-2 text-sm">
                            <p className="font-semibold text-primary mb-3">Cost Calculation Preview</p>

                            <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5">
                                <span className="text-muted-foreground">Purchase price</span>
                                <span className="tabular-nums font-medium text-right">
                                    {show(form.purchasePrice)} / {form.purchaseUnit}
                                </span>

                                <span className="text-muted-foreground">
                                    ÷ Conversion ({form.conversionRate || 1} {form.recipeUnit}/{form.purchaseUnit})
                                </span>
                                <span className="tabular-nums text-right">
                                    = {show(prevRawCost, 4)} / {form.recipeUnit}
                                </span>

                                {form.yieldPercent < 100 && (
                                    <>
                                        <span className="text-muted-foreground">
                                            ÷ Yield ({form.yieldPercent}% usable → {prevUsableQty.toFixed(2)} {form.recipeUnit} per {form.purchaseUnit})
                                        </span>
                                        <span className="tabular-nums text-right text-yellow-600">
                                            = {show(prevEffCost, 4)} / {form.recipeUnit}
                                        </span>
                                    </>
                                )}
                            </div>

                            <div className="border-t pt-2 flex items-center justify-between">
                                <span className="font-semibold">Effective Cost (used in recipes)</span>
                                <span className="font-bold text-lg text-primary tabular-nums">
                                    {show(prevEffCost, 4)} / {form.recipeUnit || "unit"}
                                </span>
                            </div>

                            {form.yieldPercent < 100 && (
                                <p className="text-xs text-muted-foreground">
                                    Each 1 {form.purchaseUnit} bought gives only {prevUsableQty.toFixed(2)} {form.recipeUnit} of usable ingredient.
                                    The recipe cost uses this yield-adjusted rate.
                                </p>
                            )}
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
                        <Button onClick={handleSave} disabled={!form.name.trim() || !form.supplierId || saving}>
                            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {editTarget ? "Save Changes" : "Add Ingredient"}
                        </Button>
                    </DialogFooter>
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
