"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
    Printer, CheckCircle2, Thermometer, Flame, Droplets, UtensilsCrossed,
    Soup, ChefHat, Coffee, Wine, Loader2, Plus, X, Copy, CalendarDays, Pencil,
} from "lucide-react";
import { prepTasksApi, prepStationsApi, type PrepTask, type PrepStation } from "@/lib/api";

// Icon key → component (stations store a key string)
const ICONS: Record<string, React.ElementType> = {
    utensils: UtensilsCrossed, droplets: Droplets, flame: Flame, thermometer: Thermometer,
    soup: Soup, chef: ChefHat, coffee: Coffee, wine: Wine,
};
const ICON_KEYS = Object.keys(ICONS);
const COLORS = [
    "bg-orange-500", "bg-blue-500", "bg-red-500", "bg-cyan-500",
    "bg-emerald-500", "bg-violet-500", "bg-amber-500", "bg-pink-500", "bg-slate-500",
];

function iconFor(key: string): React.ElementType { return ICONS[key] ?? UtensilsCrossed; }
function today() { return new Date().toISOString().slice(0, 10); }
function yesterdayOf(d: string) {
    const x = new Date(d + "T00:00:00"); x.setDate(x.getDate() - 1);
    return x.toISOString().slice(0, 10);
}

export default function PrepListPage() {
    const [date,     setDate]     = useState(today());
    const [stations, setStations] = useState<PrepStation[]>([]);
    const [tasks,    setTasks]    = useState<PrepTask[]>([]);
    const [loading,  setLoading]  = useState(true);
    const [busy,     setBusy]     = useState(false);
    const [draft,    setDraft]    = useState<Record<string, { name: string; qty: string; time: string }>>({});

    // Station add/edit dialog
    const [stationDlg, setStationDlg] = useState<{ mode: "add" | "edit"; station?: PrepStation } | null>(null);

    const loadStations = useCallback(async () => {
        try { setStations(await prepStationsApi.list()); } catch { setStations([]); }
    }, []);
    const loadTasks = useCallback(async () => {
        try { setTasks(await prepTasksApi.list(date)); } catch { setTasks([]); }
    }, [date]);

    useEffect(() => { (async () => { setLoading(true); await Promise.all([loadStations(), loadTasks()]); setLoading(false); })(); }, [loadStations, loadTasks]);
    useEffect(() => { loadTasks(); }, [loadTasks]);

    const totalItems     = tasks.length;
    const completedItems = tasks.filter(t => t.done).length;
    const progressPercent = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

    // ── Task actions ──────────────────────────────────────────────────────────
    async function toggle(task: PrepTask) {
        const next = !task.done;
        setTasks(prev => prev.map(t => t.id === task.id ? { ...t, done: next, doneAt: next ? new Date().toISOString() : null } : t));
        try { await prepTasksApi.update(task.id, { done: next }); await loadTasks(); } catch { loadTasks(); }
    }
    async function addTask(stationName: string) {
        const d = draft[stationName];
        if (!d?.name.trim()) return;
        setBusy(true);
        try {
            await prepTasksApi.create({ date, station: stationName, name: d.name, qty: d.qty || undefined, dueTime: d.time || undefined });
            setDraft(p => ({ ...p, [stationName]: { name: "", qty: "", time: "" } }));
            await loadTasks();
        } catch { /* ignore */ } finally { setBusy(false); }
    }
    async function removeTask(id: string) {
        setTasks(prev => prev.filter(t => t.id !== id));
        try { await prepTasksApi.delete(id); } catch { loadTasks(); }
    }
    async function copyFromYesterday(overwrite = false) {
        setBusy(true);
        try {
            const res = await prepTasksApi.copy(yesterdayOf(date), date, overwrite);
            if (res.status === 409 && res.duplicate) {
                if (window.confirm(`This day already has ${res.existingCount} task(s). Replace them with yesterday's list?`)) await copyFromYesterday(true);
            } else if (res.error) {
                alert(res.error === "No tasks to copy from that date" ? "Yesterday has no prep tasks to copy." : res.error);
            } else { await loadTasks(); }
        } finally { setBusy(false); }
    }

    // ── Station actions ───────────────────────────────────────────────────────
    async function deleteStation(st: PrepStation) {
        const res = await prepStationsApi.delete(st.id);
        if (res.status === 409) { alert(res.message ?? "Station still has tasks."); return; }
        await loadStations();
    }

    const setDraftField = (key: string, field: "name" | "qty" | "time", v: string) =>
        setDraft(p => { const cur = p[key] ?? { name: "", qty: "", time: "" }; return { ...p, [key]: { ...cur, [field]: v } }; });

    return (
        <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in duration-500 pb-12">

            {/* Header */}
            <div className="flex flex-wrap justify-between items-start gap-3">
                <div>
                    <h2 className="text-3xl font-bold font-playfair tracking-tight text-primary">Master Prep List</h2>
                    <p className="text-muted-foreground">Daily prep tasks by station — ticks are saved for everyone.</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5">
                        <CalendarDays className="w-4 h-4 text-muted-foreground" />
                        <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-9 w-40" />
                    </div>
                    <Button variant="outline" size="sm" onClick={() => copyFromYesterday(false)} disabled={busy}>
                        <Copy className="w-4 h-4 mr-1.5" /> Copy yesterday
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setStationDlg({ mode: "add" })}>
                        <Plus className="w-4 h-4 mr-1.5" /> Add station
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => window.print()}>
                        <Printer className="w-4 h-4 mr-1.5" /> Print
                    </Button>
                </div>
            </div>

            {/* Overall progress */}
            <Card>
                <CardContent className="pt-6">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div className="flex-1">
                            <div className="flex justify-between text-sm mb-1.5">
                                <span className="font-medium">Overall progress</span>
                                <span className="font-bold tabular-nums">{progressPercent}%</span>
                            </div>
                            <div className="w-full h-2.5 bg-secondary rounded-full overflow-hidden">
                                <div className="h-full bg-primary transition-all" style={{ width: `${progressPercent}%` }} />
                            </div>
                            <p className="text-xs text-muted-foreground mt-2">{completedItems} of {totalItems} tasks completed</p>
                        </div>
                        {totalItems > 0 && progressPercent === 100 && (
                            <div className="flex items-center gap-2 text-green-600 dark:text-green-400 font-semibold text-sm">
                                <CheckCircle2 className="h-5 w-5" /> All prep done!
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            {loading ? (
                <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {stations.map(station => {
                        const Icon  = iconFor(station.icon);
                        const items = tasks.filter(t => t.station === station.name);
                        const done  = items.filter(i => i.done).length;
                        const prog  = items.length > 0 ? (done / items.length) * 100 : 0;
                        const d     = draft[station.name] ?? { name: "", qty: "", time: "" };

                        return (
                            <Card key={station.id} className="h-full border-border/60">
                                <CardHeader className="flex flex-row items-center justify-between pb-2 bg-accent/30 border-b group">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <div className={`p-1.5 rounded-md ${station.color} text-white`}><Icon className="h-4 w-4" /></div>
                                        <CardTitle className="text-lg truncate">{station.name}</CardTitle>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <span className="text-xs text-muted-foreground tabular-nums mr-1">{done}/{items.length} · {Math.round(prog)}%</span>
                                        <button onClick={() => setStationDlg({ mode: "edit", station })}
                                            className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground/60 hover:text-foreground transition-opacity" title="Edit station">
                                            <Pencil className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </CardHeader>
                                <CardContent className="pt-4">
                                    {items.length > 0 && (
                                        <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden mb-4">
                                            <div className={`h-full ${station.color} transition-all`} style={{ width: `${prog}%` }} />
                                        </div>
                                    )}
                                    <ul className="space-y-1">
                                        {items.map(item => (
                                            <li key={item.id} className="group flex items-start gap-3 p-2 rounded-md hover:bg-accent/50 -mx-2 transition-colors">
                                                <button onClick={() => toggle(item)}
                                                    className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors touch-manipulation ${item.done ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground text-transparent hover:border-primary"}`}>
                                                    <CheckCircle2 className="w-3 h-3" />
                                                </button>
                                                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => toggle(item)}>
                                                    <p className={`text-sm font-medium ${item.done ? "line-through text-muted-foreground" : ""}`}>{item.name}</p>
                                                    <div className="flex flex-wrap gap-x-3 mt-0.5 text-xs text-muted-foreground">
                                                        {item.qty && <span>Qty: <strong className="text-foreground">{item.qty}</strong></span>}
                                                        {item.dueTime && <span>Target: {item.dueTime}</span>}
                                                        {item.done && item.doneBy && <span className="text-green-600 dark:text-green-400">✓ {item.doneBy}</span>}
                                                    </div>
                                                </div>
                                                <button onClick={() => removeTask(item.id)}
                                                    className="opacity-0 group-hover:opacity-100 text-muted-foreground/50 hover:text-destructive transition-opacity shrink-0" title="Delete task">
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </li>
                                        ))}
                                        {items.length === 0 && <li className="text-xs text-muted-foreground italic py-2 text-center opacity-70">No tasks yet</li>}
                                    </ul>
                                    <div className="mt-3 pt-3 border-t border-border/60 flex flex-wrap items-end gap-1.5">
                                        <Input placeholder="New task…" value={d.name}
                                            onChange={e => setDraftField(station.name, "name", e.target.value)}
                                            onKeyDown={e => { if (e.key === "Enter") addTask(station.name); }}
                                            className="h-8 text-sm flex-1 min-w-[120px]" />
                                        <Input placeholder="Qty" value={d.qty}
                                            onChange={e => setDraftField(station.name, "qty", e.target.value)}
                                            onKeyDown={e => { if (e.key === "Enter") addTask(station.name); }}
                                            className="h-8 text-sm w-16" />
                                        <Input placeholder="Time" value={d.time}
                                            onChange={e => setDraftField(station.name, "time", e.target.value)}
                                            onKeyDown={e => { if (e.key === "Enter") addTask(station.name); }}
                                            className="h-8 text-sm w-20" />
                                        <Button size="sm" variant="outline" className="h-8 px-2" disabled={busy || !d.name.trim()} onClick={() => addTask(station.name)}>
                                            <Plus className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}

            {/* Station add/edit dialog */}
            {stationDlg && (
                <StationDialog
                    mode={stationDlg.mode}
                    station={stationDlg.station}
                    onClose={() => setStationDlg(null)}
                    onSaved={async () => { setStationDlg(null); await loadStations(); await loadTasks(); }}
                    onDelete={stationDlg.station ? async () => {
                        await deleteStation(stationDlg.station!);
                        setStationDlg(null);
                    } : undefined}
                />
            )}
        </div>
    );
}

// ─── Station add / edit dialog ──────────────────────────────────────────────
function StationDialog({
    mode, station, onClose, onSaved, onDelete,
}: {
    mode: "add" | "edit";
    station?: PrepStation;
    onClose: () => void;
    onSaved: () => void;
    onDelete?: () => void | Promise<void>;
}) {
    const [name,  setName]  = useState(station?.name ?? "");
    const [icon,  setIcon]  = useState(station?.icon ?? "utensils");
    const [color, setColor] = useState(station?.color ?? "bg-slate-500");
    const [saving, setSaving] = useState(false);

    async function save() {
        if (!name.trim()) return;
        setSaving(true);
        try {
            if (mode === "add") await prepStationsApi.create({ name: name.trim(), icon, color });
            else if (station)   await prepStationsApi.update(station.id, { name: name.trim(), icon, color });
            onSaved();
        } catch (e) { console.error(e); } finally { setSaving(false); }
    }

    return (
        <Dialog open onOpenChange={v => { if (!v) onClose(); }}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{mode === "add" ? "Add Station" : "Edit Station"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                    <div className="space-y-1">
                        <Label className="text-xs">Station name</Label>
                        <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Garnish Station" className="h-10" autoFocus />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs">Icon</Label>
                        <div className="flex flex-wrap gap-1.5">
                            {ICON_KEYS.map(k => {
                                const I = ICONS[k];
                                return (
                                    <button key={k} onClick={() => setIcon(k)}
                                        className={`p-2 rounded-lg border transition-colors ${icon === k ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
                                        <I className="w-4 h-4" />
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs">Colour</Label>
                        <div className="flex flex-wrap gap-1.5">
                            {COLORS.map(c => (
                                <button key={c} onClick={() => setColor(c)}
                                    className={`w-7 h-7 rounded-full ${c} transition-transform ${color === c ? "ring-2 ring-offset-2 ring-foreground scale-110" : "hover:scale-105"}`} />
                            ))}
                        </div>
                    </div>
                    {/* Preview */}
                    <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 bg-muted/30">
                        <div className={`p-1.5 rounded-md ${color} text-white`}>
                            {(() => { const I = iconFor(icon); return <I className="h-4 w-4" />; })()}
                        </div>
                        <span className="font-medium">{name.trim() || "Station name"}</span>
                    </div>
                </div>
                <DialogFooter className="flex-row justify-between gap-2">
                    {mode === "edit" && onDelete ? (
                        <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700" disabled={saving}
                            onClick={() => { if (window.confirm("Delete this station?")) onDelete(); }}>
                            Delete
                        </Button>
                    ) : <span />}
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
                        <Button size="sm" onClick={save} disabled={saving || !name.trim()}>
                            {saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />} Save
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
