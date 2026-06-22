"use client";

/**
 * CompositeManager — manages reusable composite sub-recipes (e.g. "Curry Sauce"
 * = Panang 7oz + Massaman 7oz) and links menu items to the composites they use,
 * plus the combined "all Usage-Report settings" export/import. Mounted at the
 * bottom of the Portion Standards page so all Usage-Report calc settings live
 * in one place.
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Boxes, Plus, Pencil, Trash2, Loader2, Link2, Download, Upload, Search, X } from "lucide-react";
import {
    compositeApi, type CompositeRecipe, type MenuCompositeLink, type Ingredient,
} from "@/lib/api";

const UNITS = ["oz", "g", "kg", "ml", "L", "fl oz", "piece", "portion", "scoop", "tbsp", "tsp"];

// Compact searchable ingredient picker (self-contained).
function IngPick({ ingredients, value, onChange }: { ingredients: Ingredient[]; value: string; onChange: (id: string) => void }) {
    const [q, setQ] = useState("");
    const sel = ingredients.find(i => i.id === value);
    const list = useMemo(() => {
        const s = q.toLowerCase().trim();
        return s ? ingredients.filter(i => i.name.toLowerCase().includes(s)).slice(0, 30) : ingredients.slice(0, 30);
    }, [ingredients, q]);
    if (sel && !q) {
        return (
            <button type="button" onClick={() => onChange("")}
                className="flex items-center gap-1.5 border rounded-lg px-2.5 h-9 bg-muted/30 text-sm w-full justify-between">
                <span className="truncate">{sel.name}</span><X className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            </button>
        );
    }
    return (
        <div className="relative">
            <div className="relative">
                <Search className="absolute left-2 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
                <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search ingredient…" className="pl-7 h-9 text-sm" />
            </div>
            {q && (
                <div className="absolute z-20 mt-1 w-full border rounded-lg bg-popover shadow-md max-h-44 overflow-y-auto">
                    {list.length === 0 ? <p className="text-xs text-muted-foreground p-2.5">No match</p> :
                        list.map(i => (
                            <button key={i.id} type="button" onClick={() => { onChange(i.id); setQ(""); }}
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

type CompForm = { id: string | null; name: string; yieldQty: string; yieldUnit: string; notes: string;
    components: { ingredientId: string; qty: string; unit: string }[] };
const EMPTY_COMP: CompForm = { id: null, name: "", yieldQty: "", yieldUnit: "oz", notes: "", components: [{ ingredientId: "", qty: "", unit: "oz" }] };

type LinkForm = { id: string | null; itemName: string; compositeId: string; qty: string; unit: string };
const EMPTY_LINK: LinkForm = { id: null, itemName: "", compositeId: "", qty: "", unit: "oz" };

export default function CompositeManager({ ingredients, canManage }: { ingredients: Ingredient[]; canManage: boolean }) {
    const [composites, setComposites] = useState<CompositeRecipe[]>([]);
    const [links, setLinks] = useState<MenuCompositeLink[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const [comp, setComp] = useState<CompForm | null>(null);
    const [link, setLink] = useState<LinkForm | null>(null);
    const [importing, setImporting] = useState(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [importSummary, setImportSummary] = useState<any | null>(null);

    const ingName = (id: string) => ingredients.find(i => i.id === id)?.name ?? "?";

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [c, l] = await Promise.all([compositeApi.list(), compositeApi.links()]);
            setComposites(c); setLinks(l);
        } catch { /* ignore */ } finally { setLoading(false); }
    }, []);
    useEffect(() => { load(); }, [load]);

    // ── Composite save ──
    async function saveComp() {
        if (!comp) return;
        const components = comp.components
            .map(c => ({ ingredientId: c.ingredientId, qty: Number(c.qty), unit: c.unit.trim() }))
            .filter(c => c.ingredientId && c.qty > 0 && c.unit);
        if (!comp.name.trim() || !(Number(comp.yieldQty) > 0) || !comp.yieldUnit.trim() || components.length === 0) {
            setErr("Name, yield (>0), unit and at least one component are required"); return;
        }
        setSaving(true); setErr(null);
        try {
            const body = { name: comp.name.trim(), yieldQty: Number(comp.yieldQty), yieldUnit: comp.yieldUnit.trim(), notes: comp.notes.trim() || undefined, components };
            if (comp.id) await compositeApi.update(comp.id, body); else await compositeApi.create(body);
            setComp(null); await load();
        } catch (e) { setErr(e instanceof Error ? e.message : "Failed to save"); }
        finally { setSaving(false); }
    }
    async function delComp(id: string) {
        if (!confirm("Delete this composite? Menu links to it will also be removed.")) return;
        await compositeApi.remove(id); await load();
    }

    // ── Link save ──
    async function saveLink() {
        if (!link) return;
        if (!link.itemName.trim() || !link.compositeId || !(Number(link.qty) > 0) || !link.unit.trim()) {
            setErr("Menu item, composite, qty (>0) and unit are required"); return;
        }
        setSaving(true); setErr(null);
        try {
            const body = { itemName: link.itemName.trim(), compositeId: link.compositeId, qty: Number(link.qty), unit: link.unit.trim() };
            if (link.id) await compositeApi.updateLink(link.id, body); else await compositeApi.createLink(body);
            setLink(null); await load();
        } catch (e) { setErr(e instanceof Error ? e.message : "Failed to save"); }
        finally { setSaving(false); }
    }
    async function delLink(id: string) {
        if (!confirm("Delete this menu link?")) return;
        await compositeApi.removeLink(id); await load();
    }

    // ── Combined settings export / import ──
    async function exportAll() {
        const res = await fetch("/api/usage-settings/export");
        if (!res.ok) { setErr("Export failed"); return; }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `usage-settings-${new Date().toISOString().slice(0, 10)}.json`; a.click();
        URL.revokeObjectURL(url);
    }
    async function importAll(file: File) {
        setImporting(true); setErr(null);
        try {
            const body = JSON.parse(await file.text());
            const res = await fetch("/api/usage-settings/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
            const data = await res.json();
            if (!res.ok) { setErr(data.error ?? "Import failed"); return; }
            setImportSummary(data);
            await load();
        } catch (e) { setErr(e instanceof Error ? `Bad file: ${e.message}` : "Import failed"); }
        finally { setImporting(false); }
    }

    return (
        <div className="space-y-5">
            {/* Section header + combined export/import */}
            <div className="flex items-center gap-3 pt-2">
                <div className="p-2.5 rounded-xl bg-gradient-to-br from-cyan-100 to-sky-100 dark:from-cyan-900/40 dark:to-sky-900/40">
                    <Boxes className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
                </div>
                <div className="flex-1 min-w-0">
                    <h2 className="text-lg sm:text-xl font-bold">Composite Sub-Recipes &amp; Settings</h2>
                    <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">
                        Reusable sub-recipes (e.g. Curry Sauce = Panang + Massaman) and one-file export/import of ALL Usage-Report calc settings.
                    </p>
                </div>
                <div className="flex gap-2 shrink-0 flex-wrap">
                    <Button variant="outline" size="sm" className="h-9 gap-1.5 rounded-xl" onClick={exportAll}
                        title="Export PMIX rules + portion standards + unit chains + composites + links as one file">
                        <Download className="w-3.5 h-3.5" /> Export All
                    </Button>
                    {canManage && (
                        <>
                            <Button variant="outline" size="sm" className="h-9 gap-1.5 rounded-xl" disabled={importing}
                                onClick={() => document.getElementById("usage-settings-import")?.click()}>
                                {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Import All
                            </Button>
                            <input id="usage-settings-import" type="file" accept=".json,application/json" className="hidden"
                                onChange={e => { const f = e.target.files?.[0]; if (f) { importAll(f); e.target.value = ""; } }} />
                        </>
                    )}
                </div>
            </div>

            {err && <p className="text-sm text-destructive">{err}</p>}

            {loading ? (
                <Card><CardContent className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></CardContent></Card>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Composites */}
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between gap-2 py-3">
                            <div>
                                <CardTitle className="text-sm flex items-center gap-1.5"><Boxes className="w-4 h-4 text-cyan-600" /> Composites ({composites.length})</CardTitle>
                                <CardDescription className="text-xs">Sub-recipe → real ingredients, scaled by yield.</CardDescription>
                            </div>
                            {canManage && <Button size="sm" className="h-8 gap-1.5" onClick={() => { setErr(null); setComp({ ...EMPTY_COMP }); }}><Plus className="w-3.5 h-3.5" /> Add</Button>}
                        </CardHeader>
                        <CardContent className="px-3 pb-3 space-y-2">
                            {composites.length === 0 ? <p className="text-xs text-muted-foreground py-4 text-center">No composites yet.</p> :
                                composites.map(c => (
                                    <div key={c.id} className="border rounded-lg p-2.5">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <p className="text-sm font-semibold">{c.name} <span className="text-xs font-normal text-muted-foreground">yields {Number(c.yieldQty)} {c.yieldUnit}</span></p>
                                                <p className="text-xs text-muted-foreground mt-0.5">
                                                    {c.components.map(x => `${x.ingredient?.name ?? ingName(x.ingredientId)} ${Number(x.qty)}${x.unit}`).join(" + ") || "no components"}
                                                </p>
                                            </div>
                                            {canManage && (
                                                <div className="flex gap-1 shrink-0">
                                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setErr(null); setComp({
                                                        id: c.id, name: c.name, yieldQty: String(Number(c.yieldQty)), yieldUnit: c.yieldUnit, notes: c.notes ?? "",
                                                        components: c.components.length ? c.components.map(x => ({ ingredientId: x.ingredientId, qty: String(Number(x.qty)), unit: x.unit })) : [{ ingredientId: "", qty: "", unit: "oz" }],
                                                    }); }}><Pencil className="w-3.5 h-3.5" /></Button>
                                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => delComp(c.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                        </CardContent>
                    </Card>

                    {/* Menu links */}
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between gap-2 py-3">
                            <div>
                                <CardTitle className="text-sm flex items-center gap-1.5"><Link2 className="w-4 h-4 text-cyan-600" /> Menu → Composite ({links.length})</CardTitle>
                                <CardDescription className="text-xs">Which dish uses how much of a composite.</CardDescription>
                            </div>
                            {canManage && <Button size="sm" className="h-8 gap-1.5" disabled={composites.length === 0}
                                onClick={() => { setErr(null); setLink({ ...EMPTY_LINK, compositeId: composites[0]?.id ?? "", unit: composites[0]?.yieldUnit ?? "oz" }); }}><Plus className="w-3.5 h-3.5" /> Add</Button>}
                        </CardHeader>
                        <CardContent className="px-3 pb-3 space-y-2">
                            {links.length === 0 ? <p className="text-xs text-muted-foreground py-4 text-center">No links yet. {composites.length === 0 && "Add a composite first."}</p> :
                                links.map(l => (
                                    <div key={l.id} className="border rounded-lg p-2.5 flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold truncate">{l.itemName}</p>
                                            <p className="text-xs text-muted-foreground mt-0.5">uses {Number(l.qty)} {l.unit} of <strong>{l.composite?.name}</strong></p>
                                        </div>
                                        {canManage && (
                                            <div className="flex gap-1 shrink-0">
                                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setErr(null); setLink({ id: l.id, itemName: l.itemName, compositeId: l.compositeId, qty: String(Number(l.qty)), unit: l.unit }); }}><Pencil className="w-3.5 h-3.5" /></Button>
                                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => delLink(l.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Composite editor */}
            <Dialog open={!!comp} onOpenChange={o => { if (!o) setComp(null); }}>
                <DialogContent className="sm:max-w-lg max-h-[90dvh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2"><Boxes className="w-4 h-4 text-cyan-600" /> {comp?.id ? "Edit" : "Add"} Composite</DialogTitle>
                        <DialogDescription>One batch yields the amount below and is made of the components. Dishes reference it in &ldquo;Menu → Composite&rdquo;.</DialogDescription>
                    </DialogHeader>
                    {comp && (
                        <div className="space-y-3 py-1">
                            <div className="space-y-1.5">
                                <Label className="text-xs">Name *</Label>
                                <Input value={comp.name} onChange={e => setComp({ ...comp, name: e.target.value })} placeholder="e.g. Curry Sauce" className="h-9" />
                            </div>
                            <div className="flex gap-2 items-end">
                                <div className="space-y-1.5"><Label className="text-xs">Yield qty *</Label>
                                    <Input type="number" value={comp.yieldQty} onChange={e => setComp({ ...comp, yieldQty: e.target.value })} placeholder="14" className="h-9 w-24" /></div>
                                <div className="space-y-1.5"><Label className="text-xs">Yield unit *</Label>
                                    <Select value={comp.yieldUnit} onValueChange={v => setComp({ ...comp, yieldUnit: v })}><SelectTrigger className="h-9 w-28"><SelectValue /></SelectTrigger>
                                        <SelectContent>{UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent></Select></div>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs">Components (per 1 batch) *</Label>
                                {comp.components.map((c, i) => (
                                    <div key={i} className="flex items-center gap-1.5">
                                        <div className="flex-1"><IngPick ingredients={ingredients} value={c.ingredientId} onChange={id => setComp({ ...comp, components: comp.components.map((x, j) => j === i ? { ...x, ingredientId: id } : x) })} /></div>
                                        <Input type="number" value={c.qty} onChange={e => setComp({ ...comp, components: comp.components.map((x, j) => j === i ? { ...x, qty: e.target.value } : x) })} placeholder="7" className="h-9 w-16 text-right" />
                                        <Select value={c.unit} onValueChange={v => setComp({ ...comp, components: comp.components.map((x, j) => j === i ? { ...x, unit: v } : x) })}><SelectTrigger className="h-9 w-20"><SelectValue /></SelectTrigger>
                                            <SelectContent>{UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent></Select>
                                        <button onClick={() => setComp({ ...comp, components: comp.components.filter((_, j) => j !== i) })} className="text-muted-foreground/50 hover:text-destructive shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                                    </div>
                                ))}
                                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setComp({ ...comp, components: [...comp.components, { ingredientId: "", qty: "", unit: comp.yieldUnit }] })}><Plus className="w-3.5 h-3.5" /> Add component</Button>
                            </div>
                            {err && <p className="text-sm text-destructive">{err}</p>}
                        </div>
                    )}
                    <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={() => setComp(null)} disabled={saving}>Cancel</Button>
                        <Button onClick={saveComp} disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />} Save</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Link editor */}
            <Dialog open={!!link} onOpenChange={o => { if (!o) setLink(null); }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2"><Link2 className="w-4 h-4 text-cyan-600" /> {link?.id ? "Edit" : "Add"} Menu Link</DialogTitle>
                        <DialogDescription>Match a PMIX menu item to a composite and how much it uses per order.</DialogDescription>
                    </DialogHeader>
                    {link && (
                        <div className="space-y-3 py-1">
                            <div className="space-y-1.5"><Label className="text-xs">Menu item name *</Label>
                                <Input value={link.itemName} onChange={e => setLink({ ...link, itemName: e.target.value })} placeholder="e.g. Islamic Noodles" className="h-9" /></div>
                            <div className="space-y-1.5"><Label className="text-xs">Composite *</Label>
                                <Select value={link.compositeId} onValueChange={v => { const c = composites.find(x => x.id === v); setLink({ ...link, compositeId: v, unit: c?.yieldUnit ?? link.unit }); }}>
                                    <SelectTrigger className="h-9"><SelectValue placeholder="Pick a composite" /></SelectTrigger>
                                    <SelectContent>{composites.map(c => <SelectItem key={c.id} value={c.id}>{c.name} ({Number(c.yieldQty)} {c.yieldUnit}/batch)</SelectItem>)}</SelectContent></Select></div>
                            <div className="flex gap-2 items-end">
                                <div className="space-y-1.5"><Label className="text-xs">Used per order *</Label>
                                    <Input type="number" value={link.qty} onChange={e => setLink({ ...link, qty: e.target.value })} placeholder="14" className="h-9 w-24" /></div>
                                <div className="space-y-1.5"><Label className="text-xs">Unit *</Label>
                                    <Select value={link.unit} onValueChange={v => setLink({ ...link, unit: v })}><SelectTrigger className="h-9 w-28"><SelectValue /></SelectTrigger>
                                        <SelectContent>{UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent></Select></div>
                            </div>
                            {err && <p className="text-sm text-destructive">{err}</p>}
                        </div>
                    )}
                    <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={() => setLink(null)} disabled={saving}>Cancel</Button>
                        <Button onClick={saveLink} disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />} Save</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Import summary */}
            <Dialog open={!!importSummary} onOpenChange={o => { if (!o) setImportSummary(null); }}>
                <DialogContent className="sm:max-w-md max-h-[85dvh] overflow-y-auto">
                    <DialogHeader><DialogTitle className="flex items-center gap-2"><Upload className="w-4 h-4 text-primary" /> Settings imported</DialogTitle></DialogHeader>
                    {importSummary && (
                        <div className="space-y-3 py-1 text-sm">
                            <div className="rounded-lg border divide-y text-xs">
                                {Object.entries(importSummary.summary ?? {}).map(([k, v]) => {
                                    const val = v as { created: number; skipped: number };
                                    return (
                                        <div key={k} className="flex justify-between px-3 py-1.5">
                                            <span className="text-muted-foreground">{k}</span>
                                            <span><strong className="text-emerald-600">{val.created}</strong> created · {val.skipped} skipped</span>
                                        </div>
                                    );
                                })}
                            </div>
                            {importSummary.missingIngredients?.length > 0 && (
                                <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs">
                                    <p className="font-medium text-amber-800 dark:text-amber-300">Skipped — ingredient not found on this branch:</p>
                                    <p className="text-amber-700 dark:text-amber-400 mt-0.5">{importSummary.missingIngredients.join(", ")}</p>
                                    <p className="text-[11px] text-muted-foreground mt-1">Create these ingredients here, then import again.</p>
                                </div>
                            )}
                            {importSummary.missingComposites?.length > 0 && (
                                <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs">
                                    <p className="font-medium text-amber-800 dark:text-amber-300">Links skipped — composite missing:</p>
                                    <p className="text-amber-700 dark:text-amber-400 mt-0.5">{importSummary.missingComposites.join(", ")}</p>
                                </div>
                            )}
                        </div>
                    )}
                    <DialogFooter><Button size="sm" onClick={() => setImportSummary(null)}>Done</Button></DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
