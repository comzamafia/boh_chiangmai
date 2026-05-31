"use client";
/**
 * StockCountSheet — practical physical stock-count UI.
 *
 * Staff count what they SEE on the shelf — whole cases (ลัง), loose purchase
 * units (lb), loose base units (oz) — in up to three boxes per item. The
 * system converts everything to recipe units automatically using the
 * pack → purchase → recipe chain (see lib/stock-units.ts).
 *
 * Features:
 *   - Mobile-first card layout (one card per ingredient)
 *   - Live "= N oz (≈ M lb · K ลัง)" preview + variance vs system stock
 *   - Draft auto-saved to localStorage (survives refresh / accidental close)
 *   - Inline "pack size" editor — set "1 ลัง = 50 lb" once, reuse forever
 *   - Search filter + progress footer
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
    Search, Loader2, ClipboardList, Package, Pencil, Check, Trash2, Boxes,
} from "lucide-react";
import { inventoryApi, type InventoryItem } from "@/lib/api";
import {
    type StockUnitConfig, type CountEntry,
    hasPack, countToRecipeUnits, countHasValue,
    recipeUnitsToBreakdown, describeBreakdown, recipeToPurchase, recipeToPacks,
} from "@/lib/stock-units";

const DRAFT_KEY = "stockcount-draft-v1";

type DraftRow = { packs: string; purchase: string; recipe: string };
type Draft    = Record<string, DraftRow>;

const EMPTY_ROW: DraftRow = { packs: "", purchase: "", recipe: "" };

function today() { return new Date().toISOString().slice(0, 10); }
function num(s: string): number { const n = Number(s); return Number.isFinite(n) ? n : 0; }
function fmt(n: number): string { return n % 1 === 0 ? n.toLocaleString() : n.toFixed(2); }

function cfgOf(item: InventoryItem): StockUnitConfig {
    return {
        recipeUnit:     item.ingredient.recipeUnit,
        purchaseUnit:   item.ingredient.purchaseUnit,
        conversionRate: Number(item.ingredient.conversionRate) || 1,
        packUnit:       item.packUnit ?? null,
        packSize:       item.packSize != null ? Number(item.packSize) : null,
    };
}

export default function StockCountSheet({
    items, onSaved,
}: {
    items:   InventoryItem[];
    onSaved: () => void | Promise<void>;
}) {
    const [draft,   setDraft]   = useState<Draft>({});
    const [search,  setSearch]  = useState("");
    const [saving,  setSaving]  = useState(false);
    const [editId,  setEditId]  = useState<string | null>(null);

    // ── Load draft from localStorage on mount ────────────────────────────────
    useEffect(() => {
        try {
            const raw = localStorage.getItem(DRAFT_KEY);
            if (raw) setDraft(JSON.parse(raw));
        } catch { /* ignore */ }
    }, []);

    // ── Persist draft on change ──────────────────────────────────────────────
    useEffect(() => {
        try {
            const hasAny = Object.values(draft).some(r =>
                r && (r.packs !== "" || r.purchase !== "" || r.recipe !== ""));
            if (hasAny) localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
            else        localStorage.removeItem(DRAFT_KEY);
        } catch { /* ignore */ }
    }, [draft]);

    const rowOf = useCallback((id: string): DraftRow => draft[id] ?? EMPTY_ROW, [draft]);

    const setField = (id: string, field: keyof DraftRow, value: string) => {
        setDraft(d => ({ ...d, [id]: { ...EMPTY_ROW, ...d[id], [field]: value } }));
    };

    const entryOf = (id: string): CountEntry => {
        const r = rowOf(id);
        return { packs: num(r.packs), purchase: num(r.purchase), recipe: num(r.recipe) };
    };

    const filtered = useMemo(() => {
        const q = search.toLowerCase().trim();
        if (!q) return items;
        return items.filter(i =>
            i.ingredient.name.toLowerCase().includes(q) ||
            (i.ingredient.category?.name ?? "").toLowerCase().includes(q));
    }, [items, search]);

    const countedIds = Object.keys(draft).filter(id => countHasValue(entryOf(id)));
    const countedCount = countedIds.length;

    // ── Save all counted rows ────────────────────────────────────────────────
    async function handleSave() {
        if (countedCount === 0) return;
        setSaving(true);
        try {
            await Promise.all(countedIds.map(id => {
                const item = items.find(i => i.id === id);
                if (!item) return Promise.resolve();
                const cfg     = cfgOf(item);
                const entry   = entryOf(id);
                const totalOz = countToRecipeUnits(entry, cfg);
                const note    = `Counted: ${describeBreakdown(entry, cfg)} = ${fmt(totalOz)} ${cfg.recipeUnit}`;
                return inventoryApi.logTransaction({
                    inventoryItemId: id,
                    ingredientId:    item.ingredientId,
                    type:            "Stocktake",
                    qty:             totalOz,
                    unit:            cfg.recipeUnit,
                    date:            today(),
                    note,
                });
            }));
            setDraft({});
            try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
            await onSaved();
        } catch (e) {
            console.error(e);
        } finally {
            setSaving(false);
        }
    }

    const editItem = items.find(i => i.id === editId) ?? null;

    return (
        <div className="space-y-3">
            {/* ── Search + progress ── */}
            <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        placeholder="Search ingredient or category…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="pl-9 h-10"
                    />
                </div>
                <Badge variant="secondary" className="text-xs h-8 px-3 flex items-center gap-1.5">
                    <ClipboardList className="w-3.5 h-3.5" />
                    {countedCount} / {items.length} counted
                </Badge>
            </div>

            {/* ── Item cards ── */}
            <div className="space-y-2.5">
                {filtered.map(item => {
                    const cfg       = cfgOf(item);
                    const withPack  = hasPack(cfg);
                    const row       = rowOf(item.id);
                    const entry     = entryOf(item.id);
                    const counted   = countHasValue(entry);
                    const totalOz   = countToRecipeUnits(entry, cfg);
                    const sysOz     = Number(item.currentStock);
                    const variance  = counted ? totalOz - sysOz : null;
                    const sysBd     = recipeUnitsToBreakdown(sysOz, cfg);

                    const varColour = variance == null ? "" :
                        variance < 0 ? "text-red-600 dark:text-red-400" :
                        variance > 0 ? "text-emerald-600 dark:text-emerald-400" :
                        "text-muted-foreground";

                    return (
                        <Card key={item.id} className={counted ? "border-primary/40 shadow-sm" : ""}>
                            <CardContent className="p-3 space-y-2.5">
                                {/* Header row */}
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="font-semibold text-sm truncate">{item.ingredient.name}</p>
                                        <p className="text-[11px] text-muted-foreground">
                                            {item.ingredient.category?.name ?? "Uncategorized"}
                                            {" · "}System: <span className="tabular-nums">{fmt(sysOz)} {cfg.recipeUnit}</span>
                                            {withPack && (
                                                <span className="text-muted-foreground/80">
                                                    {" "}≈ {sysBd.packs} {cfg.packUnit} + {sysBd.purchase} {cfg.purchaseUnit} + {fmt(sysBd.recipe)} {cfg.recipeUnit}
                                                </span>
                                            )}
                                        </p>
                                    </div>
                                    {/* Pack chip / set-pack button */}
                                    {withPack ? (
                                        <button
                                            onClick={() => setEditId(item.id)}
                                            className="shrink-0 flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-lg border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors touch-manipulation"
                                            title="Edit pack size"
                                        >
                                            <Boxes className="w-3 h-3" />
                                            1 {cfg.packUnit} = {fmt(cfg.packSize!)} {cfg.purchaseUnit}
                                            <Pencil className="w-2.5 h-2.5 opacity-60" />
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => setEditId(item.id)}
                                            className="shrink-0 flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-lg border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors touch-manipulation"
                                            title="Set pack / case size"
                                        >
                                            <Package className="w-3 h-3" />
                                            Set pack size
                                        </button>
                                    )}
                                </div>

                                {/* Count inputs */}
                                <div className="flex items-end gap-2 flex-wrap">
                                    {withPack && (
                                        <>
                                            <CountInput
                                                label={cfg.packUnit!}
                                                value={row.packs}
                                                onChange={v => setField(item.id, "packs", v)}
                                                accent
                                            />
                                            <span className="pb-2 text-muted-foreground font-semibold">+</span>
                                        </>
                                    )}
                                    <CountInput
                                        label={cfg.purchaseUnit}
                                        value={row.purchase}
                                        onChange={v => setField(item.id, "purchase", v)}
                                    />
                                    {cfg.recipeUnit !== cfg.purchaseUnit && (
                                        <>
                                            <span className="pb-2 text-muted-foreground font-semibold">+</span>
                                            <CountInput
                                                label={cfg.recipeUnit}
                                                value={row.recipe}
                                                onChange={v => setField(item.id, "recipe", v)}
                                            />
                                        </>
                                    )}
                                </div>

                                {/* Live total + variance */}
                                {counted && (
                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1.5 border-t border-border text-xs">
                                        <span className="font-semibold tabular-nums">
                                            = {fmt(totalOz)} {cfg.recipeUnit}
                                        </span>
                                        <span className="text-muted-foreground tabular-nums">
                                            ≈ {fmt(recipeToPurchase(totalOz, cfg))} {cfg.purchaseUnit}
                                            {withPack && (() => {
                                                const p = recipeToPacks(totalOz, cfg);
                                                return p != null ? ` · ${fmt(p)} ${cfg.packUnit}` : "";
                                            })()}
                                        </span>
                                        {variance != null && (
                                            <span className={`ml-auto font-semibold tabular-nums ${varColour}`}>
                                                Variance {variance > 0 ? "+" : ""}{fmt(variance)} {cfg.recipeUnit}
                                            </span>
                                        )}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    );
                })}

                {filtered.length === 0 && (
                    <p className="text-center text-sm text-muted-foreground py-10">
                        {items.length === 0 ? "No ingredients tracked yet." : "No items match your search."}
                    </p>
                )}
            </div>

            {/* ── Sticky action bar ── */}
            {countedCount > 0 && (
                <div className="sticky bottom-3 z-10 flex items-center justify-between gap-2 rounded-xl border border-border bg-card/95 backdrop-blur px-4 py-3 shadow-lg">
                    <span className="text-sm">
                        <strong className="text-primary">{countedCount}</strong> item{countedCount !== 1 ? "s" : ""} ready to save
                    </span>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm"
                            onClick={() => { setDraft({}); try { localStorage.removeItem(DRAFT_KEY); } catch {} }}>
                            <Trash2 className="w-4 h-4 mr-1.5" /> Clear
                        </Button>
                        <Button size="sm" onClick={handleSave} disabled={saving}>
                            {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Check className="w-4 h-4 mr-1.5" />}
                            Save Count
                        </Button>
                    </div>
                </div>
            )}

            {/* ── Pack-size editor dialog ── */}
            {editItem && (
                <PackEditorDialog
                    item={editItem}
                    onClose={() => setEditId(null)}
                    onSaved={async () => { setEditId(null); await onSaved(); }}
                />
            )}
        </div>
    );
}

// ─── Single count input ───────────────────────────────────────────────────────
function CountInput({
    label, value, onChange, accent,
}: {
    label: string; value: string; onChange: (v: string) => void; accent?: boolean;
}) {
    return (
        <div className="space-y-0.5">
            <Label className={`text-[10px] uppercase tracking-wide ${accent ? "text-amber-600 dark:text-amber-400 font-bold" : "text-muted-foreground"}`}>
                {label}
            </Label>
            <Input
                type="number" min={0} inputMode="decimal"
                placeholder="0"
                value={value}
                onChange={e => onChange(e.target.value)}
                className={`w-20 h-11 text-center text-base font-semibold tabular-nums touch-manipulation ${accent ? "border-amber-300 dark:border-amber-700" : ""}`}
            />
        </div>
    );
}

// ─── Pack-size editor ───────────────────────────────────────────────────────
function PackEditorDialog({
    item, onClose, onSaved,
}: {
    item: InventoryItem; onClose: () => void; onSaved: () => void | Promise<void>;
}) {
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
        } catch (e) { console.error(e); } finally { setSaving(false); }
    }

    return (
        <Dialog open onOpenChange={v => { if (!v) onClose(); }}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Boxes className="w-4 h-4 text-amber-600" />
                        Pack / Case size
                    </DialogTitle>
                    <DialogDescription>{item.ingredient.name}</DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                        <div className="space-y-1">
                            <Label className="text-xs">Pack name</Label>
                            <Input value={unit} onChange={e => setUnit(e.target.value)} placeholder="Case / ลัง / Bag" className="h-10" />
                        </div>
                        <span className="pb-2.5 text-muted-foreground text-sm">=</span>
                        <div className="space-y-1">
                            <Label className="text-xs">Size ({cfg.purchaseUnit})</Label>
                            <Input type="number" min={0} inputMode="decimal" value={size}
                                onChange={e => setSize(e.target.value)} placeholder="50" className="h-10 text-right" />
                        </div>
                    </div>

                    {/* Live preview */}
                    <div className="rounded-lg bg-muted/40 border border-border px-3 py-2.5 text-sm">
                        <p className="font-medium">
                            1 {unit.trim() || "pack"} ={" "}
                            <span className="tabular-nums text-amber-700 dark:text-amber-300">
                                {sizeNum > 0 ? fmt(sizeNum) : "—"} {cfg.purchaseUnit}
                            </span>
                        </p>
                        {sizeNum > 0 && (
                            <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
                                = {fmt(previewRecipe)} {cfg.recipeUnit}
                                {" "}(1 {cfg.purchaseUnit} = {fmt(cfg.conversionRate)} {cfg.recipeUnit})
                            </p>
                        )}
                    </div>
                </div>

                <DialogFooter className="flex-row justify-between gap-2">
                    {hasPack(cfg) ? (
                        <Button variant="ghost" size="sm" onClick={() => save(true)} disabled={saving}
                            className="text-red-600 hover:text-red-700">
                            Remove pack
                        </Button>
                    ) : <span />}
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
                        <Button size="sm" onClick={() => save(false)} disabled={saving || sizeNum <= 0}>
                            {saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
                            Save
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
