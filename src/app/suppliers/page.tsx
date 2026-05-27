"use client";

import { useState, useEffect } from "react";
import { suppliersApi, Supplier } from "@/lib/api";
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
import { Plus, Search, Edit, Trash2, Store, CheckCircle2, XCircle, Loader2, Truck, Clock } from "lucide-react";
import Link from "next/link";
import { calculateLeadTime, formatDeliveryDays, WEEKDAY_SHORT } from "@/lib/supplier-lead-time";

type SupplierFormShape = Omit<Supplier, "id" | "createdAt" | "updatedAt">;

const emptyForm = (): SupplierFormShape => ({
    name: "", contact: "", email: "", phone: "", address: "",
    status: "Active", isSpecial: false,
    deliveryDays:         [],
    orderCutoffTime:      "",
    orderCutoffDayOffset: 1,
    deliveryTimeWindow:   "",
    minOrderValue:        null,
    deliveryNotes:        "",
});

const WEEKDAY_OPTIONS: { value: number; label: string }[] = [
    { value: 1, label: "Mon" }, { value: 2, label: "Tue" }, { value: 3, label: "Wed" },
    { value: 4, label: "Thu" }, { value: 5, label: "Fri" }, { value: 6, label: "Sat" },
    { value: 7, label: "Sun" },
];

export default function SuppliersPage() {
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [dialogOpen, setDialogOpen] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [editTarget, setEditTarget] = useState<Supplier | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null);
    const [form, setForm] = useState(emptyForm());

    useEffect(() => {
        suppliersApi.list().then(setSuppliers).finally(() => setLoading(false));
    }, []);

    const filteredSuppliers = suppliers.filter(s =>
        s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.contact.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const openAdd = () => {
        setEditTarget(null);
        setForm(emptyForm());
        setDialogOpen(true);
    };

    const openEdit = (supplier: Supplier) => {
        setEditTarget(supplier);
        setForm({
            name: supplier.name, contact: supplier.contact,
            email: supplier.email, phone: supplier.phone,
            address: supplier.address, status: supplier.status,
            isSpecial: supplier.isSpecial ?? false,
            deliveryDays:         supplier.deliveryDays         ?? [],
            orderCutoffTime:      supplier.orderCutoffTime      ?? "",
            orderCutoffDayOffset: supplier.orderCutoffDayOffset ?? 1,
            deliveryTimeWindow:   supplier.deliveryTimeWindow   ?? "",
            minOrderValue:        supplier.minOrderValue        ?? null,
            deliveryNotes:        supplier.deliveryNotes        ?? "",
        });
        setDialogOpen(true);
    };

    function toggleDeliveryDay(day: number) {
        setForm(f => {
            const current = new Set(f.deliveryDays ?? []);
            if (current.has(day)) current.delete(day);
            else                  current.add(day);
            return { ...f, deliveryDays: [...current].sort((a, b) => a - b) };
        });
    }

    const handleSave = async () => {
        if (!form.name.trim()) return;
        setSaving(true);
        try {
            if (editTarget) {
                const updated = await suppliersApi.update(editTarget.id, form);
                setSuppliers(prev => prev.map(s => s.id === updated.id ? updated : s));
            } else {
                const created = await suppliersApi.create(form);
                setSuppliers(prev => [...prev, created]);
            }
            setDialogOpen(false);
        } catch (e) { console.error(e); } finally { setSaving(false); }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setSaving(true);
        try {
            await suppliersApi.delete(deleteTarget.id);
            setSuppliers(prev => prev.filter(s => s.id !== deleteTarget.id));
            setDeleteDialogOpen(false);
            setDeleteTarget(null);
        } catch (e) { console.error(e); } finally { setSaving(false); }
    };

    const activeCount = suppliers.filter(s => s.status === "Active").length;

    if (loading) return <div className="flex justify-center items-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-wrap gap-3 justify-between items-start">
                <div>
                    <h2 className="text-3xl font-bold font-playfair tracking-tight text-primary">Suppliers</h2>
                    <p className="text-muted-foreground">Manage vendor contacts and delivery information.</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                    <Link href="/import-suppliers">
                        <Button variant="outline">Import CSV</Button>
                    </Link>
                    <Button onClick={openAdd}>
                        <Plus className="mr-2 h-4 w-4" /> Add Supplier
                    </Button>
                </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-xl border border-border bg-card px-5 py-4 flex items-center gap-4">
                    <Store className="h-8 w-8 text-primary opacity-70" />
                    <div>
                        <p className="text-2xl font-bold text-primary">{suppliers.length}</p>
                        <p className="text-xs text-muted-foreground">Total Suppliers</p>
                    </div>
                </div>
                <div className="rounded-xl border border-border bg-card px-5 py-4 flex items-center gap-4">
                    <CheckCircle2 className="h-8 w-8 text-green-500 opacity-70" />
                    <div>
                        <p className="text-2xl font-bold text-green-600 dark:text-green-400">{activeCount}</p>
                        <p className="text-xs text-muted-foreground">Active</p>
                    </div>
                </div>
                <div className="rounded-xl border border-border bg-card px-5 py-4 flex items-center gap-4">
                    <XCircle className="h-8 w-8 text-muted-foreground opacity-70" />
                    <div>
                        <p className="text-2xl font-bold">{suppliers.length - activeCount}</p>
                        <p className="text-xs text-muted-foreground">Inactive</p>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search suppliers..."
                        className="pl-8"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <p className="text-sm text-muted-foreground">{filteredSuppliers.length} result{filteredSuppliers.length !== 1 ? "s" : ""}</p>
            </div>

            <div className="border rounded-md overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>ID</TableHead>
                            <TableHead>Supplier Name</TableHead>
                            <TableHead className="hidden sm:table-cell">Contact Person</TableHead>
                            <TableHead className="hidden md:table-cell">Email</TableHead>
                            <TableHead className="hidden md:table-cell">Phone</TableHead>
                            <TableHead className="hidden lg:table-cell">Address</TableHead>
                            <TableHead className="hidden md:table-cell">Delivery</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredSuppliers.map((supplier, idx) => (
                            <TableRow key={supplier.id}>
                                <TableCell className="text-sm text-muted-foreground font-medium w-10">#{idx + 1}</TableCell>
                                <TableCell className="font-medium">
                                    <span>{supplier.name}</span>
                                    {supplier.isSpecial && (
                                        <Badge variant="secondary" className="ml-2 text-xs">Special</Badge>
                                    )}
                                    {/* Contact info shown inline on mobile */}
                                    <p className="sm:hidden text-xs text-muted-foreground mt-0.5">{supplier.contact}</p>
                                </TableCell>
                                <TableCell className="hidden sm:table-cell">{supplier.contact}</TableCell>
                                <TableCell className="hidden md:table-cell text-muted-foreground">{supplier.email}</TableCell>
                                <TableCell className="hidden md:table-cell">{supplier.phone}</TableCell>
                                <TableCell className="hidden lg:table-cell text-muted-foreground max-w-[180px] truncate text-sm">{supplier.address}</TableCell>
                                <TableCell className="hidden md:table-cell text-xs">
                                    <DeliveryCell supplier={supplier} />
                                </TableCell>
                                <TableCell>
                                    <Badge variant={supplier.status === "Active" ? "default" : "secondary"}>
                                        {supplier.status}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                    <Button variant="ghost" size="icon" onClick={() => openEdit(supplier)}>
                                        <Edit className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        variant="ghost" size="icon"
                                        className="text-destructive hover:text-destructive"
                                        disabled={supplier.isSpecial}
                                        onClick={() => { setDeleteTarget(supplier); setDeleteDialogOpen(true); }}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                        {filteredSuppliers.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                                    No suppliers found.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Add / Edit Dialog */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="sm:max-w-2xl max-h-[92dvh] flex flex-col p-0 gap-0">
                    <DialogHeader className="px-5 pt-5 pb-3 border-b shrink-0">
                        <DialogTitle>{editTarget ? "Edit Supplier" : "Add New Supplier"}</DialogTitle>
                        <DialogDescription>
                            {editTarget ? `Editing ${editTarget.name}` : "Fill in the supplier details below."}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex-1 overflow-y-auto px-5 py-4 grid gap-3">
                        {[
                            { label: "Name *", key: "name", placeholder: "Supplier company name", type: "text" },
                            { label: "Contact Person", key: "contact", placeholder: "Contact person name", type: "text" },
                            { label: "Email", key: "email", placeholder: "email@example.com", type: "email" },
                            { label: "Phone", key: "phone", placeholder: "02-XXX-XXXX", type: "text" },
                            { label: "Address", key: "address", placeholder: "Street, City", type: "text" },
                        ].map(({ label, key, placeholder, type }) => (
                            <div key={key} className="space-y-1.5">
                                <Label>{label}</Label>
                                <Input
                                    type={type}
                                    placeholder={placeholder}
                                    value={(form as Record<string, unknown>)[key] as string}
                                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                                />
                            </div>
                        ))}
                        <div className="space-y-1.5">
                            <Label>Status</Label>
                            <Select value={form.status} onValueChange={(v) => setForm(f => ({ ...f, status: v as "Active" | "Inactive" }))}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Active">Active</SelectItem>
                                    <SelectItem value="Inactive">Inactive</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* ── Delivery schedule ────────────────────────────────────────── */}
                        <div className="mt-2 rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-950/20 p-4 space-y-3">
                            <div className="flex items-center gap-2">
                                <Truck className="h-4 w-4 text-amber-700 dark:text-amber-400" />
                                <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-300">Delivery Schedule</h4>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Drives lead-time calculations for PAR Min, ROP and PAR Max in Inventory.
                            </p>

                            {/* Delivery days */}
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold">Delivery days</Label>
                                <div className="grid grid-cols-7 gap-1.5">
                                    {WEEKDAY_OPTIONS.map(d => {
                                        const active = (form.deliveryDays ?? []).includes(d.value);
                                        return (
                                            <button
                                                key={d.value}
                                                type="button"
                                                onClick={() => toggleDeliveryDay(d.value)}
                                                className={`h-9 rounded-md text-xs font-medium transition-colors border ${active
                                                    ? "bg-amber-600 text-white border-amber-700"
                                                    : "bg-background hover:bg-muted text-muted-foreground border-input"}`}
                                            >
                                                {d.label}
                                            </button>
                                        );
                                    })}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    {(form.deliveryDays ?? []).length === 0
                                        ? "No days selected — system will use static leadTimeDays as fallback."
                                        : `Delivers ${formatDeliveryDays(form.deliveryDays ?? [])}`}
                                </p>
                            </div>

                            {/* Cutoff time + offset */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold">Order cutoff time</Label>
                                    <Input
                                        type="time"
                                        value={form.orderCutoffTime ?? ""}
                                        onChange={e => setForm(f => ({ ...f, orderCutoffTime: e.target.value }))}
                                        className="h-9"
                                    />
                                    <p className="text-xs text-muted-foreground">e.g. 17:00 = must order by 5 PM</p>
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold">Order how many days before?</Label>
                                    <Select
                                        value={String(form.orderCutoffDayOffset ?? 1)}
                                        onValueChange={v => setForm(f => ({ ...f, orderCutoffDayOffset: Number(v) }))}
                                    >
                                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="0">Same day</SelectItem>
                                            <SelectItem value="1">Day before (1 day)</SelectItem>
                                            <SelectItem value="2">2 days before</SelectItem>
                                            <SelectItem value="3">3 days before</SelectItem>
                                            <SelectItem value="7">1 week before</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            {/* Delivery window + MOV */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold">Delivery time window</Label>
                                    <Input
                                        type="text"
                                        placeholder="08:00-10:00"
                                        value={form.deliveryTimeWindow ?? ""}
                                        onChange={e => setForm(f => ({ ...f, deliveryTimeWindow: e.target.value }))}
                                        className="h-9"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold">Min order value (optional)</Label>
                                    <Input
                                        type="number" min={0} step={0.01}
                                        placeholder="e.g. 1000"
                                        value={form.minOrderValue ?? ""}
                                        onChange={e => setForm(f => ({ ...f, minOrderValue: e.target.value === "" ? null : Number(e.target.value) }))}
                                        className="h-9"
                                    />
                                </div>
                            </div>

                            {/* Delivery notes */}
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold">Delivery notes</Label>
                                <Input
                                    type="text"
                                    placeholder="e.g. Order via LINE @cocoshop"
                                    value={form.deliveryNotes ?? ""}
                                    onChange={e => setForm(f => ({ ...f, deliveryNotes: e.target.value }))}
                                    className="h-9"
                                />
                            </div>

                            {/* Live lead-time preview */}
                            <LeadTimePreview form={form} />
                        </div>
                    </div>
                    <DialogFooter className="px-5 py-3 border-t shrink-0">
                        <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
                        <Button onClick={handleSave} disabled={!form.name.trim() || saving}>
                            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {editTarget ? "Save Changes" : "Add Supplier"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Delete Supplier</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This action cannot be undone.
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

// ─── Helper: short delivery summary shown in the suppliers table ──────────────
function DeliveryCell({ supplier }: { supplier: Supplier }) {
    const days = supplier.deliveryDays ?? [];
    if (days.length === 0) {
        return <span className="text-muted-foreground italic">—</span>;
    }
    const lt = calculateLeadTime({
        deliveryDays:         days,
        orderCutoffTime:      supplier.orderCutoffTime ?? null,
        orderCutoffDayOffset: supplier.orderCutoffDayOffset ?? 1,
    });
    return (
        <div className="leading-tight">
            <div className="font-medium text-foreground">
                {days.length === 7 ? "Daily" : days.map(d => WEEKDAY_SHORT[d]).join(", ")}
            </div>
            {supplier.orderCutoffTime && (
                <div className="text-muted-foreground">
                    Cutoff {supplier.orderCutoffTime}
                    {supplier.orderCutoffDayOffset != null && supplier.orderCutoffDayOffset > 0
                        ? ` (${supplier.orderCutoffDayOffset}d before)`
                        : ""}
                </div>
            )}
            <div className="text-muted-foreground">
                Lead: <span className="font-medium">{lt.worstCaseLeadDays}d</span> worst-case
            </div>
        </div>
    );
}

// ─── Helper: live preview shown inside the supplier form ──────────────────────
function LeadTimePreview({ form }: { form: SupplierFormShape }) {
    const days = form.deliveryDays ?? [];
    if (days.length === 0) {
        return (
            <div className="rounded-md border border-dashed bg-background/50 px-3 py-2.5 text-xs text-muted-foreground">
                Select at least one delivery day to see lead-time preview.
            </div>
        );
    }
    const lt = calculateLeadTime({
        deliveryDays:         days,
        orderCutoffTime:      form.orderCutoffTime || null,
        orderCutoffDayOffset: form.orderCutoffDayOffset ?? 1,
    });
    return (
        <div className="rounded-md border bg-background px-3 py-2.5 space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
                <Clock className="h-3.5 w-3.5" /> Lead-time preview (from now)
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                    <div className="text-muted-foreground">Effective lead</div>
                    <div className="font-semibold text-base text-foreground">
                        {lt.effectiveLeadDays} day{lt.effectiveLeadDays === 1 ? "" : "s"}
                    </div>
                </div>
                <div>
                    <div className="text-muted-foreground">Worst-case (for PAR Min)</div>
                    <div className="font-semibold text-base text-foreground">
                        {lt.worstCaseLeadDays} day{lt.worstCaseLeadDays === 1 ? "" : "s"}
                    </div>
                </div>
            </div>
            {lt.nextDeliveryDate && lt.nextOrderBy && (
                <div className="text-xs text-muted-foreground pt-1 border-t">
                    Next delivery: <strong className="text-foreground">{lt.nextDeliveryDate.toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" })}</strong>
                    {" "}— order by{" "}
                    <strong className="text-foreground">{lt.nextOrderBy.toLocaleString("en-CA", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</strong>
                </div>
            )}
        </div>
    );
}
