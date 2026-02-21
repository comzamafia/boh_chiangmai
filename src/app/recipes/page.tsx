"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { recipesApi, RecipeWithIngredients } from "@/lib/api";
import { useCategories, RecipeCategory } from "@/lib/use-categories";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    Dialog, DialogContent, DialogDescription,
    DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Search, ChefHat, Clock, Banknote, Edit, Trash2, Loader2, Tag, X, Pencil, Settings2 } from "lucide-react";
import { useCurrency } from "@/components/currency-context";

function calcTotalCost(recipe: RecipeWithIngredients): number {
    const ingredientCost = recipe.ingredients.reduce((sum, row) => {
        const ing = row.ingredient;
        const costPerUnit = Number(ing.purchasePrice) / Number(ing.conversionRate) / (Number(ing.yieldPercent) / 100);
        return sum + costPerUnit * Number(row.quantity);
    }, 0);
    const laborCost = Number(recipe.laborCostPerHour) * ((recipe.prepTime + recipe.cookTime) / 60);
    const energyCost = Number(recipe.energyCostPerBatch);
    return ingredientCost + laborCost + energyCost;
}

export default function RecipesPage() {
    const router = useRouter();
    const [recipes, setRecipes] = useState<RecipeWithIngredients[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [catFilter, setCatFilter] = useState("all");
    const [deleteTarget, setDeleteTarget] = useState<RecipeWithIngredients | null>(null);

    // Manage-categories dialog state
    const [manageOpen, setManageOpen] = useState(false);
    const [newCatName, setNewCatName] = useState("");
    const [newCatError, setNewCatError] = useState("");
    const [addingCat, setAddingCat] = useState(false);

    // Rename state
    const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
    const [renameError, setRenameError] = useState("");

    // Delete-category error
    const [catDeleteError, setCatDeleteError] = useState<string | null>(null);

    const { format } = useCurrency();
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
        if (!res.ok) {
            setCatDeleteError(res.error ?? "Failed to delete category.");
            return;
        }
        if (catFilter === cat.name) setCatFilter("all");
    };

    const handleQuickRemove = async (cat: RecipeCategory) => {
        const res = await removeCategory(cat.id);
        if (!res.ok) {
            setManageOpen(true);
            setCatDeleteError(res.error ?? "Failed to delete category.");
            return;
        }
        if (catFilter === cat.name) setCatFilter("all");
    };

    if (loading) return (
        <div className="flex justify-center items-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
    );

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
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
                        <Button>
                            <Plus className="mr-2 h-4 w-4" /> Create Recipe
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Search + Category Filters */}
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
                    <Button
                        variant={catFilter === "all" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setCatFilter("all")}
                    >
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filtered.map((recipe) => {
                    const totalCost = calcTotalCost(recipe);
                    const costPerYield = totalCost / Number(recipe.yieldAmount);
                    return (
                        <Card key={recipe.id} className="overflow-hidden hover:border-primary/50 transition-colors group cursor-pointer" onClick={() => router.push(`/recipes/new?id=${recipe.id}`)}>
                            <div className="h-32 bg-accent relative flex items-center justify-center border-b overflow-hidden">
                                {recipe.imageUrl ? (
                                    <img
                                        src={recipe.imageUrl}
                                        alt={recipe.name}
                                        className="w-full h-full object-cover"
                                        onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                                    />
                                ) : (
                                    <ChefHat className="h-12 w-12 text-primary/20" />
                                )}
                                {recipe.isMainSauce && (
                                    <Badge className="absolute top-2 right-2 bg-yellow-500 hover:bg-yellow-600 text-xs">
                                        Main Sauce
                                    </Badge>
                                )}
                                <Badge variant="outline" className="absolute bottom-2 left-2 text-xs bg-background/80 backdrop-blur-sm">
                                    {recipe.category}
                                </Badge>
                            </div>
                            <CardHeader className="p-4 pb-2">
                                <CardTitle className="text-lg line-clamp-1">{recipe.name}</CardTitle>
                                <CardDescription className="text-xs">Yield: {recipe.yieldAmount} {recipe.yieldUnit}</CardDescription>
                            </CardHeader>
                            <CardContent className="p-4 pt-0">
                                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                    <div className="flex items-center gap-1">
                                        <Clock className="h-3.5 w-3.5" />
                                        <span>{recipe.prepTime + recipe.cookTime}m</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Banknote className="h-3.5 w-3.5" />
                                        <span className="font-semibold text-primary tabular-nums">
                                            {format(costPerYield)}/{recipe.yieldUnit}
                                        </span>
                                    </div>
                                </div>
                            </CardContent>
                            <CardFooter className="p-4 pt-0 flex justify-between items-center">
                                <span className="text-xs text-muted-foreground tabular-nums">Total: {format(totalCost)}</span>
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
                            </CardFooter>
                        </Card>
                    );
                })}
            </div>

            {filtered.length === 0 && (
                <div className="text-center py-12 border rounded-lg border-dashed">
                    <ChefHat className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-muted-foreground">No recipes found</h3>
                    <p className="text-sm text-muted-foreground/80 mt-1">Try adjusting your search or create a new recipe.</p>
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
                                                    title="Rename"
                                                >
                                                    <Pencil className="h-3.5 w-3.5" />
                                                </Button>
                                                <Button
                                                    size="icon" variant="ghost"
                                                    className="h-8 w-8 text-destructive opacity-0 group-hover/row:opacity-100 transition-opacity"
                                                    onClick={() => handleRemoveCategory(cat)}
                                                    title="Delete"
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
