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
    Search, Loader2, ImageIcon, ArrowUpDown,
    UtensilsCrossed, TrendingDown, TrendingUp,
} from "lucide-react";

// ─── Cost helpers (same formula as recipes/page.tsx) ─────────────────────────
function calcIngredientCost(recipe: RecipeWithIngredients): number {
    return recipe.ingredients.reduce((sum, row) => {
        const ing = row.ingredient;
        const costPerUnit =
            Number(ing.purchasePrice) / Number(ing.conversionRate) / (Number(ing.yieldPercent) / 100);
        return sum + costPerUnit * Number(row.quantity);
    }, 0);
}

function fcColor(pct: number) {
    if (pct <= 30) return "text-green-600 dark:text-green-400";
    if (pct <= 40) return "text-yellow-600 dark:text-yellow-400";
    return "text-red-600 dark:text-red-400";
}

function fcBadgeClass(pct: number) {
    if (pct <= 30) return "bg-green-100 text-green-800 border-green-200 dark:bg-green-950/40 dark:text-green-400 dark:border-green-800";
    if (pct <= 40) return "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-400 dark:border-yellow-800";
    return "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800";
}

type SortKey = "name" | "category" | "cost" | "fc" | "price";
type SortDir = "asc" | "desc";

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function MenuItemsPage() {
    const [recipes, setRecipes] = useState<RecipeWithIngredients[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [categoryFilter, setCategoryFilter] = useState("all");
    const [sortKey, setSortKey] = useState<SortKey>("name");
    const [sortDir, setSortDir] = useState<SortDir>("asc");

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
        const ingCostTHB = calcIngredientCost(r);
        const yieldQty   = Number(r.yieldAmount) || 1;
        const costPerServing = (ingCostTHB / yieldQty) * rate;   // CAD
        const diningPrice    = r.sellingPrice != null ? Number(r.sellingPrice) : null;
        const fcPct = diningPrice && diningPrice > 0 && costPerServing > 0
            ? (costPerServing / diningPrice) * 100
            : null;
        return { recipe: r, costPerServing, diningPrice, fcPct };
    }), [recipes, rate]);

    // ── Filter + sort ─────────────────────────────────────────────────────────
    const filtered = useMemo(() => {
        let list = rows.filter(({ recipe }) => {
            const matchSearch = recipe.name.toLowerCase().includes(search.toLowerCase());
            const matchCat    = categoryFilter === "all" || recipe.category === categoryFilter;
            return matchSearch && matchCat;
        });
        list = [...list].sort((a, b) => {
            let cmp = 0;
            if (sortKey === "name")     cmp = a.recipe.name.localeCompare(b.recipe.name);
            if (sortKey === "category") cmp = a.recipe.category.localeCompare(b.recipe.category);
            if (sortKey === "cost")     cmp = a.costPerServing - b.costPerServing;
            if (sortKey === "fc")       cmp = (a.fcPct ?? 999) - (b.fcPct ?? 999);
            if (sortKey === "price")    cmp = (a.diningPrice ?? 0) - (b.diningPrice ?? 0);
            return sortDir === "asc" ? cmp : -cmp;
        });
        return list;
    }, [rows, search, categoryFilter, sortKey, sortDir]);

    // ── Summary stats ─────────────────────────────────────────────────────────
    const withPrice = filtered.filter(r => r.diningPrice != null);
    const avgFC = withPrice.length > 0 && withPrice.every(r => r.fcPct != null)
        ? withPrice.reduce((s, r) => s + r.fcPct!, 0) / withPrice.length
        : null;
    const avgCost = filtered.length > 0
        ? filtered.reduce((s, r) => s + r.costPerServing, 0) / filtered.length
        : 0;

    // ── Sort toggle ───────────────────────────────────────────────────────────
    const handleSort = (key: SortKey) => {
        if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
        else { setSortKey(key); setSortDir("asc"); }
    };

    const SortIcon = ({ k }: { k: SortKey }) =>
        sortKey === k
            ? sortDir === "asc"
                ? <TrendingUp className="h-3 w-3 ml-1 inline" />
                : <TrendingDown className="h-3 w-3 ml-1 inline" />
            : <ArrowUpDown className="h-3 w-3 ml-1 inline opacity-40" />;

    // ─────────────────────────────────────────────────────────────────────────
    if (loading) return (
        <div className="flex justify-center items-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
    );

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div>
                <h2 className="text-3xl font-bold font-playfair tracking-tight text-primary">
                    Menu Items
                </h2>
                <p className="text-muted-foreground">
                    Recipe cost and pricing overview — all figures per serving, ex-tax.
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
                    <Input
                        placeholder="Search menu items…"
                        className="pl-8"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
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
                            <TableHead className="w-10">#</TableHead>
                            <TableHead className="w-12"></TableHead>
                            <TableHead
                                className="cursor-pointer select-none hover:text-foreground"
                                onClick={() => handleSort("name")}
                            >
                                Recipe Name <SortIcon k="name" />
                            </TableHead>
                            <TableHead
                                className="cursor-pointer select-none hover:text-foreground"
                                onClick={() => handleSort("category")}
                            >
                                Category <SortIcon k="category" />
                            </TableHead>
                            <TableHead
                                className="cursor-pointer select-none hover:text-foreground text-right"
                                onClick={() => handleSort("cost")}
                            >
                                Cost / Serving <SortIcon k="cost" />
                            </TableHead>
                            <TableHead
                                className="cursor-pointer select-none hover:text-foreground text-center"
                                onClick={() => handleSort("fc")}
                            >
                                Food Cost % <SortIcon k="fc" />
                            </TableHead>
                            <TableHead
                                className="cursor-pointer select-none hover:text-foreground text-right"
                                onClick={() => handleSort("price")}
                            >
                                <span className="flex items-center justify-end gap-1">
                                    <UtensilsCrossed className="h-3.5 w-3.5" />
                                    Dining Price (ex-tax) <SortIcon k="price" />
                                </span>
                            </TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filtered.map(({ recipe, costPerServing, diningPrice, fcPct }, idx) => (
                            <TableRow key={recipe.id} className="hover:bg-muted/40">
                                {/* Row number */}
                                <TableCell className="text-muted-foreground text-sm font-medium">
                                    {idx + 1}
                                </TableCell>

                                {/* Thumbnail */}
                                <TableCell>
                                    {recipe.imageUrl ? (
                                        <img
                                            src={recipe.imageUrl}
                                            alt={recipe.name}
                                            className="h-9 w-9 rounded-md object-cover border"
                                        />
                                    ) : (
                                        <div className="h-9 w-9 rounded-md border bg-muted flex items-center justify-center">
                                            <ImageIcon className="h-4 w-4 text-muted-foreground" />
                                        </div>
                                    )}
                                </TableCell>

                                {/* Name */}
                                <TableCell className="font-medium">{recipe.name}</TableCell>

                                {/* Category */}
                                <TableCell>
                                    <Badge variant="outline" className="text-xs">
                                        {recipe.category || "—"}
                                    </Badge>
                                </TableCell>

                                {/* Cost per serving */}
                                <TableCell className="text-right tabular-nums">
                                    <span className="font-semibold text-primary">
                                        {show(costPerServing)}
                                    </span>
                                    <span className="text-xs text-muted-foreground ml-1">
                                        /{recipe.yieldUnit || "serving"}
                                    </span>
                                </TableCell>

                                {/* Food Cost % */}
                                <TableCell className="text-center">
                                    {fcPct != null ? (
                                        <Badge variant="outline" className={`font-semibold tabular-nums ${fcBadgeClass(fcPct)}`}>
                                            {fcPct.toFixed(1)}%
                                        </Badge>
                                    ) : (
                                        <span className="text-xs text-muted-foreground">No price</span>
                                    )}
                                </TableCell>

                                {/* Dining price */}
                                <TableCell className="text-right tabular-nums">
                                    {diningPrice != null ? (
                                        <span className="font-semibold">
                                            {show(diningPrice)}
                                        </span>
                                    ) : (
                                        <span className="text-xs text-muted-foreground">—</span>
                                    )}
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
                    <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />
                    ≤ 30% Excellent
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-yellow-500 inline-block" />
                    31–40% Acceptable
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
                    &gt; 40% Too High
                </span>
            </div>
        </div>
    );
}
