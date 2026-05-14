"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter,
    DialogHeader, DialogTitle
} from "@/components/ui/dialog";
import {
    Select, SelectContent, SelectItem,
    SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
    Table, TableBody, TableCell, TableHead,
    TableHeader, TableRow
} from "@/components/ui/table";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem,
    DropdownMenuSeparator, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
    Users, Plus, Pencil, Trash2, MoreHorizontal,
    ShieldCheck, Loader2, AlertCircle, Key
} from "lucide-react";
import { ALL_SLUGS, ROLE_DEFAULTS, ROLE_LABELS, type Role, type NavSlug } from "@/lib/permissions";

const SLUG_LABELS: Record<NavSlug, string> = {
    home: "Home",
    dashboard: "Dashboard",
    "daily-sales": "Daily Sales",
    recipes: "Recipes (View)",
    "recipes-new": "Recipes (Create/Edit)",
    "import-recipes": "Import Recipes (CSV)",
    "menu-items": "Menu Items",
    ingredients: "Ingredients",
    "import-ingredients": "Import Ingredients (CSV)",
    equipment: "Equipment",
    suppliers: "Suppliers",
    "import-suppliers": "Import Suppliers (CSV)",
    inventory: "Inventory",
    purchases: "Purchase History",
    "purchase-orders": "Purchase Orders",
    analysis: "Cost Analysis",
    "batch-calculation": "Batch Calculation",
    "batch-scaling": "Batch Scaling",
    "sales-simulation": "Sales Simulation",
    production: "Production Planning",
    admin: "Admin Panel (Users)",
};

interface UserRow {
    id: string;
    name: string;
    email: string;
    role: string;
    permissions: string[];
    isActive: boolean;
    createdAt: string;
}

const ROLES: Role[] = ["admin", "manager", "chef", "analyst", "staff"];

const ROLE_COLORS: Record<string, string> = {
    admin: "bg-red-100 text-red-800 border-red-200 dark:bg-red-950/30 dark:text-red-400",
    manager: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400",
    chef: "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-950/30 dark:text-orange-400",
    analyst: "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950/30 dark:text-purple-400",
    staff: "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300",
};

const emptyForm = { name: "", email: "", password: "", role: "staff" as Role, permissions: [] as NavSlug[], isActive: true };

export default function AdminUsersPage() {
    const [users, setUsers] = useState<UserRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState(emptyForm);
    const [saving, setSaving] = useState(false);
    const [apiError, setApiError] = useState("");
    const [useCustomPermissions, setUseCustomPermissions] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        const res = await fetch("/api/users");
        if (res.ok) setUsers(await res.json());
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const openCreate = () => {
        setEditingId(null);
        setForm(emptyForm);
        setUseCustomPermissions(false);
        setApiError("");
        setDialogOpen(true);
    };

    const openEdit = (user: UserRow) => {
        setEditingId(user.id);
        setForm({
            name: user.name,
            email: user.email,
            password: "",
            role: user.role as Role,
            permissions: user.permissions as NavSlug[],
            isActive: user.isActive,
        });
        setUseCustomPermissions(user.permissions.length > 0);
        setApiError("");
        setDialogOpen(true);
    };

    const togglePermission = (slug: NavSlug) => {
        setForm(prev => ({
            ...prev,
            permissions: prev.permissions.includes(slug)
                ? prev.permissions.filter(s => s !== slug)
                : [...prev.permissions, slug],
        }));
    };

    const effectivePermissions: NavSlug[] = useCustomPermissions
        ? form.permissions
        : ROLE_DEFAULTS[form.role] ?? [];

    const handleSave = async () => {
        if (!form.name.trim() || !form.email.trim()) { setApiError("Name and email are required."); return; }
        if (!editingId && !form.password) { setApiError("Password is required for new users."); return; }
        setSaving(true);
        setApiError("");
        const body = {
            ...form,
            permissions: useCustomPermissions ? form.permissions : [],
        };
        const res = await fetch(editingId ? `/api/users/${editingId}` : "/api/users", {
            method: editingId ? "PUT" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            const d = await res.json();
            setApiError(d.error ?? "Failed to save user");
            setSaving(false);
            return;
        }
        await load();
        setDialogOpen(false);
        setSaving(false);
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        await fetch(`/api/users/${deleteTarget.id}`, { method: "DELETE" });
        setDeleteTarget(null);
        load();
    };

    return (
        <div className="space-y-6 max-w-6xl mx-auto animate-in fade-in duration-500 pb-12">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-3xl font-bold font-playfair tracking-tight text-primary flex items-center gap-3">
                        <ShieldCheck className="h-8 w-8" /> User Management
                    </h2>
                    <p className="text-muted-foreground">Manage accounts and control menu access by role.</p>
                </div>
                <Button onClick={openCreate}>
                    <Plus className="mr-2 h-4 w-4" /> Add User
                </Button>
            </div>

            {/* Role legend */}
            <div className="flex flex-wrap gap-2">
                {ROLES.map(r => (
                    <div key={r} className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${ROLE_COLORS[r]}`}>
                        <span>{ROLE_LABELS[r]}</span>
                        <span className="opacity-60">· {ROLE_DEFAULTS[r].length} menus</span>
                    </div>
                ))}
            </div>

            <Card>
                <CardHeader className="border-b">
                    <div className="flex items-center gap-2">
                        <Users className="h-5 w-5 text-primary" />
                        <CardTitle>All Users</CardTitle>
                        <Badge variant="secondary" className="ml-auto">{users.length} accounts</Badge>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Email</TableHead>
                                    <TableHead>Role</TableHead>
                                    <TableHead>Permissions</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="w-16"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {users.map(user => (
                                    <TableRow key={user.id}>
                                        <TableCell className="font-medium">{user.name}</TableCell>
                                        <TableCell className="text-muted-foreground">{user.email}</TableCell>
                                        <TableCell>
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${ROLE_COLORS[user.role]}`}>
                                                {ROLE_LABELS[user.role as Role] ?? user.role}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            {user.permissions.length > 0
                                                ? <span className="flex items-center gap-1"><Key className="h-3 w-3" /> Custom ({user.permissions.length} menus)</span>
                                                : <span className="opacity-60">Role default ({ROLE_DEFAULTS[user.role as Role]?.length ?? 0} menus)</span>
                                            }
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={user.isActive ? "default" : "secondary"} className={user.isActive ? "bg-green-500/10 text-green-700 border-green-200" : ""}>
                                                {user.isActive ? "Active" : "Inactive"}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8">
                                                        <MoreHorizontal className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onClick={() => openEdit(user)}>
                                                        <Pencil className="mr-2 h-4 w-4" /> Edit
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget(user)}>
                                                        <Trash2 className="mr-2 h-4 w-4" /> Delete
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {users.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                                            No users yet. Create the first admin account.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {/* Create / Edit Dialog */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{editingId ? "Edit User" : "Create New User"}</DialogTitle>
                        <DialogDescription>Configure account details and menu access permissions.</DialogDescription>
                    </DialogHeader>

                    <div className="space-y-5 py-2">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label>Full Name *</Label>
                                <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Somchai Jaidee" />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Email *</Label>
                                <Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="user@chiangmai.ca" />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label>{editingId ? "New Password (leave blank to keep)" : "Password *"}</Label>
                                <Input type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} placeholder="••••••••" />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Role</Label>
                                <Select value={form.role} onValueChange={v => setForm(p => ({ ...p, role: v as Role }))}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {ROLES.map(r => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {editingId && (
                            <div className="flex items-center gap-2">
                                <Checkbox id="isActive" checked={form.isActive} onCheckedChange={v => setForm(p => ({ ...p, isActive: !!v }))} />
                                <Label htmlFor="isActive" className="cursor-pointer">Account is active</Label>
                            </div>
                        )}

                        {/* Permissions */}
                        <div className="space-y-3 p-4 border rounded-lg bg-accent/20">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="font-medium text-sm">Menu Access Permissions</p>
                                    <p className="text-xs text-muted-foreground">
                                        {form.role === "admin"
                                            ? "Administrator — full access to all menus (cannot be restricted)"
                                            : useCustomPermissions
                                                ? "Custom — override individual menus"
                                                : `Using role default (${ROLE_DEFAULTS[form.role]?.length ?? 0} menus for ${ROLE_LABELS[form.role]})`}
                                    </p>
                                </div>
                                {form.role !== "admin" && (
                                    <div className="flex items-center gap-2">
                                        <Checkbox
                                            id="customPerms"
                                            checked={useCustomPermissions}
                                            onCheckedChange={v => {
                                                setUseCustomPermissions(!!v);
                                                if (v) setForm(p => ({ ...p, permissions: [...ROLE_DEFAULTS[form.role]] }));
                                                else setForm(p => ({ ...p, permissions: [] }));
                                            }}
                                        />
                                        <Label htmlFor="customPerms" className="text-xs cursor-pointer">Customize</Label>
                                    </div>
                                )}
                            </div>

                            {form.role === "admin" && (
                                <div className="flex flex-wrap gap-1.5 pt-1">
                                    {ALL_SLUGS.map(slug => (
                                        <span key={slug} className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-700 border border-red-200 dark:text-red-400 dark:border-red-900">
                                            {SLUG_LABELS[slug]}
                                        </span>
                                    ))}
                                </div>
                            )}

                            {form.role !== "admin" && useCustomPermissions && (
                                <div className="grid grid-cols-2 gap-2 pt-2">
                                    {ALL_SLUGS.map(slug => (
                                        <label key={slug} className="flex items-center gap-2 p-2 rounded-md hover:bg-accent cursor-pointer transition-colors">
                                            <Checkbox
                                                checked={form.permissions.includes(slug)}
                                                onCheckedChange={() => togglePermission(slug)}
                                            />
                                            <span className="text-sm">{SLUG_LABELS[slug]}</span>
                                        </label>
                                    ))}
                                </div>
                            )}

                            {form.role !== "admin" && !useCustomPermissions && (
                                <div className="flex flex-wrap gap-1.5 pt-1">
                                    {effectivePermissions.map(slug => (
                                        <span key={slug} className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                                            {SLUG_LABELS[slug]}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>

                        {apiError && (
                            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                                <AlertCircle className="h-4 w-4 shrink-0" />
                                {apiError}
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
                        <Button onClick={handleSave} disabled={saving}>
                            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            {editingId ? "Save Changes" : "Create User"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirm */}
            <Dialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Delete User</DialogTitle>
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
