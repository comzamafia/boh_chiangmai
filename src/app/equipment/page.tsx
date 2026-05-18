"use client";

import { useState, useEffect } from "react";
import { equipmentApi, Equipment } from "@/lib/api";

const EQUIPMENT_TYPES = ["Pan", "Wok", "Knife", "Cleaver", "Pot", "Steamer", "Fryer", "Mixer", "Oven", "Blender", "Cutting Board", "Other"];
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
import { Plus, Search, Edit, Trash2, Wrench, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";

const emptyForm = (): Omit<Equipment, "id" | "createdAt" | "updatedAt"> => ({ name: "", type: "Pan", status: "Available" });

export default function EquipmentPage() {
    const [equipment, setEquipment] = useState<Equipment[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [dialogOpen, setDialogOpen] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [editTarget, setEditTarget] = useState<Equipment | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<Equipment | null>(null);
    const [form, setForm] = useState(emptyForm());

    useEffect(() => {
        equipmentApi.list().then(setEquipment).finally(() => setLoading(false));
    }, []);

    const filtered = equipment.filter(e =>
        e.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.type.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const openAdd = () => { setEditTarget(null); setForm(emptyForm()); setDialogOpen(true); };
    const openEdit = (item: Equipment) => {
        setEditTarget(item);
        setForm({ name: item.name, type: item.type, status: item.status });
        setDialogOpen(true);
    };

    const handleSave = async () => {
        if (!form.name.trim()) return;
        setSaving(true);
        try {
            if (editTarget) {
                const updated = await equipmentApi.update(editTarget.id, form);
                setEquipment(prev => prev.map(e => e.id === updated.id ? updated : e));
            } else {
                const created = await equipmentApi.create(form);
                setEquipment(prev => [...prev, created]);
            }
            setDialogOpen(false);
        } catch (err) { console.error(err); } finally { setSaving(false); }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setSaving(true);
        try {
            await equipmentApi.delete(deleteTarget.id);
            setEquipment(prev => prev.filter(e => e.id !== deleteTarget.id));
            setDeleteDialogOpen(false); setDeleteTarget(null);
        } catch (err) { console.error(err); } finally { setSaving(false); }
    };

    const available = equipment.filter(e => e.status === "Available").length;
    const maintenance = equipment.filter(e => e.status === "Maintenance").length;
    const retired = equipment.filter(e => e.status === "Retired").length;

    if (loading) return <div className="flex justify-center items-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

    const statusBadgeVariant = (status: string): "default" | "secondary" | "destructive" =>
        status === "Available" ? "default" : status === "Maintenance" ? "secondary" : "destructive";

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-wrap gap-3 justify-between items-start">
                <div>
                    <h2 className="text-3xl font-bold font-playfair tracking-tight text-primary">Equipment</h2>
                    <p className="text-muted-foreground">Manage kitchen tools and their operational status.</p>
                </div>
                <Button onClick={openAdd}>
                    <Plus className="mr-2 h-4 w-4" /> Add Equipment
                </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-xl border border-border bg-card px-5 py-4 flex items-center gap-4">
                    <Wrench className="h-8 w-8 text-primary opacity-70" />
                    <div><p className="text-2xl font-bold text-primary">{equipment.length}</p><p className="text-xs text-muted-foreground">Total Items</p></div>
                </div>
                <div className="rounded-xl border border-border bg-card px-5 py-4 flex items-center gap-4">
                    <CheckCircle2 className="h-8 w-8 text-green-500 opacity-70" />
                    <div><p className="text-2xl font-bold text-green-600 dark:text-green-400">{available}</p><p className="text-xs text-muted-foreground">Available</p></div>
                </div>
                <div className="rounded-xl border border-border bg-card px-5 py-4 flex items-center gap-4">
                    <AlertTriangle className="h-8 w-8 text-yellow-500 opacity-70" />
                    <div><p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{maintenance}</p><p className="text-xs text-muted-foreground">Maintenance / Retired: {retired}</p></div>
                </div>
            </div>

            <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Search equipment..." className="pl-8" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                </div>
                <p className="text-sm text-muted-foreground">{filtered.length} result{filtered.length !== 1 ? "s" : ""}</p>
            </div>

            <div className="border rounded-md">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="hidden sm:table-cell">ID</TableHead>
                            <TableHead>Equipment Name</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filtered.map((item) => (
                            <TableRow key={item.id}>
                                <TableCell className="hidden sm:table-cell font-mono text-xs text-muted-foreground">{item.id}</TableCell>
                                <TableCell className="font-medium">{item.name}</TableCell>
                                <TableCell><Badge variant="outline">{item.type}</Badge></TableCell>
                                <TableCell>
                                    <Badge variant={statusBadgeVariant(item.status)}>{item.status}</Badge>
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
                            <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No equipment found.</TableCell></TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Add/Edit Dialog */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{editTarget ? "Edit Equipment" : "Add Equipment"}</DialogTitle>
                        <DialogDescription>{editTarget ? `Editing ${editTarget.name}` : "Add a new piece of kitchen equipment."}</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-2">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label className="text-right">Name *</Label>
                            <Input className="col-span-3" placeholder="e.g. Wok Pan 14 inch" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label className="text-right">Type</Label>
                            <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                                <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {EQUIPMENT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label className="text-right">Status</Label>
                            <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as Equipment["status"] }))}>
                                <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Available">Available</SelectItem>
                                    <SelectItem value="Maintenance">Maintenance</SelectItem>
                                    <SelectItem value="Retired">Retired</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
                        <Button onClick={handleSave} disabled={!form.name.trim() || saving}>
                            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {editTarget ? "Save Changes" : "Add Equipment"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Dialog */}
            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Delete Equipment</DialogTitle>
                        <DialogDescription>Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This cannot be undone.</DialogDescription>
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
