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
import { Plus, Search, Edit, Trash2, Store, CheckCircle2, XCircle, Loader2 } from "lucide-react";

const emptyForm = (): Omit<Supplier, "id" | "createdAt" | "updatedAt"> => ({
    name: "", contact: "", email: "", phone: "", address: "",
    status: "Active", isSpecial: false,
});

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
        });
        setDialogOpen(true);
    };

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
            <div className="flex justify-between items-start">
                <div>
                    <h2 className="text-3xl font-bold font-playfair tracking-tight text-primary">Suppliers</h2>
                    <p className="text-muted-foreground">Manage vendor contacts and delivery information.</p>
                </div>
                <Button onClick={openAdd}>
                    <Plus className="mr-2 h-4 w-4" /> Add Supplier
                </Button>
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
                            <TableHead>Contact Person</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Phone</TableHead>
                            <TableHead>Address</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredSuppliers.map((supplier) => (
                            <TableRow key={supplier.id}>
                                <TableCell className="font-mono text-xs text-muted-foreground">{supplier.id}</TableCell>
                                <TableCell className="font-medium">
                                    <span>{supplier.name}</span>
                                    {supplier.isSpecial && (
                                        <Badge variant="secondary" className="ml-2 text-xs">Special</Badge>
                                    )}
                                </TableCell>
                                <TableCell>{supplier.contact}</TableCell>
                                <TableCell className="text-muted-foreground">{supplier.email}</TableCell>
                                <TableCell>{supplier.phone}</TableCell>
                                <TableCell className="text-muted-foreground max-w-[180px] truncate text-sm">{supplier.address}</TableCell>
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
                                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                                    No suppliers found.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Add / Edit Dialog */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{editTarget ? "Edit Supplier" : "Add New Supplier"}</DialogTitle>
                        <DialogDescription>
                            {editTarget ? `Editing ${editTarget.name}` : "Fill in the supplier details below."}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-2">
                        {[
                            { label: "Name *", key: "name", placeholder: "Supplier company name", type: "text" },
                            { label: "Contact", key: "contact", placeholder: "Contact person name", type: "text" },
                            { label: "Email", key: "email", placeholder: "email@example.com", type: "email" },
                            { label: "Phone", key: "phone", placeholder: "02-XXX-XXXX", type: "text" },
                            { label: "Address", key: "address", placeholder: "Street, City", type: "text" },
                        ].map(({ label, key, placeholder, type }) => (
                            <div key={key} className="grid grid-cols-4 items-center gap-4">
                                <Label className="text-right text-sm">{label}</Label>
                                <Input
                                    className="col-span-3"
                                    type={type}
                                    placeholder={placeholder}
                                    value={(form as Record<string, unknown>)[key] as string}
                                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                                />
                            </div>
                        ))}
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label className="text-right text-sm">Status</Label>
                            <Select value={form.status} onValueChange={(v) => setForm(f => ({ ...f, status: v as "Active" | "Inactive" }))}>
                                <SelectTrigger className="col-span-3">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Active">Active</SelectItem>
                                    <SelectItem value="Inactive">Inactive</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
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
