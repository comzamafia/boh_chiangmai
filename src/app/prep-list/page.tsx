"use client";

import { useState, useEffect, useCallback } from "react";
import {
    DndContext, PointerSensor, TouchSensor, useSensor, useSensors,
    useDraggable, useDroppable, DragOverlay, type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
    Thermometer, Flame, Droplets, UtensilsCrossed, Soup, ChefHat, Coffee, Wine,
    Loader2, Plus, X, CalendarDays, RotateCcw, BarChart3, Pencil, GripVertical, CheckCircle2, ListChecks, FileDown,
    ArrowRight, Undo2, Check,
} from "lucide-react";
import {
    prepApi, prepStationsApi, usersApi,
    type PrepBoardResult, type PrepCard, type PrepStation, type User,
} from "@/lib/api";
import { exportPrepAnalyticsToPDF } from "@/lib/prep-analytics-pdf";

const ICONS: Record<string, React.ElementType> = {
    utensils: UtensilsCrossed, droplets: Droplets, flame: Flame, thermometer: Thermometer,
    soup: Soup, chef: ChefHat, coffee: Coffee, wine: Wine,
};
const ICON_KEYS = Object.keys(ICONS);
const COLORS = ["bg-orange-500","bg-blue-500","bg-red-500","bg-cyan-500","bg-emerald-500","bg-violet-500","bg-amber-500","bg-pink-500","bg-slate-500"];
const iconFor = (k: string) => ICONS[k] ?? UtensilsCrossed;
const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };

type Col = "tasklist" | "todo" | "complete";

export default function PrepBoardPage() {
    const [date,    setDate]    = useState(today());
    const [board,   setBoard]   = useState<PrepBoardResult | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeStation, setActiveStation] = useState<string>("");
    const [dragCard, setDragCard] = useState<PrepCard | null>(null);

    const [stationDlg,  setStationDlg]  = useState<{ mode: "add" | "edit"; station?: PrepStation } | null>(null);
    const [analyticsOpen, setAnalyticsOpen] = useState(false);
    const [newTask, setNewTask] = useState({ name: "", qty: "", time: "" });
    const [importOpen, setImportOpen] = useState(false);
    const [importText, setImportText] = useState("");
    const [importing, setImporting] = useState(false);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(TouchSensor,   { activationConstraint: { delay: 150, tolerance: 6 } }),
    );

    const load = useCallback(async () => {
        try {
            const b = await prepApi.board(date);
            setBoard(b);
            setActiveStation(prev => b.stations.some(s => s.id === prev) ? prev : (b.stations[0]?.id ?? ""));
        } catch { setBoard(null); }
        finally { setLoading(false); }
    }, [date]);
    useEffect(() => { load(); }, [load]);

    const station = board?.stations.find(s => s.id === activeStation);

    // ── Permission-aware move (used by both drag-drop AND tap buttons) ─────────
    const canMove = useCallback((from: Col, to: Col, canManage: boolean) =>
        from !== to && (
            (from === "tasklist" && to === "todo"     && canManage) ||
            (from === "todo"     && to === "complete") ||
            (from === "complete" && to === "todo") ||
            (from === "todo"     && to === "tasklist" && canManage) ||
            (from === "complete" && to === "tasklist" && canManage)
        ), []);

    const moveCard = useCallback(async (card: PrepCard, from: Col, to: Col) => {
        if (!station || !canMove(from, to, station.canManage)) return;
        applyOptimistic(station.id, card, from, to);
        try {
            await prepApi.move({
                date, to,
                templateId:  to === "todo" && from === "tasklist" ? card.templateId : undefined,
                boardTaskId: card.id,
            });
        } finally { load(); }
    }, [station, canMove, date, load]);

    // ── Drag end → move ────────────────────────────────────────────────────────
    async function onDragEnd(e: DragEndEvent) {
        setDragCard(null);
        if (!e.over) return;
        const data = e.active.data.current as { card: PrepCard; from: Col } | undefined;
        const to = (e.over.data.current as { col: Col } | undefined)?.col;
        if (!data || !to) return;
        await moveCard(data.card, data.from, to);
    }

    function applyOptimistic(stationId: string, card: PrepCard, from: Col, to: Col) {
        setBoard(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                stations: prev.stations.map(s => {
                    if (s.id !== stationId) return s;
                    const drop = (arr: PrepCard[]) => arr.filter(c => (c.id ?? c.templateId) !== (card.id ?? card.templateId));
                    const next = { ...s, taskList: drop(s.taskList), todo: drop(s.todo), complete: drop(s.complete) };
                    if (to === "tasklist") next.taskList = [...next.taskList, card];
                    if (to === "todo")     next.todo     = [...next.todo, card];
                    if (to === "complete") next.complete = [...next.complete, card];
                    const denom = next.todo.length + next.complete.length;
                    next.progress = denom > 0 ? Math.round((next.complete.length / denom) * 100) : 0;
                    return next;
                }),
            };
        });
    }

    async function addTaskTemplate() {
        if (!station || !newTask.name.trim()) return;
        await prepApi.addTemplate({ stationId: station.id, name: newTask.name, qty: newTask.qty || undefined, dueTime: newTask.time || undefined });
        setNewTask({ name: "", qty: "", time: "" });
        load();
    }
    async function deleteTemplate(id: string) {
        if (!window.confirm("Remove this task from the master list?")) return;
        await prepApi.deleteTemplate(id); load();
    }
    async function resetBoard() {
        if (!window.confirm("Reset the board? All To-Do and Complete tasks return to the Task List.")) return;
        await prepApi.reset(date); load();
    }
    async function runImport() {
        if (!station) return;
        const names = importText.split("\n").map(s => s.trim()).filter(Boolean);
        if (names.length === 0) return;
        setImporting(true);
        try {
            const res = await prepApi.bulkAddTemplates(station.id, names);
            alert(`Imported ${res.added} task(s)${res.skipped ? `, skipped ${res.skipped} duplicate(s)` : ""}.`);
            setImportText(""); setImportOpen(false);
            await load();
        } finally { setImporting(false); }
    }

    return (
        <div className="space-y-5 max-w-6xl mx-auto pb-12">
            {/* Header */}
            <div className="flex flex-wrap justify-between items-start gap-3">
                <div>
                    <h2 className="text-3xl font-bold font-playfair tracking-tight text-primary flex items-center gap-2">
                        <ListChecks className="w-7 h-7" /> Prep Stations Board
                    </h2>
                    <p className="text-muted-foreground">Plan the shift, drag tasks across columns, track completion per station.</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
                    <div className="flex items-center gap-1.5 flex-1 sm:flex-none min-w-0">
                        <CalendarDays className="w-4 h-4 text-muted-foreground shrink-0" />
                        <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-9 flex-1 sm:w-40" />
                    </div>
                    {board?.canPlan && (
                        <>
                            <Button variant="outline" size="sm" onClick={() => setAnalyticsOpen(true)}><BarChart3 className="w-4 h-4 mr-1.5" /> Analytics</Button>
                            <Button variant="outline" size="sm" onClick={resetBoard}><RotateCcw className="w-4 h-4 mr-1.5" /> Reset</Button>
                            <Button variant="outline" size="sm" onClick={() => setStationDlg({ mode: "add" })}><Plus className="w-4 h-4 mr-1.5" /> Station</Button>
                        </>
                    )}
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center py-20"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>
            ) : !board || board.stations.length === 0 ? (
                <Card><CardContent className="py-16 text-center text-muted-foreground text-sm">
                    No stations assigned to you.{board?.canPlan && " Tap “Station” to create one."}
                </CardContent></Card>
            ) : (
                <>
                    {/* Station tabs */}
                    <div className="flex gap-1.5 overflow-x-auto pb-1">
                        {board.stations.map(s => {
                            const Icon = iconFor(s.icon);
                            const active = s.id === activeStation;
                            return (
                                <button key={s.id} onClick={() => setActiveStation(s.id)}
                                    className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all shrink-0 border
                                        ${active ? "bg-primary text-primary-foreground border-primary shadow-sm" : "bg-card border-border text-muted-foreground hover:text-foreground"}`}>
                                    <span className={`w-2.5 h-2.5 rounded-full ${s.color}`} />
                                    <Icon className="w-4 h-4" /> {s.name}
                                    <span className={`text-xs tabular-nums ${active ? "opacity-90" : "opacity-60"}`}>{s.progress}%</span>
                                </button>
                            );
                        })}
                    </div>

                    {station && (
                        <>
                            {/* Station header + progress */}
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex-1">
                                    <div className="flex justify-between text-sm mb-1">
                                        <span className="font-medium">{station.name} — progress</span>
                                        <span className="font-bold tabular-nums">{station.progress}%</span>
                                    </div>
                                    <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
                                        <div className={`h-full ${station.color} transition-all`} style={{ width: `${station.progress}%` }} />
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        {station.complete.length} of {station.todo.length + station.complete.length} planned tasks complete
                                    </p>
                                </div>
                                {station.canManage && (
                                    <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit station"
                                        onClick={() => setStationDlg({ mode: "edit", station: { id: station.id, name: station.name, icon: station.icon, color: station.color, sortOrder: 0, memberIds: station.memberIds } })}>
                                        <Pencil className="w-4 h-4" />
                                    </Button>
                                )}
                            </div>

                            {/* Board */}
                            <DndContext sensors={sensors}
                                onDragStart={(e: DragStartEvent) => setDragCard((e.active.data.current as { card: PrepCard } | undefined)?.card ?? null)}
                                onDragEnd={onDragEnd}>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <Column col="tasklist" title="Task List" subtitle="Backlog" accent="bg-slate-400"
                                        cards={station.taskList} canManage={station.canManage} onMove={moveCard}>
                                        {station.canManage && (
                                            <div className="mt-2 pt-2 border-t border-border/60 space-y-1.5">
                                                <div className="flex flex-wrap items-end gap-1.5">
                                                    <Input placeholder="New task…" value={newTask.name} onChange={e => setNewTask(p => ({ ...p, name: e.target.value }))}
                                                        onKeyDown={e => { if (e.key === "Enter") addTaskTemplate(); }} className="h-8 text-sm flex-1 min-w-[110px]" />
                                                    <Input placeholder="Qty" value={newTask.qty} onChange={e => setNewTask(p => ({ ...p, qty: e.target.value }))} className="h-8 text-sm w-14" />
                                                    <Input placeholder="Time" value={newTask.time} onChange={e => setNewTask(p => ({ ...p, time: e.target.value }))} className="h-8 text-sm w-16" />
                                                    <Button size="sm" variant="outline" className="h-8 px-2" disabled={!newTask.name.trim()} onClick={addTaskTemplate}><Plus className="w-4 h-4" /></Button>
                                                </div>
                                                <button onClick={() => setImportOpen(true)}
                                                    className="text-[11px] text-primary hover:underline">
                                                    + Import many (paste a list)
                                                </button>
                                            </div>
                                        )}
                                    </Column>
                                    <Column col="todo" title="To-Do" subtitle={`${station.todo.length} planned`} accent="bg-blue-500"
                                        cards={station.todo} canManage={station.canManage} onMove={moveCard} onDelete={station.canManage ? deleteTemplate : undefined} />
                                    <Column col="complete" title="Complete" subtitle={`${station.complete.length} done`} accent="bg-emerald-500"
                                        cards={station.complete} canManage={station.canManage} onMove={moveCard} done />
                                </div>

                                <DragOverlay>
                                    {dragCard ? <CardFace card={dragCard} dragging /> : null}
                                </DragOverlay>
                            </DndContext>

                            {!station.canManage && (
                                <p className="text-[11px] text-muted-foreground">
                                    You can move tasks between <strong>To-Do</strong> and <strong>Complete</strong>. Managers plan the To-Do list.
                                </p>
                            )}
                        </>
                    )}
                </>
            )}

            {stationDlg && (
                <StationDialog mode={stationDlg.mode} station={stationDlg.station}
                    onClose={() => setStationDlg(null)}
                    onSaved={() => { setStationDlg(null); load(); }} />
            )}
            {analyticsOpen && <AnalyticsDialog onClose={() => setAnalyticsOpen(false)} />}

            {/* Bulk import dialog */}
            <Dialog open={importOpen} onOpenChange={v => { if (!v) setImportOpen(false); }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Import tasks into {station?.name ?? "Task List"}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-2 py-2">
                        <Label className="text-xs">Paste one task per line</Label>
                        <textarea
                            value={importText}
                            onChange={e => setImportText(e.target.value)}
                            rows={12}
                            placeholder={"No.1 Seasoning Powder\nPad Thai Sauce\nBlended Garlic\n…"}
                            className="w-full rounded-lg border border-border bg-background p-2 text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                        <p className="text-[11px] text-muted-foreground">
                            {importText.split("\n").map(s => s.trim()).filter(Boolean).length} task(s) detected · duplicates are skipped automatically
                        </p>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" size="sm" onClick={() => setImportOpen(false)} disabled={importing}>Cancel</Button>
                        <Button size="sm" onClick={runImport} disabled={importing || importText.trim().length === 0}>
                            {importing && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />} Import
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

// ─── Column (droppable) ─────────────────────────────────────────────────────
function Column({ col, title, subtitle, accent, cards, canManage, done, onDelete, onMove, children }: {
    col: Col; title: string; subtitle: string; accent: string;
    cards: PrepCard[]; canManage: boolean; done?: boolean;
    onDelete?: (templateId: string) => void;
    onMove?: (card: PrepCard, from: Col, to: Col) => void;
    children?: React.ReactNode;
}) {
    const { setNodeRef, isOver } = useDroppable({ id: col, data: { col } });
    return (
        <div ref={setNodeRef}
            className={`rounded-xl border bg-muted/20 p-3 min-h-[140px] transition-colors ${isOver ? "border-primary bg-primary/5" : "border-border"}`}>
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${accent}`} />
                    <span className="font-semibold text-sm">{title}</span>
                </div>
                <span className="text-[11px] text-muted-foreground">{subtitle}</span>
            </div>
            <div className="space-y-1.5">
                {cards.map(c => (
                    <DraggableCard key={c.id ?? c.templateId} card={c} from={col} done={done}
                        canManage={canManage} onMove={onMove}
                        onDelete={col === "tasklist" && canManage && onDelete ? () => onDelete(c.templateId) : undefined} />
                ))}
                {cards.length === 0 && <p className="text-xs text-muted-foreground/60 italic text-center py-3">Drop tasks here</p>}
            </div>
            {children}
        </div>
    );
}

// ─── Draggable card ─────────────────────────────────────────────────────────
function DraggableCard({ card, from, done, canManage, onDelete, onMove }: {
    card: PrepCard; from: Col; done?: boolean; canManage?: boolean;
    onDelete?: () => void;
    onMove?: (card: PrepCard, from: Col, to: Col) => void;
}) {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: card.id ?? card.templateId, data: { card, from },
    });

    // Tap-to-move actions (primary interaction on touch / mobile)
    const move = (to: Col) => onMove?.(card, from, to);

    return (
        <div ref={setNodeRef}
            className={`group rounded-lg border bg-card px-2.5 py-2 ${isDragging ? "opacity-30" : ""} ${done ? "border-emerald-200 dark:border-emerald-800" : "border-border"}`}>
            <div className="flex items-start gap-2">
                {/* Drag handle (desktop) — only this grips, so taps elsewhere don't start a drag */}
                <button {...attributes} {...listeners}
                    className="mt-0.5 shrink-0 cursor-grab active:cursor-grabbing touch-none text-muted-foreground/40 hover:text-muted-foreground"
                    aria-label="Drag to move" tabIndex={-1}>
                    <GripVertical className="w-3.5 h-3.5" />
                </button>
                <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium leading-tight ${done ? "text-muted-foreground" : ""}`}>{card.name}</p>
                    <div className="flex flex-wrap gap-x-2 mt-0.5 text-[11px] text-muted-foreground">
                        {card.qty && <span>{card.qty}</span>}
                        {card.dueTime && <span>· {card.dueTime}</span>}
                        {done && card.completedBy && <span className="text-emerald-600 dark:text-emerald-400">✓ {card.completedBy}</span>}
                    </div>
                </div>
                {done && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
                {onDelete && (
                    <button onClick={onDelete} onPointerDown={e => e.stopPropagation()}
                        className="text-muted-foreground/40 hover:text-destructive transition-colors shrink-0 sm:opacity-0 sm:group-hover:opacity-100">
                        <X className="w-4 h-4" />
                    </button>
                )}
            </div>

            {/* Quick move buttons — work on touch where drag is awkward */}
            {onMove && (
                <div className="flex flex-wrap gap-1.5 mt-2" onPointerDown={e => e.stopPropagation()}>
                    {from === "tasklist" && canManage && (
                        <MoveBtn label="Move to To-Do" onClick={() => move("todo")} icon={ArrowRight} tone="blue" />
                    )}
                    {from === "todo" && (
                        <>
                            <MoveBtn label="Mark done" onClick={() => move("complete")} icon={Check} tone="emerald" />
                            {canManage && <MoveBtn label="Back to list" onClick={() => move("tasklist")} icon={Undo2} tone="muted" iconOnly />}
                        </>
                    )}
                    {from === "complete" && (
                        <MoveBtn label="Undo" onClick={() => move("todo")} icon={Undo2} tone="muted" />
                    )}
                </div>
            )}
        </div>
    );
}

// Touch-friendly move button (≥32px tap target)
function MoveBtn({ label, onClick, icon: Icon, tone, iconOnly }: {
    label: string; onClick: () => void; icon: React.ElementType;
    tone: "blue" | "emerald" | "muted"; iconOnly?: boolean;
}) {
    const tones: Record<string, string> = {
        blue:    "border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-950/40",
        emerald: "border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/40",
        muted:   "border-border text-muted-foreground hover:bg-accent",
    };
    return (
        <button onClick={onClick} title={label} aria-label={label}
            className={`inline-flex items-center gap-1 rounded-md border px-2 h-8 text-xs font-medium transition-colors active:scale-95 ${tones[tone]}`}>
            <Icon className="w-3.5 h-3.5" />
            {!iconOnly && <span>{label}</span>}
        </button>
    );
}
function CardFace({ card, dragging }: { card: PrepCard; dragging?: boolean }) {
    return (
        <div className={`rounded-lg border border-primary bg-card px-2.5 py-2 shadow-lg ${dragging ? "rotate-1" : ""}`}>
            <p className="text-sm font-medium">{card.name}</p>
        </div>
    );
}

// ─── Station dialog (add/edit + member assignment) ──────────────────────────
function StationDialog({ mode, station, onClose, onSaved }: {
    mode: "add" | "edit"; station?: PrepStation; onClose: () => void; onSaved: () => void;
}) {
    const [name,  setName]  = useState(station?.name ?? "");
    const [icon,  setIcon]  = useState(station?.icon ?? "utensils");
    const [color, setColor] = useState(station?.color ?? "bg-slate-500");
    const [members, setMembers] = useState<string[]>(station?.memberIds ?? []);
    const [users, setUsers] = useState<User[]>([]);
    const [saving, setSaving] = useState(false);

    useEffect(() => { usersApi.list().then(setUsers).catch(() => setUsers([])); }, []);

    async function save() {
        if (!name.trim()) return;
        setSaving(true);
        try {
            if (mode === "add") {
                const created = await prepStationsApi.create({ name: name.trim(), icon, color });
                if (members.length) await prepStationsApi.update(created.id, { memberIds: members });
            } else if (station) {
                await prepStationsApi.update(station.id, { name: name.trim(), icon, color, memberIds: members });
            }
            onSaved();
        } finally { setSaving(false); }
    }
    async function del() {
        if (!station) return;
        if (!window.confirm("Delete this station? (Only works if it has no tasks.)")) return;
        const res = await prepStationsApi.delete(station.id);
        if (res.status === 409) { alert(res.message ?? "Station still has tasks."); return; }
        onSaved();
    }

    return (
        <Dialog open onOpenChange={v => { if (!v) onClose(); }}>
            <DialogContent className="sm:max-w-md max-h-[90dvh] overflow-y-auto">
                <DialogHeader><DialogTitle>{mode === "add" ? "Add Station" : "Edit Station"}</DialogTitle></DialogHeader>
                <div className="space-y-4 py-2">
                    <div className="space-y-1">
                        <Label className="text-xs">Station name</Label>
                        <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Grill" className="h-10" autoFocus />
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
                    <div className="space-y-1.5">
                        <Label className="text-xs">Assigned staff <span className="text-muted-foreground font-normal">(none = visible to all)</span></Label>
                        <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                            {users.map(u => {
                                const on = members.includes(u.id);
                                return (
                                    <button key={u.id}
                                        onClick={() => setMembers(m => on ? m.filter(x => x !== u.id) : [...m, u.id])}
                                        className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${on ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
                                        {u.name}
                                    </button>
                                );
                            })}
                            {users.length === 0 && <span className="text-xs text-muted-foreground">No users</span>}
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

// ─── Analytics dialog ───────────────────────────────────────────────────────
function AnalyticsDialog({ onClose }: { onClose: () => void }) {
    const [from, setFrom] = useState(daysAgo(6));
    const [to,   setTo]   = useState(today());
    const [tab,  setTab]  = useState<"freq" | "staff">("freq");
    const [data, setData] = useState<Awaited<ReturnType<typeof prepApi.analytics>> | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let active = true;
        prepApi.analytics(from, to)
            .then(d => { if (active) setData(d); })
            .catch(() => { if (active) setData(null); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [from, to]);

    return (
        <Dialog open onOpenChange={v => { if (!v) onClose(); }}>
            <DialogContent className="sm:max-w-2xl max-h-[90dvh] flex flex-col p-0">
                <DialogHeader className="px-5 pt-5 pb-3 border-b border-border">
                    <DialogTitle className="flex items-center gap-2"><BarChart3 className="w-5 h-5 text-primary" /> Prep Productivity Analytics</DialogTitle>
                </DialogHeader>
                <div className="px-5 py-3 flex flex-wrap items-end gap-2 border-b border-border">
                    <div><Label className="text-xs">From</Label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-9 w-36" /></div>
                    <div><Label className="text-xs">To</Label><Input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-9 w-36" /></div>
                    <Button variant="outline" size="sm" className="h-9 gap-1.5"
                        disabled={!data || (data.stationFrequency.length === 0 && data.staffPerformance.length === 0)}
                        onClick={() => data && exportPrepAnalyticsToPDF(data)}>
                        <FileDown className="w-4 h-4" /> Export PDF
                    </Button>
                    <div className="flex gap-1 p-0.5 bg-muted/50 rounded-lg ml-auto">
                        <button onClick={() => setTab("freq")}  className={`px-3 py-1.5 rounded-md text-xs font-medium ${tab === "freq" ? "bg-background shadow-sm" : "text-muted-foreground"}`}>Station Frequency</button>
                        <button onClick={() => setTab("staff")} className={`px-3 py-1.5 rounded-md text-xs font-medium ${tab === "staff" ? "bg-background shadow-sm" : "text-muted-foreground"}`}>Staff Performance</button>
                    </div>
                </div>
                <div className="overflow-y-auto px-5 py-4 flex-1">
                    {loading ? <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
                    : tab === "freq" ? (
                        <table className="w-full text-xs">
                            <thead><tr className="border-b-2 border-border text-muted-foreground uppercase text-[10px] tracking-wide">
                                <th className="text-left py-2">Station</th><th className="text-left py-2">Task</th>
                                <th className="text-right py-2 px-2">Days</th><th className="text-right py-2 px-2">Scheduled</th><th className="text-right py-2">Completed</th>
                            </tr></thead>
                            <tbody className="divide-y divide-border/50">
                                {(data?.stationFrequency ?? []).map((r, i) => (
                                    <tr key={i} className="hover:bg-muted/20">
                                        <td className="py-1.5 text-muted-foreground">{r.station}</td>
                                        <td className="py-1.5 font-medium">{r.task}</td>
                                        <td className="py-1.5 px-2 text-right tabular-nums">{r.daysScheduled}</td>
                                        <td className="py-1.5 px-2 text-right tabular-nums font-semibold">{r.timesScheduled}</td>
                                        <td className="py-1.5 text-right tabular-nums text-emerald-600 dark:text-emerald-400">{r.timesCompleted}</td>
                                    </tr>
                                ))}
                                {(data?.stationFrequency.length ?? 0) === 0 && <tr><td colSpan={5} className="py-8 text-center text-muted-foreground italic">No activity in this range</td></tr>}
                            </tbody>
                        </table>
                    ) : (
                        <table className="w-full text-xs">
                            <thead><tr className="border-b-2 border-border text-muted-foreground uppercase text-[10px] tracking-wide">
                                <th className="text-left py-2">Staff</th><th className="text-right py-2 px-2">Completed</th>
                                <th className="text-right py-2 px-2">Days Active</th><th className="text-right py-2">Avg / Day</th>
                            </tr></thead>
                            <tbody className="divide-y divide-border/50">
                                {(data?.staffPerformance ?? []).map((r, i) => (
                                    <tr key={i} className="hover:bg-muted/20">
                                        <td className="py-1.5 font-medium">{r.name}</td>
                                        <td className="py-1.5 px-2 text-right tabular-nums font-semibold">{r.completed}</td>
                                        <td className="py-1.5 px-2 text-right tabular-nums">{r.daysActive}</td>
                                        <td className="py-1.5 text-right tabular-nums">{r.avgPerDay}</td>
                                    </tr>
                                ))}
                                {(data?.staffPerformance.length ?? 0) === 0 && <tr><td colSpan={4} className="py-8 text-center text-muted-foreground italic">No completions in this range</td></tr>}
                            </tbody>
                        </table>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-3">
                        Frequency = how often a task is planned (To-Do) — high-volume prep is a candidate for pre-cut buying. Staff completions are timestamped for performance review.
                    </p>
                </div>
                <div className="px-5 py-3 border-t border-border flex justify-end"><Button onClick={onClose}>Close</Button></div>
            </DialogContent>
        </Dialog>
    );
}
