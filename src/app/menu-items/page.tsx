"use client";

import { useState, useEffect, useMemo } from "react";
import { recipesApi, RecipeWithIngredients } from "@/lib/api";
import { useCurrency } from "@/components/currency-context";
import { CURRENCIES } from "@/lib/currency";
import { useCategories } from "@/lib/use-categories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
    Table, TableBody, TableCell,
    TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
    Select, SelectContent, SelectItem,
    SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
    Search, Loader2, ImageIcon, ArrowUpDown,
    UtensilsCrossed, Bike, TrendingDown, TrendingUp,
    Clock, ChefHat, Zap, Users, X,
} from "lucide-react";

// ─── Cost helpers ─────────────────────────────────────────────────────────────
function calcIngredientCost(recipe: RecipeWithIngredients): number {
    return recipe.ingredients.reduce((sum, row) => {
        const ing = row.ingredient;
        const cpu = Number(ing.purchasePrice) / Number(ing.conversionRate) / (Number(ing.yieldPercent) / 100);
        return sum + cpu * Number(row.quantity);
    }, 0);
}

function fcColor(pct: number) {
    if (pct <= 30) return "text-green-600 dark:text-green-400";
    if (pct <= 40) return "text-yellow-600 dark:text-yellow-400";
    return "text-red-600 dark:text-red-400";
}
function fcLabel(pct: number) {
    if (pct <= 30) return "Excellent";
    if (pct <= 40) return "Acceptable";
    return "Too High";
}
function fcBadgeClass(pct: number) {
    if (pct <= 30) return "bg-green-100 text-green-800 border-green-200 dark:bg-green-950/40 dark:text-green-400 dark:border-green-800";
    if (pct <= 40) return "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-400 dark:border-yellow-800";
    return "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800";
}

type SortKey = "name" | "category" | "cost" | "fc" | "price";
type SortDir  = "asc" | "desc";

// ─── Recipe Detail Dialog ─────────────────────────────────────────────────────
function RecipeDetailDialog({
    recipe, open, onClose,
    costPerServing, diningPrice, deliveryPrice, fcPct, deliveryFcPct,
    format, show,
}: {
    recipe: RecipeWithIngredients;
    open: boolean;
    onClose: () => void;
    costPerServing: number;
    diningPrice: number | null;
    deliveryPrice: number | null;
    fcPct: number | null;
    deliveryFcPct: number | null;
    format: (n: number, d?: number) => string;
    show: (n: number, d?: number) => string;
}) {
    const laborCost = Number(recipe.laborCostPerHour) *
        ((Number(recipe.prepTime) + Number(recipe.cookTime)) / 60);
    const energyCost = Number(recipe.energyCostPerBatch);
    const yieldQty = Number(recipe.yieldAmount) || 1;

    const steps = recipe.instructions
        ? recipe.instructions.split("\n").map(s => s.trim()).filter(Boolean)
        : [];

    return (
        <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0">
                {/* Hero image */}
                <div className="relative h-48 sm:h-56 bg-muted shrink-0 overflow-hidden rounded-t-lg">
                    {recipe.imageUrl ? (
                        <img
                            src={recipe.imageUrl}
                            alt={recipe.name}
                            className="w-full h-full object-cover"
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center">
                            <ImageIcon className="h-16 w-16 text-muted-foreground/30" />
                        </div>
                    )}
                    {/* Gradient overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                    {/* Title on image */}
                    <div className="absolute bottom-0 left-0 p-4">
                        <Badge variant="secondary" className="mb-1.5 text-xs">{recipe.category}</Badge>
                        <h2 className="text-xl sm:text-2xl font-bold font-playfair text-white leading-tight">
                            {recipe.name}
                        </h2>
                    </div>
                    {/* Close button */}
                    <button
                        onClick={onClose}
                        className="absolute top-3 right-3 h-7 w-7 rounded-full bg-black/40 hover:bg-black/60 flex items-center justify-center text-white transition-colors"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="p-5 space-y-5">
                    {/* Quick stats row */}
                    <div className="grid grid-cols-4 gap-2 text-center">
                        <div className="rounded-lg bg-muted/50 px-2 py-2.5">
                            <Clock className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                            <p className="text-xs text-muted-foreground">Prep</p>
                            <p className="text-sm font-semibold">{recipe.prepTime}m</p>
                        </div>
                        <div className="rounded-lg bg-muted/50 px-2 py-2.5">
                            <ChefHat className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                            <p className="text-xs text-muted-foreground">Cook</p>
                            <p className="text-sm font-semibold">{recipe.cookTime}m</p>
                        </div>
                        <div className="rounded-lg bg-muted/50 px-2 py-2.5">
                            <Users className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                            <p className="text-xs text-muted-foreground">Yield</p>
                            <p className="text-sm font-semibold">{recipe.yieldAmount} {recipe.yieldUnit}</p>
                        </div>
                        <div className="rounded-lg bg-muted/50 px-2 py-2.5">
                            <Zap className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                            <p className="text-xs text-muted-foreground">Ready</p>
                            <p className="text-sm font-semibold">{Number(recipe.prepTime) + Number(recipe.cookTime)}m</p>
                        </div>
                    </div>

                    {/* Ingredients */}
                    {recipe.ingredients.length > 0 && (
                        <div>
                            <h3 className="text-sm font-semibold mb-2">Ingredients</h3>
                            <div className="border rounded-lg overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead className="bg-muted/50">
                                        <tr>
                                            <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Ingredient</th>
                                            <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Qty</th>
                                            <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Cost</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {recipe.ingredients.map(row => {
                                            const ing = row.ingredient;
                                            const cpu = Number(ing.purchasePrice) / Number(ing.conversionRate) / (Number(ing.yieldPercent) / 100);
                                            const lineCostTHB = cpu * Number(row.quantity);
                                            return (
                                                <tr key={row.id} className="hover:bg-muted/30">
                                                    <td className="px-3 py-2 font-medium">{ing.name}</td>
                                                    <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">
                                                        {Number(row.quantity)} {ing.recipeUnit}
                                                    </td>
                                                    <td className="px-3 py-2 text-right tabular-nums font-medium">
                                                        {format(lineCostTHB)}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Cost breakdown */}
                    <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
                        <h3 className="text-sm font-semibold">Cost Breakdown (per {recipe.yieldUnit || "serving"})</h3>
                        <div className="space-y-1.5 text-sm">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Ingredient cost</span>
                                <span className="font-medium tabular-nums">{show(costPerServing)}</span>
                            </div>
                            {laborCost > 0 && (
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Labor ({recipe.laborCostPerHour} {"/hr"})</span>
                                    <span className="tabular-nums">{format(laborCost / yieldQty)}</span>
                                </div>
                            )}
                            {energyCost > 0 && (
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Energy</span>
                                    <span className="tabular-nums">{format(energyCost / yieldQty)}</span>
                                </div>
                            )}
                            <div className="flex justify-between border-t pt-2 font-semibold">
                                <span>Ingredient cost / serving</span>
                                <span className="text-primary tabular-nums">{show(costPerServing)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Pricing */}
                    {(diningPrice != null || deliveryPrice != null) && (
                        <div className="rounded-xl border p-4 space-y-3">
                            <h3 className="text-sm font-semibold">Pricing</h3>
                            <div className="space-y-2 text-sm">
                                {diningPrice != null && (
                                    <div className="flex items-center justify-between">
                                        <span className="flex items-center gap-1.5 text-muted-foreground">
                                            <UtensilsCrossed className="h-3.5 w-3.5" /> Dining (ex-tax)
                                        </span>
                                        <div className="flex items-center gap-2">
                                            <span className="font-semibold tabular-nums">{show(diningPrice)}</span>
                                            {fcPct != null && (
                                                <Badge variant="outline" className={`text-xs font-bold ${fcBadgeClass(fcPct)}`}>
                                                    FC {fcPct.toFixed(1)}% · {fcLabel(fcPct)}
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                )}
                                {deliveryPrice != null && (
                                    <div className="flex items-center justify-between">
                                        <span className="flex items-center gap-1.5 text-muted-foreground">
                                            <Bike className="h-3.5 w-3.5" /> Delivery (ex-tax)
                                        </span>
                                        <div className="flex items-center gap-2">
                                            <span className="font-semibold tabular-nums">{show(deliveryPrice)}</span>
                                            {deliveryFcPct != null && (
                                                <Badge variant="outline" className={`text-xs font-bold ${fcBadgeClass(deliveryFcPct)}`}>
                                                    FC {deliveryFcPct.toFixed(1)}%
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Instructions */}
                    {steps.length > 0 && (
                        <div>
                            <h3 className="text-sm font-semibold mb-2">Instructions</h3>
                            <ol className="space-y-2">
                                {steps.map((step, i) => (
                                    <li key={i} className="flex gap-3 text-sm">
                                        <span className="shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                                            {i + 1}
                                        </span>
                                        <span className="text-muted-foreground pt-0.5">{step}</span>
                                    </li>
                                ))}
                            </ol>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function MenuItemsPage() {
    const [recipes, setRecipes] = useState<RecipeWithIngredients[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [categoryFilter, setCategoryFilter] = useState("all");
    const [sortKey, setSortKey] = useState<SortKey>("name");
    const [sortDir, setSortDir] = useState<SortDir>("asc");
    const [selected, setSelected] = useState<RecipeWithIngredients | null>(null);

    const { format, symbol, currency } = useCurrency();
    const rate = CURRENCIES[currency].rateFromTHB;
    const show = (amt: number, dec = 2) => `${symbol}${amt.toFixed(dec)}`;

    const { categories } = useCategories();

    useEffect(() => {
        recipesApi.list()
            .then(data => setRecipes(data.filter(r => !r.isMainSauce)))
            .finally(() => setLoading(false));
    }, []);

    // ── Derived rows ──────────────────────────────────────────────────────────
    const rows = useMemo(() => recipes.map(r => {
        const ingCostTHB     = calcIngredientCost(r);
        const yieldQty       = Number(r.yieldAmount) || 1;
        const costPerServing = (ingCostTHB / yieldQty) * rate;
        const diningPrice    = r.sellingPrice  != null ? Number(r.sellingPrice)  : null;
        const deliveryPrice  = r.deliveryPrice != null ? Number(r.deliveryPrice) : null;
        const fcPct          = diningPrice  && diningPrice  > 0 ? (costPerServing / diningPrice)  * 100 : null;
        const deliveryFcPct  = deliveryPrice && deliveryPrice > 0 ? (costPerServing / deliveryPrice) * 100 : null;
        return { recipe: r, costPerServing, diningPrice, deliveryPrice, fcPct, deliveryFcPct };
    }), [recipes, rate]);

    // ── Filter + sort ─────────────────────────────────────────────────────────
    const filtered = useMemo(() => {
        let list = rows.filter(({ recipe }) =>
            recipe.name.toLowerCase().includes(search.toLowerCase()) &&
            (categoryFilter === "all" || recipe.category === categoryFilter)
        );
        return [...list].sort((a, b) => {
            let cmp = 0;
            if (sortKey === "name")     cmp = a.recipe.name.localeCompare(b.recipe.name);
            if (sortKey === "category") cmp = a.recipe.category.localeCompare(b.recipe.category);
            if (sortKey === "cost")     cmp = a.costPerServing - b.costPerServing;
            if (sortKey === "fc")       cmp = (a.fcPct ?? 999) - (b.fcPct ?? 999);
            if (sortKey === "price")    cmp = (a.diningPrice ?? 0) - (b.diningPrice ?? 0);
            return sortDir === "asc" ? cmp : -cmp;
        });
    }, [rows, search, categoryFilter, sortKey, sortDir]);

    // ── Summary stats ─────────────────────────────────────────────────────────
    const withPrice = filtered.filter(r => r.diningPrice != null);
    const avgFC = withPrice.length > 0 && withPrice.every(r => r.fcPct != null)
        ? withPrice.reduce((s, r) => s + r.fcPct!, 0) / withPrice.length
        : null;
    const avgCost = filtered.length > 0
        ? filtered.reduce((s, r) => s + r.costPerServing, 0) / filtered.length
        : 0;

    // ── Sort ─────────────────────────────────────────────────────────────────
    const handleSort = (key: SortKey) => {
        if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
        else { setSortKey(key); setSortDir("asc"); }
    };
    const SortIcon = ({ k }: { k: SortKey }) =>
        sortKey === k
            ? sortDir === "asc"
                ? <TrendingUp   className="h-3 w-3 ml-1 inline" />
                : <TrendingDown className="h-3 w-3 ml-1 inline" />
            : <ArrowUpDown className="h-3 w-3 ml-1 inline opacity-40" />;

    // ── Selected row data for popup ───────────────────────────────────────────
    const selectedRow = selected ? rows.find(r => r.recipe.id === selected.id) : null;

    if (loading) return (
        <div className="flex justify-center items-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
    );

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div>
                <h2 className="text-3xl font-bold font-playfair tracking-tight text-primary">Menu Items</h2>
                <p className="text-muted-foreground">
                    Recipe cost and pricing overview — click a name to see full details.
                </p>
            </div>

            {/* Summary stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="rounded-xl border bg-card px-4 py-3">
                    <p className="text-2xl font-bold text-primary">{filtered.length}</p>
                    <p className="text-xs text-muted-foreground">Menu Items</p>
                </div>
                <div className="rounded-xl border bg-card px-4 py-3">
                    <p className="text-2xl font-bold">{withPrice.length}</p>
                    <p className="text-xs text-muted-foreground">With Price Set</p>
                </div>
                <div className="rounded-xl border bg-card px-4 py-3">
                    <p className="text-2xl font-bold tabular-nums">{show(avgCost)}</p>
                    <p className="text-xs text-muted-foreground">Avg. Cost / Serving</p>
                </div>
                <div className="rounded-xl border bg-card px-4 py-3">
                    <p className={`text-2xl font-bold tabular-nums ${avgFC != null ? fcColor(avgFC) : ""}`}>
                        {avgFC != null ? `${avgFC.toFixed(1)}%` : "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">Avg. Food Cost %</p>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Search menu items…" className="pl-8"
                        value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="w-44">
                        <SelectValue placeholder="All Categories" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Categories</SelectItem>
                        {categories.map(c => (
                            <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                    {filtered.length} item{filtered.length !== 1 ? "s" : ""}
                </p>
            </div>

            {/* Table */}
            <div className="border rounded-lg overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-10 hidden sm:table-cell">#</TableHead>
                            <TableHead className="w-12" />
                            <TableHead className="cursor-pointer select-none hover:text-foreground"
                                onClick={() => handleSort("name")}>
                                Recipe Name <SortIcon k="name" />
                            </TableHead>
                            <TableHead className="cursor-pointer select-none hover:text-foreground hidden sm:table-cell"
                                onClick={() => handleSort("category")}>
                                Category <SortIcon k="category" />
                            </TableHead>
                            <TableHead className="cursor-pointer select-none hover:text-foreground text-right hidden md:table-cell"
                                onClick={() => handleSort("cost")}>
                                Cost / Serving <SortIcon k="cost" />
                            </TableHead>
                            <TableHead className="cursor-pointer select-none hover:text-foreground text-center"
                                onClick={() => handleSort("fc")}>
                                FC% <SortIcon k="fc" />
                            </TableHead>
                            <TableHead className="cursor-pointer select-none hover:text-foreground text-right"
                                onClick={() => handleSort("price")}>
                                <span className="flex items-center justify-end gap-1">
                                    <UtensilsCrossed className="h-3.5 w-3.5 hidden sm:inline" />
                                    Price <SortIcon k="price" />
                                </span>
                            </TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filtered.map(({ recipe, costPerServing, diningPrice, fcPct }, idx) => (
                            <TableRow key={recipe.id} className="hover:bg-muted/40 group">
                                <TableCell className="hidden sm:table-cell text-muted-foreground text-sm font-medium">{idx + 1}</TableCell>

                                {/* Thumbnail — click opens popup */}
                                <TableCell>
                                    <button onClick={() => setSelected(recipe)}>
                                        {recipe.imageUrl ? (
                                            <img src={recipe.imageUrl} alt={recipe.name}
                                                className="h-9 w-9 rounded-md object-cover border group-hover:ring-2 ring-primary/40 transition-all" />
                                        ) : (
                                            <div className="h-9 w-9 rounded-md border bg-muted flex items-center justify-center group-hover:ring-2 ring-primary/40 transition-all">
                                                <ImageIcon className="h-4 w-4 text-muted-foreground" />
                                            </div>
                                        )}
                                    </button>
                                </TableCell>

                                {/* Name — click opens popup */}
                                <TableCell>
                                    <button
                                        onClick={() => setSelected(recipe)}
                                        className="font-medium text-left hover:text-primary hover:underline underline-offset-2 transition-colors cursor-pointer"
                                    >
                                        {recipe.name}
                                    </button>
                                    <p className="sm:hidden text-xs text-muted-foreground mt-0.5">{recipe.category || "—"}</p>
                                </TableCell>

                                <TableCell className="hidden sm:table-cell">
                                    <Badge variant="outline" className="text-xs">{recipe.category || "—"}</Badge>
                                </TableCell>

                                <TableCell className="hidden md:table-cell text-right tabular-nums">
                                    <span className="font-semibold text-primary">{show(costPerServing)}</span>
                                    <span className="text-xs text-muted-foreground ml-1">/{recipe.yieldUnit || "serving"}</span>
                                </TableCell>

                                <TableCell className="text-center">
                                    {fcPct != null ? (
                                        <Badge variant="outline" className={`font-semibold tabular-nums ${fcBadgeClass(fcPct)}`}>
                                            {fcPct.toFixed(1)}%
                                        </Badge>
                                    ) : (
                                        <span className="text-xs text-muted-foreground">—</span>
                                    )}
                                </TableCell>

                                <TableCell className="text-right tabular-nums">
                                    {diningPrice != null
                                        ? <span className="font-semibold">{show(diningPrice)}</span>
                                        : <span className="text-xs text-muted-foreground">—</span>}
                                </TableCell>
                            </TableRow>
                        ))}
                        {filtered.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                                    No menu items found.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground pt-1">
                <span className="font-medium">Food Cost % target:</span>
                <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" /> ≤ 30% Excellent
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-yellow-500 inline-block" /> 31–40% Acceptable
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" /> &gt; 40% Too High
                </span>
            </div>

            {/* Recipe Detail Popup */}
            {selected && selectedRow && (
                <RecipeDetailDialog
                    recipe={selected}
                    open={!!selected}
                    onClose={() => setSelected(null)}
                    costPerServing={selectedRow.costPerServing}
                    diningPrice={selectedRow.diningPrice}
                    deliveryPrice={selectedRow.deliveryPrice}
                    fcPct={selectedRow.fcPct}
                    deliveryFcPct={selectedRow.deliveryFcPct}
                    format={format}
                    show={show}
                />
            )}
        </div>
    );
}
