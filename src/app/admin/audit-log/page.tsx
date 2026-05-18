"use client";

import { useState, useEffect, useCallback } from "react";
import { auditApi, type AuditLog } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
    Select, SelectContent, SelectItem,
    SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
    Table, TableBody, TableCell, TableHead,
    TableHeader, TableRow,
} from "@/components/ui/table";
import { ScrollText, Loader2, ChevronDown, ChevronRight, Search, RefreshCw } from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────
const ACTION_COLORS: Record<string, string> = {
    CREATE:   "bg-green-500/10 text-green-700 border-green-200 dark:text-green-400 dark:border-green-800",
    UPDATE:   "bg-blue-500/10 text-blue-700 border-blue-200 dark:text-blue-400 dark:border-blue-800",
    DELETE:   "bg-red-500/10 text-red-700 border-red-200 dark:text-red-400 dark:border-red-800",
    WASTE_LOG:"bg-orange-500/10 text-orange-700 border-orange-200 dark:text-orange-400 dark:border-orange-800",
    RECEIVE:  "bg-purple-500/10 text-purple-700 border-purple-200 dark:text-purple-400 dark:border-purple-800",
    LOGIN:    "bg-gray-500/10 text-gray-700 border-gray-200 dark:text-gray-400 dark:border-gray-700",
};

const ACTIONS = ["CREATE", "UPDATE", "DELETE", "WASTE_LOG", "RECEIVE", "LOGIN"];
const TABLES  = ["Ingredient", "Recipe", "IngredientCategory", "InventoryTransaction", "User"];

// ─── Diff viewer ─────────────────────────────────────────────────────────────
function DiffView({ oldValues, newValues }: {
    oldValues?: Record<string, unknown> | null;
    newValues?: Record<string, unknown> | null;
}) {
    const keys = Array.from(new Set([
        ...Object.keys(oldValues ?? {}),
        ...Object.keys(newValues ?? {}),
    ]));
    if (keys.length === 0) return <span className="text-muted-foreground text-xs">—</span>;
    return (
        <div className="space-y-1 mt-1 text-xs font-mono">
            {keys.map(k => {
                const prev = oldValues?.[k];
                const next = newValues?.[k];
                const changed = JSON.stringify(prev) !== JSON.stringify(next);
                return (
                    <div key={k} className="flex gap-2 items-start">
                        <span className="text-muted-foreground w-28 shrink-0 truncate" title={k}>{k}</span>
                        {prev !== undefined && (
                            <span className={`px-1.5 py-0.5 rounded ${changed ? "line-through text-red-600 dark:text-red-400 bg-red-500/5" : "text-muted-foreground"}`}>
                                {String(prev)}
                            </span>
                        )}
                        {changed && next !== undefined && (
                            <span className="px-1.5 py-0.5 rounded text-green-700 dark:text-green-400 bg-green-500/5">
                                {String(next)}
                            </span>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

// ─── Row ──────────────────────────────────────────────────────────────────────
function AuditRow({ log }: { log: AuditLog }) {
    const [expanded, setExpanded] = useState(false);
    const hasDetails = log.oldValues || log.newValues;

    const dt = new Date(log.createdAt);
    const dateStr = dt.toLocaleDateString("en-CA", { month: "short", day: "numeric" });
    const timeStr = dt.toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

    return (
        <>
            <TableRow
                className={hasDetails ? "cursor-pointer hover:bg-muted/50 transition-colors" : ""}
                onClick={() => hasDetails && setExpanded(e => !e)}
            >
                <TableCell className="w-6 pl-3 pr-0">
                    {hasDetails ? (
                        expanded
                            ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                            : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : null}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    <span className="block font-medium text-foreground">{dateStr}</span>
                    {timeStr}
                </TableCell>
                <TableCell className="text-sm">
                    <span className="font-medium">{log.userName ?? "—"}</span>
                    {log.userRole && (
                        <span className="ml-1.5 text-xs text-muted-foreground">({log.userRole})</span>
                    )}
                    {log.ipAddress && (
                        <p className="text-[10px] text-muted-foreground">{log.ipAddress}</p>
                    )}
                </TableCell>
                <TableCell>
                    <Badge
                        variant="outline"
                        className={`text-[11px] font-semibold ${ACTION_COLORS[log.action] ?? ""}`}
                    >
                        {log.action}
                    </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                    {log.targetTable}
                </TableCell>
                <TableCell className="text-sm max-w-[180px] truncate" title={log.targetName ?? log.targetId}>
                    {log.targetName ?? <span className="font-mono text-xs">{log.targetId.slice(0, 8)}…</span>}
                </TableCell>
            </TableRow>

            {expanded && hasDetails && (
                <TableRow>
                    <TableCell colSpan={6} className="bg-muted/20 px-8 pb-4 pt-2">
                        <DiffView oldValues={log.oldValues} newValues={log.newValues} />
                    </TableCell>
                </TableRow>
            )}
        </>
    );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function AuditLogPage() {
    const [logs, setLogs]             = useState<AuditLog[]>([]);
    const [loading, setLoading]       = useState(true);
    const [userFilter, setUserFilter] = useState("");
    const [actionFilter, setActionFilter] = useState("all");
    const [tableFilter, setTableFilter]   = useState("all");
    const [from, setFrom]             = useState("");
    const [to, setTo]                 = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params: Parameters<typeof auditApi.list>[0] = { limit: 200 };
            if (actionFilter !== "all")  params.action      = actionFilter;
            if (tableFilter  !== "all")  params.targetTable = tableFilter;
            if (from)                    params.from        = from;
            if (to)                      params.to          = to;
            const data = await auditApi.list(params);
            setLogs(data);
        } catch {
            setLogs([]);
        }
        setLoading(false);
    }, [actionFilter, tableFilter, from, to]);

    useEffect(() => { load(); }, [load]);

    // Client-side user name filter (server doesn't support it directly)
    const filtered = userFilter
        ? logs.filter(l =>
            l.userName?.toLowerCase().includes(userFilter.toLowerCase()) ||
            l.userEmail?.toLowerCase().includes(userFilter.toLowerCase())
          )
        : logs;

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-wrap gap-3 justify-between items-start">
                <div>
                    <h2 className="text-3xl font-bold font-playfair tracking-tight text-primary flex items-center gap-3">
                        <ScrollText className="h-8 w-8" /> Audit Log
                    </h2>
                    <p className="text-muted-foreground">
                        Immutable record of every create, update, delete and stock event.
                    </p>
                </div>
                <Button variant="outline" onClick={load} disabled={loading}>
                    <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                    Refresh
                </Button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3 items-end">
                {/* User search */}
                <div className="relative min-w-[180px]">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        className="pl-8"
                        placeholder="Filter by user…"
                        value={userFilter}
                        onChange={e => setUserFilter(e.target.value)}
                    />
                </div>

                {/* Action */}
                <Select value={actionFilter} onValueChange={setActionFilter}>
                    <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Actions</SelectItem>
                        {ACTIONS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                    </SelectContent>
                </Select>

                {/* Table */}
                <Select value={tableFilter} onValueChange={setTableFilter}>
                    <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Tables</SelectItem>
                        {TABLES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                </Select>

                {/* Date range */}
                <div className="flex items-center gap-2">
                    <Input
                        type="date"
                        className="w-36"
                        value={from}
                        onChange={e => setFrom(e.target.value)}
                        placeholder="From"
                    />
                    <span className="text-muted-foreground text-sm">→</span>
                    <Input
                        type="date"
                        className="w-36"
                        value={to}
                        onChange={e => setTo(e.target.value)}
                        placeholder="To"
                    />
                </div>

                <p className="text-sm text-muted-foreground self-center">
                    {filtered.length} event{filtered.length !== 1 ? "s" : ""}
                </p>
            </div>

            {/* Table */}
            <div className="border rounded-lg overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-6 pl-3 pr-0"></TableHead>
                            <TableHead className="w-28">When</TableHead>
                            <TableHead>Who</TableHead>
                            <TableHead className="w-28">Action</TableHead>
                            <TableHead className="w-36 hidden sm:table-cell">Table</TableHead>
                            <TableHead>Record</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center py-12">
                                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                                </TableCell>
                            </TableRow>
                        ) : filtered.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                                    No audit events found.
                                </TableCell>
                            </TableRow>
                        ) : (
                            filtered.map(log => <AuditRow key={log.id} log={log} />)
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
