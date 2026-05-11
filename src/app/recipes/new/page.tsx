"use client";

import { useState, useMemo, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ingredientsApi, equipmentApi, recipesApi, Ingredient, Equipment } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Save, FileText, ArrowLeft, Plus, Trash2, Loader2, ImageIcon, UtensilsCrossed, Bike, ChevronDown } from "lucide-react";
import { useCurrency } from "@/components/currency-context";
import { useCategories, DEFAULT_CATEGORY } from "@/lib/use-categories";

// ─── Protein keyword detection ───────────────────────────────────────────────
const PROTEIN_KEYWORDS: Record<string, string> = {
    chicken: "Chicken",
    shrimp: "Shrimp",
    prawn: "Shrimp",
    tiger: "Shrimp",
    beef: "Beef",
    pork: "Pork",
    duck: "Duck",
    fish: "Fish",
    crab: "Crab",
    squid: "Squid",
    tofu: "Tofu",
    egg: "Egg",
};

function detectProteinType(name: string): string | null {
    const lower = name.toLowerCase();
    for (const [key, label] of Object.entries(PROTEIN_KEYWORDS)) {
        if (lower.includes(key)) return label;
    }
    return null;
}

function detectIngredientCategory(name: string): "protein" | "produce" | "sauce" | "dry" {
    if (detectProteinType(name)) return "protein";
    const lower = name.toLowerCase();
    if (["spring", "bean", "sprout", "vegetable", "herb", "lime", "onion", "garlic"].some(k => lower.includes(k)))
        return "produce";
    if (["sauce", "oil", "paste", "sugar", "vinegar", "tamarind"].some(k => lower.includes(k)))
        return "sauce";
    return "dry";
}

interface IngredientRow {
    id: number;
    ingredientId: string;
    quantity: string;
}

function fcPctColor(pct: number) {
    if (pct <= 30) return "text-green-600";
    if (pct <= 40) return "text-yellow-600";
    return "text-red-600";
}

function fcLabel(pct: number) {
    if (pct <= 30) return "Excellent";
    if (pct <= 40) return "Acceptable";
    return "Too High";
}

function RecipeBuilderInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const editId = searchParams.get("id");
    const { format, symbol } = useCurrency();
    const { categories } = useCategories();
    const [loadingData, setLoadingData] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState("");
    const [ingredients, setIngredients] = useState<Ingredient[]>([]);
    const [equipment, setEquipment] = useState<Equipment[]>([]);
    const [activeTab, setActiveTab] = useState("info");
    const [showCostBreakdown, setShowCostBreakdown] = useState(false);

    // Form state
    const [recipeName, setRecipeName] = useState("");
    const [category, setCategory] = useState(DEFAULT_CATEGORY);
    const [yieldAmount, setYieldAmount] = useState("1");
    const [yieldUnit, setYieldUnit] = useState("serving");
    const [instructions, setInstructions] = useState("");
    const [imageUrl, setImageUrl] = useState("");
    const [ingredientRows, setIngredientRows] = useState<IngredientRow[]>([
        { id: 1, ingredientId: "", quantity: "" }
    ]);
    const [selectedEquipment, setSelectedEquipment] = useState<Set<string>>(new Set());
    const [laborCostPerHour, setLaborCostPerHour] = useState("50");
    const [prepMinutes, setPrepMinutes] = useState("15");
    const [cookMinutes, setCookMinutes] = useState("5");
    const [energyCost, setEnergyCost] = useState("5");
    const [diningPrice, setDiningPrice] = useState("");
    const [deliveryPrice, setDeliveryPrice] = useState("");

    useEffect(() => {
        const loadAll = async () => {
            const [ings, eqs] = await Promise.all([ingredientsApi.list(), equipmentApi.list()]);
            setIngredients(ings);
            setEquipment(eqs);

            if (editId) {
                try {
                    const recipe = await recipesApi.get(editId);
                    setRecipeName(recipe.name);
                    setCategory(recipe.category);
                    setYieldAmount(String(recipe.yieldAmount));
                    setYieldUnit(recipe.yieldUnit);
                    setInstructions(recipe.instructions ?? "");
                    setImageUrl(recipe.imageUrl ?? "");
                    setLaborCostPerHour(String(recipe.laborCostPerHour));
                    setPrepMinutes(String(recipe.prepTime));
                    setCookMinutes(String(recipe.cookTime));
                    setEnergyCost(String(recipe.energyCostPerBatch));
                    setDiningPrice(recipe.sellingPrice != null ? String(recipe.sellingPrice) : "");
                    setDeliveryPrice(recipe.deliveryPrice != null ? String(recipe.deliveryPrice) : "");
                    if (recipe.ingredients.length > 0) {
                        setIngredientRows(recipe.ingredients.map((r, idx) => ({
                            id: idx + 1,
                            ingredientId: r.ingredientId,
                            quantity: String(r.quantity),
                        })));
                    }
                } catch (err) {
                    console.error("Failed to load recipe:", err);
                }
            }
            setLoadingData(false);
        };
        loadAll();
    }, [editId]);

    // ─── Cost calculations ────────────────────────────────────────────────────
    const totalIngredientCost = useMemo(() => {
        return ingredientRows.reduce((sum, row) => {
            const ing = ingredients.find(i => i.id === row.ingredientId);
            const qty = parseFloat(row.quantity);
            if (!ing || !qty || isNaN(qty)) return sum;
            const costPerUnit = Number(ing.purchasePrice) / Number(ing.conversionRate) / (Number(ing.yieldPercent) / 100);
            return sum + costPerUnit * qty;
        }, 0);
    }, [ingredientRows, ingredients]);

    const totalLaborCost = (parseFloat(laborCostPerHour) || 0) *
        ((parseFloat(prepMinutes) + parseFloat(cookMinutes) || 0) / 60);
    const totalEnergyCost = parseFloat(energyCost) || 0;
    const totalCost = totalIngredientCost + totalLaborCost + totalEnergyCost;
    const yieldQty = parseFloat(yieldAmount) || 1;
    const ingCostPerYield = totalIngredientCost / yieldQty;   // Food Cost basis
    const totalCostPerYield = totalCost / yieldQty;

    // Cost bar percentages
    const ingPct = totalCost > 0 ? (totalIngredientCost / totalCost) * 100 : 0;
    const labPct = totalCost > 0 ? (totalLaborCost / totalCost) * 100 : 0;
    const engPct = totalCost > 0 ? (totalEnergyCost / totalCost) * 100 : 0;

    // Protein breakdown
    const proteinBreakdown = useMemo(() => {
        const groups: Record<string, number> = {};
        for (const row of ingredientRows) {
            const ing = ingredients.find(i => i.id === row.ingredientId);
            const qty = parseFloat(row.quantity);
            if (!ing || !qty || isNaN(qty)) continue;
            const cat = detectIngredientCategory(ing.name);
            const cost = (Number(ing.purchasePrice) / Number(ing.conversionRate) / (Number(ing.yieldPercent) / 100)) * qty;
            const key = cat === "protein" ? (detectProteinType(ing.name) ?? "Protein") : cat;
            groups[key] = (groups[key] ?? 0) + cost;
        }
        return groups;
    }, [ingredientRows, ingredients]);

    const CATEGORY_LABELS: Record<string, string> = {
        produce: "Produce",
        sauce: "Sauce & Condiments",
        dry: "Dry Goods & Spices",
    };

    // ─── Row ops ─────────────────────────────────────────────────────────────
    const addIngredientRow = () => setIngredientRows(prev => [...prev, { id: Date.now(), ingredientId: "", quantity: "" }]);
    const updateRow = (id: number, field: keyof IngredientRow, value: string) =>
        setIngredientRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
    const removeRow = (id: number) => setIngredientRows(prev => prev.filter(r => r.id !== id));
    const toggleEquipment = (id: string) => setSelectedEquipment(prev => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
    });

    // ─── Save ─────────────────────────────────────────────────────────────────
    const handleSave = async () => {
        if (!recipeName.trim()) { setSaveError("Please enter a recipe name."); return; }
        setSaveError("");
        setSaving(true);
        try {
            const rows = ingredientRows
                .filter(r => r.ingredientId && parseFloat(r.quantity) > 0)
                .map(r => ({ ingredientId: r.ingredientId, quantity: parseFloat(r.quantity) }));
            const payload = {
                name: recipeName, category,
                yieldAmount: parseFloat(yieldAmount) || 1, yieldUnit,
                prepTime: parseFloat(prepMinutes) || 0,
                cookTime: parseFloat(cookMinutes) || 0,
                laborCostPerHour: parseFloat(laborCostPerHour) || 0,
                energyCostPerBatch: parseFloat(energyCost) || 0,
                sellingPrice: parseFloat(diningPrice) > 0 ? parseFloat(diningPrice) : null,
                deliveryPrice: parseFloat(deliveryPrice) > 0 ? parseFloat(deliveryPrice) : null,
                isMainSauce: category === "Sauce Base",
                instructions,
                imageUrl: imageUrl.trim() || undefined,
                ingredients: rows,
            };
            if (editId) {
                await recipesApi.update(editId, payload);
                await recipesApi.setIngredients(editId, rows);
            } else {
                await recipesApi.create(payload);
            }
            router.push("/recipes");
        } catch (err) {
            setSaveError(err instanceof Error ? err.message : "Failed to save recipe. Please try again.");
            console.error(err);
        } finally { setSaving(false); }
    };

    // ─── Export SOP ───────────────────────────────────────────────────────────
    const handleExportSOP = () => {
        const prep = parseFloat(prepMinutes) || 0;
        const cook = parseFloat(cookMinutes) || 0;
        const ingListHtml = ingredientRows
            .filter(r => r.ingredientId && parseFloat(r.quantity) > 0)
            .map(r => {
                const ing = ingredients.find(i => i.id === r.ingredientId);
                if (!ing) return "";
                return `<li>${parseFloat(r.quantity)} ${ing.recipeUnit} ${ing.name}</li>`;
            }).join("\n");
        const directionItems = (instructions || "")
            .split("\n").map(l => l.trim()).filter(Boolean)
            .map((l, i) => `<p><strong>${i + 1}.</strong> ${l}</p>`).join("\n");
        const docCode = `SOP-${editId ? editId.slice(0, 8).toUpperCase() : "NEW"}-${new Date().toISOString().slice(0, 10)}`;
        const imageBlock = imageUrl
            ? `<img src="${imageUrl}" alt="${recipeName}" class="recipe-image" onerror="this.style.display='none'" />`
            : `<div class="recipe-image-placeholder"></div>`;
        const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><title>S.O.P — ${recipeName || "Recipe"}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Georgia,serif;color:#222;background:#fff;padding:40px 48px;max-width:800px;margin:0 auto}
.header{text-align:center;margin-bottom:24px}.header h1{font-size:2.4rem;font-weight:700;margin-bottom:4px}.header .subtitle{font-family:Arial,sans-serif;font-size:1rem;color:#555}
.recipe-image{display:block;width:100%;max-height:260px;object-fit:cover;border-radius:6px;margin-bottom:0}.recipe-image-placeholder{width:100%;height:180px;background:#f0ece4;border-radius:6px}
.time-bar{display:flex;border:1px solid #ccc;border-radius:0 0 6px 6px;overflow:hidden;font-family:Arial,sans-serif}.time-cell{flex:1;text-align:center;padding:10px 0;background:#f5f5f5;border-right:1px solid #ccc}.time-cell:last-child{border-right:none}.time-cell .tc-label{font-weight:700;font-size:.88rem;text-transform:uppercase}.time-cell .tc-value{font-size:.82rem;color:#555;margin-top:2px}
.body-grid{display:grid;grid-template-columns:1fr 1.6fr;gap:32px;margin-top:28px}h2{font-size:1.1rem;font-weight:700;border-bottom:2px solid #222;padding-bottom:4px;margin-bottom:12px;font-family:Arial,sans-serif}
.ingredients-col ul{list-style:disc;padding-left:18px;font-size:.88rem;line-height:1.8}.directions-col p{font-size:.88rem;line-height:1.7;margin-bottom:8px;text-align:justify}
.footer{margin-top:36px;padding-top:10px;border-top:1px solid #ccc;font-family:Arial,sans-serif;font-size:.75rem;color:#888;display:flex;justify-content:space-between}
@media print{body{padding:20px 24px}@page{margin:1cm;size:A4}}</style></head>
<body><div class="header"><h1>${recipeName || "Untitled Recipe"}</h1><p class="subtitle">${category}</p></div>
${imageBlock}
<div class="time-bar"><div class="time-cell"><div class="tc-label">Prep</div><div class="tc-value">${prep} mins</div></div><div class="time-cell"><div class="tc-label">Cook</div><div class="tc-value">${cook} mins</div></div><div class="time-cell"><div class="tc-label">Ready In</div><div class="tc-value">${prep + cook} mins</div></div></div>
<div class="body-grid"><div class="ingredients-col"><h2>Ingredients</h2><ul>${ingListHtml || "<li><em>No ingredients added.</em></li>"}</ul></div>
<div class="directions-col"><h2>Directions</h2>${directionItems || "<p><em>No instructions provided.</em></p>"}</div></div>
<div class="footer"><span>Document: ${docCode}</span><span>Yield: ${yieldAmount} ${yieldUnit} | Total Cost: ${format(totalCost)}</span><span>Chiang Mai BOH &copy; ${new Date().getFullYear()}</span></div>
<script>window.onload=function(){window.print();};<\/script></body></html>`;
        const win = window.open("", "_blank");
        if (win) { win.document.write(html); win.document.close(); }
    };

    if (loadingData) return (
        <div className="flex justify-center items-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
    );

    // ─── Cost sidebar (extracted for reuse) ───────────────────────────────────
    const CostSidebar = () => (
        <Card className="border-primary/20 shadow-md">
            <CardHeader className="bg-primary/5 rounded-t-lg pb-3">
                <CardTitle className="text-base">Cost Breakdown</CardTitle>
                <CardDescription className="text-xs">Real-time calculation</CardDescription>
            </CardHeader>
            <CardContent className="pt-4 space-y-3">
                {/* Ingredient / Labor / Energy lines */}
                <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-chart-1 inline-block" />Ingredients
                        </span>
                        <span className="font-medium tabular-nums">{format(totalIngredientCost)}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-chart-2 inline-block" />
                            Labor ({(parseFloat(prepMinutes) || 0) + (parseFloat(cookMinutes) || 0)}m)
                        </span>
                        <span className="font-medium tabular-nums">{format(totalLaborCost)}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-chart-3 inline-block" />Energy
                        </span>
                        <span className="font-medium tabular-nums">{format(totalEnergyCost)}</span>
                    </div>
                </div>

                {/* Stacked bar */}
                <div className="h-2 rounded-full overflow-hidden flex bg-muted">
                    <div className="bg-chart-1 transition-all duration-300" style={{ width: `${ingPct}%` }} />
                    <div className="bg-chart-2 transition-all duration-300" style={{ width: `${labPct}%` }} />
                    <div className="bg-chart-3 transition-all duration-300" style={{ width: `${engPct}%` }} />
                </div>

                <div className="flex justify-between items-center pt-1 border-t">
                    <span className="font-semibold text-sm">Total Batch Cost</span>
                    <span className="font-bold tabular-nums">{format(totalCost)}</span>
                </div>

                {/* Per yield hero */}
                <div className="p-3 bg-primary text-primary-foreground rounded-xl text-center">
                    <div className="text-xs opacity-75 mb-0.5">Ingredient cost / {yieldUnit || "yield"}</div>
                    <div className="text-2xl font-bold font-playfair tabular-nums">{format(ingCostPerYield)}</div>
                    <div className="text-xs opacity-60 mt-0.5">Total: {format(totalCostPerYield)} (incl. labor)</div>
                </div>

                {/* ─── Protein / category breakdown ─────────────────────────── */}
                {Object.keys(proteinBreakdown).length > 0 && (
                    <div className="rounded-lg border p-3 space-y-1.5">
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Ingredient Breakdown</p>
                        {Object.entries(proteinBreakdown)
                            .sort((a, b) => b[1] - a[1])
                            .map(([key, cost]) => {
                                const label = CATEGORY_LABELS[key] ?? key;
                                const pct = totalIngredientCost > 0 ? (cost / totalIngredientCost) * 100 : 0;
                                return (
                                    <div key={key} className="flex items-center justify-between text-xs gap-2">
                                        <span className="text-muted-foreground truncate">{label}</span>
                                        <span className="flex items-center gap-1.5 shrink-0">
                                            <span className="tabular-nums font-medium">{format(cost / yieldQty)}</span>
                                            <span className="text-muted-foreground tabular-nums">({pct.toFixed(0)}%)</span>
                                        </span>
                                    </div>
                                );
                            })}
                    </div>
                )}

                {/* ─── Dining & Delivery selling prices ────────────────────── */}
                <div className="rounded-lg border p-3 space-y-3">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Selling Price & Food Cost %</p>

                    {/* Dining */}
                    <div className="space-y-1">
                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <UtensilsCrossed className="h-3 w-3" /> Dining Price ({symbol})
                        </label>
                        <Input
                            type="number" min="0" step="0.5"
                            placeholder="0"
                            value={diningPrice}
                            onChange={e => setDiningPrice(e.target.value)}
                            className="h-8 text-sm"
                        />
                        {(() => {
                            const sp = parseFloat(diningPrice);
                            if (!sp || sp <= 0 || ingCostPerYield <= 0) return null;
                            const pct = (ingCostPerYield / sp) * 100;
                            return (
                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-muted-foreground">Food Cost %</span>
                                    <span className={`text-sm font-bold tabular-nums ${fcPctColor(pct)}`}>
                                        {pct.toFixed(1)}% <span className="text-xs font-normal">({fcLabel(pct)})</span>
                                    </span>
                                </div>
                            );
                        })()}
                    </div>

                    {/* Delivery */}
                    <div className="space-y-1">
                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Bike className="h-3 w-3" /> Delivery Price ({symbol})
                        </label>
                        <Input
                            type="number" min="0" step="0.5"
                            placeholder="0"
                            value={deliveryPrice}
                            onChange={e => setDeliveryPrice(e.target.value)}
                            className="h-8 text-sm"
                        />
                        {(() => {
                            const sp = parseFloat(deliveryPrice);
                            if (!sp || sp <= 0 || ingCostPerYield <= 0) return null;
                            const pct = (ingCostPerYield / sp) * 100;
                            return (
                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-muted-foreground">Food Cost %</span>
                                    <span className={`text-sm font-bold tabular-nums ${fcPctColor(pct)}`}>
                                        {pct.toFixed(1)}% <span className="text-xs font-normal">({fcLabel(pct)})</span>
                                    </span>
                                </div>
                            );
                        })()}
                    </div>
                </div>

                {/* Suggested price */}
                {ingCostPerYield > 0 && (
                    <div className="rounded-lg border border-dashed p-3 space-y-1">
                        <p className="text-xs text-muted-foreground font-medium">Suggested selling price</p>
                        <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">30% food cost</span>
                            <span className="font-semibold tabular-nums">{format(ingCostPerYield / 0.3, 0)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">35% food cost</span>
                            <span className="font-semibold tabular-nums">{format(ingCostPerYield / 0.35, 0)}</span>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );

    return (
        <div className="space-y-4 max-w-5xl mx-auto animate-in fade-in duration-500 pb-16">
            {/* ── Header bar (mobile-friendly) ─────────────────────────────── */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Button variant="ghost" size="icon" className="shrink-0" onClick={() => router.push("/recipes")}>
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div className="min-w-0">
                        <h2 className="text-2xl font-bold font-playfair tracking-tight text-primary truncate">
                            {editId ? (recipeName || "Edit Recipe") : (recipeName || "New Recipe")}
                        </h2>
                        <p className="text-muted-foreground text-xs hidden sm:block">
                            {editId ? "Editing recipe" : "Recipe Builder & Cost Calculator"}
                        </p>
                    </div>
                </div>
                <div className="flex flex-col gap-1.5 sm:items-end">
                    {saveError && <p className="text-xs text-destructive font-medium">{saveError}</p>}
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={handleExportSOP} disabled={!recipeName.trim()}>
                            <FileText className="mr-1.5 h-4 w-4" /> S.O.P
                        </Button>
                        <Button size="sm" disabled={!recipeName.trim() || saving} onClick={handleSave}>
                            {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
                            {editId ? "Update" : "Save"}
                        </Button>
                    </div>
                </div>
            </div>

            {/* ── Mobile cost toggle ───────────────────────────────────────── */}
            <div className="lg:hidden">
                <Button
                    variant="outline"
                    className="w-full justify-between"
                    onClick={() => setShowCostBreakdown(v => !v)}
                >
                    <span className="flex items-center gap-2 text-sm">
                        Cost: <span className="font-bold text-primary">{format(ingCostPerYield)}/{yieldUnit || "yield"}</span>
                        {diningPrice && (
                            <span className="text-muted-foreground">· Dining {format(parseFloat(diningPrice))}</span>
                        )}
                    </span>
                    <ChevronDown className={`h-4 w-4 transition-transform ${showCostBreakdown ? "rotate-180" : ""}`} />
                </Button>
                {showCostBreakdown && (
                    <div className="mt-2">
                        <CostSidebar />
                    </div>
                )}
            </div>

            {/* ── Two-column layout (desktop) ──────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Left: Tabs */}
                <div className="lg:col-span-2 space-y-5">
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                        <TabsList className="grid w-full grid-cols-3 mb-4">
                            <TabsTrigger value="info" className="text-xs sm:text-sm">Info & Ingredients</TabsTrigger>
                            <TabsTrigger value="process" className="text-xs sm:text-sm">Equipment & Labor</TabsTrigger>
                            <TabsTrigger value="instructions" className="text-xs sm:text-sm">Instructions</TabsTrigger>
                        </TabsList>

                        {/* TAB 1: Info & Ingredients */}
                        <TabsContent value="info" className="space-y-4">
                            <Card>
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-base">Recipe Information</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="space-y-2 sm:col-span-2">
                                            <Label htmlFor="name">Recipe Name *</Label>
                                            <Input id="name" value={recipeName} onChange={e => setRecipeName(e.target.value)} placeholder="e.g. Pad Thai Sauce" />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Category</Label>
                                            <Select value={category} onValueChange={setCategory}>
                                                <SelectTrigger><SelectValue placeholder="Select Category" /></SelectTrigger>
                                                <SelectContent>
                                                    {categories.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Yield Amount</Label>
                                            <Input type="number" min={1} value={yieldAmount} onChange={e => setYieldAmount(e.target.value)} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Yield Unit</Label>
                                            <Input value={yieldUnit} onChange={e => setYieldUnit(e.target.value)} placeholder="e.g. serving, L" />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="flex items-center gap-1.5">
                                            <ImageIcon className="h-3.5 w-3.5" /> Recipe Image URL (optional)
                                        </Label>
                                        <Input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://example.com/photo.jpg" />
                                        {imageUrl && (
                                            <div className="mt-2 h-28 w-full rounded-lg border overflow-hidden bg-muted">
                                                <img src={imageUrl} alt="Recipe preview" className="w-full h-full object-cover"
                                                    onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                                            </div>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Ingredients table */}
                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between pb-3">
                                    <div>
                                        <CardTitle className="text-base">Ingredients</CardTitle>
                                        <CardDescription className="text-xs">Real-time cost calculation</CardDescription>
                                    </div>
                                    <Button variant="outline" size="sm" onClick={addIngredientRow}>
                                        <Plus className="mr-1.5 h-3.5 w-3.5" /> Add
                                    </Button>
                                </CardHeader>
                                <CardContent className="space-y-2 overflow-x-auto">
                                    {/* Header */}
                                    <div className="grid grid-cols-[1fr_80px_60px_70px_32px] gap-1.5 px-1 min-w-[380px]">
                                        <span className="text-xs text-muted-foreground font-medium">Ingredient</span>
                                        <span className="text-xs text-muted-foreground font-medium">Qty</span>
                                        <span className="text-xs text-muted-foreground font-medium">Unit</span>
                                        <span className="text-xs text-muted-foreground font-medium text-right">Cost</span>
                                        <span />
                                    </div>
                                    {ingredientRows.map((row) => {
                                        const ing = ingredients.find(i => i.id === row.ingredientId);
                                        const qty = parseFloat(row.quantity);
                                        const costPerUnit = ing ? Number(ing.purchasePrice) / Number(ing.conversionRate) / (Number(ing.yieldPercent) / 100) : 0;
                                        const lineCost = ing && qty ? costPerUnit * qty : 0;
                                        const proteinType = ing ? detectProteinType(ing.name) : null;
                                        return (
                                            <div key={row.id} className="grid grid-cols-[1fr_80px_60px_70px_32px] gap-1.5 items-center min-w-[380px]">
                                                <Select value={row.ingredientId} onValueChange={v => updateRow(row.id, "ingredientId", v)}>
                                                    <SelectTrigger className="h-9 text-xs">
                                                        <SelectValue placeholder="Select ingredient">
                                                            {ing && (
                                                                <span className="flex items-center gap-1.5">
                                                                    {proteinType && (
                                                                        <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">{proteinType}</Badge>
                                                                    )}
                                                                    {ing.name}
                                                                </span>
                                                            )}
                                                        </SelectValue>
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {ingredients.map(mi => (
                                                            <SelectItem key={mi.id} value={mi.id}>
                                                                <span className="flex items-center gap-1.5">
                                                                    {detectProteinType(mi.name) && (
                                                                        <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4 shrink-0">
                                                                            {detectProteinType(mi.name)}
                                                                        </Badge>
                                                                    )}
                                                                    {mi.name}
                                                                </span>
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <Input
                                                    className="h-9 text-xs"
                                                    type="number" min={0} step={0.1} placeholder="0"
                                                    value={row.quantity}
                                                    onChange={e => updateRow(row.id, "quantity", e.target.value)}
                                                />
                                                <div className="h-9 flex items-center text-xs text-muted-foreground px-2 border rounded-md bg-muted/50 truncate">
                                                    {ing?.recipeUnit ?? "—"}
                                                </div>
                                                <div className="h-9 flex items-center justify-end text-xs font-medium px-2 border rounded-md bg-muted/50 tabular-nums">
                                                    {format(lineCost)}
                                                </div>
                                                <Button variant="ghost" size="icon" className="h-9 w-8 text-destructive" onClick={() => removeRow(row.id)}>
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            </div>
                                        );
                                    })}
                                    <div className="flex justify-end pt-2 border-t">
                                        <span className="text-sm text-muted-foreground mr-4">Subtotal</span>
                                        <span className="text-sm font-bold text-primary tabular-nums">{format(totalIngredientCost)}</span>
                                    </div>
                                    {category === "Sauce Base" && (
                                        <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-md text-xs text-yellow-800 dark:text-yellow-400">
                                            <strong>Main Sauce mode:</strong> This recipe will be available as an ingredient in other recipes.
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {/* TAB 2: Equipment & Labor */}
                        <TabsContent value="process" className="space-y-4">
                            <Card>
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-base">Labor & Energy Costs</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label className="text-sm">Prep Time (min)</Label>
                                            <Input type="number" min={0} value={prepMinutes} onChange={e => setPrepMinutes(e.target.value)} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-sm">Cook Time (min)</Label>
                                            <Input type="number" min={0} value={cookMinutes} onChange={e => setCookMinutes(e.target.value)} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-sm">Labor ({symbol}/hr)</Label>
                                            <Input type="number" min={0} value={laborCostPerHour} onChange={e => setLaborCostPerHour(e.target.value)} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-sm">Energy ({symbol}/batch)</Label>
                                            <Input type="number" min={0} step={0.5} value={energyCost} onChange={e => setEnergyCost(e.target.value)} />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-3 gap-3 pt-1 border-t">
                                        <div className="rounded-lg bg-muted/50 p-3 text-center">
                                            <p className="text-xs text-muted-foreground mb-1">Total time</p>
                                            <p className="font-bold text-sm">{(parseFloat(prepMinutes) || 0) + (parseFloat(cookMinutes) || 0)} min</p>
                                        </div>
                                        <div className="rounded-lg bg-muted/50 p-3 text-center">
                                            <p className="text-xs text-muted-foreground mb-1">Labor cost</p>
                                            <p className="font-bold text-sm text-primary tabular-nums">{format(totalLaborCost)}</p>
                                        </div>
                                        <div className="rounded-lg bg-muted/50 p-3 text-center">
                                            <p className="text-xs text-muted-foreground mb-1">Energy cost</p>
                                            <p className="font-bold text-sm text-primary tabular-nums">{format(totalEnergyCost)}</p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-base">Equipment Required</CardTitle>
                                    <CardDescription className="text-xs">{selectedEquipment.size} item{selectedEquipment.size !== 1 ? "s" : ""} selected</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {equipment.filter(e => e.status !== "Retired").map(eq => (
                                            <label key={eq.id} className="flex items-center gap-3 p-2.5 border rounded-lg hover:bg-accent cursor-pointer transition-colors">
                                                <Checkbox checked={selectedEquipment.has(eq.id)} onCheckedChange={() => toggleEquipment(eq.id)} />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium truncate">{eq.name}</p>
                                                </div>
                                                <Badge variant="outline" className="text-xs shrink-0">{eq.type}</Badge>
                                            </label>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {/* TAB 3: Instructions */}
                        <TabsContent value="instructions">
                            <Card>
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-base">Preparation Instructions</CardTitle>
                                    <CardDescription className="text-xs">Step-by-step Standard Operating Procedure</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <Textarea
                                        className="min-h-[280px] font-mono text-sm"
                                        placeholder={"1. Prepare all ingredients...\n2. Heat the wok to high...\n3. Add oil and..."}
                                        value={instructions}
                                        onChange={e => setInstructions(e.target.value)}
                                    />
                                    <p className="text-xs text-muted-foreground mt-2">
                                        {instructions.split("\n").filter(Boolean).length} steps written
                                    </p>
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>
                </div>

                {/* Right: Cost Sidebar (desktop only) */}
                <div className="hidden lg:block">
                    <div className="sticky top-6">
                        <CostSidebar />
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function RecipeBuilder() {
    return (
        <Suspense fallback={<div className="flex justify-center items-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
            <RecipeBuilderInner />
        </Suspense>
    );
}
