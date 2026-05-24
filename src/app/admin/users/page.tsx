"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Users, Plus, Pencil, Trash2, MoreHorizontal,
    ShieldCheck, Loader2, AlertCircle, Key, Tags, BookOpen
} from "lucide-react";
import { ALL_SLUGS, ROLE_DEFAULTS, ROLE_LABELS, type Role, type NavSlug } from "@/lib/permissions";
import {
    ingredientCategoriesApi, categoryPermissionsApi,
    recipeCategoryPermissionsApi,
    type IngredientCategory, type UserCategoryPermission,
    type RecipeCategory, type UserRecipeCategoryPermission,
} from "@/lib/api";

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
    "admin-audit": "Audit Log",
    "recipes-manage-categories": "Manage Recipe Categories",
    "settings-storage-areas": "Settings: Storage Areas",
    "settings-ingredient-categories": "Settings: Ingredient Categories",
    "pmix-dashboard": "PMIX Analytics Dashboard",
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
    const [dialogTab, setDialogTab] = useState("details");
    const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState(emptyForm);
    const [saving, setSaving] = useState(false);
    const [apiError, setApiError] = useState("");
    const [useCustomPermissions, setUseCustomPermissions] = useState(false);

    // Ingredient category permissions state
    const [categories, setCategories] = useState<IngredientCategory[]>([]);
    const [catPerms, setCatPerms] = useState<Map<string, boolean>>(new Map()); // categoryId → canEdit
    const [catPermsSaving, setCatPermsSaving] = useState(false);
    const [catPermsLoaded, setCatPermsLoaded] = useState(false);

    // Recipe category permissions state
    const [recipeCategories, setRecipeCategories] = useState<RecipeCategory[]>([]);
    const [recipeCatPerms, setRecipeCatPerms] = useState<Set<string>>(new Set()); // set of categoryIds
    const [recipeCatPermsSaving, setRecipeCatPermsSaving] = useState(false);
    const [recipeCatPermsLoaded, setRecipeCatPermsLoaded] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        const res = await fetch("/api/users");
        if (res.ok) setUsers(await res.json());
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    // Load categories once
    useEffect(() => {
        ingredientCategoriesApi.list().then(setCategories).catch(() => {});
        fetch("/api/recipe-categories").then(r => r.ok ? r.json() : []).then(setRecipeCategories).catch(() => {});
    }, []);

    // Load ingredient category permissions when editing a user
    const loadCatPerms = useCallback(async (userId: string) => {
        setCatPermsLoaded(false);
        try {
            const perms: UserCategoryPermission[] = await categoryPermissionsApi.listForUser(userId);
            const map = new Map<string, boolean>();
            perms.forEach(p => map.set(p.categoryId, p.canEdit));
            setCatPerms(map);
        } catch {
            setCatPerms(new Map());
        }
        setCatPermsLoaded(true);
    }, []);

    // Load recipe category permissions when editing a user
    const loadRecipeCatPerms = useCallback(async (userId: string) => {
        setRecipeCatPermsLoaded(false);
        try {
            const perms: UserRecipeCategoryPermission[] = await recipeCategoryPermissionsApi.listForUser(userId);
            setRecipeCatPerms(new Set(perms.map(p => p.categoryId)));
        } catch {
            setRecipeCatPerms(new Set());
        }
        setRecipeCatPermsLoaded(true);
    }, []);

    const openCreate = () => {
        setEditingId(null);
        setForm(emptyForm);
        setUseCustomPermissions(false);
        setApiError("");
        setCatPerms(new Map());
        setCatPermsLoaded(true);
        setRecipeCatPerms(new Set());
        setRecipeCatPermsLoaded(true);
        setDialogTab("details");
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
        setCatPermsLoaded(false);
        setRecipeCatPermsLoaded(false);
        setDialogTab("details");
        setDialogOpen(true);
        loadCatPerms(user.id);
        loadRecipeCatPerms(user.id);
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

    const handleSaveCatPerms = async () => {
        if (!editingId) return;
        setCatPermsSaving(true);
        try {
            const permissions = Array.from(catPerms.entries()).map(([categoryId, canEdit]) => ({ categoryId, canEdit }));
            await categoryPermissionsApi.setForUser(editingId, permissions);
        } catch {
            // silent — show nothing for now
        }
        setCatPermsSaving(false);
    };

    const handleSaveRecipeCatPerms = async () => {
        if (!editingId) return;
        setRecipeCatPermsSaving(true);
        try {
            await recipeCategoryPermissionsApi.setForUser(editingId, Array.from(recipeCatPerms));
        } catch {
            // silent
        }
        setRecipeCatPermsSaving(false);
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        await fetch(`/api/users/${deleteTarget.id}`, { method: "DELETE" });
        setDeleteTarget(null);
        load();
    };

    const toggleCatPerm = (categoryId: string) => {
        setCatPerms(prev => {
            const next = new Map(prev);
            if (next.has(categoryId)) {
                next.delete(categoryId); // remove = no access
            } else {
                next.set(categoryId, true); // default canEdit = true
            }
            return next;
        });
    };

    const toggleCatEdit = (categoryId: string) => {
        setCatPerms(prev => {
            const next = new Map(prev);
            if (next.has(categoryId)) {
                next.set(categoryId, !next.get(categoryId));
            }
            return next;
        });
    };

    return (
        <div className="space-y-6 max-w-6xl mx-auto animate-in fade-in duration-500 pb-12">
            <div className="flex flex-wrap gap-3 justify-between items-start">
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
                                    <TableHead className="hidden sm:table-cell">Email</TableHead>
                                    <TableHead>Role</TableHead>
                                    <TableHead className="hidden md:table-cell">Permissions</TableHead>
                                    <TableHead className="hidden sm:table-cell">Status</TableHead>
                                    <TableHead className="w-16"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {users.map(user => (
                                    <TableRow key={user.id}>
                                        <TableCell className="font-medium">
                                            {user.name}
                                            <p className="sm:hidden text-xs text-muted-foreground">{user.email}</p>
                                        </TableCell>
                                        <TableCell className="hidden sm:table-cell text-muted-foreground">{user.email}</TableCell>
                                        <TableCell>
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${ROLE_COLORS[user.role]}`}>
                                                {ROLE_LABELS[user.role as Role] ?? user.role}
                                            </span>
                                        </TableCell>
                                        <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                                            {user.permissions.length > 0
                                                ? <span className="flex items-center gap-1"><Key className="h-3 w-3" /> Custom ({user.permissions.length} menus)</span>
                                                : <span className="opacity-60">Role default ({ROLE_DEFAULTS[user.role as Role]?.length ?? 0} menus)</span>
                                            }
                                        </TableCell>
                                        <TableCell className="hidden sm:table-cell">
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
                <DialogContent className="sm:max-w-2xl max-h-[92dvh] flex flex-col p-0 gap-0">
                    <DialogHeader className="px-5 pt-5 pb-3 border-b shrink-0">
                        <DialogTitle>{editingId ? "Edit User" : "Create New User"}</DialogTitle>
                        <DialogDescription>Configure account details, menu access, and category permissions.</DialogDescription>
                    </DialogHeader>

                    <Tabs value={dialogTab} onValueChange={setDialogTab} className="flex-1 flex flex-col min-h-0">
                        <TabsList className="mx-5 mt-3 shrink-0 w-auto justify-start">
                            <TabsTrigger value="details">Details & Permissions</TabsTrigger>
                            {editingId && (
                                <TabsTrigger value="category-perms" className="flex items-center gap-1.5">
                                    <Tags className="h-3.5 w-3.5" /> Ingredient Categories
                                </TabsTrigger>
                            )}
                            {editingId && (
                                <TabsTrigger value="recipe-cat-perms" className="flex items-center gap-1.5">
                                    <BookOpen className="h-3.5 w-3.5" /> Recipe Categories
                                </TabsTrigger>
                            )}
                        </TabsList>

                        {/* ── Tab: Details ── */}
                        <TabsContent value="details" className="flex-1 overflow-y-auto px-5 py-4 space-y-5 mt-0">
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
                        </TabsContent>

                        {/* ── Tab: Ingredient Category Permissions ── */}
                        {editingId && (
                            <TabsContent value="category-perms" className="flex-1 overflow-y-auto px-5 py-4 mt-0 space-y-4">
                                <div className="rounded-lg border bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
                                    <strong>Note:</strong> Admin and Manager roles always see all categories. Category restrictions only apply to Chef, Staff, and Analyst roles. If no categories are assigned, the user sees all ingredients.
                                </div>

                                {!catPermsLoaded ? (
                                    <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
                                ) : categories.length === 0 ? (
                                    <div className="text-center py-8 text-muted-foreground">
                                        <Tags className="h-10 w-10 mx-auto mb-2 opacity-30" />
                                        <p className="font-medium">No categories yet</p>
                                        <p className="text-sm">Ask an admin to create ingredient categories first.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {categories.map(cat => {
                                            const hasAccess = catPerms.has(cat.id);
                                            const canEdit   = catPerms.get(cat.id) ?? false;
                                            return (
                                                <div key={cat.id} className={`flex items-center justify-between gap-4 px-4 py-3 rounded-lg border transition-colors ${hasAccess ? "bg-primary/5 border-primary/20" : "bg-muted/20"}`}>
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <Switch
                                                            checked={hasAccess}
                                                            onCheckedChange={() => toggleCatPerm(cat.id)}
                                                        />
                                                        <div className="min-w-0">
                                                            <p className="font-medium text-sm truncate">{cat.name}</p>
                                                            {cat.description && (
                                                                <p className="text-xs text-muted-foreground truncate">{cat.description}</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                    {hasAccess && (
                                                        <div className="flex items-center gap-2 shrink-0">
                                                            <span className="text-xs text-muted-foreground">Can edit</span>
                                                            <Switch
                                                                checked={canEdit}
                                                                onCheckedChange={() => toggleCatEdit(cat.id)}
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </TabsContent>
                        )}

                        {/* ── Tab: Recipe Category Permissions ── */}
                        {editingId && (
                            <TabsContent value="recipe-cat-perms" className="flex-1 overflow-y-auto px-5 py-4 mt-0 space-y-4">
                                <div className="rounded-lg border bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800 px-4 py-3 text-sm text-blue-800 dark:text-blue-300">
                                    <strong>Note:</strong> Admin and Manager roles always see all recipe categories. Restrictions only apply to Chef, Staff, and Analyst roles. If no categories are selected, the user sees all recipes.
                                </div>

                                {!recipeCatPermsLoaded ? (
                                    <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
                                ) : recipeCategories.length === 0 ? (
                                    <div className="text-center py-8 text-muted-foreground">
                                        <BookOpen className="h-10 w-10 mx-auto mb-2 opacity-30" />
                                        <p className="font-medium">No recipe categories yet</p>
                                        <p className="text-sm">Create recipe categories from the Recipes page first.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between text-xs text-muted-foreground px-1 pb-1">
                                            <span>{recipeCatPerms.size === 0 ? "No restriction — user sees all categories" : `${recipeCatPerms.size} of ${recipeCategories.length} categories allowed`}</span>
                                            {recipeCatPerms.size > 0 && (
                                                <button
                                                    className="text-primary hover:underline"
                                                    onClick={() => setRecipeCatPerms(new Set())}
                                                >
                                                    Clear all (allow all)
                                                </button>
                                            )}
                                        </div>
                                        {recipeCategories.map(cat => {
                                            const allowed = recipeCatPerms.has(cat.id);
                                            return (
                                                <div
                                                    key={cat.id}
                                                    className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors cursor-pointer ${allowed ? "bg-primary/5 border-primary/20" : "bg-muted/20"}`}
                                                    onClick={() => setRecipeCatPerms(prev => {
                                                        const next = new Set(prev);
                                                        if (next.has(cat.id)) next.delete(cat.id);
                                                        else next.add(cat.id);
                                                        return next;
                                                    })}
                                                >
                                                    <Switch
                                                        checked={allowed}
                                                        onCheckedChange={() => setRecipeCatPerms(prev => {
                                                            const next = new Set(prev);
                                                            if (next.has(cat.id)) next.delete(cat.id);
                                                            else next.add(cat.id);
                                                            return next;
                                                        })}
                                                    />
                                                    <div className="min-w-0 flex-1">
                                                        <p className="font-medium text-sm truncate">{cat.name}</p>
                                                    </div>
                                                    {allowed && (
                                                        <span className="text-xs text-primary shrink-0">Can view</span>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </TabsContent>
                        )}
                    </Tabs>

                    {/* Footer */}
                    <div className="px-5 py-4 border-t shrink-0 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                        <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving || catPermsSaving || recipeCatPermsSaving}>Cancel</Button>
                        {dialogTab === "category-perms" && editingId ? (
                            <Button onClick={handleSaveCatPerms} disabled={catPermsSaving || !catPermsLoaded}>
                                {catPermsSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Save Ingredient Access
                            </Button>
                        ) : dialogTab === "recipe-cat-perms" && editingId ? (
                            <Button onClick={handleSaveRecipeCatPerms} disabled={recipeCatPermsSaving || !recipeCatPermsLoaded}>
                                {recipeCatPermsSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Save Recipe Access
                            </Button>
                        ) : (
                            <Button onClick={handleSave} disabled={saving}>
                                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {editingId ? "Save Changes" : "Create User"}
                            </Button>
                        )}
                    </div>
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
