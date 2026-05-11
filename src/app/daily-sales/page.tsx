"use client";

import { useState, useEffect, useCallback } from "react";
import { recipesApi, salesApi, RecipeWithIngredients, SalesEntry } from "@/lib/api";
import { useCurrency } from "@/components/currency-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
    ShoppingBag, Plus, Trash2, Loader2, TrendingUp,
    TrendingDown, DollarSign, ChefHat, Calendar,
} from "lucide-react";
import Link from "next/link";

// ─── Cost calc helper ─────────────────────────────────────────────────────────
function calcCostPerYield(recipe: RecipeWithIngredients): number {
    const ingCost = recipe.ingredients.reduce((s, row) => {
        const ing = row.ingredient;
        const cpu = Number(ing.purchasePrice) / Number(ing.conversionRate) / (Number(ing.yieldPercent) / 100);
        return s + cpu * Number(row.quantity);
    }, 0);
    const labor = Number(recipe.laborCostPerHour) * ((recipe.prepTime + recipe.cookTime) / 60);
    const energy = Number(recipe.energyCostPerBatch);
    return (ingCost + labor + energy) / Number(recipe.yieldAmount);
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ title, value, sub, color }: { title: string; value: string; sub?: string; color?: string }) {
    return (
        <Card>
            <CardContent className="pt-5 pb-4">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{title}</p>
                <p className={`text-2xl font-bold mt-1 tabular-nums ${color ?? "text-primary"}`}>{value}</p>
                {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
            </CardContent>
        </Card>
    );
}

export default function DailySalesPage() {
    const { format } = useCurrency();
    const today = new Date().toISOString().slice(0, 10);

    const [date, setDate] = useState(today);
    const [recipes, setRecipes] = useState<RecipeWithIngredients[]>([]);
    const [entries, setEntries] = useState<SalesEntry[]>([]);
    const [loadingEntries, setLoadingEntries] = useState(false);

    // Form state
    const [selectedRecipeId, setSelectedRecipeId] = useState("");
    const [qty, setQty] = useState("1");
    const [unitPrice, setUnitPrice] = useState("");
    const [saving, setSaving] = useState(false);

    // Load recipes once
    useEffect(() => {
        recipesApi.list().then(r => setRecipes(r.filter(x => !x.isMainSauce)));
    }, []);

    // Load entries when date changes
    const loadEntries = useCallback(async () => {
        setLoadingEntries(true);
        try {
            setEntries(await salesApi.list(date));
        } finally {
            setLoadingEntries(false);
        }
    }, [date]);
    useEffect(() => { loadEntries(); }, [loadEntries]);

    // Auto-fill price when recipe selected
    const selectedRecipe = recipes.find(r => r.id === selectedRecipeId);
    useEffect(() => {
        if (selectedRecipe?.sellingPrice != null) {
            setUnitPrice(String(selectedRecipe.sellingPrice));
        }
    }, [selectedRecipe]);

    const handleAdd = async () => {
        if (!selectedRecipeId || !qty || !unitPrice) return;
        setSaving(true);
        try {
            const recipe = recipes.find(r => r.id === selectedRecipeId)!;
            const unitCost = calcCostPerYield(recipe);
            await salesApi.create({
                date,
                recipeId: selectedRecipeId,
                recipeName: recipe.name,
                qty: parseInt(qty),
                unitPrice: parseFloat(unitPrice),
                unitCost,
            });
            setSelectedRecipeId("");
            setQty("1");
            setUnitPrice("");
            await loadEntries();
        } catch (err) {
            console.error(err);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        await salesApi.delete(id);
        setEntries(prev => prev.filter(e => e.id !== id));
    };

    // Summary calculations
    const totalRevenue = entries.reduce((s, e) => s + Number(e.revenue), 0);
    const totalCost = entries.reduce((s, e) => s + (e.unitCost != null ? Number(e.unitCost) * e.qty : 0), 0);
    const grossProfit = totalRevenue - totalCost;
    const foodCostPct = totalRevenue > 0 ? (totalCost / totalRevenue) * 100 : 0;
    const grossProfitPct = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
    const itemsSold = entries.reduce((s, e) => s + e.qty, 0);

    const fcColor = foodCostPct === 0 ? "text-muted-foreground" : foodCostPct <= 30 ? "text-green-600" : foodCostPct <= 40 ? "text-yellow-600" : "text-red-600";
    const gpColor = grossProfitPct >= 60 ? "text-green-600" : grossProfitPct >= 50 ? "text-yellow-600" : "text-red-600";

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-wrap justify-between items-start gap-3">
                <div>
                    <h2 className="text-3xl font-bold font-playfair tracking-tight text-primary">Daily Sales</h2>
                    <p className="text-muted-foreground">Record daily sales to track Revenue and Food Cost %</p>
                </div>
                <Link href="/dashboard">
                    <Button variant="outline"><TrendingUp className="mr-2 h-4 w-4" /> Dashboard</Button>
                </Link>
            </div>

            {/* Date Picker */}
            <div className="flex items-center gap-3">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <Input
                    type="date"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    className="w-48"
                    max={today}
                />
                {date === today && <Badge variant="outline" className="text-xs">Today</Badge>}
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                <KpiCard title="Total Revenue" value={format(totalRevenue)} sub={`${itemsSold} items`} />
                <KpiCard title="Total Cost" value={format(totalCost)} />
                <KpiCard
                    title="Food Cost %"
                    value={totalRevenue > 0 ? `${foodCostPct.toFixed(1)}%` : "–"}
                    sub={foodCostPct > 0 ? (foodCostPct <= 30 ? "Excellent" : foodCostPct <= 40 ? "Acceptable" : "Too High") : undefined}
                    color={fcColor}
                />
                <KpiCard
                    title="Gross Profit"
                    value={format(grossProfit)}
                    sub={totalRevenue > 0 ? `${grossProfitPct.toFixed(1)}%` : undefined}
                    color={totalRevenue > 0 ? gpColor : undefined}
                />
                <KpiCard title="Items Sold" value={`${itemsSold}`} sub="dishes / portions" />
            </div>

            <div className="grid lg:grid-cols-3 gap-6">
                {/* Add Entry Form */}
                <Card className="lg:col-span-1">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Plus className="h-4 w-4" /> Add Sale Entry
                        </CardTitle>
                        <CardDescription>Select a menu item and enter quantity sold</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-1.5">
                            <Label>Menu / Recipe</Label>
                            <Select value={selectedRecipeId} onValueChange={setSelectedRecipeId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select a menu item..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {recipes.map(r => (
                                        <SelectItem key={r.id} value={r.id}>
                                            <span className="flex items-center gap-2">
                                                {r.name}
                                                {r.sellingPrice != null && (
                                                    <span className="text-xs text-muted-foreground">({format(Number(r.sellingPrice))})</span>
                                                )}
                                            </span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {selectedRecipe && (
                                <p className="text-xs text-muted-foreground">
                                    Cost: {format(calcCostPerYield(selectedRecipe))}/{selectedRecipe.yieldUnit}
                                </p>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label>Quantity</Label>
                                <Input
                                    type="number"
                                    min="1"
                                    value={qty}
                                    onChange={e => setQty(e.target.value)}
                                    placeholder="1"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Selling Price / Unit</Label>
                                <Input
                                    type="number"
                                    min="0"
                                    step="0.5"
                                    value={unitPrice}
                                    onChange={e => setUnitPrice(e.target.value)}
                                    placeholder="0"
                                />
                            </div>
                        </div>

                        {selectedRecipeId && qty && unitPrice && (
                            <div className="p-3 bg-accent/30 rounded-lg text-sm space-y-1">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Revenue</span>
                                    <span className="font-semibold">{format(parseInt(qty) * parseFloat(unitPrice))}</span>
                                </div>
                                {selectedRecipe && (
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Food Cost %</span>
                                        <span className={`font-semibold ${(() => {
                                            const pct = (calcCostPerYield(selectedRecipe) / parseFloat(unitPrice)) * 100;
                                            return pct <= 30 ? "text-green-600" : pct <= 40 ? "text-yellow-600" : "text-red-600";
                                        })()}`}>
                                            {((calcCostPerYield(selectedRecipe) / parseFloat(unitPrice)) * 100).toFixed(1)}%
                                        </span>
                                    </div>
                                )}
                            </div>
                        )}

                        <Button
                            className="w-full"
                            onClick={handleAdd}
                            disabled={!selectedRecipeId || !qty || !unitPrice || saving}
                        >
                            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                            Save Entry
                        </Button>
                    </CardContent>
                </Card>

                {/* Sales Table */}
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <ShoppingBag className="h-4 w-4" />
                            Sales Entries — {date}
                        </CardTitle>
                        <CardDescription>{entries.length} {entries.length === 1 ? "entry" : "entries"}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {loadingEntries ? (
                            <div className="flex justify-center py-10">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            </div>
                        ) : entries.length === 0 ? (
                            <div className="text-center py-10 border rounded-lg border-dashed">
                                <ChefHat className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                                <p className="text-muted-foreground text-sm">No sales entries for this date</p>
                            </div>
                        ) : (
                            <div className="space-y-0 divide-y">
                                {entries.map(entry => {
                                    const cost = entry.unitCost != null ? Number(entry.unitCost) * entry.qty : null;
                                    const fc = cost != null && Number(entry.revenue) > 0
                                        ? (cost / Number(entry.revenue)) * 100 : null;
                                    return (
                                        <div key={entry.id} className="flex items-center gap-3 py-3">
                                            <div className="flex-1 min-w-0">
                                                <p className="font-medium text-sm truncate">{entry.recipeName}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    {entry.qty} × {format(Number(entry.unitPrice))}
                                                </p>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <p className="font-semibold text-sm tabular-nums">{format(Number(entry.revenue))}</p>
                                                {fc != null && (
                                                    <p className={`text-xs tabular-nums ${fc <= 30 ? "text-green-600" : fc <= 40 ? "text-yellow-600" : "text-red-600"}`}>
                                                        FC {fc.toFixed(1)}%
                                                    </p>
                                                )}
                                            </div>
                                            <Button
                                                variant="ghost" size="icon"
                                                className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                                                onClick={() => handleDelete(entry.id)}
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    );
                                })}
                                <div className="pt-3 flex justify-between items-center font-semibold text-sm">
                                    <span>Total</span>
                                    <div className="text-right">
                                        <p className="tabular-nums">{format(totalRevenue)}</p>
                                        <p className={`text-xs ${fcColor} tabular-nums`}>
                                            {totalRevenue > 0 ? `FC ${foodCostPct.toFixed(1)}%` : ""}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Trend hint */}
            {totalRevenue > 0 && (
                <div className="flex items-start gap-3 p-4 border rounded-lg bg-accent/20 text-sm">
                    {grossProfit >= 0
                        ? <TrendingUp className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                        : <TrendingDown className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />}
                    <div>
                        <span className="font-medium">Today's Summary: </span>
                        Revenue <strong>{format(totalRevenue)}</strong> · Cost <strong>{format(totalCost)}</strong> ·
                        Gross Profit <strong className={grossProfit >= 0 ? "text-green-600" : "text-red-600"}>{format(grossProfit)}</strong> ({grossProfitPct.toFixed(1)}%) ·
                        Food Cost <strong className={fcColor}>{foodCostPct.toFixed(1)}%</strong>
                        {foodCostPct > 40 && <span className="text-red-600 ml-1">⚠️ Food cost too high — review recipes or selling prices</span>}
                    </div>
                </div>
            )}
        </div>
    );
}
