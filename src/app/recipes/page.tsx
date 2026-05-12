"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { recipesApi, RecipeWithIngredients } from "@/lib/api";
import { useCategories, RecipeCategory } from "@/lib/use-categories";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    Dialog, DialogContent, DialogDescription,
    DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Search, ChefHat, Clock, Edit, Trash2, Loader2, Tag, X, Pencil, Settings2, UtensilsCrossed, Bike } from "lucide-react";
import { useCurrency } from "@/components/currency-context";
import { CURRENCIES } from "@/lib/currency";

// Food Cost % = ingredient cost only / selling price (industry standard)
function calcIngredientCost(recipe: RecipeWithIngredients): number {
    return recipe.ingredients.reduce((sum, row) => {
        const ing = row.ingredient;
        const costPerRecipeUnit =
            Number(ing.purchasePrice) / Number(ing.conversionRate) / (Number(ing.yieldPercent) / 100);
        return sum + costPerRecipeUnit * Number(row.quantity);
    }, 0);
}

function calcTotalCost(recipe: RecipeWithIngredients): number {
    const ingredientCost = calcIngredientCost(recipe);
    const laborCost = Number(recipe.laborCostPerHour) * ((recipe.prepTime + recipe.cookTime) / 60);
    const energyCost = Number(recipe.energyCostPerBatch);
    return ingredientCost + laborCost + energyCost;
}

function fcColor(pct: number) {
    if (pct <= 30) return "text-green-700 bg-green-50 border-green-200";
    if (pct <= 40) return "text-yellow-700 bg-yellow-50 border-yellow-200";
    return "text-red-700 bg-red-50 border-red-200";
}

export default function RecipesPage() {
    const router = useRouter();
    const [recipes, setRecipes] = useState<RecipeWithIngredients[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [catFilter, setCatFilter] = useState("all");
    const [deleteTarget, setDeleteTarget] = useState<RecipeWithIngredients | null>(null);

    const [manageOpen, setManageOpen] = useState(false);
    const [newCatName, setNewCatName] = useState("");
    const [newCatError, setNewCatError] = useState("");
    const [addingCat, setAddingCat] = useState(false);
    const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
    const [renameError, setRenameError] = useState("");
    const [catDeleteError, setCatDeleteError] = useState<string | null>(null);

    const { format, symbol, currency } = useCurrency();
    const rate = CURRENCIES[currency].rateFromTHB;
    const show = (amt: number, dec = 2) => `${symbol}${amt.toFixed(dec)}`;
    const { categories, loading: catsLoading, addCategory, updateCategory, removeCategory } = useCategories();

    useEffect(() => {
        recipesApi.list().then(setRecipes).finally(() => setLoading(false));
    }, []);

    const filtered = recipes.filter(r => {
        const matchSearch =
            r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            r.category.toLowerCase().includes(searchTerm.toLowerCase());
        const matchCat = catFilter === "all" || r.category === catFilter;
        return matchSearch && matchCat;
    });

    const handleDelete = async () => {
        if (!deleteTarget) return;
        try {
            await recipesApi.delete(deleteTarget.id);
            setRecipes(prev => prev.filter(r => r.id !== deleteTarget.id));
        } catch (err) { console.error(err); }
        setDeleteTarget(null);
    };

    const handleAddCategory = async () => {
        setNewCatError("");
        if (!newCatName.trim()) { setNewCatError("Category name is required."); return; }
        setAddingCat(true);
        const res = await addCategory(newCatName.trim());
        setAddingCat(false);
        if (!res.ok) { setNewCatError(res.error ?? "Failed to add category."); return; }
        setNewCatName("");
    };

    const handleStartRename = (cat: RecipeCategory) => {
        setRenaming({ id: cat.id, name: cat.name });
        setRenameError("");
    };

    const handleRename = async () => {
        if (!renaming) return;
        setRenameError("");
        if (!renaming.name.trim()) { setRenameError("Name cannot be empty."); return; }
        const res = await updateCategory(renaming.id, renaming.name.trim());
        if (!res.ok) { setRenameError(res.error ?? "Failed to rename."); return; }
        setRenaming(null);
    };

    const handleRemoveCategory = async (cat: RecipeCategory) => {
        setCatDeleteError(null);
        const res = await removeCategory(cat.id);
        if (!res.ok) { setCatDeleteError(res.error ?? "Failed to delete category."); return; }
        if (catFilter === cat.name) setCatFilter("all");
    };

    const handleQuickRemove = async (cat: RecipeCategory) => {
        const res = await removeCategory(cat.id);
        if (!res.ok) { setManageOpen(true); setCatDeleteError(res.error ?? "Failed to delete category."); return; }
        if (catFilter === cat.name) setCatFilter("all");
    };

    if (loading) return (
        <div className="flex justify-center items-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
    );

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-wrap justify-between items-start gap-3">
                <div>
                    <h2 className="text-3xl font-bold font-playfair tracking-tight text-primary">Recipes</h2>
                    <p className="text-muted-foreground">Manage your standard operating procedures and recipe costs.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Link href="/import-recipes">
                        <Button variant="outline">Import Recipes</Button>
                    </Link>
                    <Button variant="outline" onClick={() => { setManageOpen(true); setNewCatName(""); setNewCatError(""); setCatDeleteError(null); setRenaming(null); }}>
                        <Settings2 className="mr-2 h-4 w-4" /> Manage Categories
                    </Button>
                    <Link href="/recipes/new">
                        <Button><Plus className="mr-2 h-4 w-4" /> Create Recipe</Button>
                    </Link>
                </div>
            </div>

            {/* Search + Filters */}
            <div className="flex items-center gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search recipes..."
                        className="pl-8"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="flex gap-1.5 flex-wrap">
                    <Button variant={catFilter === "all" ? "default" : "outline"} size="sm" onClick={() => setCatFilter("all")}>
                        All
                    </Button>
                    {catsLoading ? (
                        <div className="h-8 w-24 rounded-md bg-muted animate-pulse" />
                    ) : (
                        categories.map(cat => (
                            <div key={cat.id} className="relative group/cat">
                                <Button
                                    variant={catFilter === cat.name ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => setCatFilter(cat.name)}
                                    className="capitalize pr-6"
                                >
                                    {cat.name}
                                </Button>
                                <button
                                    onClick={e => { e.stopPropagation(); handleQuickRemove(cat); }}
                                    className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-destructive text-destructive-foreground items-center justify-center hidden group-hover/cat:flex shadow"
                                    title="Remove category"
                                >
                                    <X className="h-2.5 w-2.5" />
                                </button>
                            </div>
                        ))
                    )}
                </div>
                <p className="text-sm text-muted-foreground ml-auto">
                    {filtered.length} recipe{filtered.length !== 1 ? "s" : ""}
                </p>
            </div>

            {/* Recipe Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {filtered.map((recipe) => {
                    const ingCost = calcIngredientCost(recipe);
                    const totalCost = calcTotalCost(recipe);
                    const yield_ = Number(recipe.yieldAmount);
                    const ingCostPerYield = ingCost / yield_;          // THB
                    const ingCostPerYieldDisplay = ingCostPerYield * rate; // display currency
                    const totalCostPerYield = totalCost / yield_;

                    // sellingPrice stored as display currency (CAD) — do not call format() on it
                    const diningPrice = recipe.sellingPrice != null ? Number(recipe.sellingPrice) : null;
                    const deliveryPrice = recipe.deliveryPrice != null ? Number(recipe.deliveryPrice) : null;

                    // Food Cost % = ingredient cost (display currency) / selling price (display currency)
                    const diningFC = diningPrice && diningPrice > 0 ? (ingCostPerYieldDisplay / diningPrice) * 100 : null;
                    const deliveryFC = deliveryPrice && deliveryPrice > 0 ? (ingCostPerYieldDisplay / deliveryPrice) * 100 : null;

                    // Primary badge: dining first, else delivery
                    const primaryFC = diningFC ?? deliveryFC;

                    return (
                        <Card
                            key={recipe.id}
                            className="overflow-hidden hover:shadow-md hover:border-primary/40 transition-all duration-200 group cursor-pointer flex flex-col"
                            onClick={() => router.push(`/recipes/new?id=${recipe.id}`)}
                        >
                            {/* Image / placeholder */}
                            <div className="h-36 bg-accent relative flex items-center justify-center border-b overflow-hidden shrink-0">
                                {recipe.imageUrl ? (
                                    <img
                                        src={recipe.imageUrl}
                                        alt={recipe.name}
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                        onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                                    />
                                ) : (
                                    <ChefHat className="h-14 w-14 text-primary/15" />
                                )}
                                {/* Overlay gradient for text legibility */}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent pointer-events-none" />

                                {/* Top-left: primary FC badge */}
                                {primaryFC != null && (
                                    <Badge variant="outline" className={`absolute top-2 left-2 text-xs font-bold border shadow-sm backdrop-blur-sm bg-white/80 ${fcColor(primaryFC)}`}>
                                        FC {primaryFC.toFixed(1)}%
                                    </Badge>
                                )}

                                {/* Top-right: Main Sauce */}
                                {recipe.isMainSauce && (
                                    <Badge className="absolute top-2 right-2 bg-amber-500 hover:bg-amber-600 text-xs shadow">
                                        Main Sauce
                                    </Badge>
                                )}

                                {/* Bottom: category + time */}
                                <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
                                    <Badge variant="secondary" className="text-xs bg-black/50 text-white border-0 backdrop-blur-sm">
                                        {recipe.category}
                                    </Badge>
                                    <span className="flex items-center gap-1 text-xs text-white/90">
                                        <Clock className="h-3 w-3" />
                                        {recipe.prepTime + recipe.cookTime}m
                                    </span>
                                </div>
                            </div>

                            {/* Name */}
                            <CardHeader className="p-4 pb-2 flex-1">
                                <CardTitle className="text-base leading-tight line-clamp-2">{recipe.name}</CardTitle>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    Yield: {recipe.yieldAmount} {recipe.yieldUnit}
                                    {recipe.ingredients.length > 0 && (
                                        <span className="ml-2 text-muted-foreground/70">· {recipe.ingredients.length} ingredients</span>
                                    )}
                                </p>
                            </CardHeader>

                            {/* Cost rows */}
                            <CardContent className="p-4 pt-0 space-y-2">
                                {/* Ingredient cost per yield */}
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">Ingredient cost</span>
                                    <span className="font-semibold text-primary tabular-nums">{format(ingCostPerYield)}/{recipe.yieldUnit}</span>
                                </div>
                                <div className="flex items-center justify-between text-xs text-muted-foreground">
                                    <span>Total cost (incl. labor)</span>
                                    <span className="tabular-nums">{format(totalCostPerYield)}/{recipe.yieldUnit}</span>
                                </div>

                                {/* Pricing: Dining & Delivery */}
                                {(diningPrice != null || deliveryPrice != null) && (
                                    <div className="pt-1 border-t space-y-1">
                                        {diningPrice != null && (
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="flex items-center gap-1 text-muted-foreground">
                                                    <UtensilsCrossed className="h-3 w-3" /> Dining
                                                </span>
                                                <span className="flex items-center gap-2">
                                                    <span className="tabular-nums font-medium">{show(diningPrice)}</span>
                                                    {diningFC != null && (
                                                        <span className={`font-semibold tabular-nums ${fcColor(diningFC).split(" ")[0]}`}>
                                                            {diningFC.toFixed(1)}%
                                                        </span>
                                                    )}
                                                </span>
                                            </div>
                                        )}
                                        {deliveryPrice != null && (
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="flex items-center gap-1 text-muted-foreground">
                                                    <Bike className="h-3 w-3" /> Delivery
                                                </span>
                                                <span className="flex items-center gap-2">
                                                    <span className="tabular-nums font-medium">{show(deliveryPrice)}</span>
                                                    {deliveryFC != null && (
                                                        <span className={`font-semibold tabular-nums ${fcColor(deliveryFC).split(" ")[0]}`}>
                                                            {deliveryFC.toFixed(1)}%
                                                        </span>
                                                    )}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </CardContent>

                            <CardFooter className="p-3 pt-0 flex justify-end items-center border-t bg-muted/30">
                                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                                    <Link href={`/recipes/new?id=${recipe.id}`} onClick={(e) => e.stopPropagation()}>
                                        <Button variant="ghost" size="icon" className="h-8 w-8">
                                            <Edit className="h-4 w-4" />
                                        </Button>
                                    </Link>
                                    <Button
                                        variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(recipe); }}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                                <span className="text-xs text-muted-foreground mr-auto">Total: {format(totalCost)}</span>
                            </CardFooter>
                        </Card>
                    );
                })}
            </div>

            {filtered.length === 0 && (
                <div className="text-center py-16 border rounded-xl border-dashed">
                    <ChefHat className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-muted-foreground">No recipes found</h3>
                    <p className="text-sm text-muted-foreground/70 mt-1">Try adjusting your search or create a new recipe.</p>
                </div>
            )}

            {/* Manage Categories Dialog */}
            <Dialog open={manageOpen} onOpenChange={v => { setManageOpen(v); setCatDeleteError(null); setRenaming(null); }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Tag className="h-4 w-4" /> Manage Categories
                        </DialogTitle>
                        <DialogDescription>Add, rename, or delete recipe categories.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
                        {catsLoading ? (
                            <div className="space-y-2">
                                {[1, 2, 3].map(i => <div key={i} className="h-10 rounded-md bg-muted animate-pulse" />)}
                            </div>
                        ) : categories.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-4">No categories yet.</p>
                        ) : (
                            categories.map(cat => {
                                const usageCount = recipes.filter(r => r.category === cat.name).length;
                                const isRenaming = renaming?.id === cat.id;
                                return (
                                    <div key={cat.id} className="flex items-center gap-2 group/row">
                                        {isRenaming ? (
                                            <>
                                                <Input
                                                    className="flex-1 h-9"
                                                    value={renaming.name}
                                                    autoFocus
                                                    onChange={e => setRenaming({ id: cat.id, name: e.target.value })}
                                                    onKeyDown={e => {
                                                        if (e.key === "Enter") handleRename();
                                                        if (e.key === "Escape") setRenaming(null);
                                                    }}
                                                />
                                                <Button size="sm" onClick={handleRename}>Save</Button>
                                                <Button size="sm" variant="ghost" onClick={() => setRenaming(null)}>Cancel</Button>
                                            </>
                                        ) : (
                                            <>
                                                <span className="flex-1 text-sm font-medium">{cat.name}</span>
                                                <span className="text-xs text-muted-foreground tabular-nums">
                                                    {usageCount} recipe{usageCount !== 1 ? "s" : ""}
                                                </span>
                                                <Button
                                                    size="icon" variant="ghost"
                                                    className="h-8 w-8 opacity-0 group-hover/row:opacity-100 transition-opacity"
                                                    onClick={() => handleStartRename(cat)}
                                                >
                                                    <Pencil className="h-3.5 w-3.5" />
                                                </Button>
                                                <Button
                                                    size="icon" variant="ghost"
                                                    className="h-8 w-8 text-destructive opacity-0 group-hover/row:opacity-100 transition-opacity"
                                                    onClick={() => handleRemoveCategory(cat)}
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            </>
                                        )}
                                    </div>
                                );
                            })
                        )}
                        {renameError && <p className="text-xs text-destructive">{renameError}</p>}
                        {catDeleteError && <p className="text-xs text-destructive">{catDeleteError}</p>}
                    </div>
                    <div className="border-t pt-3 space-y-2">
                        <Label className="text-xs text-muted-foreground uppercase tracking-wide">Add New Category</Label>
                        <div className="flex gap-2">
                            <Input
                                placeholder="e.g. Appetizer, Dessert..."
                                value={newCatName}
                                onChange={e => { setNewCatName(e.target.value); setNewCatError(""); }}
                                onKeyDown={e => e.key === "Enter" && handleAddCategory()}
                                className="flex-1"
                            />
                            <Button onClick={handleAddCategory} disabled={addingCat}>
                                {addingCat ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                            </Button>
                        </div>
                        {newCatError && <p className="text-xs text-destructive">{newCatError}</p>}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setManageOpen(false)}>Close</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Recipe Dialog */}
            <Dialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Delete Recipe</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
                        <Button variant="destructive" onClick={handleDelete}>Delete</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
