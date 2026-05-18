"use client";

import { useState, useEffect } from "react";
import { equipmentApi, Equipment } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Table, TableBody, TableCell, TableHead,
    TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
    Dialog, DialogContent, DialogDescription,
    DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
    Select, SelectContent, SelectItem,
    SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
    Plus, Search, Edit, Trash2,
    Wrench, CheckCircle2, AlertTriangle, Archive, Loader2,
} from "lucide-react";

const EQUIPMENT_TYPES = [
    "Pan", "Wok", "Knife", "Cleaver", "Pot", "Steamer",
    "Fryer", "Mixer", "Oven", "Blender", "Cutting Board", "Other",
];

const STATUS_CONFIG: Record<Equipment["status"], {
    label: string;
    badgeClass: string;
    icon: React.ElementType;
    statClass: string;
}> = {
    Available:   { label: "Available",   badgeClass: "bg-green-100 text-green-800 border-green-200 dark:bg-green-950/40 dark:text-green-400 dark:border-green-800",     icon: CheckCircle2,  statClass: "text-green-600 dark:text-green-400" },
    Maintenance: { label: "Maintenance", badgeClass: "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-400 dark:border-yellow-800", icon: AlertTriangle,  statClass: "text-yellow-600 dark:text-yellow-400" },
    Retired:     { label: "Retired",     badgeClass: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800/40 dark:text-slate-400 dark:border-slate-700",       icon: Archive,       statClass: "text-slate-500 dark:text-slate-400" },
};

const emptyForm = (): Omit<Equipment, "id" | "createdAt" | "updatedAt"> => ({
    name: "", type: "Pan", status: "Available",
});

export default function EquipmentPage() {
    const [equipment, setEquipment] = useState<Equipment[]>([]);
    const [loading, setLoading]     = useState(true);
    const [saving, setSaving]       = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState<Equipment["status"] | "All">("All");
    const [dialogOpen, setDialogOpen]           = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [editTarget, setEditTarget]   = useState<Equipment | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<Equipment | null>(null);
    const [form, setForm] = useState(emptyForm());

    useEffect(() => {
        equipmentApi.list().then(setEquipment).finally(() => setLoading(false));
    }, []);

    const filtered = equipment.filter(e => {
        const matchSearch = e.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            e.type.toLowerCase().includes(searchTerm.toLowerCase());
        const matchStatus = statusFilter === "All" || e.status === statusFilter;
        return matchSearch && matchStatus;
    });

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
            setDeleteDialogOpen(false);
            setDeleteTarget(null);
        } catch (err) { console.error(err); } finally { setSaving(false); }
    };

    const counts = {
        total:       equipment.length,
        available:   equipment.filter(e => e.status === "Available").length,
        maintenance: equipment.filter(e => e.status === "Maintenance").length,
        retired:     equipment.filter(e => e.status === "Retired").length,
    };

    if (loading) return (
        <div className="flex justify-center items-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
    );

    return (
        <div className="space-y-6 animate-in fade-in duration-500">

            {/* ── Header ── */}
            <div className="flex flex-wrap gap-3 justify-between items-start">
                <div>
                    <h2 className="text-3xl font-bold font-playfair tracking-tight text-primary">Equipment</h2>
                    <p className="text-muted-foreground">Manage kitchen tools and their operational status.</p>
                </div>
                <Button onClick={openAdd}>
                    <Plus className="mr-2 h-4 w-4" /> Add Equipment
                </Button>
            </div>

            {/* ── Stat Cards ── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="rounded-xl border bg-card px-4 py-3 flex items-center gap-3">
                    <Wrench className="h-7 w-7 text-primary opacity-70 shrink-0" />
                    <div>
                        <p className="text-2xl font-bold text-primary">{counts.total}</p>
                        <p className="text-xs text-muted-foreground">Total Items</p>
                    </div>
                </div>
                {(["Available", "Maintenance", "Retired"] as const).map(s => {
                    const cfg = STATUS_CONFIG[s];
                    const Icon = cfg.icon;
                    return (
                        <button
                            key={s}
                            onClick={() => setStatusFilter(statusFilter === s ? "All" : s)}
                            className={`rounded-xl border bg-card px-4 py-3 flex items-center gap-3 text-left transition-colors hover:border-primary/40 ${statusFilter === s ? "ring-2 ring-primary/40" : ""}`}
                        >
                            <Icon className={`h-7 w-7 opacity-70 shrink-0 ${cfg.statClass}`} />
                            <div>
                                <p className={`text-2xl font-bold ${cfg.statClass}`}>{counts[s.toLowerCase() as keyof typeof counts]}</p>
                                <p className="text-xs text-muted-foreground">{s}</p>
                            </div>
                        </button>
                    );
                })}
            </div>

            {/* ── Search ── */}
            <div className="flex items-center gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[180px] max-w-sm">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search equipment or type..."
                        className="pl-8"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
                {statusFilter !== "All" && (
                    <Badge
                        variant="outline"
                        className={`${STATUS_CONFIG[statusFilter].badgeClass} cursor-pointer`}
                        onClick={() => setStatusFilter("All")}
                    >
                        {statusFilter} ×
                    </Badge>
                )}
                <p className="text-sm text-muted-foreground">
                    {filtered.length} result{filtered.length !== 1 ? "s" : ""}
                </p>
            </div>

            {/* ── Table ── */}
            <div className="border rounded-lg overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Equipment Name</TableHead>
                            <TableHead className="hidden sm:table-cell">Type</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filtered.map(item => (
                            <TableRow key={item.id}>
                                <TableCell className="font-medium">
                                    {item.name}
                                    <span className="sm:hidden ml-2 text-xs text-muted-foreground">{item.type}</span>
                                </TableCell>
                                <TableCell className="hidden sm:table-cell">
                                    <Badge variant="outline">{item.type}</Badge>
                                </TableCell>
                                <TableCell>
                                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_CONFIG[item.status].badgeClass}`}>
                                        {item.status}
                                    </span>
                                </TableCell>
                                <TableCell className="text-right">
                                    <Button variant="ghost" size="icon" onClick={() => openEdit(item)}>
                                        <Edit className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        variant="ghost" size="icon"
                                        className="text-destructive hover:text-destructive"
                                        onClick={() => { setDeleteTarget(item); setDeleteDialogOpen(true); }}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                        {filtered.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={4} className="text-center py-10 text-muted-foreground">
                                    {equipment.length === 0 ? "No equipment added yet." : "No equipment matches your search."}
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* ── Add / Edit Dialog ── */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{editTarget ? "Edit Equipment" : "Add Equipment"}</DialogTitle>
                        <DialogDescription>
                            {editTarget ? `Editing ${editTarget.name}` : "Add a new piece of kitchen equipment."}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        <div className="space-y-1.5">
                            <Label>Equipment Name <span className="text-destructive">*</span></Label>
                            <Input
                                placeholder="e.g. Wok Pan 14 inch"
                                value={form.name}
                                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label>Type</Label>
                                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {EQUIPMENT_TYPES.map(t => (
                                            <SelectItem key={t} value={t}>{t}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-1.5">
                                <Label>Status</Label>
                                <Select
                                    value={form.status}
                                    onValueChange={v => setForm(f => ({ ...f, status: v as Equipment["status"] }))}
                                >
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Available">Available</SelectItem>
                                        <SelectItem value="Maintenance">Maintenance</SelectItem>
                                        <SelectItem value="Retired">Retired</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* Status preview */}
                        <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${STATUS_CONFIG[form.status].badgeClass}`}>
                            {(() => { const Icon = STATUS_CONFIG[form.status].icon; return <Icon className="h-4 w-4 shrink-0" />; })()}
                            <span className="text-sm font-medium">{STATUS_CONFIG[form.status].label}</span>
                        </div>
                    </div>

                    <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
                        <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
                            Cancel
                        </Button>
                        <Button onClick={handleSave} disabled={!form.name.trim() || saving}>
                            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {editTarget ? "Save Changes" : "Add Equipment"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── Delete Confirm Dialog ── */}
            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Delete Equipment</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
                        <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={saving}>
                            Cancel
                        </Button>
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
