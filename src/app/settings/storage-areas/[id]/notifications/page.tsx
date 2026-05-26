"use client";

/**
 * Per-storage-area notification settings.
 *
 * Route: /settings/storage-areas/[id]/notifications
 * - Edit alert routing for one area (notifyEnabled, alertThreshold, digestSchedule, digestHourLocal)
 * - Manage watchers (add/remove users)
 * - Send test email
 */
import { useState, useEffect, useCallback, use as usePromise } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
    Bell, BellOff, ChevronLeft, Trash2, Plus, Loader2, Send, Mail, Clock, Users, CheckCircle2,
} from "lucide-react";
import {
    storageAreasApi, usersApi,
    type StorageArea, type StorageAreaWatcher, type User,
    notificationsApi,
} from "@/lib/api";

const THRESHOLDS = [
    { value: "critical", label: "Critical only",       desc: "Only send when stock falls below PAR Min" },
    { value: "reorder",  label: "Reorder + Critical",  desc: "Send at reorder point and below (recommended)" },
    { value: "any",      label: "Any change",          desc: "Every stock-affecting event (noisy)" },
];

const SCHEDULES = [
    { value: "off",      label: "Off",                desc: "Pause all alerts" },
    { value: "realtime", label: "Real-time only",     desc: "Critical alerts only, no digest" },
    { value: "daily",    label: "Daily digest",       desc: "One email per day at chosen hour" },
    { value: "weekly",   label: "Weekly digest",      desc: "One email every Monday" },
];

export default function AreaNotificationsPage(props: { params: Promise<{ id: string }> }) {
    const { id } = usePromise(props.params);
    const [area,     setArea]     = useState<StorageArea | null>(null);
    const [watchers, setWatchers] = useState<StorageAreaWatcher[]>([]);
    const [allUsers, setAllUsers] = useState<User[]>([]);
    const [loading,  setLoading]  = useState(true);
    const [saving,   setSaving]   = useState(false);
    const [addOpen,  setAddOpen]  = useState(false);
    const [testing,    setTesting]    = useState(false);
    const [testMsg,    setTestMsg]    = useState<string | null>(null);
    const [overrideTo, setOverrideTo] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [areas, w, u] = await Promise.all([
                storageAreasApi.list(),
                storageAreasApi.listWatchers(id),
                usersApi.list(),
            ]);
            setArea(areas.find(a => a.id === id) ?? null);
            setWatchers(w);
            setAllUsers(u.filter(usr => usr.isActive));
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => { load(); }, [load]);

    async function saveSettings(patch: Partial<StorageArea>) {
        if (!area) return;
        setSaving(true);
        try {
            const updated = await storageAreasApi.update(area.id, patch);
            setArea(updated);
        } catch (e) {
            console.error(e);
        } finally {
            setSaving(false);
        }
    }

    async function removeWatcher(userId: string) {
        await storageAreasApi.removeWatcher(id, userId);
        setWatchers(ws => ws.filter(w => w.userId !== userId));
    }

    async function sendTest(type: "digest" | "critical") {
        setTesting(true);
        setTestMsg(null);
        try {
            // Use raw fetch so we can read the JSON error body on non-2xx
            const body: Record<string, unknown> = { storageAreaId: id, type };
            if (overrideTo.trim()) body.overrideEmail = overrideTo.trim();
            const r = await fetch("/api/notifications/test", {
                method:  "POST",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify(body),
            });
            const data = await r.json().catch(() => ({}));
            if (!r.ok || data.ok === false) {
                const stage   = data.stage   ? ` [stage: ${data.stage}]` : "";
                const details = data.details ?? data.error ?? data.message ?? `HTTP ${r.status}`;
                setTestMsg(`✗ ${details}${stage}`);
            } else {
                setTestMsg(`✓ Test ${type} email sent to ${data.to} (from ${data.from}) — check your inbox.`);
            }
        } catch (e) {
            setTestMsg(`✗ ${e instanceof Error ? e.message : String(e)}`);
        } finally {
            setTesting(false);
        }
    }

    if (loading) return (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
    );
    if (!area) return (
        <div className="p-6">
            <p className="text-muted-foreground">Storage area not found.</p>
            <Link href="/settings/storage-areas" className="text-sm text-amber-700 underline">← Back to storage areas</Link>
        </div>
    );

    const notifyEnabled   = area.notifyEnabled ?? true;
    const alertThreshold  = area.alertThreshold ?? "reorder";
    const digestSchedule  = area.digestSchedule ?? "daily";
    const digestHourLocal = area.digestHourLocal ?? 8;

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div>
                <Link
                    href="/settings/storage-areas"
                    className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
                >
                    <ChevronLeft className="h-4 w-4 mr-1" /> Storage Areas
                </Link>
                <h2 className="mt-2 text-3xl font-bold font-playfair tracking-tight text-primary">
                    {area.name}
                </h2>
                <p className="text-muted-foreground">Email notification settings</p>
            </div>

            {/* Master toggle */}
            <Card>
                <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                {notifyEnabled
                                    ? <Bell    className="h-5 w-5 text-amber-600" />
                                    : <BellOff className="h-5 w-5 text-muted-foreground" />}
                                Email Alerts
                            </CardTitle>
                            <CardDescription className="mt-1">
                                Master switch for all notifications about <strong>{area.name}</strong>.
                            </CardDescription>
                        </div>
                        <Switch
                            checked={notifyEnabled}
                            onCheckedChange={v => saveSettings({ notifyEnabled: v })}
                            disabled={saving}
                        />
                    </div>
                </CardHeader>
            </Card>

            {/* Threshold + schedule */}
            <Card className={notifyEnabled ? "" : "opacity-50 pointer-events-none"}>
                <CardHeader>
                    <CardTitle className="text-lg">Routing</CardTitle>
                    <CardDescription>When and how watchers receive alerts.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                    <div className="space-y-2">
                        <Label className="text-sm font-semibold">Send for</Label>
                        <Select value={alertThreshold} onValueChange={v => saveSettings({ alertThreshold: v as StorageArea["alertThreshold"] })}>
                            <SelectTrigger className="w-full sm:w-80"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {THRESHOLDS.map(t => (
                                    <SelectItem key={t.value} value={t.value}>
                                        <div>
                                            <div className="font-medium">{t.label}</div>
                                            <div className="text-xs text-muted-foreground">{t.desc}</div>
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label className="text-sm font-semibold">Digest schedule</Label>
                        <div className="flex flex-col sm:flex-row gap-2">
                            <Select value={digestSchedule} onValueChange={v => saveSettings({ digestSchedule: v as StorageArea["digestSchedule"] })}>
                                <SelectTrigger className="w-full sm:w-60"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {SCHEDULES.map(s => (
                                        <SelectItem key={s.value} value={s.value}>
                                            <div>
                                                <div className="font-medium">{s.label}</div>
                                                <div className="text-xs text-muted-foreground">{s.desc}</div>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {(digestSchedule === "daily" || digestSchedule === "weekly") && (
                                <div className="flex items-center gap-2">
                                    <Clock className="h-4 w-4 text-muted-foreground" />
                                    <Select
                                        value={String(digestHourLocal)}
                                        onValueChange={v => saveSettings({ digestHourLocal: Number(v) })}
                                    >
                                        <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {Array.from({ length: 24 }, (_, h) => (
                                                <SelectItem key={h} value={String(h)}>
                                                    {String(h).padStart(2, "0")}:00
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <span className="text-xs text-muted-foreground">Toronto</span>
                                </div>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Watchers */}
            <Card className={notifyEnabled ? "" : "opacity-50 pointer-events-none"}>
                <CardHeader>
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <CardTitle className="text-lg flex items-center gap-2">
                                <Users className="h-5 w-5 text-amber-600" />
                                Watchers
                                <Badge variant="outline" className="ml-1">{watchers.length}</Badge>
                            </CardTitle>
                            <CardDescription>People who receive alerts for this area.</CardDescription>
                        </div>
                        <Button size="sm" onClick={() => setAddOpen(true)}>
                            <Plus className="h-4 w-4 mr-1.5" /> Add
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    {watchers.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-4 text-center">
                            No watchers yet. Add someone to start receiving alerts.
                        </p>
                    ) : (
                        <div className="space-y-2">
                            {watchers.map(w => (
                                <div key={w.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="h-9 w-9 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
                                            <span className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                                                {w.user.name.slice(0, 1).toUpperCase()}
                                            </span>
                                        </div>
                                        <div className="min-w-0">
                                            <div className="font-medium truncate">{w.user.name}</div>
                                            <div className="text-xs text-muted-foreground truncate">{w.user.email}</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <Badge variant="outline" className="text-xs">
                                            {w.role === "owner" ? "Owner" : "Watcher"}
                                        </Badge>
                                        {w.ccOnly && <Badge variant="secondary" className="text-xs">CC</Badge>}
                                        <Button
                                            size="icon" variant="ghost"
                                            className="h-8 w-8 text-red-600 hover:text-red-700"
                                            onClick={() => removeWatcher(w.userId)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Test */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                        <Send className="h-5 w-5 text-amber-600" /> Send Test Email
                    </CardTitle>
                    <CardDescription>Preview templates by sending one to yourself.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">
                            Send to (optional — leave blank to send to your account email)
                        </Label>
                        <Input
                            type="email"
                            placeholder="e.g. you@gmail.com"
                            value={overrideTo}
                            onChange={e => setOverrideTo(e.target.value)}
                            className="h-9"
                        />
                        <p className="text-xs text-muted-foreground">
                            Using Resend sandbox? This must be the exact email you signed up to Resend with.
                        </p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                        <Button
                            variant="outline" className="flex-1"
                            onClick={() => sendTest("digest")} disabled={testing}
                        >
                            <Mail className="h-4 w-4 mr-2" />
                            Test Daily Digest
                        </Button>
                        <Button
                            variant="outline" className="flex-1"
                            onClick={() => sendTest("critical")} disabled={testing}
                        >
                            <Mail className="h-4 w-4 mr-2" />
                            Test Critical Alert
                        </Button>
                    </div>
                    {testing && (
                        <div className="flex items-center text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Sending...
                        </div>
                    )}
                    {testMsg && (
                        <div className={`flex items-center text-sm rounded-md border px-3 py-2 ${testMsg.startsWith("✓")
                            ? "bg-green-50 border-green-200 text-green-700 dark:bg-green-950/30 dark:text-green-400"
                            : "bg-red-50 border-red-200 text-red-700 dark:bg-red-950/30 dark:text-red-400"}`}
                        >
                            {testMsg.startsWith("✓") && <CheckCircle2 className="h-4 w-4 mr-2" />}
                            {testMsg}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Add watcher dialog */}
            <AddWatcherDialog
                open={addOpen} onClose={() => setAddOpen(false)}
                allUsers={allUsers.filter(u => !watchers.find(w => w.userId === u.id))}
                onAdded={(w) => { setWatchers(ws => [...ws, w]); setAddOpen(false); }}
                areaId={id}
            />
        </div>
    );
}

function AddWatcherDialog({
    open, onClose, allUsers, onAdded, areaId,
}: {
    open: boolean; onClose: () => void;
    allUsers: User[]; onAdded: (w: StorageAreaWatcher) => void; areaId: string;
}) {
    const [userId, setUserId] = useState("");
    const [role,   setRole]   = useState<"owner" | "watcher">("watcher");
    const [ccOnly, setCcOnly] = useState(false);
    const [saving, setSaving] = useState(false);
    const [err,    setErr]    = useState<string | null>(null);

    useEffect(() => { if (open) { setUserId(""); setRole("watcher"); setCcOnly(false); setErr(null); } }, [open]);

    async function add() {
        if (!userId) return;
        setSaving(true); setErr(null);
        try {
            const w = await storageAreasApi.addWatcher(areaId, { userId, role, ccOnly });
            onAdded(w);
        } catch (e) {
            setErr(e instanceof Error ? e.message : String(e));
        } finally { setSaving(false); }
    }

    return (
        <Dialog open={open} onOpenChange={v => !v && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Add Watcher</DialogTitle>
                    <DialogDescription>Receive email alerts for this storage area.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                    <div className="space-y-2">
                        <Label>User</Label>
                        <Select value={userId} onValueChange={setUserId}>
                            <SelectTrigger><SelectValue placeholder="Select user…" /></SelectTrigger>
                            <SelectContent>
                                {allUsers.length === 0 && (
                                    <div className="px-3 py-2 text-sm text-muted-foreground">All active users already watch this area.</div>
                                )}
                                {allUsers.map(u => (
                                    <SelectItem key={u.id} value={u.id}>
                                        <div>
                                            <div className="font-medium">{u.name}</div>
                                            <div className="text-xs text-muted-foreground">{u.email} · {u.role}</div>
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>Role</Label>
                        <Select value={role} onValueChange={v => setRole(v as "owner" | "watcher")}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="owner">Owner</SelectItem>
                                <SelectItem value="watcher">Watcher</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex items-center justify-between">
                        <div>
                            <Label className="text-sm font-semibold">CC only</Label>
                            <p className="text-xs text-muted-foreground">Add as CC instead of To.</p>
                        </div>
                        <Switch checked={ccOnly} onCheckedChange={setCcOnly} />
                    </div>
                    {err && <p className="text-sm text-red-600">{err}</p>}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={add} disabled={!userId || saving}>
                        {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Add Watcher
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
