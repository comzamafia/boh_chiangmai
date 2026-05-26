"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter,
    DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
    Select, SelectContent, SelectItem,
    SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
    Table, TableBody, TableCell, TableHead,
    TableHeader, TableRow,
} from "@/components/ui/table";
import { Warehouse, Plus, Pencil, Trash2, Thermometer, Loader2, AlertCircle, Bell, BellOff } from "lucide-react";
import { storageAreasApi, type StorageArea } from "@/lib/api";
import Link from "next/link";

const TEMPERATURES = [
    "Ambient (15-25°C)",
    "Chilled (2-5°C)",
    "Frozen (-18°C)",
    "Custom",
];

const TEMP_BADGE: Record<string, string> = {
    "Ambient (15-25°C)": "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
    "Chilled (2-5°C)":   "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    "Frozen (-18°C)":    "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300",
};

const emptyForm = { name: "", temperature: "", isActive: true, sortOrder: 0 };

export default function StorageAreasPage() {
    const [areas, setAreas]             = useState<StorageArea[]>([]);
    const [loading, setLoading]         = useState(true);
    const [saving, setSaving]           = useState(false);
    const [error, setError]             = useState<string | null>(null);
    const [dialogOpen, setDialogOpen]   = useState(false);
    const [editArea, setEditArea]       = useState<StorageArea | null>(null);
    const [deleteArea, setDeleteArea]   = useState<StorageArea | null>(null);
    const [form, setForm]               = useState(emptyForm);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setAreas(await storageAreasApi.list());
        } catch {
            setError("Failed to load storage areas");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    function openAdd() {
        setEditArea(null);
        setForm(emptyForm);
        setError(null);
        setDialogOpen(true);
    }

    function openEdit(area: StorageArea) {
        setEditArea(area);
        setForm({
            name:        area.name,
            temperature: area.temperature ?? "",
            isActive:    area.isActive,
            sortOrder:   area.sortOrder,
        });
        setError(null);
        setDialogOpen(true);
    }

    async function handleSave() {
        if (!form.name.trim()) { setError("Name is required"); return; }
        setSaving(true);
        setError(null);
        try {
            if (editArea) {
                await storageAreasApi.update(editArea.id, {
                    name:        form.name.trim(),
                    temperature: form.temperature || undefined,
                    isActive:    form.isActive,
                    sortOrder:   form.sortOrder,
                });
            } else {
                await storageAreasApi.create({
                    name:        form.name.trim(),
                    temperature: form.temperature || undefined,
                    isActive:    form.isActive,
                    sortOrder:   form.sortOrder,
                });
            }
            setDialogOpen(false);
            await load();
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Failed to save");
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete() {
        if (!deleteArea) return;
        try {
            await storageAreasApi.delete(deleteArea.id);
            setDeleteArea(null);
            await load();
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Failed to delete");
            setDeleteArea(null);
        }
    }

    const totalIngredients = areas.reduce((s, a) => s + (a._count?.ingredients ?? 0), 0);
    const activeCount      = areas.filter(a => a.isActive).length;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                        <Warehouse className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold">Storage Areas</h1>
                        <p className="text-sm text-muted-foreground">
                            Manage physical storage locations for ingredients
                        </p>
                    </div>
                </div>
                <Button onClick={openAdd} className="gap-2">
                    <Plus className="w-4 h-4" /> Add Area
                </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
                <Card>
                    <CardContent className="pt-4 pb-4">
                        <p className="text-xs text-muted-foreground">Total Areas</p>
                        <p className="text-2xl font-bold">{areas.length}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4 pb-4">
                        <p className="text-xs text-muted-foreground">Active</p>
                        <p className="text-2xl font-bold text-green-600">{activeCount}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4 pb-4">
                        <p className="text-xs text-muted-foreground">Ingredients Assigned</p>
                        <p className="text-2xl font-bold text-blue-600">{totalIngredients}</p>
                    </CardContent>
                </Card>
            </div>

            {/* Error banner */}
            {error && !dialogOpen && (
                <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {error}
                </div>
            )}

            {/* Table */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">All Storage Areas</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="flex justify-center py-12">
                            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : areas.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <Warehouse className="w-8 h-8 mx-auto mb-2 opacity-40" />
                            <p>No storage areas yet. Add your first one.</p>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Temperature</TableHead>
                                    <TableHead className="text-center">Ingredients</TableHead>
                                    <TableHead className="text-center">Status</TableHead>
                                    <TableHead className="text-center">Order</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {areas.map(area => (
                                    <TableRow key={area.id}>
                                        <TableCell className="font-medium">{area.name}</TableCell>
                                        <TableCell>
                                            {area.temperature ? (
                                                <Badge variant="outline"
                                                    className={TEMP_BADGE[area.temperature] ?? "bg-gray-100 text-gray-700"}>
                                                    <Thermometer className="w-3 h-3 mr-1" />
                                                    {area.temperature}
                                                </Badge>
                                            ) : (
                                                <span className="text-muted-foreground text-sm">—</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <Badge variant="secondary">{area._count?.ingredients ?? 0}</Badge>
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <Badge variant={area.isActive ? "default" : "outline"}
                                                className={area.isActive
                                                    ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                                                    : "text-muted-foreground"}>
                                                {area.isActive ? "Active" : "Inactive"}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-center text-muted-foreground text-sm">
                                            {area.sortOrder}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-1">
                                                <Link href={`/settings/storage-areas/${area.id}/notifications`}>
                                                    <Button
                                                        size="icon" variant="ghost"
                                                        title={area.notifyEnabled === false ? "Notifications off" : "Notifications"}
                                                        className={area.notifyEnabled === false ? "text-muted-foreground" : "text-amber-600 hover:text-amber-700"}
                                                    >
                                                        {area.notifyEnabled === false
                                                            ? <BellOff className="w-4 h-4" />
                                                            : <Bell    className="w-4 h-4" />}
                                                    </Button>
                                                </Link>
                                                <Button size="icon" variant="ghost" onClick={() => openEdit(area)}>
                                                    <Pencil className="w-4 h-4" />
                                                </Button>
                                                <Button size="icon" variant="ghost"
                                                    className="text-destructive hover:text-destructive"
                                                    onClick={() => setDeleteArea(area)}>
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {/* Add / Edit Dialog */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{editArea ? "Edit Storage Area" : "Add Storage Area"}</DialogTitle>
                        <DialogDescription>
                            Define a physical location where ingredients are stored.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        {error && (
                            <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                                <AlertCircle className="w-4 h-4 shrink-0" /> {error}
                            </div>
                        )}

                        <div className="space-y-1.5">
                            <Label>Name <span className="text-destructive">*</span></Label>
                            <Input
                                placeholder="e.g. Walk-in Fridge, Dry Store, Bar Cabinet"
                                value={form.name}
                                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label>Temperature Zone</Label>
                            <Select
                                value={form.temperature || "__none__"}
                                onValueChange={v => setForm(f => ({ ...f, temperature: v === "__none__" ? "" : v }))}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select temperature zone…" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__none__">— Not specified —</SelectItem>
                                    {TEMPERATURES.map(t => (
                                        <SelectItem key={t} value={t}>{t}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <Label>Display Order</Label>
                            <Input
                                type="number"
                                min={0}
                                value={form.sortOrder}
                                onChange={e => setForm(f => ({ ...f, sortOrder: Number(e.target.value) }))}
                            />
                            <p className="text-xs text-muted-foreground">Lower numbers appear first</p>
                        </div>

                        <div className="flex items-center justify-between">
                            <div>
                                <Label>Active</Label>
                                <p className="text-xs text-muted-foreground">Inactive areas are hidden in inventory</p>
                            </div>
                            <Switch
                                checked={form.isActive}
                                onCheckedChange={v => setForm(f => ({ ...f, isActive: v }))}
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleSave} disabled={saving}>
                            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            {editArea ? "Save Changes" : "Create Area"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation */}
            <Dialog open={!!deleteArea} onOpenChange={(open: boolean) => { if (!open) setDeleteArea(null); }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Delete Storage Area?</DialogTitle>
                        <DialogDescription>
                            {deleteArea && (deleteArea._count?.ingredients ?? 0) > 0 ? (
                                <span className="text-destructive">
                                    Cannot delete — {deleteArea._count!.ingredients} ingredient(s) are assigned to
                                    &ldquo;{deleteArea.name}&rdquo;. Reassign them first.
                                </span>
                            ) : (
                                <>
                                    This will permanently delete &ldquo;{deleteArea?.name}&rdquo;.
                                    This action cannot be undone.
                                </>
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteArea(null)}>Cancel</Button>
                        <Button variant="destructive"
                            onClick={handleDelete}
                            disabled={(deleteArea?._count?.ingredients ?? 0) > 0}>
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
