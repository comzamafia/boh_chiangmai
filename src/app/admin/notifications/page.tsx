"use client";

/**
 * /admin/notifications
 *
 * Notification log + manual digest runner. Admin/manager only.
 */
import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader2, Send, Mail, RefreshCw, CheckCircle2, XCircle, Clock } from "lucide-react";
import { notificationsApi, storageAreasApi, type NotificationLogEntry, type StorageArea } from "@/lib/api";

const TYPE_LABELS: Record<string, string> = {
    low_stock_digest: "Daily Digest",
    critical_stock:   "Critical Stock",
    stocktake_due:    "Stocktake Due",
    waste_spike:      "Waste Spike",
    price_alert:      "Price Alert",
};

const STATUS_STYLE: Record<string, { badge: string; icon: React.ReactNode }> = {
    sent:    { badge: "bg-green-100 text-green-800 border-green-200",  icon: <CheckCircle2 className="h-3 w-3" /> },
    failed:  { badge: "bg-red-100 text-red-800 border-red-200",        icon: <XCircle      className="h-3 w-3" /> },
    skipped: { badge: "bg-slate-100 text-slate-700 border-slate-200",  icon: <Clock        className="h-3 w-3" /> },
    queued:  { badge: "bg-blue-100 text-blue-800 border-blue-200",     icon: <Clock        className="h-3 w-3" /> },
};

export default function AdminNotificationsPage() {
    const [logs,    setLogs]    = useState<NotificationLogEntry[]>([]);
    const [areas,   setAreas]   = useState<StorageArea[]>([]);
    const [loading, setLoading] = useState(true);
    const [running, setRunning] = useState(false);
    const [lastRun, setLastRun] = useState<string | null>(null);

    // Filters
    const [typeFilter,   setTypeFilter]   = useState("all");
    const [areaFilter,   setAreaFilter]   = useState("all");
    const [statusFilter, setStatusFilter] = useState("all");

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [l, a] = await Promise.all([
                notificationsApi.list({
                    type:          typeFilter   === "all" ? undefined : typeFilter,
                    storageAreaId: areaFilter   === "all" ? undefined : areaFilter,
                    status:        statusFilter === "all" ? undefined : statusFilter,
                    limit: 200,
                }),
                storageAreasApi.list(),
            ]);
            setLogs(l);
            setAreas(a);
        } finally { setLoading(false); }
    }, [typeFilter, areaFilter, statusFilter]);

    useEffect(() => { load(); }, [load]);

    async function runDigest(cadence: "daily" | "weekly") {
        setRunning(true); setLastRun(null);
        try {
            const r = await notificationsApi.runDigestNow(cadence);
            setLastRun(`${cadence}: ${r.areasSent}/${r.areasChecked} areas notified, ${r.sent} emails sent (${r.skipped} skipped, ${r.failed} failed)`);
            await load();
        } catch (e) {
            setLastRun(`Failed: ${e instanceof Error ? e.message : String(e)}`);
        } finally { setRunning(false); }
    }

    const areaName = (id: string | null) => id ? areas.find(a => a.id === id)?.name ?? id : "—";

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div>
                <h2 className="text-3xl font-bold font-playfair tracking-tight text-primary">Notifications</h2>
                <p className="text-muted-foreground">Email alert history and manual digest runs.</p>
            </div>

            {/* Manual run */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                        <Send className="h-5 w-5 text-amber-600" /> Run Digest Now
                    </CardTitle>
                    <CardDescription>
                        Manually trigger a stock digest run. Automatic runs happen daily at 08:00 BKK and weekly on Monday.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col sm:flex-row gap-2">
                        <Button onClick={() => runDigest("daily")} disabled={running}>
                            {running && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            <Mail className="h-4 w-4 mr-2" /> Run Daily Digest
                        </Button>
                        <Button variant="outline" onClick={() => runDigest("weekly")} disabled={running}>
                            <Mail className="h-4 w-4 mr-2" /> Run Weekly Digest
                        </Button>
                    </div>
                    {lastRun && (
                        <p className="mt-3 text-sm text-muted-foreground bg-slate-50 dark:bg-slate-900 rounded-md px-3 py-2 border">
                            {lastRun}
                        </p>
                    )}
                </CardContent>
            </Card>

            {/* Log */}
            <Card>
                <CardHeader>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div>
                            <CardTitle className="text-lg">Recent Activity</CardTitle>
                            <CardDescription>{logs.length} entries</CardDescription>
                        </div>
                        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
                            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
                        </Button>
                    </div>

                    {/* Filters */}
                    <div className="flex flex-wrap gap-2 mt-3">
                        <Select value={typeFilter} onValueChange={setTypeFilter}>
                            <SelectTrigger className="w-48"><SelectValue placeholder="All types" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All types</SelectItem>
                                {Object.entries(TYPE_LABELS).map(([v, l]) => (
                                    <SelectItem key={v} value={v}>{l}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={areaFilter} onValueChange={setAreaFilter}>
                            <SelectTrigger className="w-52"><SelectValue placeholder="All areas" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All areas</SelectItem>
                                {areas.map(a => (
                                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="w-40"><SelectValue placeholder="All statuses" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All statuses</SelectItem>
                                <SelectItem value="sent">Sent</SelectItem>
                                <SelectItem value="failed">Failed</SelectItem>
                                <SelectItem value="skipped">Skipped</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
                    ) : logs.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-10">No notifications match these filters.</p>
                    ) : (
                        <div className="border rounded-md overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>When</TableHead>
                                        <TableHead>Type</TableHead>
                                        <TableHead className="hidden sm:table-cell">Area</TableHead>
                                        <TableHead className="hidden md:table-cell">Recipient</TableHead>
                                        <TableHead>Subject</TableHead>
                                        <TableHead>Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {logs.map(l => {
                                        const s = STATUS_STYLE[l.status] ?? STATUS_STYLE.skipped;
                                        return (
                                            <TableRow key={l.id}>
                                                <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                                                    {new Date(l.createdAt).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}
                                                </TableCell>
                                                <TableCell className="text-xs">{TYPE_LABELS[l.type] ?? l.type}</TableCell>
                                                <TableCell className="hidden sm:table-cell text-xs">{areaName(l.storageAreaId)}</TableCell>
                                                <TableCell className="hidden md:table-cell text-xs">{l.email}</TableCell>
                                                <TableCell className="text-xs max-w-[280px] truncate">{l.subject}</TableCell>
                                                <TableCell>
                                                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${s.badge}`}>
                                                        {s.icon}{l.status}
                                                    </span>
                                                    {l.errorMsg && (
                                                        <div className="text-xs text-red-600 mt-1 max-w-[280px] truncate" title={l.errorMsg}>
                                                            {l.errorMsg}
                                                        </div>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
