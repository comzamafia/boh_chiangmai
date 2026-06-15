"use client";
/**
 * /usage-report — Last-N-day PMIX usage in five reports (Protein, Curry,
 * Appetizers, Desserts, Beverage), shown per weekday and convertible into any
 * unit of the ingredient's unit chain (Order / oz / piece / box / case…), like Stock Count.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useAuth } from "@/components/auth-provider";
import {
    Gauge, Loader2, Beef, Soup, IceCream, Wine, Settings2, Plus, Trash2, ChevronDown, Link2, FileDown, Image as ImageIcon, Salad,
} from "lucide-react";
import {
    usageReportApi, type UsageReportResult, type UsageReportItem,
} from "@/lib/api";
import { solveChain, solvableUnits, fmtChainQty } from "@/lib/unit-chain";
import { exportUsageReportPDF, type UsageReportExport } from "@/lib/usage-report-pdf";

const EDIT_ROLES = ["admin", "manager", "chef"];
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
type Tab = "protein" | "curry" | "dessert" | "beverage" | "appetizer";
const TABS: { key: Tab; label: string; icon: React.ElementType; color: string }[] = [
    { key: "protein",   label: "Main Protein",  icon: Beef,     color: "text-rose-600" },
    { key: "curry",     label: "Main Curry",    icon: Soup,     color: "text-amber-600" },
    { key: "appetizer", label: "Appetizers",    icon: Salad,    color: "text-green-600" },
    { key: "dessert",   label: "Main Desserts", icon: IceCream, color: "text-pink-600" },
    { key: "beverage",  label: "Beverages",     icon: Wine,     color: "text-purple-600" },
];

// orders → chosen unit, using the item's chain (+ portion std as a bridge)
function converterFor(item: UsageReportItem) {
    const units: string[] = ["Order"];
    let perBase: Record<string, number> | null = null;
    let basePerOrder: number | null = null;

    if (item.chain && item.chain.base) {
        perBase = solveChain(item.chain);
        if (perBase["Order"] != null) basePerOrder = perBase["Order"];
        else if (item.portionUnit && perBase[item.portionUnit] != null && item.portionSize != null) {
            basePerOrder = item.portionSize * perBase[item.portionUnit];
        }
        if (basePerOrder != null) for (const u of solvableUnits(item.chain)) if (!units.includes(u)) units.push(u);
    }
    if (item.portionUnit && !units.includes(item.portionUnit)) units.push(item.portionUnit);

    const convert = (orders: number, unit: string): number | null => {
        if (unit === "Order") return orders;
        if (perBase && basePerOrder != null && perBase[unit] != null) return (orders * basePerOrder) / perBase[unit];
        if (item.portionUnit === unit && item.portionSize != null) return orders * item.portionSize;
        return null;
    };
    return { units, convert };
}

export default function UsageReportPage() {
    const { user } = useAuth();
    const canManage = EDIT_ROLES.includes(user?.role ?? "");

    const [days, setDays]       = useState(7);
    const [data, setData]       = useState<UsageReportResult | null>(null);
    const [loading, setLoading] = useState(true);
    const [tab, setTab]         = useState<Tab>("protein");
    const [editChain, setEditChain] = useState<UsageReportItem | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try { setData(await usageReportApi.get(days)); }
        catch { setData(null); }
        finally { setLoading(false); }
    }, [days]);
    useEffect(() => { load(); }, [load]);

    const rows = data ? data[tab] : [];

    function exportPDF() {
        if (!data) return;
        const totalDays = Math.max(1, data.dowCounts.reduce((s, x) => s + x, 0));
        const sectionFor = (title: string, items: UsageReportItem[]) => ({
            title,
            rows: items.map(item => {
                const conv = converterFor(item);
                const multiLine = (orders: number) => conv.units
                    .map(u => { const v = conv.convert(orders, u); return v == null ? null : `${fmtChainQty(v)} ${u}`; })
                    .filter(Boolean).join("\n");
                return {
                    label: item.label,
                    dayCells: item.byDow.map(q => q > 0 ? multiLine(q) : ""),
                    dayOrders: item.byDow.map(q => q > 0 ? q : null),
                    total: multiLine(item.total),
                    avg: multiLine(item.total / totalDays),
                };
            }),
        });
        // Export ONLY the station (tab) currently in view — one report per PDF
        const tabLabel = TABS.find(t => t.key === tab)?.label ?? "Usage";
        const payload: UsageReportExport = {
            days: data.days, dowCounts: data.dowCounts,
            sections: [sectionFor(tabLabel, data[tab])],
            iceCream: tab === "dessert"
                ? data.iceCream.map(f => ({ flavor: f.flavor, cells: f.byDow.map(q => q ? String(q) : ""), total: String(f.total) }))
                : [],
            fileLabel: tabLabel,
        };
        exportUsageReportPDF(payload);
    }

    const captureRef = useRef<HTMLDivElement>(null);
    async function exportJpg() {
        const node = captureRef.current;
        if (!node) return;
        const { toJpeg } = await import("html-to-image");
        const bg = getComputedStyle(document.body).backgroundColor || "#ffffff";
        // Expand horizontal-scroll wrappers so the full (off-screen) table is captured
        const scrollers = Array.from(node.querySelectorAll<HTMLElement>(".overflow-x-auto"));
        const prevOv = scrollers.map(el => el.style.overflow);
        const prevW = node.style.width;
        scrollers.forEach(el => { el.style.overflow = "visible"; });
        node.style.width = "max-content";
        await new Promise(requestAnimationFrame);
        try {
            const url = await toJpeg(node, { quality: 0.95, pixelRatio: 2, backgroundColor: bg, cacheBust: true,
                width: node.scrollWidth, height: node.scrollHeight });
            const a = document.createElement("a");
            a.href = url;
            a.download = `usage-${tab}-${days}d-${new Date().toISOString().slice(0, 10)}.jpg`;
            a.click();
        } finally {
            scrollers.forEach((el, i) => { el.style.overflow = prevOv[i]; });
            node.style.width = prevW;
        }
    }

    return (
        <div className="space-y-5 max-w-6xl mx-auto pb-12">
            <div className="flex flex-wrap justify-between items-start gap-3">
                <div>
                    <h2 className="text-3xl font-bold font-playfair tracking-tight text-primary flex items-center gap-2">
                        <Gauge className="w-7 h-7" /> Usage Report
                    </h2>
                    <p className="text-muted-foreground">Last {days}-day usage from PMIX — view any unit (orders, oz, pieces, boxes, cases).</p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 p-0.5 bg-muted/50 rounded-lg">
                        {[7, 14, 30].map(d => (
                            <button key={d} onClick={() => setDays(d)}
                                className={`px-3 py-1.5 rounded-md text-xs font-medium ${days === d ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>{d}d</button>
                        ))}
                    </div>
                    <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={exportJpg} disabled={!data}>
                        <ImageIcon className="w-4 h-4" /> JPG
                    </Button>
                    <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={exportPDF} disabled={!data}>
                        <FileDown className="w-4 h-4" /> PDF
                    </Button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 overflow-x-auto pb-1">
                {TABS.map(t => {
                    const Icon = t.icon; const active = tab === t.key;
                    const n = data ? data[t.key].length : 0;
                    return (
                        <button key={t.key} onClick={() => setTab(t.key)}
                            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium whitespace-nowrap shrink-0 border transition-all
                                ${active ? "bg-primary text-primary-foreground border-primary shadow-sm" : "bg-card border-border text-muted-foreground hover:text-foreground"}`}>
                            <Icon className={`w-4 h-4 ${active ? "" : t.color}`} /> {t.label}
                            <span className={`text-xs tabular-nums ${active ? "opacity-90" : "opacity-60"}`}>{n}</span>
                        </button>
                    );
                })}
            </div>

            {loading ? (
                <div className="flex justify-center py-20"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>
            ) : !data ? (
                <Card><CardContent className="py-12 text-center text-muted-foreground text-sm">Failed to load. Upload PMIX reports first.</CardContent></Card>
            ) : (
                <div ref={captureRef} className="space-y-5 bg-background">
                    <UsageTable rows={rows} dowCounts={data.dowCounts}
                        canManage={canManage} onEditChain={setEditChain} />
                    {tab === "dessert" && data.iceCream.length > 0 && (
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm flex items-center gap-2"><IceCream className="w-4 h-4 text-pink-500" /> Ice Cream — by flavour (orders)</CardTitle>
                            </CardHeader>
                            <CardContent className="px-2 sm:px-4">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-xs min-w-[420px]">
                                        <thead><tr className="text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border">
                                            <th className="text-left py-2 pl-2">Flavour</th>{DOW.map(d => <th key={d} className="text-right py-2 px-2">{d}</th>)}<th className="text-right py-2 pr-2">Total</th>
                                        </tr></thead>
                                        <tbody className="divide-y divide-border/40">
                                            {data.iceCream.map(f => (
                                                <tr key={f.flavor} className="hover:bg-muted/20">
                                                    <td className="py-1.5 pl-2 font-medium">{f.flavor}</td>
                                                    {f.byDow.map((q, i) => <td key={i} className="py-1.5 px-2 text-right tabular-nums">{q || <span className="text-muted-foreground/40">·</span>}</td>)}
                                                    <td className="py-1.5 pr-2 text-right tabular-nums font-semibold">{f.total}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>
            )}

            {editChain && (
                <ChainEditor item={editChain} onClose={() => setEditChain(null)} onSaved={() => { setEditChain(null); load(); }} />
            )}
        </div>
    );
}

// ─── Usage table (all units stacked per cell, like the PDF) ─────────────────
function MultiCell({ lines, muted }: { lines: { u: string; v: number }[]; muted?: boolean }) {
    if (lines.length === 0) return <span className="text-muted-foreground/40 font-normal">·</span>;
    return (
        <div className="space-y-0.5">
            {lines.map(l => (
                <div key={l.u} className="whitespace-nowrap leading-tight">
                    <span className={`tabular-nums font-bold ${muted ? "text-muted-foreground" : "text-foreground"}`}>{fmtChainQty(l.v)}</span>
                    <span className="text-muted-foreground text-[10px] ml-1">{l.u}</span>
                </div>
            ))}
        </div>
    );
}

function UsageTable({ rows, dowCounts, canManage, onEditChain }: {
    rows: UsageReportItem[]; dowCounts: number[];
    canManage: boolean; onEditChain: (i: UsageReportItem) => void;
}) {
    const totalDays = Math.max(1, dowCounts.reduce((s, x) => s + x, 0));
    if (rows.length === 0) return <Card><CardContent className="py-12 text-center text-muted-foreground text-sm">No usage in this window.</CardContent></Card>;
    return (
        <Card>
            <CardContent className="px-2 sm:px-4 py-3">
                <div className="overflow-x-auto">
                    <table className="w-full text-xs" style={{ minWidth: 720 }}>
                        <thead>
                            <tr className="text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border">
                                <th className="text-left py-2 pl-1 sticky left-0 bg-card">Item</th>
                                {DOW.map((d, i) => <th key={d} className="text-right py-2 px-2">{d}<span className="block text-[8px] opacity-60">×{dowCounts[i] || 0}</span></th>)}
                                <th className="text-right py-2 px-2">Avg/d</th>
                                <th className="text-right py-2 px-2">Total</th>
                                <th className="w-8" />
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(item => {
                                const conv = converterFor(item);
                                const linesOf = (orders: number) => conv.units
                                    .map(u => { const v = conv.convert(orders, u); return v == null ? null : { u, v }; })
                                    .filter((x): x is { u: string; v: number } => x != null);
                                return (
                                    <tr key={item.label} className="border-t border-border/40 hover:bg-muted/20 align-top">
                                        <td className="py-1.5 pl-1 sticky left-0 bg-card font-medium max-w-[160px]">
                                            <div className="flex items-start gap-1">
                                                <span className="truncate">{item.label}</span>
                                                {!item.ingredientId && <Link2 className="inline w-3 h-3 mt-0.5 text-amber-500 shrink-0" />}
                                            </div>
                                        </td>
                                        {item.byDow.map((q, i) => (
                                            <td key={i} className="py-1.5 px-2 text-right">{q > 0 ? <MultiCell lines={linesOf(q)} /> : <span className="text-muted-foreground/40">·</span>}</td>
                                        ))}
                                        <td className="py-1.5 px-2 text-right bg-muted/20"><MultiCell lines={linesOf(item.total / totalDays)} muted /></td>
                                        <td className="py-1.5 px-2 text-right"><MultiCell lines={linesOf(item.total)} /></td>
                                        <td className="py-1.5 text-right pr-1">
                                            {canManage && (
                                                <button onClick={() => onEditChain(item)} title="Configure units for this item"
                                                    className="text-muted-foreground hover:text-primary">
                                                    <Settings2 className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                <p className="text-[10px] text-muted-foreground mt-2">
                    Every configured unit is shown stacked per cell (Avg/d = average per day). <Link2 className="inline w-3 h-3 text-amber-500" /> = no Portion Standard linked yet (only Order count available).
                    Configure multi-level units (1 Case = 4 Box…) with the <Settings2 className="inline w-3 h-3" /> button.
                </p>
            </CardContent>
        </Card>
    );
}

// ─── Unit chain editor ──────────────────────────────────────────────────────
function ChainEditor({ item, onClose, onSaved }: { item: UsageReportItem; onClose: () => void; onSaved: () => void }) {
    const [base, setBase] = useState(item.chain?.base ?? (item.portionUnit ?? "Piece"));
    const [rels, setRels] = useState<{ from: string; qty: string; to: string }[]>(
        item.chain?.relations.map(r => ({ from: r.from, qty: String(r.qty), to: r.to }))
        ?? [{ from: "Order", qty: "", to: item.portionUnit ?? "Piece" }],
    );
    const [saving, setSaving] = useState(false);

    const preview = useMemo(() => {
        const relations = rels.map(r => ({ from: r.from.trim(), qty: Number(r.qty), to: r.to.trim() }))
            .filter(r => r.from && r.to && Number.isFinite(r.qty) && r.qty > 0);
        const perBase = solveChain({ base: base.trim(), relations });
        return Object.entries(perBase).map(([u, v]) => `1 ${u} = ${fmtChainQty(v)} ${base.trim()}`);
    }, [base, rels]);

    async function save() {
        if (!item.reportKey) return;
        setSaving(true);
        try {
            const relations = rels.map(r => ({ from: r.from.trim(), qty: Number(r.qty), to: r.to.trim() }))
                .filter(r => r.from && r.to && Number.isFinite(r.qty) && r.qty > 0);
            await usageReportApi.saveChain(item.reportKey, base.trim(), relations);
            onSaved();
        } finally { setSaving(false); }
    }

    return (
        <Dialog open onOpenChange={v => { if (!v) onClose(); }}>
            <DialogContent className="sm:max-w-lg max-h-[90dvh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2"><Settings2 className="w-4 h-4 text-primary" /> Unit chain — {item.label}</DialogTitle>
                    <DialogDescription>
                        Define conversions as &ldquo;1 X = N Y&rdquo;. Everything reduces to the base unit.
                        {item.portionUnit && <> Portion standard: 1 Order = {item.portionSize} {item.portionUnit}.</>}
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-3 py-1">
                    <div className="space-y-1">
                        <Label className="text-xs">Base unit (smallest)</Label>
                        <Input value={base} onChange={e => setBase(e.target.value)} placeholder="Piece" className="h-9 w-40" />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs">Conversions</Label>
                        {rels.map((r, i) => (
                            <div key={i} className="flex items-center gap-1.5 text-sm">
                                <span className="text-muted-foreground">1</span>
                                <Input value={r.from} onChange={e => setRels(a => a.map((x, j) => j === i ? { ...x, from: e.target.value } : x))} placeholder="Case" className="h-9 w-24" />
                                <span className="text-muted-foreground">=</span>
                                <Input type="number" value={r.qty} onChange={e => setRels(a => a.map((x, j) => j === i ? { ...x, qty: e.target.value } : x))} placeholder="4" className="h-9 w-16 text-right" />
                                <Input value={r.to} onChange={e => setRels(a => a.map((x, j) => j === i ? { ...x, to: e.target.value } : x))} placeholder="Box" className="h-9 w-24" />
                                <button onClick={() => setRels(a => a.filter((_, j) => j !== i))} className="text-muted-foreground/50 hover:text-destructive shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                            </div>
                        ))}
                        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setRels(a => [...a, { from: "", qty: "", to: base }])}>
                            <Plus className="w-3.5 h-3.5" /> Add conversion
                        </Button>
                    </div>
                    {preview.length > 1 && (
                        <div className="rounded-lg bg-muted/40 border border-border px-3 py-2 text-[11px] text-muted-foreground space-y-0.5">
                            <p className="font-medium text-foreground flex items-center gap-1"><ChevronDown className="w-3 h-3" /> Resolved</p>
                            {preview.map((p, i) => <p key={i} className="tabular-nums">{p}</p>)}
                        </div>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
                    <Button size="sm" onClick={save} disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />} Save</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
