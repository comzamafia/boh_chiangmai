"use client";

/**
 * /settings/pmix-rules
 *
 * Manage PmixItemRule rows — the engine that classifies item names into
 * main_protein / extra_protein / dessert / excluded categories.
 *
 * Admin / manager only.
 */
import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus, Pencil, Trash2, Tag, RefreshCw } from "lucide-react";

interface ItemRule {
    id:        string;
    pattern:   string;
    matchType: string;
    category:  string;
    label:     string | null;
    priority:  number;
    isActive:  boolean;
    notes:     string | null;
    createdAt: string;
}

const CATEGORY_META: Record<string, { label: string; color: string }> = {
    main_protein:  { label: "Main Protein",  color: "bg-teal-100 text-teal-800 border-teal-200" },
    extra_protein: { label: "Extra Add-on",  color: "bg-violet-100 text-violet-800 border-violet-200" },
    dessert:       { label: "Dessert",        color: "bg-pink-100 text-pink-800 border-pink-200" },
    excluded:      { label: "Excluded",       color: "bg-slate-100 text-slate-600 border-slate-200" },
};

const MATCH_LABELS: Record<string, string> = {
    contains:    "Contains",
    exact:       "Exact match",
    starts_with: "Starts with",
};

const EMPTY_FORM = {
    pattern:   "",
    matchType: "contains",
    category:  "main_protein",
    label:     "",
    priority:  "0",
    isActive:  true,
    notes:     "",
};

export default function PmixRulesPage() {
    const [rules,   setRules]   = useState<ItemRule[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving,  setSaving]  = useState(false);
    const [open,    setOpen]    = useState(false);
    const [editId,  setEditId]  = useState<string | null>(null);
    const [form,    setForm]    = useState(EMPTY_FORM);
    const [catFilter, setCatFilter] = useState("all");
    const [testInput, setTestInput] = useState("");
    const [testResult, setTestResult] = useState<{ label: string; category: string; pattern: string } | null | "no-match">(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const r = await fetch("/api/pmix/item-rules");
            const data = await r.json();
            setRules(Array.isArray(data) ? data : []);
        } finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    function openNew() {
        setEditId(null);
        setForm(EMPTY_FORM);
        setOpen(true);
    }

    function openEdit(rule: ItemRule) {
        setEditId(rule.id);
        setForm({
            pattern:   rule.pattern,
            matchType: rule.matchType,
            category:  rule.category,
            label:     rule.label ?? "",
            priority:  String(rule.priority),
            isActive:  rule.isActive,
            notes:     rule.notes ?? "",
        });
        setOpen(true);
    }

    async function save() {
        if (!form.pattern.trim()) return;
        setSaving(true);
        try {
            const body = {
                ...form,
                label:    form.label.trim() || null,
                notes:    form.notes.trim() || null,
                priority: Number(form.priority),
            };
            if (editId) {
                await fetch(`/api/pmix/item-rules/${editId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
            } else {
                await fetch("/api/pmix/item-rules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
            }
            setOpen(false);
            await load();
        } finally { setSaving(false); }
    }

    async function remove(id: string) {
        if (!confirm("Delete this rule?")) return;
        await fetch(`/api/pmix/item-rules/${id}`, { method: "DELETE" });
        await load();
    }

    async function toggleActive(rule: ItemRule) {
        await fetch(`/api/pmix/item-rules/${rule.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isActive: !rule.isActive }),
        });
        await load();
    }

    // Live test
    function runTest() {
        if (!testInput.trim()) { setTestResult(null); return; }
        const lower = testInput.toLowerCase().trim();
        const sorted = [...rules].filter(r => r.isActive).sort((a, b) => b.priority - a.priority || a.pattern.localeCompare(b.pattern));
        for (const rule of sorted) {
            const pat = rule.pattern.toLowerCase().trim();
            let hit = false;
            if (rule.matchType === "exact")       hit = lower === pat;
            else if (rule.matchType === "starts_with") hit = lower.startsWith(pat);
            else                                   hit = lower.includes(pat);
            if (hit) {
                setTestResult({ label: rule.label ?? rule.pattern, category: rule.category, pattern: rule.pattern });
                return;
            }
        }
        setTestResult("no-match");
    }

    const filtered = catFilter === "all" ? rules : rules.filter(r => r.category === catFilter);

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div>
                <h2 className="text-3xl font-bold font-playfair tracking-tight text-primary">PMIX Classification Rules</h2>
                <p className="text-muted-foreground">
                    Define how item names are automatically classified into proteins, desserts, or excluded items.
                    Rules are matched top-down by priority (highest first).
                </p>
            </div>

            {/* Live tester */}
            <Card>
                <CardHeader className="pb-2 pt-4">
                    <CardTitle className="text-sm flex items-center gap-2">
                        <Tag className="h-4 w-4 text-amber-600" /> Test Classification
                    </CardTitle>
                    <CardDescription>Type a menu item name to see which rule would match it.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex gap-2">
                        <Input
                            placeholder='e.g. "Crying Tiger Steak" or "Mango Sticky Rice Ice Cream"'
                            value={testInput}
                            onChange={e => { setTestInput(e.target.value); setTestResult(null); }}
                            onKeyDown={e => e.key === "Enter" && runTest()}
                            className="max-w-sm"
                        />
                        <Button onClick={runTest} variant="outline" size="sm">Test</Button>
                    </div>
                    {testResult && (
                        <div className="mt-3">
                            {testResult === "no-match" ? (
                                <p className="text-sm text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                                    ⚠ No rule matches — this item would appear as <strong>Uncategorized</strong>.
                                </p>
                            ) : (
                                <p className="text-sm text-green-700 dark:text-green-400">
                                    ✓ Matched pattern <strong>&quot;{testResult.pattern}&quot;</strong> →{" "}
                                    <Badge className={`${CATEGORY_META[testResult.category]?.color ?? ""} border text-xs`}>
                                        {CATEGORY_META[testResult.category]?.label ?? testResult.category}
                                    </Badge>{" "}
                                    label: <strong>{testResult.label}</strong>
                                </p>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Rules table */}
            <Card>
                <CardHeader>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div>
                            <CardTitle className="text-lg">Rules ({rules.length})</CardTitle>
                            <CardDescription>Sorted by priority (highest first). Higher priority rules are checked first.</CardDescription>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                            <Button size="sm" variant="outline" onClick={load} disabled={loading}>
                                <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Refresh
                            </Button>
                            <Button size="sm" onClick={openNew}>
                                <Plus className="h-4 w-4 mr-1.5" /> Add Rule
                            </Button>
                        </div>
                    </div>
                    {/* Filter */}
                    <div className="mt-3">
                        <Select value={catFilter} onValueChange={setCatFilter}>
                            <SelectTrigger className="w-44">
                                <SelectValue placeholder="All categories" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All categories</SelectItem>
                                {Object.entries(CATEGORY_META).map(([k, v]) => (
                                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex justify-center py-10">
                            <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        </div>
                    ) : filtered.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-10">No rules found.</p>
                    ) : (
                        <div className="border rounded-md overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-10 text-center">P</TableHead>
                                        <TableHead>Pattern</TableHead>
                                        <TableHead>Match</TableHead>
                                        <TableHead>Category</TableHead>
                                        <TableHead>Label</TableHead>
                                        <TableHead className="w-16 text-center">Active</TableHead>
                                        <TableHead className="w-20" />
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filtered.map(rule => {
                                        const meta = CATEGORY_META[rule.category];
                                        return (
                                            <TableRow key={rule.id} className={rule.isActive ? "" : "opacity-50"}>
                                                <TableCell className="text-center tabular-nums font-mono text-xs text-muted-foreground">{rule.priority}</TableCell>
                                                <TableCell className="font-medium font-mono text-sm">{rule.pattern}</TableCell>
                                                <TableCell className="text-xs text-muted-foreground">{MATCH_LABELS[rule.matchType] ?? rule.matchType}</TableCell>
                                                <TableCell>
                                                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${meta?.color ?? ""}`}>
                                                        {meta?.label ?? rule.category}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="text-xs">{rule.label ?? <span className="text-muted-foreground italic">= pattern</span>}</TableCell>
                                                <TableCell className="text-center">
                                                    <Switch checked={rule.isActive} onCheckedChange={() => toggleActive(rule)} />
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex gap-1 justify-end">
                                                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(rule)}>
                                                            <Pencil className="h-3.5 w-3.5" />
                                                        </Button>
                                                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => remove(rule.id)}>
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Add / Edit dialog */}
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{editId ? "Edit Rule" : "Add Classification Rule"}</DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        <div className="space-y-1.5">
                            <Label>Pattern *</Label>
                            <Input
                                placeholder='e.g. "Steak" or "Crying Tiger"'
                                value={form.pattern}
                                onChange={e => setForm(f => ({ ...f, pattern: e.target.value }))}
                            />
                            <p className="text-[11px] text-muted-foreground">Text to match against the item name (case-insensitive).</p>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label>Match type</Label>
                                <Select value={form.matchType} onValueChange={v => setForm(f => ({ ...f, matchType: v }))}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="contains">Contains</SelectItem>
                                        <SelectItem value="exact">Exact match</SelectItem>
                                        <SelectItem value="starts_with">Starts with</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label>Priority</Label>
                                <Input
                                    type="number" min={0} max={999}
                                    value={form.priority}
                                    onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                                />
                                <p className="text-[11px] text-muted-foreground">Higher = checked first. Excluded=100, Dessert=50, Protein=0.</p>
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <Label>Category *</Label>
                            <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {Object.entries(CATEGORY_META).map(([k, v]) => (
                                        <SelectItem key={k} value={k}>{v.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {(form.category === "main_protein" || form.category === "extra_protein") && (
                            <div className="space-y-1.5">
                                <Label>Protein label</Label>
                                <Input
                                    placeholder='e.g. "Beef", "Soft Shell Crab" — leave blank to use pattern'
                                    value={form.label}
                                    onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                                />
                                <p className="text-[11px] text-muted-foreground">
                                    Multiple items can share a label to merge into one row (e.g. &quot;Steak&quot; + &quot;Ribeye&quot; both → &quot;Beef&quot;).
                                </p>
                            </div>
                        )}

                        {form.category === "dessert" && (
                            <div className="space-y-1.5">
                                <Label>Dessert label (optional)</Label>
                                <Input
                                    placeholder='e.g. "Ice Cream" — leave blank to use item name as-is'
                                    value={form.label}
                                    onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                                />
                            </div>
                        )}

                        <div className="space-y-1.5">
                            <Label>Notes (optional)</Label>
                            <Input
                                placeholder="Internal note about this rule"
                                value={form.notes}
                                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                            />
                        </div>

                        <div className="flex items-center gap-3">
                            <Switch
                                id="isActive"
                                checked={form.isActive}
                                onCheckedChange={v => setForm(f => ({ ...f, isActive: v }))}
                            />
                            <Label htmlFor="isActive">Active</Label>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                        <Button onClick={save} disabled={saving || !form.pattern.trim()}>
                            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            {editId ? "Save changes" : "Add rule"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
