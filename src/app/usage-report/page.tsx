"use client";
/**
 * /usage-report — Last-N-day PMIX usage in five reports (Protein, Curry,
 * Appetizers, Desserts, Beverage), shown per weekday and convertible into any
 * unit of the ingredient's unit chain (Order / oz / piece / box / case…), like Stock Count.
 */
import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useAuth } from "@/components/auth-provider";
import {
    Gauge, Loader2, Beef, Soup, IceCream, Wine, Settings2, Plus, Trash2, ChevronDown, ChevronRight, Link2, FileDown, Image as ImageIcon, Salad, Boxes, CalendarDays,
} from "lucide-react";
import {
    usageReportApi, type UsageReportResult, type UsageReportItem,
    type DessertSection,
    type IngredientUsageResult,
    type ProteinReportResult,
} from "@/lib/api";
import { solveChain, solvableUnits, fmtChainQty } from "@/lib/unit-chain";
import { exportUsageReportPDF } from "@/lib/usage-report-pdf";
import { STORE_SHORT } from "@/lib/branding";

const EDIT_ROLES = ["admin", "manager", "chef"];
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
type Tab = "protein" | "curry" | "dessert" | "beverage" | "ingredients";
const TABS: { key: Tab; label: string; icon: React.ElementType; color: string }[] = [
    { key: "protein",     label: "Main Protein",  icon: Beef,     color: "text-rose-600" },
    { key: "curry",       label: "Main Curry",    icon: Soup,     color: "text-amber-600" },
    { key: "dessert",     label: "Main Desserts", icon: IceCream, color: "text-pink-600" },
    { key: "beverage",    label: "Beverages",     icon: Wine,     color: "text-purple-600" },
    { key: "ingredients", label: "Ingredients",   icon: Boxes,    color: "text-cyan-600" },
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

// Chain type shared by ingredient/protein/dessert rows.
type RowChain = { base: string; relations: { from: string; qty: number; to: string }[] } | null;

// Expand a row's per-unit values into all configured units. Values whose unit
// equals the chain base are converted into every solvable unit; others pass
// through unchanged. With no chain, returns the values as-is.
function applyChain(unitVals: { unit: string; v: number }[], chain: RowChain): { u: string; v: number }[] {
    if (!chain || !chain.base) return unitVals.map(x => ({ u: x.unit, v: x.v }));
    const perBase = solveChain(chain);
    const solvable = solvableUnits(chain);
    const out: { u: string; v: number }[] = [];
    for (const { unit, v } of unitVals) {
        if (unit === chain.base) {
            for (const u of solvable) {
                const per = perBase[u];
                if (per != null && per > 0) out.push({ u, v: v / per });
            }
        } else {
            out.push({ u: unit, v });
        }
    }
    return out;
}

// Synthesize a UsageReportItem so the existing ChainEditor can edit any row's chain.
function chainItem(reportKey: string, label: string, baseUnit: string, chain: RowChain): UsageReportItem {
    return {
        label, reportKey, byDow: [], total: 0,
        ingredientId: null, portionSize: null, portionUnit: baseUnit, chain,
    };
}

function localToday(): string {
    return new Date().toLocaleDateString("en-CA");
}

type RangeMode = "quick" | "custom";

export default function UsageReportPage() {
    const { user } = useAuth();
    const canManage = EDIT_ROLES.includes(user?.role ?? "");

    const [days, setDays]       = useState(7);
    const [rangeMode, setRangeMode] = useState<RangeMode>("quick");
    const [dateFrom, setDateFrom] = useState(() => {
        const d = new Date(); d.setDate(d.getDate() - 6);
        return d.toLocaleDateString("en-CA");
    });
    const [dateTo, setDateTo] = useState(localToday);
    const [data, setData]       = useState<UsageReportResult | null>(null);
    const [loading, setLoading] = useState(true);
    const [tab, setTab]         = useState<Tab>("protein");
    const [editChain, setEditChain] = useState<UsageReportItem | null>(null);
    const [ingData, setIngData] = useState<IngredientUsageResult | null>(null);
    const [ingLoading, setIngLoading] = useState(false);
    const [protData, setProtData] = useState<ProteinReportResult | null>(null);
    const [protLoading, setProtLoading] = useState(false);

    const range = rangeMode === "custom" ? { from: dateFrom, to: dateTo } : undefined;

    const load = useCallback(async () => {
        setLoading(true);
        try { setData(await usageReportApi.get(days, range)); }
        catch { setData(null); }
        finally { setLoading(false); }
    }, [days, rangeMode, dateFrom, dateTo]);
    useEffect(() => { load(); }, [load]);

    const isIng = tab === "ingredients";
    const isProteinTab = tab === "protein";
    const isDessert = tab === "dessert";

    const loadProtein = useCallback(async () => {
        setProtLoading(true);
        try { setProtData(await usageReportApi.proteinUsage(days, range)); }
        catch { setProtData(null); }
        finally { setProtLoading(false); }
    }, [days, rangeMode, dateFrom, dateTo]);
    const loadIngredient = useCallback(async () => {
        setIngLoading(true);
        try { setIngData(await usageReportApi.ingredientUsage(days, range)); }
        catch { setIngData(null); }
        finally { setIngLoading(false); }
    }, [days, rangeMode, dateFrom, dateTo]);

    const pickQuick = (d: number) => { setRangeMode("quick"); setDays(d); };
    const applyRange = () => { setRangeMode("custom"); };

    // Main Protein tab: protein groups (ingredient roll-up folded into display groups).
    useEffect(() => { if (isProteinTab) loadProtein(); }, [isProteinTab, loadProtein]);
    // Ingredients tab: full ingredient roll-up.
    useEffect(() => { if (isIng) loadIngredient(); }, [isIng, loadIngredient]);

    // After a unit-chain edit, refresh whichever tab is showing.
    const reloadActive = useCallback(async () => {
        if (isProteinTab) await loadProtein();
        else if (isIng) await loadIngredient();
        else await load();
    }, [isProteinTab, isIng, loadProtein, loadIngredient, load]);

    const isDomCapture = isProteinTab || isIng || isDessert;
    const rows = (!isDomCapture && data) ? data[tab as "curry" | "beverage"] : [];

    // Whether the active tab has data ready to export.
    const canExport = isProteinTab ? !!protData : isIng ? !!ingData : !!data;

    // Export the CURRENT tab to PDF. Every tab now supports PDF — each builds the
    // generic { sections, iceCream } payload exportUsageReportPDF expects.
    function exportPDF() {
        const tabLabel = TABS.find(t => t.key === tab)?.label ?? "Usage";
        const linesToStr = (lines: { u: string; v: number }[]) => lines.map(l => `${fmtChainQty(l.v)} ${l.u}`).join("\n");

        // Protein groups + Ingredients share the same { units, chain } row shape.
        const unitRowToPdf = (label: string, units: { unit: string; byDow: number[]; total: number }[], chain: RowChain, totalDays: number) => ({
            label,
            dayCells: Array.from({ length: 7 }).map((_, i) =>
                linesToStr(applyChain(units.map(u => ({ unit: u.unit, v: u.byDow[i] })).filter(x => x.v > 0), chain))),
            dayOrders: Array.from({ length: 7 }).map((_, i) => units[0]?.byDow[i] ?? 0),
            total: linesToStr(applyChain(units.map(u => ({ unit: u.unit, v: u.total })), chain)),
            avg: linesToStr(applyChain(units.map(u => ({ unit: u.unit, v: u.total / totalDays })), chain)),
        });

        if (isProteinTab) {
            if (!protData) return;
            const totalDays = Math.max(1, protData.dowCounts.reduce((s, x) => s + x, 0));
            exportUsageReportPDF({
                days: protData.days, dowCounts: protData.dowCounts, iceCream: [], fileLabel: tabLabel,
                sections: [{ title: tabLabel, rows: protData.groups.map(g => unitRowToPdf(g.name, g.units, g.chain, totalDays)) }],
            });
            return;
        }
        if (isIng) {
            if (!ingData) return;
            const totalDays = Math.max(1, ingData.dowCounts.reduce((s, x) => s + x, 0));
            exportUsageReportPDF({
                days: ingData.days, dowCounts: ingData.dowCounts, iceCream: [], fileLabel: tabLabel,
                sections: [{ title: tabLabel, rows: ingData.ingredients.map(ing => unitRowToPdf(ing.name, ing.units, ing.chain, totalDays)) }],
            });
            return;
        }
        if (isDessert) {
            if (!data) return;
            const totalDays = Math.max(1, data.dowCounts.reduce((s, x) => s + x, 0));
            const sections = data.dessertSections.map(sec => ({
                title: sec.category,
                rows: sec.items.flatMap(item => {
                    const itemRow = {
                        label: item.itemName,
                        dayCells: item.byDow.map(q => item.chain ? (q > 0 ? linesToStr(applyChain([{ unit: "Order", v: q }], item.chain)) : "") : (q > 0 ? String(q) : "")),
                        dayOrders: item.byDow.map(q => q > 0 ? q : null),
                        total: item.chain ? linesToStr(applyChain([{ unit: "Order", v: item.total }], item.chain)) : String(item.total),
                        avg: item.chain ? linesToStr(applyChain([{ unit: "Order", v: item.total / totalDays }], item.chain)) : fmtChainQty(item.total / totalDays),
                    };
                    const flavourRows = item.flavours.map(f => ({
                        label: `   ↳ ${f.name}`,
                        dayCells: f.byDow.map(q => q > 0 ? String(q) : ""),
                        dayOrders: f.byDow.map(q => q > 0 ? q : null),
                        total: String(f.total),
                        avg: fmtChainQty(f.total / totalDays),
                    }));
                    return [itemRow, ...flavourRows];
                }),
            }));
            exportUsageReportPDF({ days: data.days, dowCounts: data.dowCounts, sections, iceCream: [], fileLabel: tabLabel });
            return;
        }

        // Curry / Beverage (order-based).
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
        exportUsageReportPDF({
            days: data.days, dowCounts: data.dowCounts,
            sections: [sectionFor(tabLabel, data[tab as "curry" | "beverage"])],
            iceCream: [], fileLabel: tabLabel,
        });
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

    const rangeLabel = rangeMode === "custom"
        ? `${dateFrom} — ${dateTo}`
        : `Last ${days}-day`;

    return (
        <div className="space-y-5 max-w-6xl mx-auto pb-12">
            <div className="flex flex-wrap justify-between items-start gap-3">
                <div>
                    <h2 className="text-3xl font-bold font-playfair tracking-tight text-primary flex items-center gap-2">
                        <Gauge className="w-7 h-7" /> Usage Report
                    </h2>
                    <p className="text-sm font-medium text-primary/80">{STORE_SHORT}</p>
                    <p className="text-muted-foreground">{rangeLabel} usage from PMIX — view any unit (orders, oz, pieces, boxes, cases).</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 p-0.5 bg-muted/50 rounded-lg">
                            {[7, 14, 30].map(d => (
                                <button key={d} onClick={() => pickQuick(d)}
                                    className={`px-3 py-1.5 rounded-md text-xs font-medium ${rangeMode === "quick" && days === d ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>{d}d</button>
                            ))}
                        </div>
                        <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={exportJpg} disabled={!canExport}>
                            <ImageIcon className="w-4 h-4" /> JPG
                        </Button>
                        <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={exportPDF} disabled={!canExport}>
                            <FileDown className="w-4 h-4" /> PDF
                        </Button>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs">
                        <CalendarDays className="w-3.5 h-3.5 text-muted-foreground" />
                        <Input type="date" value={dateFrom} max={dateTo || localToday()}
                            onChange={e => { if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) setDateFrom(e.target.value); }}
                            className="border rounded px-1.5 py-1 h-7 w-[130px] text-xs bg-background" />
                        <span className="text-muted-foreground">→</span>
                        <Input type="date" value={dateTo} min={dateFrom} max={localToday()}
                            onChange={e => { if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) setDateTo(e.target.value); }}
                            className="border rounded px-1.5 py-1 h-7 w-[130px] text-xs bg-background" />
                        <Button variant={rangeMode === "custom" ? "default" : "outline"} size="sm" className="h-7 px-3 text-xs" onClick={applyRange}>
                            Apply
                        </Button>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 overflow-x-auto pb-1">
                {TABS.map(t => {
                    const Icon = t.icon; const active = tab === t.key;
                    const n = t.key === "ingredients"
                        ? (ingData?.ingredients.length ?? 0)
                        : t.key === "protein"
                            ? (protData?.groups.length ?? 0)
                            : t.key === "dessert"
                                ? (data?.dessertSections.reduce((s, sec) => s + sec.items.length, 0) ?? 0)
                                : (data ? data[t.key as "curry" | "beverage"].length : 0);
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

            {isProteinTab ? (
                protLoading ? (
                    <div className="flex justify-center py-20"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>
                ) : !protData ? (
                    <Card><CardContent className="py-12 text-center text-muted-foreground text-sm">Failed to load. Upload PMIX reports and configure Portion Standards first.</CardContent></Card>
                ) : (
                    <div ref={captureRef} className="space-y-5 bg-background">
                        <ProteinGroupTable data={protData} canManage={canManage} onEditChain={setEditChain} />
                    </div>
                )
            ) : isIng ? (
                ingLoading ? (
                    <div className="flex justify-center py-20"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>
                ) : !ingData ? (
                    <Card><CardContent className="py-12 text-center text-muted-foreground text-sm">Failed to load. Upload PMIX reports and configure Portion Standards / Composites first.</CardContent></Card>
                ) : (
                    <div ref={captureRef} className="space-y-5 bg-background">
                        <IngredientUsageTable data={ingData} canManage={canManage} onEditChain={setEditChain} />
                    </div>
                )
            ) : loading ? (
                <div className="flex justify-center py-20"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>
            ) : !data ? (
                <Card><CardContent className="py-12 text-center text-muted-foreground text-sm">Failed to load. Upload PMIX reports first.</CardContent></Card>
            ) : isDessert ? (
                <div ref={captureRef} className="space-y-5 bg-background">
                    <DessertSectionsView sections={data.dessertSections} dowCounts={data.dowCounts}
                        canManage={canManage} onEditChain={setEditChain} />
                </div>
            ) : (
                <div ref={captureRef} className="space-y-5 bg-background">
                    <UsageTable rows={rows} dowCounts={data.dowCounts}
                        canManage={canManage} onEditChain={setEditChain} />
                </div>
            )}

            {editChain && (
                <ChainEditor item={editChain} onClose={() => setEditChain(null)} onSaved={() => { setEditChain(null); reloadActive(); }} />
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

// ─── Main Protein (display groups, each summing its member ingredients) ──────
function ProteinGroupTable({ data, canManage, onEditChain }: { data: ProteinReportResult; canManage: boolean; onEditChain: (i: UsageReportItem) => void }) {
    const [open, setOpen] = useState<Set<string>>(new Set());
    const totalDays = Math.max(1, data.dowCounts.reduce((s, x) => s + x, 0));
    const toggle = (id: string) => setOpen(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

    if (data.groups.length === 0) {
        return <Card><CardContent className="py-12 text-center text-muted-foreground text-sm">
            No protein usage yet. Set up protein groups in <a href="/settings/portion-standards" className="underline text-primary">Portion Standards → Protein Groups</a> (click <strong>Quick start</strong> to create the default 16), or tag ingredients with the <strong>Proteins</strong> category.
        </CardContent></Card>;
    }
    return (
        <Card>
            <CardContent className="px-2 sm:px-4 py-3">
                <div className="overflow-x-auto">
                    <table className="w-full text-xs" style={{ minWidth: 760 }}>
                        <thead>
                            <tr className="text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border">
                                <th className="text-left py-2 pl-1 sticky left-0 bg-card">Protein</th>
                                {DOW.map((d, i) => <th key={d} className="text-right py-2 px-2">{d}<span className="block text-[8px] opacity-60">×{data.dowCounts[i] || 0}</span></th>)}
                                <th className="text-right py-2 px-2">Avg/d</th>
                                <th className="text-right py-2 px-2">Total</th>
                                <th className="w-6" />
                            </tr>
                        </thead>
                        <tbody>
                            {data.groups.map(g => {
                                const hasData = g.units.some(u => u.total > 0);
                                const canExpand = g.members.length > 0;
                                const isOpen = open.has(g.id);
                                const dayLines = (i: number) => applyChain(g.units.map(u => ({ unit: u.unit, v: u.byDow[i] })).filter(x => x.v > 0), g.chain);
                                const totalLines = applyChain(g.units.map(u => ({ unit: u.unit, v: u.total })), g.chain);
                                const avgLines   = applyChain(g.units.map(u => ({ unit: u.unit, v: u.total / totalDays })), g.chain);
                                const baseUnit = g.units[0]?.unit ?? "oz";
                                return (
                                    <Fragment key={g.id}>
                                        <tr className={`border-t border-border/40 hover:bg-muted/20 align-top ${canExpand ? "cursor-pointer" : ""}`} onClick={() => canExpand && toggle(g.id)}>
                                            <td className="py-1.5 pl-1 sticky left-0 bg-card font-medium max-w-[200px]">
                                                <div className="flex items-start gap-1">
                                                    {canExpand
                                                        ? (isOpen ? <ChevronDown className="w-3 h-3 mt-0.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 mt-0.5 shrink-0 text-muted-foreground" />)
                                                        : <span className="w-3 shrink-0" />}
                                                    <span className="truncate">{g.name}</span>
                                                    {!g.grouped && <span className="text-[9px] px-1 rounded bg-muted text-muted-foreground shrink-0" title="Not assigned to a group">other</span>}
                                                </div>
                                                {g.grouped && g.members.length > 0 && (
                                                    <span className="block text-[10px] text-muted-foreground/70 pl-4 truncate">{g.members.map(m => m.name).join(", ")}</span>
                                                )}
                                            </td>
                                            {Array.from({ length: 7 }).map((_, i) => (
                                                <td key={i} className="py-1.5 px-2 text-right"><MultiCell lines={dayLines(i)} /></td>
                                            ))}
                                            <td className="py-1.5 px-2 text-right bg-muted/20"><MultiCell lines={avgLines} muted /></td>
                                            <td className="py-1.5 px-2 text-right"><MultiCell lines={totalLines} /></td>
                                            <td className="py-1.5 text-right pr-1">
                                                {canManage && (
                                                    <button onClick={e => { e.stopPropagation(); onEditChain(chainItem(g.reportKey, g.name, baseUnit, g.chain)); }}
                                                        title="Configure units for this item" className="text-muted-foreground hover:text-primary">
                                                        <Settings2 className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                        {isOpen && canExpand && (
                                            <tr className="bg-muted/10">
                                                <td colSpan={11} className="px-3 py-2 space-y-2">
                                                    {!hasData && <p className="text-[11px] text-amber-600">No usage in this window — check the ingredient links in Portion Standards.</p>}
                                                    {g.members.map(m => (
                                                        <div key={m.ingredientId} className="text-[11px]">
                                                            <span className="font-medium">{m.name}</span>
                                                            <span className="text-muted-foreground"> — {m.units.map(u => `${fmtChainQty(u.total)} ${u.unit}`).join(", ") || "0"}</span>
                                                            {m.sources.length > 0 && (
                                                                <div className="flex flex-wrap gap-1 mt-0.5 pl-2">
                                                                    {m.sources.map((s, i) => (
                                                                        <span key={i} className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-1.5 py-0.5 text-[10px]">
                                                                            <span>{s.label}</span>
                                                                            {s.via && <span className="text-cyan-600 dark:text-cyan-400">via {s.via}</span>}
                                                                            <span className="tabular-nums text-muted-foreground">{fmtChainQty(s.total)} {s.unit}</span>
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </td>
                                            </tr>
                                        )}
                                    </Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                <p className="text-[10px] text-muted-foreground mt-2">
                    Each protein is summed across <strong>every</strong> dish, modifier, add-on, and composite it appears in (same figures as the Ingredients tab). Rows tagged <span className="px-1 rounded bg-muted">other</span> are proteins not yet assigned to a group — set groups up in <a href="/settings/portion-standards" className="underline text-primary">Portion Standards → Protein Groups</a>.
                </p>
            </CardContent>
        </Card>
    );
}

// ─── Dessert sections (Desserts + Kids Meal with item detail + modifiers) ────
function DessertSectionsView({ sections, dowCounts, canManage, onEditChain }: { sections: DessertSection[]; dowCounts: number[]; canManage: boolean; onEditChain: (i: UsageReportItem) => void }) {
    const totalDays = Math.max(1, dowCounts.reduce((s, x) => s + x, 0));
    if (sections.length === 0) return <Card><CardContent className="py-12 text-center text-muted-foreground text-sm">No dessert or kids meal data in this window.</CardContent></Card>;
    return (
        <div className="space-y-5">
            {sections.map(sec => (
                <Card key={sec.category}>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                            {sec.category === "Kids Meal"
                                ? <><Salad className="w-4 h-4 text-green-500" /> {sec.category}</>
                                : <><IceCream className="w-4 h-4 text-pink-500" /> {sec.category}</>}
                            <span className="text-xs font-normal text-muted-foreground">({sec.items.length} items)</span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="px-2 sm:px-4 py-1">
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs" style={{ minWidth: 660 }}>
                                <thead>
                                    <tr className="text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border">
                                        <th className="text-left py-2 pl-2 sticky left-0 bg-card">Item</th>
                                        {DOW.map((d, i) => <th key={d} className="text-right py-2 px-2">{d}<span className="block text-[8px] opacity-60">×{dowCounts[i] || 0}</span></th>)}
                                        <th className="text-right py-2 px-2">Avg/d</th>
                                        <th className="text-right py-2 px-2">Total</th>
                                        <th className="w-6" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {sec.items.map(item => {
                                        const ch = item.chain;
                                        return (
                                        <Fragment key={item.itemName}>
                                            <tr className="border-t border-border/40 hover:bg-muted/20 align-top">
                                                <td className="py-1.5 pl-2 sticky left-0 bg-card font-medium max-w-[200px]">
                                                    <span className="truncate block">{item.itemName}</span>
                                                </td>
                                                {item.byDow.map((q, i) => (
                                                    <td key={i} className="py-1.5 px-2 text-right tabular-nums">
                                                        {ch ? <MultiCell lines={applyChain(q > 0 ? [{ unit: "Order", v: q }] : [], ch)} /> : (q > 0 ? q : <span className="text-muted-foreground/40">·</span>)}
                                                    </td>
                                                ))}
                                                <td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground bg-muted/20">
                                                    {ch ? <MultiCell muted lines={applyChain([{ unit: "Order", v: item.total / totalDays }], ch)} /> : fmtChainQty(item.total / totalDays)}
                                                </td>
                                                <td className="py-1.5 px-2 text-right tabular-nums font-semibold">
                                                    {ch ? <MultiCell lines={applyChain([{ unit: "Order", v: item.total }], ch)} /> : item.total}
                                                </td>
                                                <td className="py-1.5 text-right pr-1">
                                                    {canManage && (
                                                        <button onClick={() => onEditChain(chainItem(item.reportKey, item.itemName, "Order", item.chain))}
                                                            title="Configure units for this item" className="text-muted-foreground hover:text-primary">
                                                            <Settings2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                            {item.flavours.length > 0 && item.flavours.map(f => (
                                                <tr key={f.name} className="bg-muted/10 hover:bg-muted/20">
                                                    <td className="py-1 pl-6 sticky left-0 bg-muted/10 text-muted-foreground text-[11px]">
                                                        ↳ {f.name}
                                                    </td>
                                                    {f.byDow.map((q, i) => (
                                                        <td key={i} className="py-1 px-2 text-right tabular-nums text-[11px] text-muted-foreground">{q > 0 ? q : <span className="text-muted-foreground/40">·</span>}</td>
                                                    ))}
                                                    <td className="py-1 px-2 text-right tabular-nums text-[11px] text-muted-foreground bg-muted/20">{fmtChainQty(f.total / totalDays)}</td>
                                                    <td className="py-1 pr-2 text-right tabular-nums text-[11px] font-medium text-muted-foreground">{f.total}</td>
                                                    <td />
                                                </tr>
                                            ))}
                                        </Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}

// ─── Ingredient roll-up table (aggregated across all dishes, drill-down) ─────
function IngredientUsageTable({ data, canManage, onEditChain }: { data: IngredientUsageResult; canManage: boolean; onEditChain: (i: UsageReportItem) => void }) {
    const [open, setOpen] = useState<Set<string>>(new Set());
    const totalDays = Math.max(1, data.dowCounts.reduce((s, x) => s + x, 0));
    const toggle = (id: string) => setOpen(s => {
        const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n;
    });

    const rows = data.ingredients;

    if (rows.length === 0) {
        return <Card><CardContent className="py-12 text-center text-muted-foreground text-sm">
            No ingredient usage yet. Link menu items to ingredients in <a href="/settings/portion-standards" className="underline text-primary">Portion Standards</a> (and define Composites there).
        </CardContent></Card>;
    }

    return (
        <Card>
            <CardContent className="px-2 sm:px-4 py-3">
                <div className="overflow-x-auto">
                    <table className="w-full text-xs" style={{ minWidth: 760 }}>
                        <thead>
                            <tr className="text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border">
                                <th className="text-left py-2 pl-1 sticky left-0 bg-card">Ingredient</th>
                                {DOW.map((d, i) => <th key={d} className="text-right py-2 px-2">{d}<span className="block text-[8px] opacity-60">×{data.dowCounts[i] || 0}</span></th>)}
                                <th className="text-right py-2 px-2">Avg/d</th>
                                <th className="text-right py-2 px-2">Total</th>
                                <th className="w-6" />
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(ing => {
                                const isOpen = open.has(ing.ingredientId);
                                const dayLines = (i: number) => applyChain(ing.units.map(u => ({ unit: u.unit, v: u.byDow[i] })).filter(x => x.v > 0), ing.chain);
                                const totalLines = applyChain(ing.units.map(u => ({ unit: u.unit, v: u.total })), ing.chain);
                                const avgLines   = applyChain(ing.units.map(u => ({ unit: u.unit, v: u.total / totalDays })), ing.chain);
                                const baseUnit = ing.units[0]?.unit ?? "oz";
                                return (
                                    <Fragment key={ing.ingredientId}>
                                        <tr className="border-t border-border/40 hover:bg-muted/20 align-top cursor-pointer" onClick={() => toggle(ing.ingredientId)}>
                                            <td className="py-1.5 pl-1 sticky left-0 bg-card font-medium max-w-[180px]">
                                                <div className="flex items-start gap-1">
                                                    {isOpen ? <ChevronDown className="w-3 h-3 mt-0.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 mt-0.5 shrink-0 text-muted-foreground" />}
                                                    <span className="truncate">{ing.name}</span>
                                                </div>
                                            </td>
                                            {Array.from({ length: 7 }).map((_, i) => (
                                                <td key={i} className="py-1.5 px-2 text-right"><MultiCell lines={dayLines(i)} /></td>
                                            ))}
                                            <td className="py-1.5 px-2 text-right bg-muted/20"><MultiCell lines={avgLines} muted /></td>
                                            <td className="py-1.5 px-2 text-right"><MultiCell lines={totalLines} /></td>
                                            <td className="py-1.5 text-right pr-1">
                                                {canManage && (
                                                    <button onClick={e => { e.stopPropagation(); onEditChain(chainItem(ing.reportKey, ing.name, baseUnit, ing.chain)); }}
                                                        title="Configure units for this item" className="text-muted-foreground hover:text-primary">
                                                        <Settings2 className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                        {isOpen && (
                                            <tr className="bg-muted/10">
                                                <td colSpan={11} className="px-3 py-2">
                                                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Comes from</p>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {ing.sources.map((s, i) => (
                                                            <span key={i} className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-[11px]">
                                                                <span className="font-medium">{s.label}</span>
                                                                {s.via && <span className="text-cyan-600 dark:text-cyan-400">via {s.via}</span>}
                                                                <span className="tabular-nums text-muted-foreground">{fmtChainQty(s.total)} {s.unit}</span>
                                                            </span>
                                                        ))}
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                <p className="text-[10px] text-muted-foreground mt-2">
                    Each ingredient is summed across <strong>every</strong> dish &amp; modifier it appears in (main dishes, appetizers, add-ons, and composite sub-recipes). Click a row to see where it came from.
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
