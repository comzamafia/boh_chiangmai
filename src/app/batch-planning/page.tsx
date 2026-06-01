"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Dialog, DialogContent, DialogDescription,
    DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
    Select, SelectContent, SelectItem,
    SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { recipesApi, RecipeWithIngredients } from "@/lib/api";
import { ListChecks, Plus, Settings2, Play, CheckCircle2, MoreHorizontal, Trash2, Loader2, CalendarDays } from "lucide-react";

interface BatchPlanItem {
    id?: string;
    recipeId?: string | null;
    recipeName: string;
    qty: string;
    unit: string;
}
interface BatchPlan {
    id: string;
    date: string;
    status: "Pending" | "In Progress" | "Completed";
    progress: number;
    items: BatchPlanItem[];
}

const TODAY = new Date().toLocaleDateString("en-CA");

async function apiGet(): Promise<BatchPlan[]> {
    const res = await fetch("/api/batch-plans");
    if (!res.ok) throw new Error("Failed to fetch");
    return res.json();
}
async function apiCreate(data: Omit<BatchPlan, "id">): Promise<BatchPlan> {
    const res = await fetch("/api/batch-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Failed to create");
    return res.json();
}
async function apiUpdate(id: string, data: Omit<BatchPlan, "id">): Promise<BatchPlan> {
    const res = await fetch(`/api/batch-plans/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error("Failed to update");
    return res.json();
}
async function apiDelete(id: string) {
    await fetch(`/api/batch-plans/${id}`, { method: "DELETE" });
}

export default function BatchPlanningPage() {
    const [recipes, setRecipes] = useState<RecipeWithIngredients[]>([]);
    const [recipesLoading, setRecipesLoading] = useState(true);
    const [plans, setPlans] = useState<BatchPlan[]>([]);
    const [plansLoading, setPlansLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formDate, setFormDate] = useState(TODAY);
    const [formItems, setFormItems] = useState<{ recipeId: string; qty: string }[]>([{ recipeId: "", qty: "1" }]);

    const refresh = useCallback(async () => {
        try {
            const data = await apiGet();
            setPlans(data);
        } catch (err) {
            console.error(err);
        } finally {
            setPlansLoading(false);
        }
    }, []);

    useEffect(() => {
        recipesApi.list().then(setRecipes).finally(() => setRecipesLoading(false));
        refresh();
    }, [refresh]);

    const openCreate = () => {
        setEditingId(null);
        setFormDate(TODAY);
        setFormItems([{ recipeId: "", qty: "1" }]);
        setDialogOpen(true);
    };

    const openEdit = (plan: BatchPlan) => {
        setEditingId(plan.id);
        setFormDate(plan.date);
        setFormItems(plan.items.map(i => ({ recipeId: i.recipeId ?? "", qty: i.qty })));
        setDialogOpen(true);
    };

    const addFormItem = () => setFormItems(prev => [...prev, { recipeId: "", qty: "1" }]);
    const removeFormItem = (idx: number) => setFormItems(prev => prev.filter((_, i) => i !== idx));
    const updateFormItem = (idx: number, field: "recipeId" | "qty", val: string) =>
        setFormItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: val } : it));

    const handleSave = async () => {
        const validItems = formItems.filter(i => i.recipeId);
        if (!validItems.length) return;
        const items = validItems.map(i => {
            const r = recipes.find(r => r.id === i.recipeId);
            return { recipeId: i.recipeId, recipeName: r?.name ?? i.recipeId, qty: i.qty, unit: r?.yieldUnit ?? "" };
        });
        setSaving(true);
        try {
            if (editingId) {
                const existing = plans.find(p => p.id === editingId)!;
                const updated = await apiUpdate(editingId, { date: formDate, status: existing.status, progress: existing.progress, items });
                setPlans(prev => prev.map(p => p.id === editingId ? updated : p));
            } else {
                const created = await apiCreate({ date: formDate, status: "Pending", progress: 0, items });
                setPlans(prev => [created, ...prev]);
            }
            setDialogOpen(false);
        } catch (err) {
            console.error(err);
        } finally {
            setSaving(false);
        }
    };

    const updateStatus = async (plan: BatchPlan, status: BatchPlan["status"], progress: number) => {
        const updated = { ...plan, status, progress, items: plan.items };
        // optimistic
        setPlans(prev => prev.map(p => p.id === plan.id ? { ...p, status, progress } : p));
        try {
            await apiUpdate(plan.id, updated);
        } catch { await refresh(); }
    };

    const handleDelete = async (id: string) => {
        setPlans(prev => prev.filter(p => p.id !== id));
        try { await apiDelete(id); } catch { await refresh(); }
    };

    if (plansLoading) return (
        <div className="flex justify-center items-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
    );

    return (
        <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in duration-500 pb-12">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-3xl font-bold font-playfair tracking-tight text-primary">Batch Planning</h2>
                    <p className="text-muted-foreground">Manage and track grouped production recipes.</p>
                </div>
                <div className="flex gap-2">
                    <Button onClick={openCreate}>
                        <Plus className="mr-2 h-4 w-4" /> Create Batch Plan
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {plans.map((plan) => (
                    <Card key={plan.id} className={`flex flex-col ${plan.status === "In Progress" ? "border-primary/50 ring-1 ring-primary/20" : ""}`}>
                        <CardHeader className="pb-3">
                            <div className="flex justify-between items-start mb-2">
                                <Badge
                                    variant={plan.status === "In Progress" ? "default" : plan.status === "Completed" ? "secondary" : "outline"}
                                    className={plan.status === "In Progress" ? "bg-blue-500 hover:bg-blue-600" : ""}
                                >
                                    {plan.status}
                                </Badge>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-6 w-6 -mr-2 -mt-2">
                                            <MoreHorizontal className="h-4 w-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        {plan.status !== "Completed" && (
                                            <DropdownMenuItem onClick={() => openEdit(plan)}>
                                                <Settings2 className="mr-2 h-4 w-4" /> Edit
                                            </DropdownMenuItem>
                                        )}
                                        <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(plan.id)}>
                                            <Trash2 className="mr-2 h-4 w-4" /> Delete
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                            <CardTitle className="text-lg flex items-start justify-between gap-1">
                                <span className="text-sm font-mono text-muted-foreground">{plan.id.slice(0, 8)}…</span>
                                <span className="text-sm font-normal text-muted-foreground flex items-center gap-1 shrink-0">
                                    <CalendarDays className="h-3.5 w-3.5" />
                                    {plan.date === TODAY ? "Today" : plan.date}
                                </span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="flex-1">
                            <div className="space-y-3">
                                <h4 className="text-sm font-semibold border-b pb-1">Production Items</h4>
                                <ul className="space-y-2 text-sm">
                                    {plan.items.map((item, idx) => (
                                        <li key={item.id ?? idx} className="flex justify-between">
                                            <span className="text-muted-foreground truncate">{item.recipeName}</span>
                                            <span className="font-medium shrink-0 ml-2">{item.qty} {item.unit}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            {plan.status !== "Pending" && (
                                <div className="mt-6 space-y-2">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">Prep Progress</span>
                                        <span className="font-medium">{plan.progress}%</span>
                                    </div>
                                    <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
                                        <div
                                            className={`h-full transition-all ${plan.status === "Completed" ? "bg-green-500" : "bg-primary"}`}
                                            style={{ width: `${plan.progress}%` }}
                                        />
                                    </div>
                                </div>
                            )}
                        </CardContent>
                        <CardFooter className="bg-accent/30 pt-4 flex gap-2">
                            {plan.status === "Pending" ? (
                                <>
                                    <Button variant="outline" className="flex-1 bg-background" onClick={() => openEdit(plan)}>
                                        <Settings2 className="mr-2 h-4 w-4" /> Edit
                                    </Button>
                                    <Button className="flex-1" onClick={() => updateStatus(plan, "In Progress", 0)}>
                                        <Play className="mr-2 h-4 w-4" /> Start
                                    </Button>
                                </>
                            ) : plan.status === "In Progress" ? (
                                <>
                                    <Link href="/prep-list" className="flex-1">
                                        <Button variant="outline" className="w-full bg-background border-primary text-primary hover:text-primary">
                                            <ListChecks className="mr-2 h-4 w-4" /> View Prep List
                                        </Button>
                                    </Link>
                                    <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={() => updateStatus(plan, "Completed", 100)}>
                                        <CheckCircle2 className="mr-2 h-4 w-4" /> Complete
                                    </Button>
                                </>
                            ) : (
                                <Button variant="outline" className="w-full bg-background" disabled>
                                    <CheckCircle2 className="mr-2 h-4 w-4" /> Archived
                                </Button>
                            )}
                        </CardFooter>
                    </Card>
                ))}

                {plans.length === 0 && (
                    <div className="col-span-3 py-20 text-center text-muted-foreground border-2 border-dashed rounded-xl">
                        <ListChecks className="h-12 w-12 mx-auto mb-3 opacity-20" />
                        <p className="text-lg font-medium text-foreground mb-1">No batch plans yet</p>
                        <p className="text-sm mb-4">Create your first batch plan to start tracking production.</p>
                        <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> Create Batch Plan</Button>
                    </div>
                )}
            </div>

            {/* Create / Edit Dialog */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{editingId ? "Edit Batch Plan" : "New Batch Plan"}</DialogTitle>
                        <DialogDescription>Select recipes and quantities for this production batch.</DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        <div className="space-y-1.5">
                            <Label>Production Date</Label>
                            <Input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} />
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label>Recipes</Label>
                                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={addFormItem}>
                                    <Plus className="h-3 w-3 mr-1" /> Add Recipe
                                </Button>
                            </div>

                            {recipesLoading ? (
                                <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
                            ) : (
                                formItems.map((item, idx) => (
                                    <div key={idx} className="flex gap-2 items-center">
                                        <Select value={item.recipeId} onValueChange={v => updateFormItem(idx, "recipeId", v)}>
                                            <SelectTrigger className="flex-1"><SelectValue placeholder="Select recipe..." /></SelectTrigger>
                                            <SelectContent>
                                                {recipes.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                        <Input
                                            type="number"
                                            min={1}
                                            value={item.qty}
                                            onChange={e => updateFormItem(idx, "qty", e.target.value)}
                                            className="w-20 shrink-0"
                                            placeholder="Qty"
                                        />
                                        {formItems.length > 1 && (
                                            <Button variant="ghost" size="icon" className="shrink-0 text-destructive" onClick={() => removeFormItem(idx)}>
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleSave} disabled={saving || !formItems.some(i => i.recipeId)}>
                            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {editingId ? "Save Changes" : "Create Batch"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
