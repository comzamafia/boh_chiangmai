"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useAuth } from "@/components/auth-provider";
import {
    Thermometer, Flame, Droplets, UtensilsCrossed, Soup, ChefHat, Coffee, Wine,
    Loader2, Plus, Pencil, Carrot, Play, Search, AlertTriangle, ChevronDown, ListChecks, X,
} from "lucide-react";
import {
    reportStationsApi, type ReportStation, type StationReport, type PmixMenuName,
} from "@/lib/api";
import { unitOptions, convertQty, fmtQty } from "@/lib/report-units";

const ICONS: Record<string, React.ElementType> = {
    utensils: UtensilsCrossed, droplets: Droplets, flame: Flame, thermometer: Thermometer,
    soup: Soup, chef: ChefHat, coffee: Coffee, wine: Wine, carrot: Carrot,
};
const ICON_KEYS = Object.keys(ICONS);
const COLORS = ["bg-orange-500","bg-blue-500","bg-red-500","bg-cyan-500","bg-emerald-500","bg-violet-500","bg-amber-500","bg-pink-500","bg-slate-500"];
const iconFor = (k: string) => ICONS[k] ?? UtensilsCrossed;
const EDIT_ROLES = ["admin", "manager", "chef"];
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function StationPrepPage() {
    const { user } = useAuth();
    const canManage = EDIT_ROLES.includes(user?.role ?? "");

    const [stations, setStations] = useState<ReportStation[]>([]);
    const [loading, setLoading]   = useState(true);
    const [activeId, setActiveId] = useState<string>("");

    const [days, setDays]   = useState(7);
    const [view, setView]   = useState<"weekday" | "dated">("weekday");
    const [report, setReport]       = useState<StationReport | null>(null);
    const [reportLoading, setReportLoading] = useState(false);
    const [units, setUnits] = useState<Record<string, string>>({});   // ingredientId → display unit
    const [expanded, setExpanded] = useState<Set<string>>(new Set());

    const [stationDlg, setStationDlg] = useState<{ mode: "add" | "edit"; station?: ReportStation } | null>(null);
    const [assignDlg, setAssignDlg]   = useState<ReportStation | null>(null);

    const loadStations = useCallback(async () => {
        setLoading(true);
        try {
            const list = await reportStationsApi.list();
            setStations(list);
            setActiveId(prev => list.some(s => s.id === prev) ? prev : (list[0]?.id ?? ""));
        } catch { setStations([]); }
        finally { setLoading(false); }
    }, []);
    useEffect(() => { loadStations(); }, [loadStations]);

    const station = stations.find(s => s.id === activeId);

    // Reset report when switching station
    useEffect(() => { setReport(null); setUnits({}); setExpanded(new Set()); }, [activeId]);

    async function runReport() {
        if (!station) return;
        setReportLoading(true);
        try {
            const r = await reportStationsApi.report(station.id, days);
            setReport(r);
            // default each ingredient to its recipe unit
            const u: Record<string, string> = {};
            r.ingredients.forEach(i => { u[i.ingredientId] = i.recipeUnit; });
            setUnits(u);
        } catch { setReport(null); }
        finally { setReportLoading(false); }
    }

    return (
        <div className="space-y-5 max-w-6xl mx-auto pb-12">
            {/* Header */}
            <div className="flex flex-wrap justify-between items-start gap-3">
                <div>
                    <h2 className="text-3xl font-bold font-playfair tracking-tight text-primary flex items-center gap-2">
                        <Carrot className="w-7 h-7" /> Station Prep Report
                    </h2>
                    <p className="text-muted-foreground">Assign menus to stations, then run a report to see how much of each ingredient to prep.</p>
                </div>
                {canManage && (
                    <Button size="sm" onClick={() => setStationDlg({ mode: "add" })}>
                        <Plus className="w-4 h-4 mr-1.5" /> Station
                    </Button>
                )}
            </div>

            {loading ? (
                <div className="flex justify-center py-20"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>
            ) : stations.length === 0 ? (
                <Card><CardContent className="py-16 text-center text-muted-foreground text-sm">
                    No stations yet.{canManage && " Tap “Station” to create one."}
                </CardContent></Card>
            ) : (
                <>
                    {/* Station chips */}
                    <div className="flex gap-1.5 overflow-x-auto pb-1">
                        {stations.map(s => {
                            const Icon = iconFor(s.icon);
                            const active = s.id === activeId;
                            return (
                                <button key={s.id} onClick={() => setActiveId(s.id)}
                                    className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all shrink-0 border
                                        ${active ? "bg-primary text-primary-foreground border-primary shadow-sm" : "bg-card border-border text-muted-foreground hover:text-foreground"}`}>
                                    <span className={`w-2.5 h-2.5 rounded-full ${s.color}`} />
                                    <Icon className="w-4 h-4" /> {s.name}
                                    <span className={`text-xs tabular-nums ${active ? "opacity-90" : "opacity-60"}`}>{s.menus.length}</span>
                                </button>
                            );
                        })}
                    </div>

                    {station && (
                        <>
                            {/* Station toolbar */}
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className="font-semibold truncate">{station.name}</span>
                                    <span className="text-xs text-muted-foreground shrink-0">{station.menus.length} menu(s)</span>
                                    {canManage && (
                                        <>
                                            <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit station"
                                                onClick={() => setStationDlg({ mode: "edit", station })}><Pencil className="w-4 h-4" /></Button>
                                            <Button variant="outline" size="sm" className="h-7" onClick={() => setAssignDlg(station)}>
                                                <ListChecks className="w-3.5 h-3.5 mr-1.5" /> Assign menus
                                            </Button>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Controls */}
                            <div className="flex flex-wrap items-center gap-2">
                                <div className="flex items-center gap-1 p-0.5 bg-muted/50 rounded-lg">
                                    {[7, 14, 30].map(d => (
                                        <button key={d} onClick={() => setDays(d)}
                                            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${days === d ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                                            {d}d
                                        </button>
                                    ))}
                                </div>
                                <div className="flex items-center gap-1 p-0.5 bg-muted/50 rounded-lg">
                                    <button onClick={() => setView("weekday")}
                                        className={`px-3 py-1.5 rounded-md text-xs font-medium ${view === "weekday" ? "bg-background shadow-sm" : "text-muted-foreground"}`}>Weekday avg</button>
                                    <button onClick={() => setView("dated")}
                                        className={`px-3 py-1.5 rounded-md text-xs font-medium ${view === "dated" ? "bg-background shadow-sm" : "text-muted-foreground"}`}>Dated</button>
                                </div>
                                <Button size="sm" onClick={runReport} disabled={reportLoading || station.menus.length === 0} className="ml-auto">
                                    {reportLoading ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Play className="w-4 h-4 mr-1.5" />}
                                    Run Report
                                </Button>
                            </div>

                            {/* Report */}
                            {station.menus.length === 0 ? (
                                <Card><CardContent className="py-12 text-center text-muted-foreground text-sm">
                                    No menus assigned.{canManage && " Tap “Assign menus” to add some."}
                                </CardContent></Card>
                            ) : !report ? (
                                <Card><CardContent className="py-12 text-center text-muted-foreground text-sm">
                                    Choose a window + view, then tap <strong>Run Report</strong>.
                                </CardContent></Card>
                            ) : (
                                <ReportTable report={report} view={view} units={units} setUnits={setUnits}
                                    expanded={expanded} setExpanded={setExpanded} />
                            )}
                        </>
                    )}
                </>
            )}

            {stationDlg && (
                <StationDialog mode={stationDlg.mode} station={stationDlg.station}
                    onClose={() => setStationDlg(null)}
                    onSaved={() => { setStationDlg(null); loadStations(); }} />
            )}
            {assignDlg && (
                <AssignDialog station={assignDlg}
                    onClose={() => setAssignDlg(null)}
                    onSaved={() => { setAssignDlg(null); loadStations(); setReport(null); }} />
            )}
        </div>
    );
}

// ─── Report table ───────────────────────────────────────────────────────────
function ReportTable({ report, view, units, setUnits, expanded, setExpanded }: {
    report: StationReport; view: "weekday" | "dated";
    units: Record<string, string>; setUnits: React.Dispatch<React.SetStateAction<Record<string, string>>>;
    expanded: Set<string>; setExpanded: React.Dispatch<React.SetStateAction<Set<string>>>;
}) {
    const cols = view === "weekday" ? DOW : report.dates.map(d => d.slice(5));
    const valuesFor = (ing: StationReport["ingredients"][number]) => view === "weekday" ? ing.dowAvg : ing.byDate;

    return (
        <div className="space-y-3">
            {report.unlinkedMenus.length > 0 && (
                <div className="flex items-start gap-2 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                        <strong>{report.unlinkedMenus.length}</strong> assigned menu(s) have no linked recipe and are excluded from the numbers:
                        <span className="block opacity-90">{report.unlinkedMenus.join(", ")}</span>
                        <span className="block mt-0.5">Link them to a BOH recipe (PMIX → BOM Linkage) to include their ingredients.</span>
                    </div>
                </div>
            )}

            <Card>
                <CardContent className="px-2 sm:px-4 py-3">
                    {report.ingredients.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-10">
                            No ingredient usage in the last {report.days} days for the linked menus.
                        </p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs border-separate border-spacing-0" style={{ minWidth: 480 }}>
                                <thead>
                                    <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                        <th className="text-left py-2 pl-1 pr-2 sticky left-0 bg-card z-10">Ingredient</th>
                                        <th className="text-left py-2 px-1">Unit</th>
                                        {cols.map((c, i) => <th key={i} className="text-right py-2 px-2 whitespace-nowrap">{c}</th>)}
                                        {view === "dated" && <th className="text-right py-2 px-2">Total</th>}
                                        <th className="text-right py-2 px-2 whitespace-nowrap">ROP</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {report.ingredients.map(ing => {
                                        const unit = units[ing.ingredientId] ?? ing.recipeUnit;
                                        const opts = unitOptions(ing);
                                        const conv = (q: number) => { const v = convertQty(q, unit, ing); return v === null ? q : v; };
                                        const vals = valuesFor(ing);
                                        const isOpen = expanded.has(ing.ingredientId);
                                        return (
                                            <Fragment key={ing.ingredientId}>
                                                <tr className="border-t border-border/40 hover:bg-muted/20">
                                                    <td className="py-1.5 pl-1 pr-2 sticky left-0 bg-card z-10">
                                                        <button onClick={() => setExpanded(s => { const n = new Set(s); if (n.has(ing.ingredientId)) n.delete(ing.ingredientId); else n.add(ing.ingredientId); return n; })}
                                                            className="flex items-center gap-1 text-left font-medium hover:text-primary">
                                                            <ChevronDown className={`w-3 h-3 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                                                            <span className="truncate max-w-[140px]">{ing.name}</span>
                                                        </button>
                                                    </td>
                                                    <td className="py-1.5 px-1">
                                                        <select value={unit} onChange={e => setUnits(u => ({ ...u, [ing.ingredientId]: e.target.value }))}
                                                            className="h-7 rounded-md border border-border bg-background px-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-primary/40">
                                                            {opts.map(o => <option key={o} value={o}>{o}</option>)}
                                                        </select>
                                                    </td>
                                                    {vals.map((q, i) => (
                                                        <td key={i} className="py-1.5 px-2 text-right tabular-nums">{q > 0 ? fmtQty(conv(q)) : <span className="text-muted-foreground/40">·</span>}</td>
                                                    ))}
                                                    {view === "dated" && <td className="py-1.5 px-2 text-right tabular-nums font-semibold">{fmtQty(conv(ing.total))}</td>}
                                                    <td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground">{ing.rop !== null ? fmtQty(conv(ing.rop)) : "—"}</td>
                                                </tr>
                                                {isOpen && (
                                                    <tr className="bg-muted/10">
                                                        <td colSpan={cols.length + (view === "dated" ? 4 : 3)} className="px-6 py-2 text-[11px] text-muted-foreground">
                                                            <span className="font-medium text-foreground">From menus: </span>{ing.menus.join(", ")}
                                                        </td>
                                                    </tr>
                                                )}
                                            </Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-3">
                        {view === "weekday"
                            ? `Average usage per weekday over the last ${report.days} days (${report.linkedMenuCount} linked menu(s)). ROP = reorder point.`
                            : `Actual usage per day over the last ${report.days} days. ROP = reorder point.`}
                        {" "}Pick a display unit per ingredient. Numbers are estimated from linked recipe BOM × qty sold.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}

// ─── Station add/edit dialog ────────────────────────────────────────────────
function StationDialog({ mode, station, onClose, onSaved }: {
    mode: "add" | "edit"; station?: ReportStation; onClose: () => void; onSaved: () => void;
}) {
    const [name, setName]   = useState(station?.name ?? "");
    const [icon, setIcon]   = useState(station?.icon ?? "carrot");
    const [color, setColor] = useState(station?.color ?? "bg-emerald-500");
    const [saving, setSaving] = useState(false);

    async function save() {
        if (!name.trim()) return;
        setSaving(true);
        try {
            if (mode === "add") await reportStationsApi.create({ name: name.trim(), icon, color });
            else if (station)   await reportStationsApi.update(station.id, { name: name.trim(), icon, color });
            onSaved();
        } finally { setSaving(false); }
    }
    async function del() {
        if (!station || !window.confirm("Delete this station and its menu assignments?")) return;
        await reportStationsApi.delete(station.id);
        onSaved();
    }

    return (
        <Dialog open onOpenChange={v => { if (!v) onClose(); }}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader><DialogTitle>{mode === "add" ? "Add Station" : "Edit Station"}</DialogTitle></DialogHeader>
                <div className="space-y-4 py-2">
                    <div className="space-y-1">
                        <Label className="text-xs">Station name</Label>
                        <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Wok" className="h-10" autoFocus />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs">Icon</Label>
                        <div className="flex flex-wrap gap-1.5">
                            {ICON_KEYS.map(k => { const I = ICONS[k]; return (
                                <button key={k} onClick={() => setIcon(k)}
                                    className={`p-2 rounded-lg border ${icon === k ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>
                                    <I className="w-4 h-4" />
                                </button>); })}
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs">Colour</Label>
                        <div className="flex flex-wrap gap-1.5">
                            {COLORS.map(c => (
                                <button key={c} onClick={() => setColor(c)}
                                    className={`w-7 h-7 rounded-full ${c} ${color === c ? "ring-2 ring-offset-2 ring-foreground" : ""}`} />
                            ))}
                        </div>
                    </div>
                </div>
                <DialogFooter className="flex-row justify-between gap-2">
                    {mode === "edit" ? <Button variant="ghost" size="sm" className="text-red-600" onClick={del} disabled={saving}>Delete</Button> : <span />}
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
                        <Button size="sm" onClick={save} disabled={saving || !name.trim()}>{saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />} Save</Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ─── Assign menus dialog ────────────────────────────────────────────────────
function AssignDialog({ station, onClose, onSaved }: { station: ReportStation; onClose: () => void; onSaved: () => void }) {
    const [all, setAll]       = useState<PmixMenuName[]>([]);
    const [loading, setLoading] = useState(true);
    const [sel, setSel]       = useState<Set<string>>(new Set(station.menus));
    const [q, setQ]           = useState("");
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        reportStationsApi.menuNames()
            .then(d => setAll(d.items))
            .catch(() => setAll([]))
            .finally(() => setLoading(false));
    }, []);

    const filtered = all.filter(m => !q || m.itemName.toLowerCase().includes(q.toLowerCase()) || m.category.toLowerCase().includes(q.toLowerCase()));

    async function save() {
        setSaving(true);
        try { await reportStationsApi.setMenus(station.id, [...sel]); onSaved(); }
        finally { setSaving(false); }
    }

    return (
        <Dialog open onOpenChange={v => { if (!v) onClose(); }}>
            <DialogContent className="sm:max-w-lg max-h-[90dvh] flex flex-col">
                <DialogHeader><DialogTitle>Assign menus → {station.name}</DialogTitle></DialogHeader>
                <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input className="pl-8 h-9" placeholder="Search menu items…" value={q} onChange={e => setQ(e.target.value)} />
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                    <span>{sel.size} selected</span>
                    {sel.size > 0 && <button onClick={() => setSel(new Set())} className="hover:text-foreground flex items-center gap-1"><X className="w-3 h-3" /> Clear</button>}
                </div>
                <div className="flex-1 overflow-y-auto mt-2 -mx-1 px-1 space-y-1 min-h-[200px]">
                    {loading ? (
                        <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
                    ) : filtered.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-10">No menu items found. Upload a PMIX report first.</p>
                    ) : filtered.map(m => {
                        const on = sel.has(m.itemName);
                        return (
                            <button key={m.itemName}
                                onClick={() => setSel(s => { const n = new Set(s); if (n.has(m.itemName)) n.delete(m.itemName); else n.add(m.itemName); return n; })}
                                className={`w-full flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm transition-colors ${on ? "border-primary bg-primary/5" : "border-border hover:bg-accent"}`}>
                                <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${on ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/40"}`}>
                                    {on && <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={3}><path d="M20 6 9 17l-5-5" /></svg>}
                                </span>
                                <span className="flex-1 min-w-0">
                                    <span className="font-medium truncate block">{m.itemName}</span>
                                    <span className="text-[10px] text-muted-foreground">{m.category} · {m.totalQty.toLocaleString()} sold</span>
                                </span>
                                {m.linked
                                    ? <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 shrink-0">linked</span>
                                    : <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 shrink-0">no recipe</span>}
                            </button>
                        );
                    })}
                </div>
                <DialogFooter>
                    <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
                    <Button size="sm" onClick={save} disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />} Save ({sel.size})</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
