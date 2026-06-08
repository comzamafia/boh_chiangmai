"use client";
/**
 * /loss-management — Admin-only Loss Management dashboard.
 * Upload the nightly loss-management.csv + discounts.csv, then review
 * Complaint/Undo losses and Discount authorisation across three views.
 */
import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useAuth } from "@/components/auth-provider";
import {
    ShieldAlert, Upload, Loader2, AlertTriangle, TrendingDown, Percent, ShieldX, Flag,
    Undo2, Tag, FileDown, Mail, Settings2, Plus, Trash2, GitCompareArrows, CalendarDays, ChevronDown,
} from "lucide-react";
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
    PieChart, Pie, Legend,
} from "recharts";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { lossApi, type LossDashboard, type LossReasonRule } from "@/lib/api";

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dAgo = (n: number) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const today = () => new Date().toISOString().slice(0, 10);
type Tab = "overview" | "voids" | "complaints" | "discounts" | "correlation" | "daily";

export default function LossManagementPage() {
    const { user } = useAuth();
    const isAdmin = user?.role === "admin";

    const [from, setFrom] = useState(dAgo(30));
    const [to, setTo]     = useState(today());
    const [data, setData] = useState<LossDashboard | null>(null);
    const [loading, setLoading] = useState(true);
    const [tab, setTab]   = useState<Tab>("overview");
    const [uploading, setUploading] = useState(false);
    const [msg, setMsg]   = useState<string | null>(null);
    const [reasonOpen, setReasonOpen] = useState(false);

    const load = useCallback(async () => {
        if (!isAdmin) { setLoading(false); return; }
        setLoading(true);
        try { setData(await lossApi.dashboard(from, to)); } catch { setData(null); }
        finally { setLoading(false); }
    }, [from, to, isAdmin]);
    useEffect(() => { load(); }, [load]);

    async function handleFiles(files: FileList | null) {
        if (!files || files.length === 0) return;
        setUploading(true); setMsg(null);
        const results: string[] = [];
        try {
            for (const f of Array.from(files)) {
                const content = await f.text();
                try {
                    const r = await lossApi.upload(f.name, content);
                    results.push(`${f.name}: ${r.type} · ${r.imported} rows${r.errors?.length ? ` · ${r.errors.length} skipped` : ""}`);
                } catch (e) {
                    results.push(`${f.name}: ${e instanceof Error ? e.message : "failed"}`);
                }
            }
            setMsg(results.join("  |  "));
            await load();
        } finally { setUploading(false); }
    }

    if (!isAdmin) return (
        <div className="max-w-md mx-auto py-20 text-center space-y-3">
            <ShieldX className="w-10 h-10 mx-auto text-muted-foreground/40" />
            <p className="font-semibold">Admins only</p>
            <p className="text-sm text-muted-foreground">Loss Management is restricted to administrators.</p>
        </div>
    );

    return (
        <div className="space-y-5 max-w-6xl mx-auto pb-12">
            {/* Header */}
            <div className="flex flex-wrap justify-between items-start gap-3">
                <div>
                    <h2 className="text-3xl font-bold font-playfair tracking-tight text-primary flex items-center gap-2">
                        <ShieldAlert className="w-7 h-7" /> Loss Management
                    </h2>
                    <p className="text-muted-foreground">Complaints, Undo reconciliation &amp; discount authorisation — from nightly POS exports.</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-9 w-36" />
                    <span className="text-muted-foreground text-sm">→</span>
                    <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-9 w-36" />
                    <Button variant="outline" size="sm" className="h-9 gap-1.5" disabled={uploading}
                        onClick={() => document.getElementById("loss-file")?.click()}>
                        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Upload CSV
                    </Button>
                    <input id="loss-file" type="file" accept=".csv" multiple className="hidden"
                        onChange={e => { handleFiles(e.target.files); e.target.value = ""; }} />
                    <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => setReasonOpen(true)} title="Edit reason categories">
                        <Settings2 className="w-4 h-4" /> Reasons
                    </Button>
                </div>
            </div>
            <div className="flex gap-1.5 flex-wrap">
                {[["Today", today(), today()], ["7 days", dAgo(7), today()], ["30 days", dAgo(30), today()]].map(([lbl, f, t]) => (
                    <button key={lbl} onClick={() => { setFrom(f); setTo(t); }}
                        className="text-xs px-2.5 py-1 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-accent">{lbl}</button>
                ))}
            </div>
            {msg && <p className="text-xs text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg px-3 py-2">{msg}</p>}

            {loading ? (
                <div className="flex justify-center py-20"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>
            ) : !data || (!data.periodAlignment.hasComplaintData && !data.periodAlignment.hasDiscountData) ? (
                <Card><CardContent className="py-16 text-center text-muted-foreground text-sm">
                    No data in this range. Click <strong>Upload CSV</strong> and select your loss-management and discounts files.
                </CardContent></Card>
            ) : (
                <>
                    {/* Period alignment warning */}
                    {data.periodAlignment.discMissingForComplaintDays.length > 0 && (
                        <div className="flex items-start gap-2 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>Discount data is missing for {data.periodAlignment.discMissingForComplaintDays.length} day(s) with complaints
                                ({data.periodAlignment.discMissingForComplaintDays.slice(0, 5).join(", ")}{data.periodAlignment.discMissingForComplaintDays.length > 5 ? "…" : ""}).
                                Combined loss reflects only days where both datasets exist.</span>
                        </div>
                    )}

                    {/* KPI row */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <Kpi label="Net Loss (combined)" value={money(data.kpis.combinedNetLoss)} icon={TrendingDown} tone="rose"
                            sub={`Complaints ${money(data.kpis.netComplaintTotal)} + Discounts ${money(data.kpis.discountTotal)}`} />
                        <Kpi label="Net Complaints" value={money(data.kpis.netComplaintTotal)} icon={Undo2}
                            sub={`Gross ${money(data.kpis.grossComplaintTotal)} · Undo ${money(data.kpis.undoTotal)}`} />
                        <Kpi label="Discounts" value={money(data.kpis.discountTotal)} icon={Percent}
                            sub={`${data.discountByName.length} types`} />
                        <Kpi label="High-risk flags" value={String(data.kpis.highRiskCount)} icon={Flag} tone="amber"
                            sub={`Data issues: ${data.kpis.dataQualityIssues}`} />
                    </div>

                    {/* Tabs */}
                    <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
                        {([["overview", "Overview"], ["voids", "Voids"], ["complaints", "Complaints"], ["discounts", "Discounts"], ["correlation", "Correlation"], ["daily", "Daily Report"]] as [Tab, string][]).map(([k, l]) => (
                            <button key={k} onClick={() => setTab(k)}
                                className={`px-3.5 py-2 rounded-xl text-sm font-medium border whitespace-nowrap shrink-0 ${tab === k ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground hover:text-foreground"}`}>{l}</button>
                        ))}
                    </div>

                    {tab === "overview"    && <Overview data={data} onChanged={load} />}
                    {tab === "voids"       && <Voids data={data} />}
                    {tab === "complaints"  && <Complaints data={data} />}
                    {tab === "discounts"   && <Discounts data={data} />}
                    {tab === "correlation" && <Correlation data={data} />}
                    {tab === "daily"       && <Daily data={data} from={from} to={to} />}
                </>
            )}

            {reasonOpen && <ReasonMapDialog onClose={() => setReasonOpen(false)} onSaved={() => { setReasonOpen(false); load(); }} />}
        </div>
    );
}

function Kpi({ label, value, sub, icon: Icon, tone }: { label: string; value: string; sub?: string; icon: React.ElementType; tone?: "rose" | "amber" }) {
    const c = tone === "rose" ? "text-rose-600" : tone === "amber" ? "text-amber-600" : "text-foreground";
    return (
        <div className="rounded-xl border border-border bg-card p-3">
            <div className="flex items-center justify-between"><span className="text-[11px] text-muted-foreground">{label}</span><Icon className={`w-4 h-4 ${c}`} /></div>
            <p className={`text-xl font-bold mt-1 ${c}`}>{value}</p>
            {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
        </div>
    );
}

const PIE = ["#f43f5e", "#6366f1"];
function Overview({ data, onChanged }: { data: LossDashboard; onChanged: () => void }) {
    const [mgrOpen, setMgrOpen] = useState(false);
    const pieData = [
        { name: "Net Complaints", value: data.kpis.netComplaintTotal },
        { name: "Discounts", value: data.kpis.discountTotal },
    ].filter(d => d.value > 0);
    return (
        <div className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-2">
            <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Loss Breakdown</CardTitle></CardHeader>
                <CardContent>
                    {pieData.length === 0 ? <p className="text-sm text-muted-foreground py-8 text-center">No loss in range</p> : (
                        <ResponsiveContainer width="100%" height={220}>
                            <PieChart>
                                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={2}>
                                    {pieData.map((_, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}
                                </Pie>
                                <Tooltip formatter={(v) => money(Number(v ?? 0))} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    )}
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Data Quality</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                    <QualityRow label="Generic item entries (e.g. “food”)" n={data.kpis.genericCount} />
                    <QualityRow label="Unassigned-user entries (e.g. “Host”)" n={data.kpis.unassignedCount} />
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">Uncategorised reasons</span>
                        <div className="flex items-center gap-2">
                            <Badge variant="outline" className={data.kpis.uncategorizedCount > 0 ? "text-amber-700 border-amber-300 dark:text-amber-400" : "text-emerald-700 border-emerald-300 dark:text-emerald-400"}>{data.kpis.uncategorizedCount}</Badge>
                            <Button variant="outline" size="sm" className="h-6 px-2 text-[11px] gap-1" onClick={() => setMgrOpen(true)}>
                                <Settings2 className="w-3 h-3" /> Manage
                            </Button>
                        </div>
                    </div>
                    <QualityRow label="Bulk discounts (>10 items, same time)" n={data.kpis.bulkCount} />
                    <QualityRow label="Orphaned Undos (no matching complaint)" n={data.orphanUndos.length} />
                </CardContent>
            </Card>
        </div>

        <CoverageCalendar coverage={data.coverage} range={data.range} />

        {mgrOpen && <UncategorizedManager onClose={() => setMgrOpen(false)} onApplied={onChanged} />}
        </div>
    );
}

// ── Compact, collapsible coverage calendar (green = complete, amber = missing a file) ──
function CoverageCalendar({ coverage, range }: { coverage: LossDashboard["coverage"]; range: { from: string; to: string } }) {
    const [open, setOpen] = useState(false);
    const byDate = new Map(coverage.map(c => [c.date, c]));
    const pad = (n: number) => String(n).padStart(2, "0");
    const months: { y: number; m: number }[] = [];
    const start = new Date(range.from + "T00:00:00Z"), end = new Date(range.to + "T00:00:00Z");
    let cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    while (cur <= end && months.length < 24) { months.push({ y: cur.getUTCFullYear(), m: cur.getUTCMonth() }); cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1)); }
    const DOWS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
    const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    return (
        <Card>
            <CardContent className="p-3">
                <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between gap-2 text-xs text-muted-foreground hover:text-foreground">
                    <span className="flex items-center gap-1.5 font-medium"><CalendarDays className="w-3.5 h-3.5" /> Data coverage</span>
                    <span className="flex items-center gap-3 text-[10px]">
                        <span className="hidden sm:flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> complete</span>
                        <span className="hidden sm:flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> missing file</span>
                        <ChevronDown className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} />
                    </span>
                </button>
                {open && (
                    <div className="mt-3 flex flex-wrap gap-x-8 gap-y-4">
                        {months.map(({ y, m }) => {
                            const offset = (new Date(Date.UTC(y, m, 1)).getUTCDay() + 6) % 7;
                            const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
                            return (
                                <div key={`${y}-${m}`}>
                                    <p className="text-[11px] font-semibold mb-1.5">{MONTH[m]} {y}</p>
                                    <div className="grid grid-cols-7 gap-0.5">
                                        {DOWS.map(d => <div key={d} className="w-7 text-center text-[9px] text-muted-foreground/60">{d}</div>)}
                                        {Array.from({ length: offset }).map((_, i) => <div key={`b${i}`} className="w-7 h-7" />)}
                                        {Array.from({ length: days }).map((_, i) => {
                                            const d = i + 1;
                                            const cov = byDate.get(`${y}-${pad(m + 1)}-${pad(d)}`);
                                            const complete = cov?.hasComplaints && cov?.hasDiscounts;
                                            const partial = cov && !complete;
                                            const missing = cov ? [!cov.hasComplaints && "Complaints", !cov.hasDiscounts && "Discounts"].filter(Boolean).join(" + ") : "";
                                            const tip = complete ? "Complete — complaints + discounts" : partial ? `Missing: ${missing}` : "No data";
                                            return (
                                                <div key={d} title={tip}
                                                    className={`w-7 h-7 rounded-md flex flex-col items-center justify-center text-[10px] tabular-nums border
                                                        ${complete ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                                                          : partial ? "bg-amber-500/10 border-amber-500/40 text-amber-700 dark:text-amber-300"
                                                          : "border-transparent text-muted-foreground/40"}`}>
                                                    {d}
                                                    {cov && <span className={`w-1.5 h-1.5 rounded-full ${complete ? "bg-emerald-500" : "bg-amber-500"}`} />}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
function QualityRow({ label, n }: { label: string; n: number }) {
    return (
        <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">{label}</span>
            <Badge variant="outline" className={n > 0 ? "text-amber-700 border-amber-300 dark:text-amber-400" : "text-emerald-700 border-emerald-300 dark:text-emerald-400"}>{n}</Badge>
        </div>
    );
}

function SimpleTable({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[420px]">
                <thead><tr className="text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border">
                    {head.map((h, i) => <th key={i} className={`py-2 px-2 ${i === 0 ? "text-left pl-2" : "text-right"}`}>{h}</th>)}
                </tr></thead>
                <tbody className="divide-y divide-border/40">
                    {rows.map((r, i) => <tr key={i} className="hover:bg-muted/20">{r.map((c, j) => <td key={j} className={`py-1.5 px-2 ${j === 0 ? "text-left pl-2 font-medium" : "text-right tabular-nums"}`}>{c}</td>)}</tr>)}
                    {rows.length === 0 && <tr><td colSpan={head.length} className="py-8 text-center text-muted-foreground italic">No data</td></tr>}
                </tbody>
            </table>
        </div>
    );
}

// ── Voids view — every Complaint + Undo with its reason ──────────────────────
function Voids({ data }: { data: LossDashboard }) {
    const [q, setQ] = useState("");
    const [actionFilter, setActionFilter] = useState<"all" | "Complaint" | "Undo">("all");
    const [staff, setStaff] = useState("all");
    const k = data.kpis;
    const maxReason = Math.max(1, ...data.byReason.map(r => r.net));
    const staffOptions = [...new Set(data.voids.map(v => v.staff).filter(Boolean))].sort((a, b) => a.localeCompare(b));

    const rows = data.voids.filter(v =>
        (actionFilter === "all" || v.action === actionFilter) &&
        (staff === "all" || v.staff === staff) &&
        (!q || `${v.item} ${v.reason} ${v.staff} ${v.orderId} ${v.table}`.toLowerCase().includes(q.toLowerCase()))
    );

    return (
        <div className="space-y-4">
            {/* KPI strip */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Kpi label="Void events" value={String(k.complaintCount + k.undoCount)} icon={Undo2} sub={`${k.complaintCount} complaints · ${k.undoCount} undo`} />
                <Kpi label="Gross void $" value={money(k.grossComplaintTotal)} icon={TrendingDown} tone="rose" />
                <Kpi label="Reversed (Undo) $" value={money(k.undoTotal)} icon={Undo2} sub="returned via undo" />
                <Kpi label="Net void $" value={money(k.netComplaintTotal)} icon={TrendingDown} tone="rose" sub="after reconciliation" />
            </div>

            {/* Reasons — prominent */}
            <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Flag className="w-4 h-4 text-rose-500" /> Void Reasons</CardTitle></CardHeader>
                <CardContent className="px-2 sm:px-4 space-y-1.5">
                    {data.byReason.length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">No voids in range</p> : data.byReason.map(r => (
                        <div key={r.category} className="flex items-center gap-2 text-xs">
                            <span className="w-40 shrink-0 truncate font-medium">{r.category}</span>
                            <div className="flex-1 h-3 rounded-full bg-muted/50 overflow-hidden min-w-[40px]">
                                <div className="h-full rounded-full bg-rose-500/70" style={{ width: `${Math.max(3, (r.net / maxReason) * 100)}%` }} />
                            </div>
                            <span className="w-10 text-right text-muted-foreground tabular-nums">{r.count}×</span>
                            <span className="w-16 text-right font-semibold tabular-nums">{money(r.net)}</span>
                        </div>
                    ))}
                </CardContent>
            </Card>

            {/* Void log */}
            <Card>
                <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                        <CardTitle className="text-sm">Void Log ({rows.length})</CardTitle>
                        <div className="flex items-center gap-2">
                            <div className="flex rounded-lg border border-border overflow-hidden text-[11px]">
                                {(["all", "Complaint", "Undo"] as const).map(a => (
                                    <button key={a} onClick={() => setActionFilter(a)} className={`px-2 py-1 ${actionFilter === a ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{a === "all" ? "All" : a}</button>
                                ))}
                            </div>
                            <select value={staff} onChange={e => setStaff(e.target.value)} title="Filter by staff member"
                                className={`h-8 rounded-md border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40 ${staff !== "all" ? "border-primary/60" : "border-border"}`}>
                                <option value="all">All staff</option>
                                {staffOptions.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                            <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search item / reason…" className="h-8 w-40 text-xs" />
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="px-2 sm:px-4">
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs" style={{ minWidth: 760 }}>
                            <thead><tr className="text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border">
                                <th className="text-left py-2 pl-2">Date</th><th className="text-left py-2 px-2">Table</th><th className="text-left py-2 px-2">Order</th>
                                <th className="text-left py-2 px-2">Item</th><th className="text-center py-2 px-2">Action</th><th className="text-right py-2 px-2">Amount</th>
                                <th className="text-left py-2 px-2">Reason</th><th className="text-left py-2 px-2">Staff</th>
                            </tr></thead>
                            <tbody className="divide-y divide-border/40">
                                {rows.map((v, i) => (
                                    <tr key={i} className="hover:bg-muted/20">
                                        <td className="py-1.5 pl-2 whitespace-nowrap text-muted-foreground">{v.date}</td>
                                        <td className="py-1.5 px-2 whitespace-nowrap">{v.table} <span className="text-muted-foreground/60 text-[10px]">{v.zone}</span></td>
                                        <td className="py-1.5 px-2 tabular-nums text-muted-foreground">{v.orderId}</td>
                                        <td className="py-1.5 px-2 max-w-[200px] truncate" title={v.item}>{v.item}</td>
                                        <td className="py-1.5 px-2 text-center">
                                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${v.action === "Undo" ? "bg-slate-500/15 text-slate-600 dark:text-slate-300" : "bg-rose-500/15 text-rose-600 dark:text-rose-400"}`}>{v.action}</span>
                                        </td>
                                        <td className="py-1.5 px-2 text-right tabular-nums font-semibold">{money(v.gross)}</td>
                                        <td className="py-1.5 px-2 max-w-[160px] truncate" title={v.reason}>{v.reason || <span className="text-muted-foreground/40">—</span>} {v.reasonCategory === "Uncategorized" && v.reason && <span title="Uncategorised">⚠️</span>}</td>
                                        <td className="py-1.5 px-2 whitespace-nowrap">{v.staff}</td>
                                    </tr>
                                ))}
                                {rows.length === 0 && <tr><td colSpan={8} className="py-8 text-center text-muted-foreground italic">No matching voids</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

function Complaints({ data }: { data: LossDashboard }) {
    return (
        <div className="space-y-4">
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Loss by Reason</CardTitle></CardHeader>
                <CardContent className="px-2 sm:px-4">
                    <SimpleTable head={["Reason", "Count", "Net $"]} rows={data.byReason.map(r => [r.category, r.count, money(r.net)])} />
                </CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Top Lost Items</CardTitle></CardHeader>
                <CardContent className="px-2 sm:px-4">
                    <SimpleTable head={["Item", "Count", "Net $"]} rows={data.topItems.map(r => [
                        <span key="i" className="flex items-center gap-1">{r.isGeneric && <span title="Generic entry — re-enter the real item">⚠️</span>}{r.item}</span>, r.count, money(r.net)])} />
                </CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Staff Accountability</CardTitle></CardHeader>
                <CardContent className="px-2 sm:px-4">
                    <SimpleTable head={["Staff", "Complaints", "Gross $", "Net $", "Undo"]} rows={data.byStaff.map(r => [
                        <span key="s" className="flex items-center gap-1">{r.unassigned && <span title="Unassigned user">⛔</span>}{r.user}</span>, r.count, money(r.gross), money(r.net), r.undoCount])} />
                </CardContent></Card>
            <div className="grid gap-4 lg:grid-cols-2">
                <Card><CardHeader className="pb-2"><CardTitle className="text-sm">By Zone</CardTitle></CardHeader>
                    <CardContent className="px-2 sm:px-4"><SimpleTable head={["Zone", "Count", "Net $"]} rows={data.byZone.map(r => [r.zone, r.count, money(r.net)])} /></CardContent></Card>
                <Card><CardHeader className="pb-2"><CardTitle className="text-sm">By Device</CardTitle></CardHeader>
                    <CardContent className="px-2 sm:px-4"><SimpleTable head={["Device", "Count", "Net $"]} rows={data.byDevice.map(r => [r.device, r.count, money(r.net)])} /></CardContent></Card>
            </div>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Undo Reconciliation</CardTitle></CardHeader>
                <CardContent className="px-2 sm:px-4">
                    <SimpleTable head={["Order", "Item", "Complaint $", "Undo $", "Net $", ""]} rows={data.undoPairs.map(r => [
                        <span key="o" className="flex items-center gap-1">{r.loop && <span title="Complaint loop (>2)">🔁</span>}{r.orderId}</span>,
                        r.item, money(r.complaint), money(r.undo), money(r.net), r.reconciled ? "✓" : <span className="text-amber-600">orphan</span>])} />
                </CardContent></Card>
        </div>
    );
}

function Discounts({ data }: { data: LossDashboard }) {
    const hourly = data.hourly.map((amount, hour) => ({ hour, amount }));
    return (
        <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
                <Card><CardHeader className="pb-2"><CardTitle className="text-sm">By Category</CardTitle></CardHeader>
                    <CardContent className="px-2 sm:px-4"><SimpleTable head={["Category", "Count", "Amount"]} rows={data.discountByCategory.map(r => [r.category, r.count, money(r.amount)])} /></CardContent></Card>
                <Card><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Tag className="w-4 h-4 text-pink-500" /> Promotions</CardTitle></CardHeader>
                    <CardContent className="px-2 sm:px-4"><SimpleTable head={["Promotion", "Times", "Amount"]} rows={data.promotions.map(r => [r.name, r.count, money(r.amount)])} /></CardContent></Card>
            </div>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Discount Hourly Timeline</CardTitle><p className="text-[10px] text-muted-foreground">Red band = after-hours risk window (22:00–02:00)</p></CardHeader>
                <CardContent>
                    <ResponsiveContainer width="100%" height={180}>
                        <BarChart data={hourly}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                            <XAxis dataKey="hour" tick={{ fontSize: 10 }} />
                            <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${v}`} width={45} />
                            <Tooltip formatter={(v) => money(Number(v ?? 0))} labelFormatter={h => `${h}:00`} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                            <Bar dataKey="amount" radius={[3, 3, 0, 0]}>
                                {hourly.map((h, i) => <Cell key={i} fill={h.hour >= 22 || h.hour < 2 ? "#ef4444" : "#6366f1"} />)}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Staff Authorisation Accountability</CardTitle></CardHeader>
                <CardContent className="px-2 sm:px-4">
                    <SimpleTable head={["Authorised by", "Count", "Amount", "Types", "Risk", "MGR100"]} rows={data.staffAuth.map(r => [
                        <span key="a" className="flex items-center gap-1">{r.anon && <span title="Anonymous/generic approver">⚠️</span>}{r.authorizedBy}</span>,
                        r.count, money(r.amount), r.types, r.riskCount, r.mgr100])} />
                </CardContent></Card>
            <Card className={data.highRisk.length > 0 ? "border-rose-300 dark:border-rose-800" : ""}>
                <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Flag className="w-4 h-4 text-rose-500" /> High-Risk Discounts ({data.highRisk.length})</CardTitle></CardHeader>
                <CardContent className="px-2 sm:px-4">
                    <SimpleTable head={["Time", "Order", "Discount", "Amount", "By", "Risk"]} rows={data.highRisk.map(r => [
                        r.time ? new Date(r.time).toLocaleString("en-CA", { hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" }) : "—",
                        r.displayId, r.name, money(r.amount), r.authorizedBy, <span key="r" className="text-rose-600">{r.reason}</span>])} />
                </CardContent></Card>
        </div>
    );
}

// View 4 — Correlation
function Correlation({ data }: { data: LossDashboard }) {
    return (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><GitCompareArrows className="w-4 h-4 text-indigo-500" /> Complaint ↔ Discount Overlap ({data.correlation.length})</CardTitle>
                <p className="text-[10px] text-muted-foreground">Orders that had both a complaint and a discount the same night — a discount may be compensation for the complaint. ⚠️ = same staff on both.</p>
            </CardHeader>
            <CardContent className="px-2 sm:px-4">
                <SimpleTable head={["Date", "Table", "Order", "Reason", "Complaint $", "Discount", "Discount $", "Same staff"]}
                    rows={data.correlation.map(r => [r.date, `${r.table} (${r.zone})`, r.orderId, r.reasons, money(r.complaintAmount), r.discountTypes, money(r.discountAmount),
                        r.sameStaff ? <span key="s" className="text-amber-600">⚠️ yes</span> : "no"])} />
            </CardContent>
        </Card>
    );
}

// View 5 — Daily Report (+ PDF / Email)
function Daily({ data, from, to }: { data: LossDashboard; from: string; to: string }) {
    const [emailing, setEmailing] = useState(false);
    const [emailMsg, setEmailMsg] = useState<string | null>(null);

    function exportPdf() {
        const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
        const M = 32;
        doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.setTextColor(30, 41, 59);
        doc.text("Loss Management — Daily Report", M, 40);
        doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(120, 130, 145);
        doc.text(`${from} → ${to}   ·   Combined net loss ${money(data.kpis.combinedNetLoss)}`, M, 56);
        autoTable(doc, {
            startY: 70,
            head: [["Date", "Net Complaints", "Discounts", "Combined", "Complaints", "Discount lines", "High-risk", "Top reason", "Top staff"]],
            body: data.daily.map(d => [d.date, money(d.netComplaint), money(d.discountTotal), money(d.combined), String(d.complaintCount), String(d.discountCount), String(d.highRisk), d.topReason, d.topStaff]),
            margin: { left: M, right: M },
            styles: { font: "helvetica", fontStyle: "bold", fontSize: 8, cellPadding: 3, textColor: [17, 24, 39] },
            headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 7.5 },
            columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" } },
        });
        doc.save(`loss-daily-${from}_${to}.pdf`);
    }
    async function emailReport() {
        setEmailing(true); setEmailMsg(null);
        try { const r = await lossApi.emailReport(from, to); setEmailMsg(`Emailed to ${r.sentTo} admin(s).`); }
        catch (e) { setEmailMsg(e instanceof Error ? e.message : "Email failed"); }
        finally { setEmailing(false); }
    }
    return (
        <Card>
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                    <CardTitle className="text-sm flex items-center gap-2"><CalendarDays className="w-4 h-4 text-blue-500" /> Daily Report</CardTitle>
                    <div className="flex items-center gap-2">
                        {emailMsg && <span className="text-[11px] text-emerald-600">{emailMsg}</span>}
                        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={emailReport} disabled={emailing}>
                            {emailing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />} Email admins
                        </Button>
                        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={exportPdf}><FileDown className="w-3.5 h-3.5" /> PDF</Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="px-2 sm:px-4">
                <SimpleTable head={["Date", "Net Compl.", "Discounts", "Combined", "Compl.", "Disc.", "High-risk", "Top reason", "Top staff"]}
                    rows={data.daily.map(d => [d.date, money(d.netComplaint), money(d.discountTotal), money(d.combined), d.complaintCount, d.discountCount, d.highRisk, d.topReason, d.topStaff])} />
            </CardContent>
        </Card>
    );
}

// Editable reason map
function ReasonMapDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
    const [rows, setRows] = useState<LossReasonRule[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);

    useEffect(() => { lossApi.reasonMap().then(setRows).catch(() => setRows([])).finally(() => setLoading(false)); }, []);

    async function save() {
        setSaving(true);
        try {
            const clean = rows.filter(r => r.keyword.trim() && r.category.trim());
            const r = await lossApi.saveReasonMap(clean);
            setMsg(`Saved ${r.rules} rules · re-classified ${r.reclassified} complaints`);
            setTimeout(onSaved, 700);
        } finally { setSaving(false); }
    }

    return (
        <Dialog open onOpenChange={v => { if (!v) onClose(); }}>
            <DialogContent className="sm:max-w-lg max-h-[88dvh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2"><Settings2 className="w-4 h-4 text-primary" /> Reason Categories</DialogTitle>
                    <DialogDescription>Map raw reason text (keyword, case-insensitive) → category. Saving re-classifies all existing complaints.</DialogDescription>
                </DialogHeader>
                {loading ? <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div> : (
                    <div className="flex-1 overflow-y-auto space-y-1.5 py-1">
                        {rows.map((r, i) => (
                            <div key={i} className="flex items-center gap-1.5">
                                <Input value={r.keyword} placeholder="keyword (e.g. run out)" className="h-8 flex-1"
                                    onChange={e => setRows(a => a.map((x, j) => j === i ? { ...x, keyword: e.target.value } : x))} />
                                <span className="text-muted-foreground text-xs">→</span>
                                <Input value={r.category} placeholder="Out of Stock" className="h-8 flex-1"
                                    onChange={e => setRows(a => a.map((x, j) => j === i ? { ...x, category: e.target.value } : x))} />
                                <button onClick={() => setRows(a => a.filter((_, j) => j !== i))} className="text-muted-foreground/50 hover:text-destructive shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                            </div>
                        ))}
                        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setRows(a => [...a, { keyword: "", category: "" }])}>
                            <Plus className="w-3.5 h-3.5" /> Add rule
                        </Button>
                    </div>
                )}
                <DialogFooter className="flex-row justify-between gap-2">
                    {msg ? <span className="text-xs text-emerald-600 self-center">{msg}</span> : <span />}
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
                        <Button size="sm" onClick={save} disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />} Save &amp; re-classify</Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ── Triage uncategorised raw reasons → assign categories (batch) ──────────────
function UncategorizedManager({ onClose, onApplied }: { onClose: () => void; onApplied: () => void }) {
    const [list, setList] = useState<{ reasonRaw: string; count: number; net: number }[]>([]);
    const [cats, setCats] = useState<string[]>([]);
    const [rules, setRules] = useState<LossReasonRule[]>([]);
    const [assign, setAssign] = useState<Record<string, { category: string; keyword: string }>>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);

    const reload = useCallback(async () => {
        setLoading(true);
        try {
            const [u, rm] = await Promise.all([lossApi.uncategorized(), lossApi.reasonMap()]);
            setList(u); setRules(rm);
            setCats([...new Set(rm.map(r => r.category))].sort());
            setAssign({});
        } finally { setLoading(false); }
    }, []);
    useEffect(() => { reload(); }, [reload]);

    const setRow = (raw: string, patch: Partial<{ category: string; keyword: string }>) =>
        setAssign(a => ({ ...a, [raw]: { category: a[raw]?.category ?? "", keyword: a[raw]?.keyword ?? raw.toLowerCase(), ...patch } }));

    const queued = Object.entries(assign).filter(([, v]) => v.category.trim());

    async function apply() {
        if (queued.length === 0) return;
        setSaving(true); setMsg(null);
        try {
            const newRules: LossReasonRule[] = queued.map(([raw, v]) => ({ keyword: (v.keyword || raw).trim().toLowerCase(), category: v.category.trim() }));
            await lossApi.saveReasonMap([...newRules, ...rules]);   // new rules first → match before falling through
            setMsg(`Assigned ${queued.length} reason(s) and re-classified complaints.`);
            onApplied();
            await reload();
        } finally { setSaving(false); }
    }

    return (
        <Dialog open onOpenChange={v => { if (!v) onClose(); }}>
            <DialogContent className="sm:max-w-2xl max-h-[88dvh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-500" /> Uncategorised reasons</DialogTitle>
                    <DialogDescription>Pick a category for each raw reason text. Keyword is a case-insensitive substring — shorten it to match similar future entries. Apply re-classifies all complaints at once.</DialogDescription>
                </DialogHeader>

                {loading ? <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
                : list.length === 0 ? <div className="py-10 text-center text-sm text-muted-foreground">🎉 No uncategorised reasons — everything is mapped.</div>
                : (
                    <div className="flex-1 overflow-y-auto -mx-1 px-1">
                        <datalist id="loss-cat-options">{cats.map(c => <option key={c} value={c} />)}</datalist>
                        <div className="space-y-2">
                            {list.map(r => {
                                const row = assign[r.reasonRaw];
                                const done = row?.category.trim();
                                return (
                                    <div key={r.reasonRaw} className={`rounded-lg border p-2.5 ${done ? "border-emerald-400/50 bg-emerald-500/5" : "border-border"}`}>
                                        <div className="flex items-start justify-between gap-2 mb-1.5">
                                            <span className="text-sm font-medium break-words">&ldquo;{r.reasonRaw}&rdquo;</span>
                                            <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">{r.count}× · {money(r.net)}</span>
                                        </div>
                                        <div className="flex flex-col sm:flex-row gap-1.5">
                                            <Input list="loss-cat-options" placeholder="Category (pick or type)…" className="h-8 flex-1"
                                                value={row?.category ?? ""} onChange={e => setRow(r.reasonRaw, { category: e.target.value })} />
                                            <Input placeholder="match keyword" className="h-8 sm:w-44"
                                                value={row?.keyword ?? r.reasonRaw.toLowerCase()} onChange={e => setRow(r.reasonRaw, { keyword: e.target.value })} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                <DialogFooter className="flex-row justify-between gap-2">
                    {msg ? <span className="text-xs text-emerald-600 self-center">{msg}</span> : <span className="text-xs text-muted-foreground self-center">{queued.length} queued</span>}
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Close</Button>
                        <Button size="sm" onClick={apply} disabled={saving || queued.length === 0}>{saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />} Apply {queued.length || ""}</Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
