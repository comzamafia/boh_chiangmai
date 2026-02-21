"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Dialog, DialogContent, DialogDescription,
    DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
    Select, SelectContent, SelectItem,
    SelectTrigger, SelectValue
} from "@/components/ui/select";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, Trash2, Loader2 } from "lucide-react";
import Link from "next/link";

interface Schedule {
    id: string;
    date: string; // YYYY-MM-DD
    items: string[];
    status: "pending" | "completed";
}

const monthNames = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];

function pad2(n: number) { return String(n).padStart(2, "0"); }
function toDateStr(year: number, month: number, day: number) {
    return `${year}-${pad2(month + 1)}-${pad2(day)}`;
}

async function apiGet(): Promise<Schedule[]> {
    const res = await fetch("/api/production-schedules");
    if (!res.ok) throw new Error("Failed to fetch");
    return res.json();
}
async function apiCreate(payload: Omit<Schedule, "id">): Promise<Schedule> {
    const res = await fetch("/api/production-schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Failed to create");
    return res.json();
}
async function apiDelete(id: string) {
    await fetch(`/api/production-schedules/${id}`, { method: "DELETE" });
}
async function apiToggle(sched: Schedule): Promise<Schedule> {
    const res = await fetch(`/api/production-schedules/${sched.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...sched, status: sched.status === "pending" ? "completed" : "pending" }),
    });
    if (!res.ok) throw new Error("Failed to update");
    return res.json();
}

export default function ProductionCalendarPage() {
    const [currentDate, setCurrentDate] = useState<Date | null>(null);
    const [today, setToday] = useState<Date | null>(null);

    useEffect(() => {
        const now = new Date();
        setCurrentDate(now);
        setToday(now);
    }, []);

    const daysInMonth = currentDate
        ? new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate()
        : 0;
    const firstDayOfMonth = currentDate
        ? new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay()
        : 0;

    const prevMonth = () => setCurrentDate(d => d ? new Date(d.getFullYear(), d.getMonth() - 1, 1) : d);
    const nextMonth = () => setCurrentDate(d => d ? new Date(d.getFullYear(), d.getMonth() + 1, 1) : d);

    const [schedules, setSchedules] = useState<Schedule[]>([]);
    const [loadingSchedules, setLoadingSchedules] = useState(true);

    const [dialogOpen, setDialogOpen] = useState(false);
    const [formDay, setFormDay] = useState("1");
    const [formStatus, setFormStatus] = useState<"pending" | "completed">("pending");
    const [taskItems, setTaskItems] = useState<string[]>([""]);
    const [saving, setSaving] = useState(false);

    const refresh = useCallback(async () => {
        try {
            const data = await apiGet();
            setSchedules(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoadingSchedules(false);
        }
    }, []);

    useEffect(() => { refresh(); }, [refresh]);

    const openDialog = (day?: number) => {
        setFormDay(String(day ?? today?.getDate() ?? new Date().getDate()));
        setFormStatus("pending");
        setTaskItems([""]);
        setDialogOpen(true);
    };

    const addTask = () => setTaskItems(prev => [...prev, ""]);
    const updateTask = (idx: number, val: string) =>
        setTaskItems(prev => prev.map((t, i) => i === idx ? val : t));
    const removeTask = (idx: number) =>
        setTaskItems(prev => prev.filter((_, i) => i !== idx));

    const handleSave = async () => {
        const validItems = taskItems.filter(t => t.trim());
        if (!validItems.length || !currentDate) return;
        const day = Math.min(Math.max(parseInt(formDay) || 1, 1), daysInMonth);
        const dateStr = toDateStr(currentDate.getFullYear(), currentDate.getMonth(), day);
        setSaving(true);
        try {
            const created = await apiCreate({ date: dateStr, items: validItems, status: formStatus });
            setSchedules(prev => [...prev, created]);
            setDialogOpen(false);
        } catch (err) {
            console.error(err);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        setSchedules(prev => prev.filter(s => s.id !== id));
        try { await apiDelete(id); } catch { await refresh(); }
    };

    const handleToggle = async (sched: Schedule) => {
        const next = { ...sched, status: sched.status === "pending" ? "completed" : "pending" } as Schedule;
        setSchedules(prev => prev.map(s => s.id === sched.id ? next : s));
        try { await apiToggle(sched); } catch { await refresh(); }
    };

    const getSchedulesForDate = (date: number) => {
        if (!currentDate) return [];
        const dateStr = toDateStr(currentDate.getFullYear(), currentDate.getMonth(), date);
        return schedules.filter(s => s.date === dateStr);
    };

    const isToday = (date: number) =>
        !!today && !!currentDate &&
        today.getDate() === date &&
        today.getMonth() === currentDate.getMonth() &&
        today.getFullYear() === currentDate.getFullYear();

    return (
        <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in duration-500 pb-12">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-3xl font-bold font-playfair tracking-tight text-primary">Production Calendar</h2>
                    <p className="text-muted-foreground">Schedule upcoming kitchen production runs.</p>
                </div>
                <Button onClick={() => openDialog()}>
                    <Plus className="mr-2 h-4 w-4" /> New Schedule
                </Button>
            </div>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between border-b pb-6">
                    <div className="flex items-center gap-2">
                        <CalendarIcon className="h-6 w-6 text-primary" />
                        <CardTitle className="text-2xl font-playfair">
                            {currentDate ? `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}` : "\u00a0"}
                        </CardTitle>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" size="icon" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
                        <Button variant="outline" size="icon" onClick={nextMonth}><ChevronRight className="h-4 w-4" /></Button>
                        <Button variant="outline" onClick={() => setCurrentDate(new Date())}>Today</Button>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    {loadingSchedules ? (
                        <div className="flex justify-center items-center py-20">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : (
                        <>
                            <div className="grid grid-cols-7 border-b bg-muted/30">
                                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => (
                                    <div key={day} className="p-3 text-center text-sm font-medium text-muted-foreground">{day}</div>
                                ))}
                            </div>

                            <div className="grid grid-cols-7">
                                {Array.from({ length: firstDayOfMonth }).map((_, i) => (
                                    <div key={`empty-${i}`} className="min-h-[120px] p-2 border-b border-r border-border/50 bg-muted/10 opacity-50" />
                                ))}

                                {Array.from({ length: daysInMonth }).map((_, i) => {
                                    const date = i + 1;
                                    const dayScheds = getSchedulesForDate(date);
                                    const todayFlag = isToday(date);

                                    return (
                                        <div
                                            key={date}
                                            className={`min-h-[120px] p-2 border-b border-r border-border/50 transition-colors hover:bg-accent/20 relative group ${todayFlag ? "bg-primary/5" : ""}`}
                                        >
                                            <span className={`inline-flex items-center justify-center w-7 h-7 text-sm font-medium rounded-full mb-1 ${todayFlag ? "bg-primary text-primary-foreground" : "text-foreground"}`}>
                                                {date}
                                            </span>

                                            {dayScheds.map(sched => (
                                                <div key={sched.id} className="mb-1">
                                                    {sched.items.map((item, idx) => (
                                                        <div
                                                            key={idx}
                                                            className={`text-xs p-1.5 rounded truncate border mb-0.5 cursor-pointer select-none ${
                                                                sched.status === "completed"
                                                                    ? "bg-muted border-border/50 text-muted-foreground line-through"
                                                                    : "bg-primary/10 border-primary/20 text-foreground font-medium"
                                                            }`}
                                                            onClick={() => handleToggle(sched)}
                                                            title="Click to toggle status"
                                                        >
                                                            {item}
                                                        </div>
                                                    ))}
                                                    <div className="flex items-center justify-between mt-0.5">
                                                        <span className="text-[10px] text-muted-foreground uppercase tracking-widest px-1">
                                                            {sched.status}
                                                        </span>
                                                        <button
                                                            onClick={() => handleDelete(sched.id)}
                                                            className="opacity-0 group-hover:opacity-100 text-destructive transition-opacity p-0.5 rounded hover:bg-destructive/10"
                                                        >
                                                            <Trash2 className="h-3 w-3" />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}

                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                className="h-6 w-6 absolute top-2 right-2 opacity-0 group-hover:opacity-100 bg-background/80 backdrop-blur-sm"
                                                onClick={() => openDialog(date)}
                                            >
                                                <Plus className="h-3 w-3" />
                                            </Button>
                                        </div>
                                    );
                                })}

                                {Array.from({ length: (7 - ((firstDayOfMonth + daysInMonth) % 7)) % 7 }).map((_, i) => (
                                    <div key={`empty-end-${i}`} className="min-h-[120px] p-2 border-b border-r border-border/50 bg-muted/10 opacity-50" />
                                ))}
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>

            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded bg-primary/10 border border-primary/20" />
                    <span>Pending (click to toggle)</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded bg-muted border border-border/50" />
                    <span>Completed</span>
                </div>
                <span className="ml-auto text-muted-foreground/70">Hover a day → click + to add</span>
            </div>

            <div className="flex justify-center">
                <Link href="/production-planning" className="text-primary hover:underline text-sm">← Back to Production Planning</Link>
            </div>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>New Production Schedule</DialogTitle>
                        <DialogDescription>
                            Add a production task to {currentDate ? `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}` : "the calendar"}.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label>Day of Month</Label>
                                <Input
                                    type="number"
                                    min={1}
                                    max={daysInMonth}
                                    value={formDay}
                                    onChange={e => setFormDay(e.target.value)}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Status</Label>
                                <Select value={formStatus} onValueChange={v => setFormStatus(v as "pending" | "completed")}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="pending">Pending</SelectItem>
                                        <SelectItem value="completed">Completed</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label>Production Tasks</Label>
                                <Button variant="ghost" size="sm" onClick={addTask} className="h-7 text-xs">
                                    <Plus className="h-3 w-3 mr-1" /> Add Task
                                </Button>
                            </div>
                            {taskItems.map((item, idx) => (
                                <div key={idx} className="flex gap-2">
                                    <Input
                                        placeholder="e.g. Pad Thai Sauce (10L)"
                                        value={item}
                                        onChange={e => updateTask(idx, e.target.value)}
                                        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTask(); } }}
                                    />
                                    {taskItems.length > 1 && (
                                        <Button variant="ghost" size="icon" className="shrink-0 text-destructive" onClick={() => removeTask(idx)}>
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleSave} disabled={saving || !taskItems.some(t => t.trim())}>
                            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Add to Calendar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
