"use client";
/**
 * /server-performance — Admin-only executive dashboard ranking servers on a
 * multi-dimensional Performance Score from the nightly Server Sales export.
 */
import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/components/auth-provider";
import {
    Trophy, Upload, Loader2, ShieldX, DollarSign, Percent, Users, Wine, FileDown, Medal, Crown, Award,
} from "lucide-react";
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, Legend,
} from "recharts";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { serverPerfApi, type ServerPerfResult, type ServerPerfRow } from "@/lib/api";

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const money0 = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const dAgo = (n: number) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const today = () => new Date().toISOString().slice(0, 10);

export default function ServerPerformancePage() {
    const { user } = useAuth();
    const isAdmin = user?.role === "admin";

    const [from, setFrom] = useState(dAgo(7));
    const [to, setTo]     = useState(today());
    const [data, setData] = useState<ServerPerfResult | null>(null);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [msg, setMsg]   = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!isAdmin) { setLoading(false); return; }
        setLoading(true);
        try { setData(await serverPerfApi.dashboard(from, to)); } catch { setData(null); }
        finally { setLoading(false); }
    }, [from, to, isAdmin]);
    useEffect(() => { load(); }, [load]);

    async function handleFiles(files: FileList | null) {
        if (!files || files.length === 0) return;
        setUploading(true); setMsg(null);
        const out: string[] = [];
        try {
            for (const f of Array.from(files)) {
                try { const r = await serverPerfApi.upload(f.name, await f.text()); out.push(`${f.name}: ${r.date} · ${r.servers} servers`); }
                catch (e) { out.push(`${f.name}: ${e instanceof Error ? e.message : "failed"}`); }
            }
            setMsg(out.join("  |  ")); await load();
        } finally { setUploading(false); }
    }

    if (!isAdmin) return (
        <div className="max-w-md mx-auto py-20 text-center space-y-3">
            <ShieldX className="w-10 h-10 mx-auto text-muted-foreground/40" />
            <p className="font-semibold">Admins only</p>
            <p className="text-sm text-muted-foreground">Server Performance is restricted to administrators.</p>
        </div>
    );

    const servers = data?.servers ?? [];
    const ranked = servers.filter(s => !s.isStation && s.netSales > 0);

    function exportPdf() {
        if (!data) return;
        const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
        const M = 28;
        doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.setTextColor(30, 41, 59);
        doc.text("Server Performance Leaderboard", M, 38);
        doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(120, 130, 145);
        doc.text(`${from} → ${to}`, M, 53);
        autoTable(doc, {
            startY: 66,
            head: [["#", "Server", "Score", "Net Sales", "Sales/hr", "Guests", "Avg/Guest", "Tip %", "Drink %", "Dessert/100", "Disc %"]],
            body: ranked.map((s, i) => [String(i + 1), s.name, s.score.toFixed(1), money(s.netSales), money(s.salesPerHour), String(s.guests),
                money(s.avgPerGuest), `${s.tipPct}%`, `${s.drinkPct}%`, s.dessertPer100.toFixed(0), `${s.discountPct}%`]),
            margin: { left: M, right: M },
            styles: { font: "helvetica", fontStyle: "bold", fontSize: 8, cellPadding: 3, textColor: [17, 24, 39] },
            headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 7.5 },
            columnStyles: { 0: { halign: "center", cellWidth: 24 }, 3: { halign: "right" }, 4: { halign: "right" }, 6: { halign: "right" } },
        });
        doc.save(`server-performance-${from}_${to}.pdf`);
    }

    const medal = (i: number) => i === 0 ? <Crown className="w-4 h-4 text-amber-500" /> : i === 1 ? <Medal className="w-4 h-4 text-slate-400" /> : i === 2 ? <Award className="w-4 h-4 text-amber-700" /> : <span className="text-muted-foreground text-xs w-4 inline-block text-center">{i + 1}</span>;

    return (
        <div className="space-y-5 max-w-6xl mx-auto pb-12">
            {/* Header */}
            <div className="flex flex-wrap justify-between items-start gap-3">
                <div>
                    <h2 className="text-3xl font-bold font-playfair tracking-tight text-primary flex items-center gap-2">
                        <Trophy className="w-7 h-7" /> Server Performance
                    </h2>
                    <p className="text-muted-foreground">Multi-dimensional KPI scoring from nightly server-sales exports.</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-9 w-36" />
                    <span className="text-muted-foreground text-sm">→</span>
                    <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-9 w-36" />
                    <Button variant="outline" size="sm" className="h-9 gap-1.5" disabled={uploading} onClick={() => document.getElementById("sp-file")?.click()}>
                        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Upload CSV
                    </Button>
                    <input id="sp-file" type="file" accept=".csv" multiple className="hidden" onChange={e => { handleFiles(e.target.files); e.target.value = ""; }} />
                    <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={exportPdf} disabled={!data}><FileDown className="w-4 h-4" /> PDF</Button>
                </div>
            </div>
            <div className="flex gap-1.5 flex-wrap">
                {[["Today", today(), today()], ["7 days", dAgo(7), today()], ["30 days", dAgo(30), today()]].map(([lbl, f, t]) => (
                    <button key={lbl} onClick={() => { setFrom(f); setTo(t); }} className="text-xs px-2.5 py-1 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-accent">{lbl}</button>
                ))}
            </div>
            {msg && <p className="text-xs text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg px-3 py-2">{msg}</p>}

            {loading ? (
                <div className="flex justify-center py-20"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>
            ) : !data || ranked.length === 0 ? (
                <Card><CardContent className="py-16 text-center text-muted-foreground text-sm">
                    No server data in this range. Click <strong>Upload CSV</strong> and select your server-sales file.
                </CardContent></Card>
            ) : (
                <>
                    {/* KPI row */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <Kpi label="Team Net Sales" value={money0(data.team.netSales)} icon={DollarSign} sub={`${data.team.servers} servers`} />
                        <Kpi label="Total Tips" value={money0(data.team.tips)} icon={DollarSign} tone="emerald" sub={`${data.team.avgTipPct}% avg`} />
                        <Kpi label="Avg / Guest" value={money(data.team.avgPerGuest)} icon={Users} sub={`${data.team.guests.toLocaleString()} guests`} />
                        <Kpi label="Drink mix" value={`${data.team.avgDrinkPct}%`} icon={Wine} tone="violet" sub="beverage + liquor" />
                    </div>

                    {/* Leaderboard */}
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm flex items-center gap-2"><Trophy className="w-4 h-4 text-amber-500" /> Performance Leaderboard</CardTitle>
                            <p className="text-[10px] text-muted-foreground">Score = Sales/hr 30% · Avg/Guest 20% · Tip% 20% · Drink% 15% · Dessert attach 10% · Discount discipline 5% (normalised across servers)</p>
                        </CardHeader>
                        <CardContent className="px-2 sm:px-4">
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs" style={{ minWidth: 760 }}>
                                    <thead><tr className="text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border">
                                        <th className="text-left py-2 pl-1 sticky left-0 bg-card">#</th>
                                        <th className="text-left py-2 px-2 sticky left-8 bg-card">Server</th>
                                        <th className="text-right py-2 px-2">Score</th>
                                        <th className="text-right py-2 px-2">Net Sales</th>
                                        <th className="text-right py-2 px-2">Sales/hr</th>
                                        <th className="text-right py-2 px-2">Guests</th>
                                        <th className="text-right py-2 px-2">Avg/Guest</th>
                                        <th className="text-right py-2 px-2">Tip %</th>
                                        <th className="text-right py-2 px-2">Drink %</th>
                                        <th className="text-right py-2 px-2">Dessert/100</th>
                                        <th className="text-right py-2 px-2">Disc %</th>
                                    </tr></thead>
                                    <tbody className="divide-y divide-border/40">
                                        {ranked.map((s, i) => (
                                            <tr key={s.name} className={`hover:bg-muted/20 ${i === 0 ? "bg-amber-50/50 dark:bg-amber-950/20" : ""}`}>
                                                <td className="py-1.5 pl-1 sticky left-0 bg-card">{medal(i)}</td>
                                                <td className="py-1.5 px-2 font-semibold sticky left-8 bg-card max-w-[140px] truncate">{s.name}</td>
                                                <td className="py-1.5 px-2 text-right"><span className="font-bold text-primary tabular-nums">{s.score.toFixed(1)}</span></td>
                                                <td className="py-1.5 px-2 text-right tabular-nums">{money(s.netSales)}</td>
                                                <td className="py-1.5 px-2 text-right tabular-nums">{money(s.salesPerHour)}</td>
                                                <td className="py-1.5 px-2 text-right tabular-nums">{s.guests}</td>
                                                <td className="py-1.5 px-2 text-right tabular-nums">{money(s.avgPerGuest)}</td>
                                                <td className="py-1.5 px-2 text-right tabular-nums">{s.tipPct}%</td>
                                                <td className="py-1.5 px-2 text-right tabular-nums">{s.drinkPct}%</td>
                                                <td className="py-1.5 px-2 text-right tabular-nums">{s.dessertPer100.toFixed(0)}</td>
                                                <td className="py-1.5 px-2 text-right tabular-nums">{s.discountPct}%</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Charts */}
                    <div className="grid gap-4 lg:grid-cols-2">
                        <ChartCard title="Performance Score">
                            <SimpleBar data={ranked.map(s => ({ name: s.name, value: s.score }))} color="#6366f1" />
                        </ChartCard>
                        <ChartCard title="Avg per Guest (upsell)">
                            <SimpleBar data={ranked.map(s => ({ name: s.name, value: s.avgPerGuest }))} color="#0ea5e9" fmt={money} />
                        </ChartCard>
                        <ChartCard title="Tip % (service quality)">
                            <SimpleBar data={ranked.map(s => ({ name: s.name, value: s.tipPct }))} color="#10b981" fmt={v => `${v}%`} />
                        </ChartCard>
                        <ChartCard title="Category Mix (% of net sales)">
                            <ResponsiveContainer width="100%" height={Math.max(180, ranked.length * 26)}>
                                <BarChart layout="vertical" data={ranked.map(s => ({ name: s.name, Food: s.foodPct, Beverage: s.beveragePct, Liquor: s.alcoholPct, Dessert: s.dessertPct }))} stackOffset="expand">
                                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                    <XAxis type="number" tickFormatter={v => `${Math.round(v * 100)}%`} tick={{ fontSize: 9 }} />
                                    <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 9 }} />
                                    <Tooltip formatter={(v) => `${Number(v ?? 0).toFixed(1)}%`} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                                    <Legend wrapperStyle={{ fontSize: 11 }} />
                                    <Bar dataKey="Food" stackId="a" fill="#f59e0b" />
                                    <Bar dataKey="Beverage" stackId="a" fill="#0ea5e9" />
                                    <Bar dataKey="Liquor" stackId="a" fill="#8b5cf6" />
                                    <Bar dataKey="Dessert" stackId="a" fill="#ec4899" />
                                </BarChart>
                            </ResponsiveContainer>
                        </ChartCard>
                    </div>

                    {servers.some(s => s.isStation) && (
                        <p className="text-[10px] text-muted-foreground">Note: station logins ({servers.filter(s => s.isStation).map(s => s.name).join(", ")}) are excluded from ranking.</p>
                    )}
                </>
            )}
        </div>
    );
}

function Kpi({ label, value, sub, icon: Icon, tone }: { label: string; value: string; sub?: string; icon: React.ElementType; tone?: "emerald" | "violet" }) {
    const c = tone === "emerald" ? "text-emerald-600" : tone === "violet" ? "text-violet-600" : "text-foreground";
    return (
        <div className="rounded-xl border border-border bg-card p-3">
            <div className="flex items-center justify-between"><span className="text-[11px] text-muted-foreground">{label}</span><Icon className={`w-4 h-4 ${c}`} /></div>
            <p className={`text-xl font-bold mt-1 ${c}`}>{value}</p>
            {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
        </div>
    );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
            <CardContent>{children}</CardContent></Card>
    );
}

function SimpleBar({ data, color, fmt }: { data: { name: string; value: number }[]; color: string; fmt?: (v: number) => string }) {
    return (
        <ResponsiveContainer width="100%" height={Math.max(180, data.length * 26)}>
            <BarChart layout="vertical" data={data} margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 9 }} tickFormatter={v => fmt ? fmt(v) : String(v)} />
                <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 9 }} />
                <Tooltip formatter={(v) => fmt ? fmt(Number(v ?? 0)) : String(v)} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                <Bar dataKey="value" radius={[0, 3, 3, 0]}>
                    {data.map((_, i) => <Cell key={i} fill={i === 0 ? "#f59e0b" : color} />)}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    );
}
