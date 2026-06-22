"use client";

/**
 * ProteinGroupManager — defines the protein display groups used by the Usage
 * Report's Main Protein tab. A group (e.g. "Chicken") maps to one or more real
 * ingredients; the tab then sums those ingredients across every dish/modifier/
 * composite under that one display name, in the configured order.
 *
 * "Quick start" creates the default 16 groups and auto-assigns matching
 * ingredients by keyword; everything is then editable here.
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Beef, Plus, Pencil, Trash2, Loader2, Wand2, Search, X, GripVertical } from "lucide-react";
import { proteinGroupApi, type ProteinGroup, type Ingredient } from "@/lib/api";

// Compact searchable ingredient picker (self-contained, like composite-manager).
function IngPick({ ingredients, exclude, onPick }: { ingredients: Ingredient[]; exclude: Set<string>; onPick: (id: string) => void }) {
    const [q, setQ] = useState("");
    const list = useMemo(() => {
        const s = q.toLowerCase().trim();
        return ingredients
            .filter(i => !exclude.has(i.id) && (!s || i.name.toLowerCase().includes(s)))
            .slice(0, 30);
    }, [ingredients, exclude, q]);
    return (
        <div className="relative">
            <div className="relative">
                <Search className="absolute left-2 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
                <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Add ingredient…" className="pl-7 h-9 text-sm" />
            </div>
            {q && (
                <div className="absolute z-20 mt-1 w-full border rounded-lg bg-popover shadow-md max-h-44 overflow-y-auto">
                    {list.length === 0 ? <p className="text-xs text-muted-foreground p-2.5">No match</p> :
                        list.map(i => (
                            <button key={i.id} type="button" onClick={() => { onPick(i.id); setQ(""); }}
                                className="w-full flex justify-between gap-2 px-2.5 py-1.5 text-left text-sm hover:bg-muted/50">
                                <span className="truncate">{i.name}</span>
                                <span className="text-[10px] border rounded px-1 text-muted-foreground shrink-0">{i.recipeUnit}</span>
                            </button>
                        ))}
                </div>
            )}
        </div>
    );
}

type Form = { id: string | null; name: string; sortOrder: string; ingredientIds: string[] };
const EMPTY: Form = { id: null, name: "", sortOrder: "0", ingredientIds: [] };

export default function ProteinGroupManager({ ingredients, canManage }: { ingredients: Ingredient[]; canManage: boolean }) {
    const [groups, setGroups] = useState<ProteinGroup[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [form, setForm] = useState<Form | null>(null);
    const [quickResult, setQuickResult] = useState<{ assigned: number; unmatched: string[] } | null>(null);

    const ingById = useMemo(() => new Map(ingredients.map(i => [i.id, i])), [ingredients]);

    const load = useCallback(async () => {
        setLoading(true);
        try { setGroups(await proteinGroupApi.list()); }
        catch { setGroups([]); }
        finally { setLoading(false); }
    }, []);
    useEffect(() => { load(); }, [load]);

    async function quickStart() {
        if (!confirm("Create the default 16 protein groups and auto-assign matching ingredients? Existing groups and assignments are kept.")) return;
        setSaving(true); setErr(null);
        try {
            const r = await proteinGroupApi.quickStart(true);
            setQuickResult({ assigned: r.assigned.length, unmatched: r.unmatched });
            await load();
        } catch (e) { setErr(e instanceof Error ? e.message : "Quick start failed"); }
        finally { setSaving(false); }
    }

    async function save() {
        if (!form || !form.name.trim()) return;
        setSaving(true); setErr(null);
        try {
            const payload = { name: form.name.trim(), sortOrder: Number(form.sortOrder) || 0, ingredientIds: form.ingredientIds };
            if (form.id) await proteinGroupApi.update(form.id, payload);
            else await proteinGroupApi.create(payload);
            setForm(null);
            await load();
        } catch (e) { setErr(e instanceof Error ? e.message : "Save failed"); }
        finally { setSaving(false); }
    }

    async function del(id: string) {
        if (!confirm("Delete this protein group? (Ingredients themselves are not affected.)")) return;
        setSaving(true);
        try { await proteinGroupApi.delete(id); await load(); }
        finally { setSaving(false); }
    }

    return (
        <Card className="mt-6">
            <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <CardTitle className="text-base flex items-center gap-2"><Beef className="w-4 h-4 text-rose-600" /> Protein Groups</CardTitle>
                        <CardDescription className="text-xs">
                            Group ingredients under one protein name for the Usage Report&apos;s Main Protein tab (e.g. Chicken = Breast + Thigh + Wings + Ground). Order = display order.
                        </CardDescription>
                    </div>
                    {canManage && (
                        <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={quickStart} disabled={saving}>
                                <Wand2 className="w-3.5 h-3.5" /> Quick start
                            </Button>
                            <Button size="sm" className="h-8 gap-1.5" onClick={() => { setForm({ ...EMPTY, sortOrder: String(groups.length) }); setErr(null); }} disabled={saving}>
                                <Plus className="w-3.5 h-3.5" /> New group
                            </Button>
                        </div>
                    )}
                </div>
            </CardHeader>
            <CardContent>
                {quickResult && (
                    <div className="mb-3 rounded-lg border border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20 px-3 py-2 text-xs">
                        Auto-assigned <strong>{quickResult.assigned}</strong> ingredient(s).
                        {quickResult.unmatched.length > 0 && <> Unmatched proteins (assign manually): {quickResult.unmatched.join(", ")}.</>}
                        <button className="ml-2 underline text-muted-foreground" onClick={() => setQuickResult(null)}>dismiss</button>
                    </div>
                )}
                {loading ? (
                    <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : groups.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">
                        No protein groups yet. Click <strong>Quick start</strong> to create the default 16 (Chicken, Beef, Shrimp, …) and auto-map your ingredients.
                    </p>
                ) : (
                    <div className="space-y-1.5">
                        {groups.map(g => (
                            <div key={g.id} className="flex items-start gap-2 rounded-lg border border-border/60 px-2.5 py-2 hover:bg-muted/20">
                                <GripVertical className="w-3.5 h-3.5 text-muted-foreground/40 mt-0.5 shrink-0" />
                                <span className="text-[10px] tabular-nums text-muted-foreground w-5 mt-0.5 shrink-0">{g.sortOrder}</span>
                                <div className="flex-1 min-w-0">
                                    <div className="font-medium text-sm">{g.name}</div>
                                    <div className="flex flex-wrap gap-1 mt-0.5">
                                        {g.members.length === 0
                                            ? <span className="text-[11px] text-amber-600">no ingredients assigned</span>
                                            : g.members.map(m => (
                                                <span key={m.ingredientId} className="text-[11px] rounded-full border border-border bg-card px-1.5 py-0.5">
                                                    {m.ingredient?.name ?? ingById.get(m.ingredientId)?.name ?? "?"}
                                                </span>
                                            ))}
                                    </div>
                                </div>
                                {canManage && (
                                    <div className="flex items-center gap-1 shrink-0">
                                        <button className="text-muted-foreground hover:text-primary p-1" title="Edit"
                                            onClick={() => setForm({ id: g.id, name: g.name, sortOrder: String(g.sortOrder), ingredientIds: g.members.map(m => m.ingredientId) })}>
                                            <Pencil className="w-3.5 h-3.5" />
                                        </button>
                                        <button className="text-muted-foreground hover:text-destructive p-1" title="Delete" onClick={() => del(g.id)}>
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>

            {form && (
                <Dialog open onOpenChange={v => { if (!v) setForm(null); }}>
                    <DialogContent className="sm:max-w-md max-h-[90dvh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2"><Beef className="w-4 h-4 text-rose-600" /> {form.id ? "Edit" : "New"} protein group</DialogTitle>
                            <DialogDescription>The Main Protein tab sums these ingredients under this name, in the given order.</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-3 py-1">
                            {err && <p className="text-xs text-destructive">{err}</p>}
                            <div className="flex gap-2">
                                <div className="flex-1 space-y-1">
                                    <Label className="text-xs">Name</Label>
                                    <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Chicken" className="h-9" />
                                </div>
                                <div className="w-20 space-y-1">
                                    <Label className="text-xs">Order</Label>
                                    <Input type="number" value={form.sortOrder} onChange={e => setForm({ ...form, sortOrder: e.target.value })} className="h-9 text-right" />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs">Ingredients in this group</Label>
                                <div className="flex flex-wrap gap-1">
                                    {form.ingredientIds.map(id => (
                                        <span key={id} className="inline-flex items-center gap-1 text-[11px] rounded-full border border-border bg-muted/40 px-2 py-0.5">
                                            {ingById.get(id)?.name ?? "?"}
                                            <button onClick={() => setForm({ ...form, ingredientIds: form.ingredientIds.filter(x => x !== id) })}>
                                                <X className="w-3 h-3 text-muted-foreground" />
                                            </button>
                                        </span>
                                    ))}
                                    {form.ingredientIds.length === 0 && <span className="text-[11px] text-muted-foreground">none yet</span>}
                                </div>
                                <IngPick ingredients={ingredients} exclude={new Set(form.ingredientIds)}
                                    onPick={id => setForm({ ...form, ingredientIds: [...form.ingredientIds, id] })} />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" size="sm" onClick={() => setForm(null)} disabled={saving}>Cancel</Button>
                            <Button size="sm" onClick={save} disabled={saving || !form.name.trim()}>{saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />} Save</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}
        </Card>
    );
}
