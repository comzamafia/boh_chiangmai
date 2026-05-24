"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter,
    DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
    Table, TableBody, TableCell, TableHead,
    TableHeader, TableRow,
} from "@/components/ui/table";
import { Tag, Plus, Pencil, Trash2, Loader2, AlertCircle, Sparkles } from "lucide-react";
import { ingredientCategoriesApi, type IngredientCategory } from "@/lib/api";

// ─── Default categories for Thai restaurant ───────────────────────────────────
const DEFAULT_CATEGORIES = [
    { name: "Proteins",              description: "Meat, poultry, seafood and eggs",       sortOrder: 1 },
    { name: "Vegetables",            description: "Fresh and frozen vegetables",            sortOrder: 2 },
    { name: "Herbs & Spices",        description: "Fresh herbs, dried spices and aromatics",sortOrder: 3 },
    { name: "Seasoning & Sauces",    description: "Fish sauce, soy, oyster sauce and pastes", sortOrder: 4 },
    { name: "Dry Goods",             description: "Rice, noodles, flour and dried goods",  sortOrder: 5 },
    { name: "Oils & Fats",           description: "Cooking oils, coconut milk and fats",   sortOrder: 6 },
    { name: "Dairy & Eggs",          description: "Eggs, milk and dairy products",         sortOrder: 7 },
    { name: "Fruits",                description: "Fresh and dried fruits",                sortOrder: 8 },
    { name: "Beverages",             description: "Drinks, juices and syrups",             sortOrder: 9 },
    { name: "Packaging",             description: "Containers, bags and packaging materials", sortOrder: 10 },
];

const emptyForm = { name: "", description: "", sortOrder: 0 };

export default function IngredientCategoriesPage() {
    const [cats, setCats]               = useState<IngredientCategory[]>([]);
    const [loading, setLoading]         = useState(true);
    const [saving, setSaving]           = useState(false);
    const [seeding, setSeeding]         = useState(false);
    const [error, setError]             = useState<string | null>(null);
    const [dialogOpen, setDialogOpen]   = useState(false);
    const [editCat, setEditCat]         = useState<IngredientCategory | null>(null);
    const [deleteCat, setDeleteCat]     = useState<IngredientCategory | null>(null);
    const [form, setForm]               = useState(emptyForm);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setCats(await ingredientCategoriesApi.list());
        } catch {
            setError("Failed to load categories");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const openAdd = () => {
        setEditCat(null);
        setForm({ name: "", description: "", sortOrder: cats.length * 10 });
        setError(null);
        setDialogOpen(true);
    };

    const openEdit = (cat: IngredientCategory) => {
        setEditCat(cat);
        setForm({ name: cat.name, description: cat.description ?? "", sortOrder: cat.sortOrder });
        setError(null);
        setDialogOpen(true);
    };

    const handleSave = async () => {
        if (!form.name.trim()) return;
        setSaving(true);
        setError(null);
        try {
            if (editCat) {
                const updated = await ingredientCategoriesApi.update(editCat.id, {
                    name: form.name.trim(),
                    description: form.description.trim() || undefined,
                    sortOrder: Number(form.sortOrder),
                });
                setCats(prev => prev.map(c => c.id === updated.id ? updated : c));
            } else {
                const created = await ingredientCategoriesApi.create({
                    name: form.name.trim(),
                    description: form.description.trim() || undefined,
                    sortOrder: Number(form.sortOrder),
                });
                setCats(prev => [...prev, created].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)));
            }
            setDialogOpen(false);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Save failed");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!deleteCat) return;
        setSaving(true);
        setError(null);
        try {
            await ingredientCategoriesApi.delete(deleteCat.id);
            setCats(prev => prev.filter(c => c.id !== deleteCat.id));
            setDeleteCat(null);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Delete failed");
            setDeleteCat(null);
        } finally {
            setSaving(false);
        }
    };

    const handleSeedDefaults = async () => {
        const existingNames = new Set(cats.map(c => c.name.toLowerCase()));
        const toCreate = DEFAULT_CATEGORIES.filter(d => !existingNames.has(d.name.toLowerCase()));
        if (toCreate.length === 0) { setError("All default categories already exist."); return; }
        setSeeding(true);
        setError(null);
        try {
            for (const d of toCreate) {
                await ingredientCategoriesApi.create(d);
            }
            await load();
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Seeding failed");
        } finally {
            setSeeding(false);
        }
    };

    return (
        <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                    <h2 className="text-3xl font-bold font-playfair tracking-tight text-primary">Ingredient Categories</h2>
                    <p className="text-muted-foreground">Organise ingredients by type (Proteins, Vegetables, Seasoning…)</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                    <Button variant="outline" onClick={handleSeedDefaults} disabled={seeding || loading}>
                        {seeding
                            ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Adding defaults…</>
                            : <><Sparkles className="mr-2 h-4 w-4" /> Add Defaults</>}
                    </Button>
                    <Button onClick={openAdd}>
                        <Plus className="mr-2 h-4 w-4" /> Add Category
                    </Button>
                </div>
            </div>

            {error && !dialogOpen && !deleteCat && (
                <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 text-destructive px-4 py-2 text-sm">
                    <AlertCircle className="h-4 w-4 shrink-0" /> {error}
                </div>
            )}

            {/* Categories table */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Tag className="h-4 w-4" /> Categories
                    </CardTitle>
                    <CardDescription>
                        {loading ? "Loading…" : `${cats.length} categor${cats.length !== 1 ? "ies" : "y"}`}
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="flex justify-center py-12">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : cats.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-6">
                            <Tag className="h-10 w-10 text-muted-foreground/30" />
                            <p className="text-muted-foreground text-sm">No categories yet.</p>
                            <p className="text-muted-foreground text-xs">Click <strong>Add Defaults</strong> to add common Thai restaurant categories, or <strong>Add Category</strong> to create your own.</p>
                            <div className="flex gap-2 mt-2">
                                <Button variant="outline" size="sm" onClick={handleSeedDefaults} disabled={seeding}>
                                    <Sparkles className="mr-1 h-3.5 w-3.5" /> Add Defaults
                                </Button>
                                <Button size="sm" onClick={openAdd}>
                                    <Plus className="mr-1 h-3.5 w-3.5" /> Add Category
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-10 text-center">#</TableHead>
                                    <TableHead>Name</TableHead>
                                    <TableHead className="hidden sm:table-cell">Description</TableHead>
                                    <TableHead className="text-center">Ingredients</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {cats.map((cat, idx) => (
                                    <TableRow key={cat.id}>
                                        <TableCell className="text-center text-muted-foreground text-sm">{idx + 1}</TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <Badge variant="secondary" className="font-medium">{cat.name}</Badge>
                                            </div>
                                        </TableCell>
                                        <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                                            {cat.description ?? <span className="italic opacity-50">—</span>}
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <span className={`text-sm font-semibold ${(cat._count?.ingredients ?? 0) > 0 ? "text-primary" : "text-muted-foreground"}`}>
                                                {cat._count?.ingredients ?? 0}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(cat)}>
                                                <Pencil className="h-3.5 w-3.5" />
                                            </Button>
                                            <Button
                                                variant="ghost" size="icon"
                                                className="h-8 w-8 text-destructive hover:text-destructive"
                                                onClick={() => setDeleteCat(cat)}
                                                disabled={(cat._count?.ingredients ?? 0) > 0}
                                                title={(cat._count?.ingredients ?? 0) > 0 ? "Re-assign ingredients before deleting" : "Delete"}
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {/* Default categories reference */}
            <Card className="border-muted">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-muted-foreground font-normal">Default category list (Thai restaurant)</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-wrap gap-2">
                        {DEFAULT_CATEGORIES.map(d => (
                            <Badge key={d.name} variant="outline" className="text-xs font-normal">{d.name}</Badge>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* ── Add / Edit Dialog ── */}
            <Dialog open={dialogOpen} onOpenChange={v => { setDialogOpen(v); if (!v) setError(null); }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{editCat ? "Edit Category" : "Add Category"}</DialogTitle>
                        <DialogDescription>
                            {editCat ? `Editing "${editCat.name}"` : "Create a new ingredient category."}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="space-y-1.5">
                            <Label>Name <span className="text-destructive">*</span></Label>
                            <Input
                                placeholder="e.g. Proteins"
                                value={form.name}
                                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                autoFocus
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Description <span className="text-xs text-muted-foreground">(optional)</span></Label>
                            <Input
                                placeholder="e.g. Meat, poultry, seafood and eggs"
                                value={form.description}
                                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Sort Order</Label>
                            <Input
                                type="number" min={0} step={1}
                                value={form.sortOrder}
                                onChange={e => setForm(f => ({ ...f, sortOrder: Number(e.target.value) }))}
                            />
                            <p className="text-xs text-muted-foreground">Lower numbers appear first in lists.</p>
                        </div>
                        {error && (
                            <p className="text-sm text-destructive flex items-center gap-1.5">
                                <AlertCircle className="h-4 w-4 shrink-0" /> {error}
                            </p>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
                        <Button onClick={handleSave} disabled={!form.name.trim() || saving}>
                            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {editCat ? "Save Changes" : "Add Category"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── Delete Confirm ── */}
            <Dialog open={!!deleteCat} onOpenChange={v => { if (!v) setDeleteCat(null); }}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Delete Category</DialogTitle>
                        <DialogDescription>
                            Delete <strong>{deleteCat?.name}</strong>? This cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    {error && (
                        <p className="text-sm text-destructive flex items-center gap-1.5 px-1">
                            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
                        </p>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteCat(null)} disabled={saving}>Cancel</Button>
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
