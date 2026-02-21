"use client";

import { useState, useEffect } from "react";
import { ingredientsApi, suppliersApi, Ingredient, Supplier } from "@/lib/api";

const UNITS = {
    Weight: ["kg", "g", "lb", "oz"],
    Volume: ["L", "ml", "fl oz"],
    Count: ["pc", "pack", "bottle", "can", "box"],
};
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Table, TableBody, TableCell, TableHead,
    TableHeader, TableRow
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
    Dialog, DialogContent, DialogDescription,
    DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
    Select, SelectContent, SelectItem,
    SelectTrigger, SelectValue
} from "@/components/ui/select";
import { Plus, Search, Edit, Trash2, ArrowRight, ShoppingCart, Loader2, ImageIcon } from "lucide-react";
import Link from "next/link";
import { useCurrency } from "@/components/currency-context";

export default function IngredientsPage() {
    const [ingredients, setIngredients] = useState<Ingredient[]>([]);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [groupFilter, setGroupFilter] = useState<string>("all");
    const [dialogOpen, setDialogOpen] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [editTarget, setEditTarget] = useState<Ingredient | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<Ingredient | null>(null);

    const emptyForm = (): Omit<Ingredient, "id" | "createdAt" | "updatedAt" | "supplier"> => ({
        name: "", supplierId: suppliers[0]?.id ?? "", purchaseUnit: "kg",
        purchasePrice: 0, recipeUnit: "g", yieldPercent: 100,
        conversionRate: 1000, groupId: "Weight", imageUrl: "",
    });
    const [form, setForm] = useState<Omit<Ingredient, "id" | "createdAt" | "updatedAt" | "supplier">>({
        name: "", supplierId: "", purchaseUnit: "kg",
        purchasePrice: 0, recipeUnit: "g", yieldPercent: 100,
        conversionRate: 1000, groupId: "Weight", imageUrl: "",
    });

    useEffect(() => {
        Promise.all([ingredientsApi.list(), suppliersApi.list()])
            .then(([ings, sups]) => { setIngredients(ings); setSuppliers(sups); })
            .finally(() => setLoading(false));
    }, []);

    const filtered = ingredients.filter(i => {
        const matchSearch = i.name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchGroup = groupFilter === "all" || i.groupId === groupFilter;
        return matchSearch && matchGroup;
    });

    const getSupplierName = (ing: Ingredient) =>
        ing.supplier?.name ?? suppliers.find(s => s.id === ing.supplierId)?.name ?? "Unknown";

    const costPerRecipeUnit = (item: Ingredient) =>
        (Number(item.purchasePrice) / Number(item.conversionRate)) / (Number(item.yieldPercent) / 100);

    const openAdd = () => { setEditTarget(null); setForm(emptyForm()); setDialogOpen(true); };
    const openEdit = (item: Ingredient) => {
        setEditTarget(item);
        setForm({ name: item.name, supplierId: item.supplierId, purchaseUnit: item.purchaseUnit,
            purchasePrice: Number(item.purchasePrice), recipeUnit: item.recipeUnit,
            yieldPercent: Number(item.yieldPercent), conversionRate: Number(item.conversionRate),
            groupId: item.groupId, imageUrl: item.imageUrl ?? "" });
        setDialogOpen(true);
    };

    const handleSave = async () => {
        if (!form.name.trim()) return;
        setSaving(true);
        try {
            if (editTarget) {
                const updated = await ingredientsApi.update(editTarget.id, form);
                setIngredients(prev => prev.map(i => i.id === updated.id ? updated : i));
            } else {
                const created = await ingredientsApi.create(form);
                setIngredients(prev => [...prev, created]);
            }
            setDialogOpen(false);
        } catch (err) { console.error(err); } finally { setSaving(false); }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setSaving(true);
        try {
            await ingredientsApi.delete(deleteTarget.id);
            setIngredients(prev => prev.filter(i => i.id !== deleteTarget.id));
            setDeleteDialogOpen(false); setDeleteTarget(null);
        } catch (err) { console.error(err); } finally { setSaving(false); }
    };

    const allUnits = [...UNITS.Weight, ...UNITS.Volume, ...UNITS.Count];
    const { format, symbol } = useCurrency();

    if (loading) return <div className="flex justify-center items-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex justify-between items-start">
                <div>
                    <h2 className="text-3xl font-bold font-playfair tracking-tight text-primary">Ingredients</h2>
                    <p className="text-muted-foreground">Manage raw materials and unit conversions.</p>
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
                    <div><p className="text-xl font-bold text-primary">{ingredients.length}</p><p className="text-xs text-muted-foreground">Total</p></div>
                </div>
                {(["Weight", "Volume", "Count"] as const).map(g => (
                    <div key={g} className="rounded-xl border bg-card px-4 py-3 cursor-pointer hover:border-primary/50 transition-colors"
                        onClick={() => setGroupFilter(groupFilter === g ? "all" : g)}>
                        <p className="text-xl font-bold">{ingredients.filter(i => i.groupId === g).length}</p>
                        <p className="text-xs text-muted-foreground">{g} items {groupFilter === g ? "✓" : ""}</p>
                    </div>
                ))}
            </div>

            <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Search ingredients..." className="pl-8" value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)} />
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

            <div className="border rounded-md overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-16">Image</TableHead>
                            <TableHead>Ingredient Name</TableHead>
                            <TableHead>Supplier</TableHead>
                            <TableHead>Group</TableHead>
                            <TableHead>Cost / Purchase Unit</TableHead>
                            <TableHead>Yield %</TableHead>
                            <TableHead>Conversion</TableHead>
                            <TableHead>Cost / Recipe Unit</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filtered.map((item) => (
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
                                    {getSupplierName(item) === "Owner Sauce" && (
                                        <Badge variant="secondary" className="ml-2 text-[10px]">Auto-generated</Badge>
                                    )}
                                </TableCell>
                                <TableCell className="text-muted-foreground text-sm">{getSupplierName(item)}</TableCell>
                                <TableCell><Badge variant="outline">{item.groupId}</Badge></TableCell>
                                <TableCell>{format(Number(item.purchasePrice))} / {item.purchaseUnit}</TableCell>
                                <TableCell>
                                    <span className={Number(item.yieldPercent) < 90 ? "text-yellow-600 dark:text-yellow-400 font-medium" : ""}>
                                        {Number(item.yieldPercent)}%
                                    </span>
                                </TableCell>
                                <TableCell>
                                    <div className="flex items-center text-xs text-muted-foreground">
                                        1&nbsp;{item.purchaseUnit}&nbsp;<ArrowRight className="h-3 w-3 mx-1" />&nbsp;
                                        {Number(item.conversionRate)}&nbsp;{item.recipeUnit}
                                    </div>
                                </TableCell>
                                <TableCell className="font-semibold text-primary">
                                    {format(costPerRecipeUnit(item), 4)} / {item.recipeUnit}
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
                        ))}
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

            {/* Add/Edit Dialog */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{editTarget ? "Edit Ingredient" : "Add Ingredient"}</DialogTitle>
                        <DialogDescription>
                            {editTarget ? `Editing ${editTarget.name}` : "Add a new raw material with unit conversion settings."}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
                        <div className="col-span-2 space-y-1.5">
                            <Label>Ingredient Name *</Label>
                            <Input placeholder="e.g. Tiger Shrimp" value={form.name}
                                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                        </div>
                        <div className="col-span-2 space-y-1.5">
                            <Label>Image URL <span className="text-muted-foreground text-xs">(optional)</span></Label>
                            <Input placeholder="https://example.com/image.jpg" value={form.imageUrl ?? ""}
                                onChange={e => setForm(f => ({ ...f, imageUrl: e.target.value }))} />
                            {form.imageUrl && (
                                <img src={form.imageUrl} alt="preview"
                                    className="mt-2 h-24 w-24 rounded-lg object-cover border" />
                            )}
                        </div>
                        <div className="space-y-1.5">
                            <Label>Supplier</Label>
                            <Select value={form.supplierId} onValueChange={v => setForm(f => ({ ...f, supplierId: v }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                            {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Unit Group</Label>
                            <Select value={form.groupId} onValueChange={v => setForm(f => ({ ...f, groupId: v as Ingredient["groupId"] }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Weight">Weight</SelectItem>
                                    <SelectItem value="Volume">Volume</SelectItem>
                                    <SelectItem value="Count">Count</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Purchase Unit</Label>
                            <Select value={form.purchaseUnit} onValueChange={v => setForm(f => ({ ...f, purchaseUnit: v }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {allUnits.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Purchase Price ({symbol} per purchase unit)</Label>
                            <Input type="number" min={0} step={0.01} value={form.purchasePrice}
                                onChange={e => setForm(f => ({ ...f, purchasePrice: parseFloat(e.target.value) || 0 }))} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Recipe Unit</Label>
                            <Select value={form.recipeUnit} onValueChange={v => setForm(f => ({ ...f, recipeUnit: v }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {allUnits.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Conversion Rate (recipe units per purchase unit)</Label>
                            <Input type="number" min={1} step={1} value={form.conversionRate}
                                onChange={e => setForm(f => ({ ...f, conversionRate: parseFloat(e.target.value) || 1 }))} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Yield % (after prep waste)</Label>
                            <Input type="number" min={1} max={100} step={1} value={form.yieldPercent}
                                onChange={e => setForm(f => ({ ...f, yieldPercent: parseFloat(e.target.value) || 100 }))} />
                        </div>
                        {/* Live preview */}
                        <div className="col-span-2 rounded-lg bg-primary/5 border border-primary/20 p-3 text-sm">
                            <span className="font-medium text-primary mr-2">Effective cost:</span>
                            <span>{format((form.purchasePrice / (form.conversionRate || 1)) / ((form.yieldPercent || 100) / 100), 5)} / {form.recipeUnit || "unit"}</span>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
                        <Button onClick={handleSave} disabled={!form.name.trim() || saving}>
                            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {editTarget ? "Save Changes" : "Add Ingredient"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Dialog */}
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
