"use client";
/**
 * /stock-count — practical, area-first physical stock count.
 *
 * 1. Pick the Storage Area you're standing in.
 * 2. Its ingredients appear, grouped by Category, for fast counting.
 * 3. Count what you SEE (packs / purchase units / base units) — the system
 *    converts to recipe units. The same ingredient can be counted in several
 *    areas; the rolled-up total becomes its stock.
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
    Loader2, ClipboardCheck, ChevronLeft, ChevronRight, Search, Plus, Thermometer,
    Warehouse, Check, Snowflake, FileDown, Printer, ListFilter, Boxes, Package, Pencil,
} from "lucide-react";
import {
    inventoryApi, storageAreasApi, stockCountApi,
    type InventoryItem, type StorageArea,
} from "@/lib/api";
import {
    type StockUnitConfig, type CountEntry,
    hasPack, countToRecipeUnits, countHasValue, describeBreakdown, recipeToPurchase, recipeToPacks,
} from "@/lib/stock-units";
import { exportBlankCountSheet, exportFilledCountSheet } from "@/lib/stock-count-pdf";

type Row = { packs: string; purchase: string; recipe: string };
const EMPTY: Row = { packs: "", purchase: "", recipe: "" };
const num = (s: string) => { const n = Number(s); return Number.isFinite(n) ? n : 0; };
const fmt = (n: number) => n % 1 === 0 ? n.toLocaleString() : n.toFixed(2);

function cfgOf(item: InventoryItem): StockUnitConfig {
    return {
        recipeUnit:     item.ingredient.recipeUnit,
        purchaseUnit:   item.ingredient.purchaseUnit,
        conversionRate: Number(item.ingredient.conversionRate) || 1,
        packUnit:       item.packUnit ?? null,
        packSize:       item.packSize != null ? Number(item.packSize) : null,
    };
}
const entryOf = (r: Row): CountEntry => ({ packs: num(r.packs), purchase: num(r.purchase), recipe: num(r.recipe) });

export default function StockCountPage() {
    const [areas, setAreas]   = useState<StorageArea[]>([]);
    const [items, setItems]   = useState<InventoryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [areaId, setAreaId] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [a, i] = await Promise.all([storageAreasApi.list(), inventoryApi.list()]);
            setAreas(a.filter(x => x.isActive !== false));
            setItems(i);
        } finally { setLoading(false); }
    }, []);
    useEffect(() => { load(); }, [load]);

    const area = areas.find(a => a.id === areaId) ?? null;

    if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>;

    return (
        <div className="space-y-5 max-w-5xl mx-auto pb-12">
            <div>
                <h2 className="text-3xl font-bold font-playfair tracking-tight text-primary flex items-center gap-2">
                    <ClipboardCheck className="w-7 h-7" /> Stock Count
                </h2>
                <p className="text-muted-foreground">Pick where you are — count the ingredients on those shelves.</p>
            </div>

            {!areaId
                ? <AreaPicker areas={areas} items={items} onPick={setAreaId} />
                : <AreaCount key={areaId} area={area} items={items} onBack={() => setAreaId(null)} onSaved={load}
                    onStockUpdated={m => setItems(prev => prev.map(i => m[i.ingredientId] != null ? { ...i, currentStock: m[i.ingredientId] } : i))} />}
        </div>
    );
}

// ─── Area picker ────────────────────────────────────────────────────────────
function AreaPicker({ areas, items, onPick }: { areas: StorageArea[]; items: InventoryItem[]; onPick: (id: string) => void }) {
    const countFor = (id: string) => items.filter(i => (i.ingredient.storageAreaId ?? null) === id).length;
    const assignedIds = new Set(areas.map(a => a.id));
    const unassigned = items.filter(i => { const a = i.ingredient.storageAreaId; return !a || !assignedIds.has(a); }).length;

    if (areas.length === 0) return (
        <Card><CardContent className="py-16 text-center text-muted-foreground text-sm">
            No storage areas yet. Create them in Settings → Storage Areas, then assign ingredients in Inventory.
        </CardContent></Card>
    );

    return (
        <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {areas.map(a => {
                    const n = countFor(a.id);
                    const cold = /frozen|chill|fridge|cold|-18|2-5/i.test(`${a.name} ${a.temperature ?? ""}`);
                    return (
                        <button key={a.id} onClick={() => onPick(a.id)}
                            className="group text-left rounded-2xl border border-border bg-card p-4 hover:border-primary hover:shadow-sm transition-all">
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className={`flex items-center justify-center w-10 h-10 rounded-xl shrink-0 ${cold ? "bg-cyan-500/15 text-cyan-600" : "bg-amber-500/15 text-amber-600"}`}>
                                        {cold ? <Snowflake className="w-5 h-5" /> : <Warehouse className="w-5 h-5" />}
                                    </span>
                                    <div className="min-w-0">
                                        <p className="font-semibold truncate">{a.name}</p>
                                        {a.temperature && <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Thermometer className="w-3 h-3" />{a.temperature}</p>}
                                    </div>
                                </div>
                                <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary shrink-0" />
                            </div>
                            <p className="text-xs text-muted-foreground mt-3">{n} ingredient{n !== 1 ? "s" : ""} to count</p>
                        </button>
                    );
                })}
            </div>
            {unassigned > 0 && (
                <p className="text-xs text-muted-foreground">
                    {unassigned} tracked ingredient{unassigned !== 1 ? "s have" : " has"} no storage area — set one in <a href="/inventory" className="underline">Inventory</a> to count them here.
                </p>
            )}
        </>
    );
}

// ─── Area count sheet ───────────────────────────────────────────────────────
function AreaCount({ area, items, onBack, onSaved, onStockUpdated }: {
    area: StorageArea | null; items: InventoryItem[]; onBack: () => void;
    onSaved: () => void | Promise<void>; onStockUpdated: (m: Record<string, number>) => void;
}) {
    const [draft, setDraft]   = useState<Record<string, Row>>({});
    const [extra, setExtra]   = useState<Set<string>>(new Set());   // ingredientIds added "found here"
    const [counts, setCounts] = useState<Record<string, number>>({}); // last saved per-area counts
    const [search, setSearch] = useState("");
    const [addOpen, setAddOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [savedMsg, setSavedMsg] = useState<string | null>(null);
    const [remainingOnly, setRemainingOnly] = useState(false);
    const [hydrated, setHydrated] = useState(false);
    const [packEdit, setPackEdit] = useState<InventoryItem | null>(null);

    const draftKey = area ? `sc-draft-${area.id}` : "";
    const extraKey = area ? `sc-extra-${area.id}` : "";

    // Load: server per-area counts + locally-saved draft (survives refresh / phone sleep)
    useEffect(() => {
        if (!area) return;
        let savedExtra: string[] = [];
        try {
            const d = localStorage.getItem(draftKey); if (d) setDraft(JSON.parse(d));
            const e = localStorage.getItem(extraKey); if (e) savedExtra = JSON.parse(e);
        } catch { /* ignore */ }
        stockCountApi.areaCounts(area.id).then(d => {
            setCounts(d.counts);
            setExtra(new Set([...Object.keys(d.counts), ...savedExtra]));
        }).catch(() => setExtra(new Set(savedExtra)))
          .finally(() => setHydrated(true));
    }, [area, draftKey, extraKey]);

    // Auto-save draft + extras to localStorage on every change (after hydration)
    useEffect(() => {
        if (!hydrated || !area) return;
        try {
            localStorage.setItem(draftKey, JSON.stringify(draft));
            localStorage.setItem(extraKey, JSON.stringify([...extra]));
        } catch { /* ignore */ }
    }, [draft, extra, hydrated, area, draftKey, extraKey]);

    // Items belonging to THIS area = home-area items ∪ extras (multi-area + found-here)
    const areaItems = useMemo(() => {
        if (!area) return [];
        return items.filter(i => (i.ingredient.storageAreaId ?? null) === area.id || extra.has(i.ingredientId));
    }, [items, area, extra]);

    const isCounted = (i: InventoryItem) => countHasValue(entryOf(draft[i.id] ?? EMPTY));

    // Group by category. "Remaining only" hides items already SAVED this round
    // (based on persisted per-area counts) so typing never makes a row vanish.
    const groups = useMemo(() => {
        const m = new Map<string, InventoryItem[]>();
        for (const it of areaItems) {
            if (remainingOnly && counts[it.ingredientId] != null) continue;
            const cat = it.ingredient.category?.name ?? "Uncategorized";
            (m.get(cat) ?? m.set(cat, []).get(cat)!).push(it);
        }
        return [...m.entries()].sort(([a], [b]) => a === "Uncategorized" ? 1 : b === "Uncategorized" ? -1 : a.localeCompare(b))
            .map(([cat, list]) => [cat, list.sort((x, y) => x.ingredient.name.localeCompare(y.ingredient.name))] as const);
    }, [areaItems, remainingOnly, counts]);

    const set = (id: string, field: keyof Row, v: string) => setDraft(d => ({ ...d, [id]: { ...(d[id] ?? EMPTY), [field]: v } }));
    const countedIds = areaItems.filter(isCounted).map(i => i.id);
    const total = areaItems.length;
    const pct = total > 0 ? Math.round((countedIds.length / total) * 100) : 0;

    async function save() {
        if (countedIds.length === 0 || !area) return;
        setSaving(true); setSavedMsg(null);
        try {
            const payload = countedIds.map(id => {
                const it = areaItems.find(x => x.id === id)!;
                return { ingredientId: it.ingredientId, recipeQty: countToRecipeUnits(entryOf(draft[id] ?? EMPTY), cfgOf(it)) };
            });
            const res = await stockCountApi.save(area.id, payload);
            // Real-time: push new rolled-up stock into the parent's items (no full reload)
            onStockUpdated(Object.fromEntries(res.updated.map(u => [u.ingredientId, u.currentStock])));
            setSavedMsg(`Saved ${res.updated.length} item${res.updated.length !== 1 ? "s" : ""} · stock updated.`);
            setDraft({});
            try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
            const d = await stockCountApi.areaCounts(area.id); setCounts(d.counts);
        } finally { setSaving(false); }
    }

    // ── PDF exports ─────────────────────────────────────────────────────────
    function catGroups<T>(map: (i: InventoryItem) => T | null) {
        const m = new Map<string, T[]>();
        for (const it of areaItems) {
            const v = map(it); if (v == null) continue;
            const cat = it.ingredient.category?.name ?? "Uncategorized";
            (m.get(cat) ?? m.set(cat, []).get(cat)!).push(v);
        }
        return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([category, items]) => ({ category, items }));
    }
    function printBlank() {
        if (!area) return;
        exportBlankCountSheet(area.name, catGroups(it => {
            const cfg = cfgOf(it);
            const hint = [hasPack(cfg) ? `${cfg.packUnit}(${cfg.packSize} ${cfg.purchaseUnit})` : null, cfg.purchaseUnit, cfg.recipeUnit].filter(Boolean).join(" / ");
            return { name: it.ingredient.name, unitsHint: hint, system: `${fmt(Number(it.currentStock))} ${cfg.recipeUnit}` };
        }));
    }
    function exportFilled() {
        if (!area) return;
        exportFilledCountSheet(area.name, catGroups(it => {
            if (!isCounted(it)) return null;
            const cfg = cfgOf(it); const e = entryOf(draft[it.id] ?? EMPTY); const t = countToRecipeUnits(e, cfg);
            const v = t - Number(it.currentStock);
            return {
                name: it.ingredient.name, counted: describeBreakdown(e, cfg),
                total: `${fmt(t)} ${cfg.recipeUnit}`, system: `${fmt(Number(it.currentStock))} ${cfg.recipeUnit}`,
                variance: `${v > 0 ? "+" : ""}${fmt(v)}`,
            };
        }));
    }

    // Add-found-here candidates: any tracked item not already in this area
    const inArea = new Set(areaItems.map(i => i.ingredientId));
    const candidates = items.filter(i => !inArea.has(i.ingredientId) && (!search || i.ingredient.name.toLowerCase().includes(search.toLowerCase())));

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="sticky top-0 bg-background z-10 pt-1 pb-2 space-y-2">
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={onBack} className="gap-1"><ChevronLeft className="w-4 h-4" /> Areas</Button>
                    <div className="min-w-0">
                        <p className="font-semibold truncate flex items-center gap-1.5"><Warehouse className="w-4 h-4 text-muted-foreground" />{area?.name}</p>
                    </div>
                    <Button size="sm" variant="outline" className="ml-auto gap-1" onClick={() => setAddOpen(true)}><Plus className="w-4 h-4" /> Add item</Button>
                </div>
                {/* Progress + tools */}
                <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex-1 min-w-[120px]">
                        <div className="flex justify-between text-[11px] text-muted-foreground mb-0.5">
                            <span>{countedIds.length} / {total} counted</span><span className="tabular-nums">{pct}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                            <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                        </div>
                    </div>
                    <Button variant={remainingOnly ? "default" : "outline"} size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setRemainingOnly(v => !v)}>
                        <ListFilter className="w-3.5 h-3.5" /> {remainingOnly ? "Showing remaining" : "Remaining only"}
                    </Button>
                    <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={printBlank} title="Printable blank sheet">
                        <Printer className="w-3.5 h-3.5" /> Sheet
                    </Button>
                    <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={exportFilled} disabled={countedIds.length === 0} title="Export counted as PDF">
                        <FileDown className="w-3.5 h-3.5" /> PDF
                    </Button>
                </div>
            </div>

            {areaItems.length === 0 ? (
                <Card><CardContent className="py-12 text-center text-muted-foreground text-sm">
                    No ingredients assigned to this area. Use <strong>Add item</strong> for things stored here, or set the storage area in Inventory.
                </CardContent></Card>
            ) : (
                groups.map(([cat, list]) => (
                    <div key={cat} className="space-y-2">
                        <div className="flex items-center gap-2 py-1">
                            <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{cat}</h3>
                            <span className="text-[10px] text-muted-foreground">{list.length}</span>
                            <div className="flex-1 h-px bg-border" />
                        </div>
                        {list.map(it => (
                            <CountCard key={it.id} item={it} row={draft[it.id] ?? EMPTY} onSet={set}
                                last={counts[it.ingredientId]} isExtra={(it.ingredient.storageAreaId ?? null) !== area?.id}
                                onEditPack={() => setPackEdit(it)} />
                        ))}
                    </div>
                ))
            )}

            {/* Save bar */}
            <div className="sticky bottom-0 -mx-1 px-1 pt-2 pb-1 bg-gradient-to-t from-background via-background to-transparent">
                <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5 shadow-sm">
                    <span className="text-sm text-muted-foreground">{countedIds.length} counted</span>
                    {savedMsg && <span className="text-xs text-emerald-600 flex items-center gap-1"><Check className="w-3.5 h-3.5" />{savedMsg}</span>}
                    <Button size="sm" className="ml-auto" disabled={saving || countedIds.length === 0} onClick={save}>
                        {saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />} Save count
                    </Button>
                </div>
            </div>

            {/* Add item dialog */}
            <Dialog open={addOpen} onOpenChange={v => { if (!v) { setAddOpen(false); setSearch(""); } }}>
                <DialogContent className="sm:max-w-md max-h-[80dvh] flex flex-col">
                    <DialogHeader><DialogTitle>Add item found in {area?.name}</DialogTitle></DialogHeader>
                    <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input className="pl-8 h-9" placeholder="Search ingredient…" value={search} onChange={e => setSearch(e.target.value)} autoFocus />
                    </div>
                    <div className="flex-1 overflow-y-auto mt-2 space-y-1">
                        {candidates.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-8">No other tracked ingredients.</p>
                        ) : candidates.slice(0, 60).map(i => (
                            <button key={i.id}
                                onClick={() => { setExtra(s => new Set(s).add(i.ingredientId)); setAddOpen(false); setSearch(""); }}
                                className="w-full flex items-center justify-between gap-2 rounded-lg border border-border px-2.5 py-2 text-left text-sm hover:bg-accent">
                                <span className="min-w-0"><span className="font-medium truncate block">{i.ingredient.name}</span>
                                    <span className="text-[10px] text-muted-foreground">{i.ingredient.category?.name ?? "Uncategorized"} · home: {i.ingredient.storageArea?.name ?? "—"}</span></span>
                                <Plus className="w-4 h-4 text-muted-foreground shrink-0" />
                            </button>
                        ))}
                    </div>
                </DialogContent>
            </Dialog>

            {packEdit && (
                <PackEditor item={packEdit}
                    onClose={() => setPackEdit(null)}
                    onSaved={async () => { setPackEdit(null); await onSaved(); }} />
            )}
        </div>
    );
}

// ─── Single count card ──────────────────────────────────────────────────────
function CountCard({ item, row, onSet, last, isExtra, onEditPack }: {
    item: InventoryItem; row: Row; onSet: (id: string, f: keyof Row, v: string) => void; last?: number; isExtra: boolean; onEditPack: () => void;
}) {
    const cfg = cfgOf(item);
    const entry = entryOf(row);
    const total = countToRecipeUnits(entry, cfg);
    const has = countHasValue(entry);
    const current = Number(item.currentStock);
    const variance = has ? total - current : 0;

    return (
        <Card className={has ? "border-primary/40" : ""}>
            <CardContent className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                        <p className="font-medium leading-tight flex items-center gap-1.5">
                            {item.ingredient.name}
                            {isExtra && <Badge variant="outline" className="text-[9px] py-0">also here</Badge>}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                            <span className="font-semibold text-foreground">
                                On system: {hasPack(cfg) && recipeToPacks(current, cfg) != null
                                    ? `${fmt(recipeToPacks(current, cfg)!)} ${cfg.packUnit}`
                                    : `${fmt(current)} ${cfg.recipeUnit}`}
                            </span>
                            {hasPack(cfg) && <span className="ml-1">({fmt(current)} {cfg.recipeUnit})</span>}
                            {last != null && <span> · last here: {hasPack(cfg) && recipeToPacks(last, cfg) != null
                                ? `${fmt(recipeToPacks(last, cfg)!)} ${cfg.packUnit}`
                                : `${fmt(last)} ${cfg.recipeUnit}`}</span>}
                        </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        {/* Pack / case size chip — set once, then count in cases */}
                        {hasPack(cfg) ? (
                            <button onClick={onEditPack} title="Edit pack size"
                                className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-lg border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors">
                                <Boxes className="w-3 h-3" /> 1 {cfg.packUnit} = {fmt(cfg.packSize!)} {cfg.purchaseUnit} <Pencil className="w-2.5 h-2.5 opacity-60" />
                            </button>
                        ) : (
                            <button onClick={onEditPack} title="Set pack / case size"
                                className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-lg border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors">
                                <Package className="w-3 h-3" /> Set pack size
                            </button>
                        )}
                        {has && <Check className="w-4 h-4 text-primary" />}
                    </div>
                </div>

                <div className="flex flex-wrap gap-2">
                    {hasPack(cfg) && (
                        <Field label={cfg.packUnit ?? "Pack"} value={row.packs} onChange={v => onSet(item.id, "packs", v)} />
                    )}
                    <Field label={cfg.purchaseUnit} value={row.purchase} onChange={v => onSet(item.id, "purchase", v)} />
                    <Field label={cfg.recipeUnit} value={row.recipe} onChange={v => onSet(item.id, "recipe", v)} />
                </div>

                {has && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
                        <span className="font-semibold">{describeBreakdown(entry, cfg)} = {fmt(total)} {cfg.recipeUnit}</span>
                        <span className="text-muted-foreground">≈ {fmt(recipeToPurchase(total, cfg))} {cfg.purchaseUnit}{recipeToPacks(total, cfg) != null ? ` · ${fmt(recipeToPacks(total, cfg)!)} ${cfg.packUnit}` : ""}</span>
                        <span className={variance < 0 ? "text-rose-600" : variance > 0 ? "text-emerald-600" : "text-muted-foreground"}>
                            {variance === 0 ? "matches system" : `${variance > 0 ? "+" : ""}${fmt(variance)} vs system`}
                        </span>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
    return (
        <div className="flex flex-col items-center">
            <Input type="number" inputMode="decimal" min={0} value={value} onChange={e => onChange(e.target.value)}
                placeholder="0" className="h-11 w-20 text-center text-base tabular-nums" />
            <span className="text-[10px] text-muted-foreground mt-0.5 max-w-[80px] truncate">{label}</span>
        </div>
    );
}

// ─── Pack / case size editor (set "1 Case = 50 lb" once, reuse forever) ──────
function PackEditor({ item, onClose, onSaved }: { item: InventoryItem; onClose: () => void; onSaved: () => void | Promise<void> }) {
    const cfg = cfgOf(item);
    const [unit, setUnit] = useState(item.packUnit ?? "Case");
    const [size, setSize] = useState(item.packSize != null ? String(Number(item.packSize)) : "");
    const [saving, setSaving] = useState(false);
    const sizeNum = num(size);
    const previewRecipe = sizeNum > 0 ? sizeNum * cfg.conversionRate : 0;

    async function save(clear = false) {
        setSaving(true);
        try {
            await inventoryApi.update(item.id, {
                packUnit: clear ? null : (unit.trim() || null),
                packSize: clear ? null : (sizeNum > 0 ? sizeNum : null),
            });
            await onSaved();
        } finally { setSaving(false); }
    }

    return (
        <Dialog open onOpenChange={v => { if (!v) onClose(); }}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2"><Boxes className="w-4 h-4 text-amber-600" /> Pack / Case size</DialogTitle>
                    <DialogDescription>{item.ingredient.name}</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                    <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                        <div className="space-y-1">
                            <Label className="text-xs">Pack name</Label>
                            <Input value={unit} onChange={e => setUnit(e.target.value)} placeholder="Case / Box / Bag" className="h-10" />
                        </div>
                        <span className="pb-2.5 text-muted-foreground text-sm">=</span>
                        <div className="space-y-1">
                            <Label className="text-xs">Size ({cfg.purchaseUnit})</Label>
                            <Input type="number" min={0} inputMode="decimal" value={size}
                                onChange={e => setSize(e.target.value)} placeholder="50" className="h-10 text-right" />
                        </div>
                    </div>
                    <div className="rounded-lg bg-muted/40 border border-border px-3 py-2.5 text-sm">
                        <p className="font-medium">1 {unit.trim() || "pack"} = <span className="tabular-nums text-amber-700 dark:text-amber-300">{sizeNum > 0 ? fmt(sizeNum) : "—"} {cfg.purchaseUnit}</span></p>
                        {sizeNum > 0 && (
                            <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">= {fmt(previewRecipe)} {cfg.recipeUnit} (1 {cfg.purchaseUnit} = {fmt(cfg.conversionRate)} {cfg.recipeUnit})</p>
                        )}
                    </div>
                </div>
                <DialogFooter className="flex-row justify-between gap-2">
                    {hasPack(cfg)
                        ? <Button variant="ghost" size="sm" onClick={() => save(true)} disabled={saving} className="text-red-600 hover:text-red-700">Remove pack</Button>
                        : <span />}
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
                        <Button size="sm" onClick={() => save(false)} disabled={saving || sizeNum <= 0}>
                            {saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />} Save
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
