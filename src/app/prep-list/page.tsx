"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
    Printer, CheckCircle2, Thermometer, Flame, Droplets, UtensilsCrossed,
    Loader2, Plus, X, Copy, CalendarDays,
} from "lucide-react";
import { prepTasksApi, type PrepTask } from "@/lib/api";

// Fixed station definitions (icon + colour). Tasks are grouped by station key.
const STATIONS = [
    { key: "Prep",  name: "Prep Station",  icon: UtensilsCrossed, color: "bg-orange-500" },
    { key: "Sauce", name: "Sauce Station", icon: Droplets,        color: "bg-blue-500" },
    { key: "Hot",   name: "Hot Station",   icon: Flame,           color: "bg-red-500" },
    { key: "Cold",  name: "Cold Station",  icon: Thermometer,     color: "bg-cyan-500" },
] as const;

function today() { return new Date().toISOString().slice(0, 10); }
function yesterdayOf(d: string) {
    const x = new Date(d + "T00:00:00"); x.setDate(x.getDate() - 1);
    return x.toISOString().slice(0, 10);
}

export default function PrepListPage() {
    const [date,    setDate]    = useState(today());
    const [tasks,   setTasks]   = useState<PrepTask[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy,    setBusy]    = useState(false);
    // New-task draft per station
    const [draft, setDraft] = useState<Record<string, { name: string; qty: string; time: string }>>({});

    const load = useCallback(async () => {
        setLoading(true);
        try { setTasks(await prepTasksApi.list(date)); }
        catch { setTasks([]); }
        finally { setLoading(false); }
    }, [date]);
    useEffect(() => { load(); }, [load]);

    const totalItems     = tasks.length;
    const completedItems = tasks.filter(t => t.done).length;
    const progressPercent = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

    // ── Actions (optimistic) ──────────────────────────────────────────────────
    async function toggle(task: PrepTask) {
        const next = !task.done;
        setTasks(prev => prev.map(t => t.id === task.id ? { ...t, done: next, doneAt: next ? new Date().toISOString() : null } : t));
        try { await prepTasksApi.update(task.id, { done: next }); await load(); }
        catch { load(); }
    }

    async function addTask(stationKey: string) {
        const d = draft[stationKey];
        if (!d?.name.trim()) return;
        setBusy(true);
        try {
            await prepTasksApi.create({ date, station: stationKey, name: d.name, qty: d.qty || undefined, dueTime: d.time || undefined });
            setDraft(p => ({ ...p, [stationKey]: { name: "", qty: "", time: "" } }));
            await load();
        } catch { /* ignore */ } finally { setBusy(false); }
    }

    async function removeTask(id: string) {
        setTasks(prev => prev.filter(t => t.id !== id));
        try { await prepTasksApi.delete(id); } catch { load(); }
    }

    async function copyFromYesterday(overwrite = false) {
        setBusy(true);
        try {
            const res = await prepTasksApi.copy(yesterdayOf(date), date, overwrite);
            if (res.status === 409 && res.duplicate) {
                if (window.confirm(`This day already has ${res.existingCount} task(s). Replace them with yesterday's list?`)) {
                    await copyFromYesterday(true);
                }
            } else if (res.error) {
                alert(res.error === "No tasks to copy from that date" ? "Yesterday has no prep tasks to copy." : res.error);
            } else {
                await load();
            }
        } finally { setBusy(false); }
    }

    const setDraftField = (key: string, field: "name" | "qty" | "time", v: string) =>
        setDraft(p => {
            const cur = p[key] ?? { name: "", qty: "", time: "" };
            return { ...p, [key]: { ...cur, [field]: v } };
        });

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
                            <p className="text-xs text-muted-foreground mt-2">
                                {completedItems} of {totalItems} tasks completed
                            </p>
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
                    {STATIONS.map(station => {
                        const items = tasks.filter(t => t.station === station.key);
                        const done  = items.filter(i => i.done).length;
                        const prog  = items.length > 0 ? (done / items.length) * 100 : 0;
                        const d     = draft[station.key] ?? { name: "", qty: "", time: "" };

                        return (
                            <Card key={station.key} className="h-full border-border/60">
                                <CardHeader className="flex flex-row items-center justify-between pb-2 bg-accent/30 border-b">
                                    <div className="flex items-center gap-2">
                                        <div className={`p-1.5 rounded-md ${station.color} text-white`}>
                                            <station.icon className="h-4 w-4" />
                                        </div>
                                        <CardTitle className="text-lg">{station.name}</CardTitle>
                                    </div>
                                    <span className="text-xs text-muted-foreground tabular-nums">
                                        {done}/{items.length} · {Math.round(prog)}%
                                    </span>
                                </CardHeader>
                                <CardContent className="pt-4">
                                    {items.length > 0 && (
                                        <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden mb-4">
                                            <div className={`h-full ${station.color} transition-all`} style={{ width: `${prog}%` }} />
                                        </div>
                                    )}

                                    <ul className="space-y-1">
                                        {items.map(item => (
                                            <li key={item.id}
                                                className="group flex items-start gap-3 p-2 rounded-md hover:bg-accent/50 -mx-2 transition-colors">
                                                <button onClick={() => toggle(item)}
                                                    className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors touch-manipulation ${item.done ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground text-transparent hover:border-primary"}`}>
                                                    <CheckCircle2 className="w-3 h-3" />
                                                </button>
                                                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => toggle(item)}>
                                                    <p className={`text-sm font-medium ${item.done ? "line-through text-muted-foreground" : ""}`}>
                                                        {item.name}
                                                    </p>
                                                    <div className="flex flex-wrap gap-x-3 mt-0.5 text-xs text-muted-foreground">
                                                        {item.qty && <span>Qty: <strong className="text-foreground">{item.qty}</strong></span>}
                                                        {item.dueTime && <span>Target: {item.dueTime}</span>}
                                                        {item.done && item.doneBy && <span className="text-green-600 dark:text-green-400">✓ {item.doneBy}</span>}
                                                    </div>
                                                </div>
                                                <button onClick={() => removeTask(item.id)}
                                                    className="opacity-0 group-hover:opacity-100 text-muted-foreground/50 hover:text-destructive transition-opacity shrink-0"
                                                    title="Delete task">
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </li>
                                        ))}
                                        {items.length === 0 && (
                                            <li className="text-xs text-muted-foreground italic py-2 text-center opacity-70">No tasks yet</li>
                                        )}
                                    </ul>

                                    {/* Add task row */}
                                    <div className="mt-3 pt-3 border-t border-border/60 flex flex-wrap items-end gap-1.5">
                                        <Input placeholder="New task…" value={d.name}
                                            onChange={e => setDraftField(station.key, "name", e.target.value)}
                                            onKeyDown={e => { if (e.key === "Enter") addTask(station.key); }}
                                            className="h-8 text-sm flex-1 min-w-[120px]" />
                                        <Input placeholder="Qty" value={d.qty}
                                            onChange={e => setDraftField(station.key, "qty", e.target.value)}
                                            onKeyDown={e => { if (e.key === "Enter") addTask(station.key); }}
                                            className="h-8 text-sm w-16" />
                                        <Input placeholder="Time" value={d.time}
                                            onChange={e => setDraftField(station.key, "time", e.target.value)}
                                            onKeyDown={e => { if (e.key === "Enter") addTask(station.key); }}
                                            className="h-8 text-sm w-20" />
                                        <Button size="sm" variant="outline" className="h-8 px-2" disabled={busy || !d.name.trim()}
                                            onClick={() => addTask(station.key)}>
                                            <Plus className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
