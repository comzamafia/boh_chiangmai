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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
    Loader2, ClipboardCheck, ChevronLeft, ChevronRight, Search, Plus, Thermometer,
    Warehouse, Check, Snowflake,
} from "lucide-react";
import {
    inventoryApi, storageAreasApi, stockCountApi,
    type InventoryItem, type StorageArea,
} from "@/lib/api";
import {
    type StockUnitConfig, type CountEntry,
    hasPack, countToRecipeUnits, countHasValue, describeBreakdown, recipeToPurchase, recipeToPacks,
} from "@/lib/stock-units";

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
                : <AreaCount key={areaId} area={area} items={items} onBack={() => setAreaId(null)} onSaved={load} />}
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
function AreaCount({ area, items, onBack, onSaved }: {
    area: StorageArea | null; items: InventoryItem[]; onBack: () => void; onSaved: () => void | Promise<void>;
}) {
    const [draft, setDraft]   = useState<Record<string, Row>>({});
    const [extra, setExtra]   = useState<Set<string>>(new Set());   // ingredientIds added "found here"
    const [counts, setCounts] = useState<Record<string, number>>({}); // last saved per-area counts
    const [search, setSearch] = useState("");
    const [addOpen, setAddOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [savedMsg, setSavedMsg] = useState<string | null>(null);

    useEffect(() => {
        if (!area) return;
        stockCountApi.areaCounts(area.id).then(d => {
            setCounts(d.counts);
            setExtra(new Set(Object.keys(d.counts)));   // already-counted-here items show up even if home area differs
        }).catch(() => {});
    }, [area]);

    // Items belonging to THIS area = home-area items ∪ extras (multi-area + found-here)
    const areaItems = useMemo(() => {
        if (!area) return [];
        return items.filter(i => (i.ingredient.storageAreaId ?? null) === area.id || extra.has(i.ingredientId));
    }, [items, area, extra]);

    // Group by category
    const groups = useMemo(() => {
        const m = new Map<string, InventoryItem[]>();
        for (const it of areaItems) {
            const cat = it.ingredient.category?.name ?? "Uncategorized";
            (m.get(cat) ?? m.set(cat, []).get(cat)!).push(it);
        }
        return [...m.entries()].sort(([a], [b]) => a === "Uncategorized" ? 1 : b === "Uncategorized" ? -1 : a.localeCompare(b))
            .map(([cat, list]) => [cat, list.sort((x, y) => x.ingredient.name.localeCompare(y.ingredient.name))] as const);
    }, [areaItems]);

    const set = (id: string, field: keyof Row, v: string) => setDraft(d => ({ ...d, [id]: { ...(d[id] ?? EMPTY), [field]: v } }));
    const countedIds = areaItems.filter(i => countHasValue(entryOf(draft[i.id] ?? EMPTY))).map(i => i.id);

    async function save() {
        if (countedIds.length === 0 || !area) return;
        setSaving(true); setSavedMsg(null);
        try {
            const payload = countedIds.map(id => {
                const it = areaItems.find(x => x.id === id)!;
                return { ingredientId: it.ingredientId, recipeQty: countToRecipeUnits(entryOf(draft[id] ?? EMPTY), cfgOf(it)) };
            });
            const res = await stockCountApi.save(area.id, payload);
            setSavedMsg(`Saved ${res.updated} item${res.updated !== 1 ? "s" : ""}.`);
            setDraft({});
            const d = await stockCountApi.areaCounts(area.id); setCounts(d.counts);
            await onSaved();
        } finally { setSaving(false); }
    }

    // Add-found-here candidates: any tracked item not already in this area
    const inArea = new Set(areaItems.map(i => i.ingredientId));
    const candidates = items.filter(i => !inArea.has(i.ingredientId) && (!search || i.ingredient.name.toLowerCase().includes(search.toLowerCase())));

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center gap-2 sticky top-0 bg-background z-10 py-1">
                <Button variant="outline" size="sm" onClick={onBack} className="gap-1"><ChevronLeft className="w-4 h-4" /> Areas</Button>
                <div className="min-w-0">
                    <p className="font-semibold truncate flex items-center gap-1.5"><Warehouse className="w-4 h-4 text-muted-foreground" />{area?.name}</p>
                </div>
                <Button size="sm" variant="outline" className="ml-auto gap-1" onClick={() => setAddOpen(true)}><Plus className="w-4 h-4" /> Add item</Button>
            </div>

            {areaItems.length === 0 ? (
                <Card><CardContent className="py-12 text-center text-muted-foreground text-sm">
                    No ingredients assigned to this area. Use <strong>Add item</strong> for things stored here, or set the storage area in Inventory.
                </CardContent></Card>
            ) : (
                groups.map(([cat, list]) => (
                    <div key={cat} className="space-y-2">
                        <div className="flex items-center gap-2 sticky top-12 bg-background/95 backdrop-blur z-[5] py-1">
                            <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{cat}</h3>
                            <span className="text-[10px] text-muted-foreground">{list.length}</span>
                            <div className="flex-1 h-px bg-border" />
                        </div>
                        {list.map(it => (
                            <CountCard key={it.id} item={it} row={draft[it.id] ?? EMPTY} onSet={set}
                                last={counts[it.ingredientId]} isExtra={(it.ingredient.storageAreaId ?? null) !== area?.id} />
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
        </div>
    );
}

// ─── Single count card ──────────────────────────────────────────────────────
function CountCard({ item, row, onSet, last, isExtra }: {
    item: InventoryItem; row: Row; onSet: (id: string, f: keyof Row, v: string) => void; last?: number; isExtra: boolean;
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
                            On system: {fmt(current)} {cfg.recipeUnit}
                            {last != null && <span> · last here: {fmt(last)} {cfg.recipeUnit}</span>}
                        </p>
                    </div>
                    {has && <Check className="w-4 h-4 text-primary shrink-0" />}
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
