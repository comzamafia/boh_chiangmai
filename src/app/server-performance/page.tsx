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
    Trophy, Upload, Loader2, ShieldX, DollarSign, Users, Wine, FileDown, Medal, Crown, Award, CalendarDays, ChevronDown,
} from "lucide-react";
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, Legend, LabelList,
} from "recharts";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { serverPerfApi, type ServerPerfResult, type ServerPerfRow } from "@/lib/api";
import { STORE_NAME } from "@/lib/branding";

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
    const [view, setView] = useState<"score" | "upsell">("score");

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
        const pageW = doc.internal.pageSize.width, pageH = doc.internal.pageSize.height;
        const M = 32;
        const NAVY: [number, number, number] = [30, 41, 59];
        const MUTED: [number, number, number] = [120, 130, 145];
        const INK: [number, number, number] = [17, 24, 39];
        const t = data.team;

        const isUpsell = view === "upsell";
        const subtitle = isUpsell ? "Beverage / Liquor / Dessert Upsell" : "Performance Score Leaderboard";

        // ── Header band ──
        doc.setFillColor(...NAVY); doc.rect(0, 0, pageW, 66, "F");
        doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.setTextColor(255, 255, 255);
        doc.text("Server Performance Report", M, 30);
        doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(148, 197, 253);
        doc.text(subtitle.toUpperCase(), M, 45);
        doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(203, 213, 225);
        doc.text(`${from}  to  ${to}`, M, 58);
        doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(255, 255, 255);
        doc.text(STORE_NAME, pageW - M, 30, { align: "right" });
        doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(203, 213, 225);
        doc.text(`Generated ${new Date().toLocaleString("en-CA", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`, pageW - M, 48, { align: "right" });

        // ── KPI stat boxes (per view) ──
        const kpis: [string, string][] = isUpsell ? [
            ["LIQUOR + BEV %", `${t.avgDrinkPct}%`],
            ["LIQUOR %", `${t.liquorPct}%`],
            ["BEVERAGE %", `${t.beveragePct}%`],
            ["DESSERT %", `${t.dessertPct}%`],
            ["TEAM NET SALES", money0(t.netSales)],
        ] : [
            ["TEAM NET SALES", money0(t.netSales)],
            ["GUESTS SERVED", t.guests.toLocaleString()],
            ["AVG / GUEST", money(t.avgPerGuest)],
            ["DRINK MIX", `${t.avgDrinkPct}%`],
            ["SERVERS RANKED", String(t.servers)],
        ];
        const gap = 12, boxW = (pageW - M * 2 - gap * (kpis.length - 1)) / kpis.length, boxY = 84, boxH = 48;
        kpis.forEach(([label, value], i) => {
            const x = M + i * (boxW + gap);
            doc.setFillColor(248, 250, 252); doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.5);
            doc.roundedRect(x, boxY, boxW, boxH, 5, 5, "FD");
            doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...MUTED);
            doc.text(label, x + 10, boxY + 16);
            doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(...INK);
            doc.text(value, x + 10, boxY + 37);
        });

        // ── Section title + table (per view) ──
        let top = boxY + boxH + 24;
        doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(...NAVY);
        doc.text(isUpsell ? "Beverage, Liquor & Dessert — ranked by Liquor + Beverage %" : "Performance Leaderboard", M, top);
        top += 8;

        const upsellRanked = [...ranked].sort((a, b) => b.drinkPct - a.drinkPct);
        const head = isUpsell
            ? [["#", "Server", "Net Sales", "Liquor $", "Liquor %", "Bev $", "Bev %", "Liquor+Bev %", "Dessert $", "Dessert %"]]
            : [["#", "Server", "Score", "Net Sales", "Sales/hr", "Guests", "Avg/Guest", "Drink %", "Dessert /100", "Disc %"]];
        const body = isUpsell
            ? upsellRanked.map((s, i) => [String(i + 1), s.name, money(s.netSales), money0(s.alcoholSales), `${s.alcoholPct}%`, money0(s.beverageSales), `${s.beveragePct}%`, `${s.drinkPct}%`, money0(s.dessertSales), `${s.dessertPct}%`])
            : ranked.map((s, i) => [String(i + 1), s.name, s.score.toFixed(1), money(s.netSales), money(s.salesPerHour), String(s.guests), money(s.avgPerGuest), `${s.drinkPct}%`, s.dessertPer100.toFixed(0), `${s.discountPct}%`]);
        const highlight: [number, number, number] = isUpsell ? [245, 243, 255] : [254, 249, 231];
        const footer = isUpsell
            ? "% = share of each server's net sales. Ranked by Liquor + Beverage %. Station logins excluded; tips not shown."
            : "Score = Sales/hr 35% · Avg/Guest 25% · Drink% 20% · Dessert attach 12% · Discount discipline 8% (normalised across servers). Station logins excluded; tips not shown.";

        autoTable(doc, {
            startY: top,
            head, body,
            margin: { left: M, right: M, bottom: 40 },
            styles: { font: "helvetica", fontSize: 8.5, cellPadding: 5, textColor: INK, lineColor: [226, 232, 240], lineWidth: 0.5, valign: "middle" },
            headStyles: { fillColor: NAVY, textColor: 255, fontSize: 8, fontStyle: "bold", halign: "center", cellPadding: 5 },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            columnStyles: {
                0: { halign: "center", cellWidth: 26, fontStyle: "bold" },
                1: { halign: "left", fontStyle: "bold", cellWidth: 120 },
                2: isUpsell ? { halign: "right" } : { halign: "center", fontStyle: "bold", textColor: NAVY },
                3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" },
                6: { halign: "right" }, 7: isUpsell ? { halign: "right", fontStyle: "bold", textColor: NAVY } : { halign: "right" }, 8: { halign: "right" }, 9: { halign: "right" },
            },
            didParseCell: (d) => {
                if (d.section === "body" && d.row.index === 0) { d.cell.styles.fillColor = highlight; }   // top performer highlight
            },
            didDrawPage: () => {
                doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...MUTED);
                doc.text(footer, M, pageH - 18);
                doc.text(`Page ${doc.getNumberOfPages()}`, pageW - M, pageH - 18, { align: "right" });
            },
        });
        doc.save(`server-performance-${isUpsell ? "upsell" : "score"}-${from}_${to}.pdf`);
    }

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
                    {/* View toggle */}
                    <div className="flex gap-1.5">
                        {([["score", "Performance Score"], ["upsell", "Upsell % (Bev / Liquor / Dessert)"]] as [typeof view, string][]).map(([k, l]) => (
                            <button key={k} onClick={() => setView(k)}
                                className={`px-3.5 py-2 rounded-xl text-sm font-medium border whitespace-nowrap ${view === k ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground hover:text-foreground"}`}>{l}</button>
                        ))}
                    </div>

                    {view === "upsell" ? <Upsell data={data} /> : <>
                    {/* KPI row */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <Kpi label="Team Net Sales" value={money0(data.team.netSales)} icon={DollarSign} sub={`${data.team.servers} servers`} />
                        <Kpi label="Total Guests" value={data.team.guests.toLocaleString()} icon={Users} sub={`${data.team.servers} servers`} />
                        <Kpi label="Avg / Guest" value={money(data.team.avgPerGuest)} icon={Users} sub="check average" />
                        <Kpi label="Drink mix" value={`${data.team.avgDrinkPct}%`} icon={Wine} tone="violet" sub="beverage + liquor" />
                    </div>

                    {/* Leaderboard (sortable + per-column filters) */}
                    <Leaderboard rows={ranked} />

                    {/* Charts */}
                    <div className="grid gap-4 lg:grid-cols-2">
                        <ChartCard title="Performance Score">
                            <SimpleBar data={ranked.map(s => ({ name: s.name, value: s.score }))} color="#6366f1" />
                        </ChartCard>
                        <ChartCard title="Avg per Guest (upsell)">
                            <SimpleBar data={ranked.map(s => ({ name: s.name, value: s.avgPerGuest }))} color="#0ea5e9" fmt={money} />
                        </ChartCard>
                        <ChartCard title="Sales per hour (productivity)">
                            <SimpleBar data={ranked.map(s => ({ name: s.name, value: s.salesPerHour }))} color="#10b981" fmt={money} />
                        </ChartCard>
                        <ChartCard title="Category Mix (% of net sales)">
                            <ResponsiveContainer width="100%" height={Math.max(200, ranked.length * 40)}>
                                <BarChart layout="vertical" data={ranked.map(s => ({ name: s.name, Food: s.foodPct, Beverage: s.beveragePct, Liquor: s.alcoholPct, Dessert: s.dessertPct }))} stackOffset="expand" margin={{ left: 4, right: 12, top: 6, bottom: 6 }} barCategoryGap="22%">
                                    <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                                    <XAxis type="number" tickFormatter={v => `${Math.round(v * 100)}%`} tick={{ fontSize: 11, fill: "currentColor", opacity: 0.65 }} tickLine={false} axisLine={false} />
                                    <YAxis type="category" dataKey="name" width={118} tick={AXIS} tickLine={false} axisLine={false} interval={0} />
                                    <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.35 }} formatter={(v) => `${Number(v ?? 0).toFixed(1)}%`} contentStyle={TOOLTIP} itemStyle={TIP_ITEM} labelStyle={TIP_ITEM} />
                                    <Legend wrapperStyle={{ fontSize: 12, fontWeight: 600, paddingTop: 6 }} iconType="circle" />
                                    {([["Food", "#f59e0b"], ["Beverage", "#0ea5e9"], ["Liquor", "#8b5cf6"], ["Dessert", "#ec4899"]] as const).map(([k, c], idx, arr) => (
                                        <Bar key={k} dataKey={k} stackId="a" fill={c} barSize={24} radius={idx === arr.length - 1 ? [0, 6, 6, 0] : idx === 0 ? [6, 0, 0, 6] : 0} isAnimationActive={false}>
                                            <LabelList dataKey={k} position="center" formatter={(v) => { const n = Number(v ?? 0); return n >= 9 ? `${Math.round(n)}%` : ""; }} style={{ fontSize: 10.5, fontWeight: 700, fill: "#fff" }} />
                                        </Bar>
                                    ))}
                                </BarChart>
                            </ResponsiveContainer>
                        </ChartCard>
                    </div>

                    </>}

                    {servers.some(s => s.isStation) && (
                        <p className="text-[10px] text-muted-foreground">Note: station logins ({servers.filter(s => s.isStation).map(s => s.name).join(", ")}) are excluded from ranking.</p>
                    )}

                    <SpCoverage coverage={data.coverage} range={data.range} />
                </>
            )}
        </div>
    );
}

// ── Upsell view (Beverage / Liquor / Dessert %), ranked by Liquor + Beverage % ──
function Upsell({ data }: { data: ServerPerfResult }) {
    const ranked = [...data.servers].filter(s => !s.isStation && s.netSales > 0).sort((a, b) => b.drinkPct - a.drinkPct);
    const maxLB = Math.max(1, ...ranked.map(s => s.drinkPct));
    const bar = (pct: number, color: string) => (
        <div className="flex items-center gap-1.5">
            <div className="flex-1 h-2 rounded-full bg-muted/60 overflow-hidden min-w-[40px]"><div className="h-full rounded-full" style={{ width: `${Math.min(100, (pct / maxLB) * 100)}%`, background: color }} /></div>
            <span className="tabular-nums font-bold w-10 text-right">{pct}%</span>
        </div>
    );

    // Sortable + per-column numeric filters
    const COLS: (LbCol & { align: "left" | "right" })[] = [
        { key: "name",          label: "Server",         kind: "text", align: "left",  get: s => s.name,          render: s => <span className="font-semibold">{s.name}</span> },
        { key: "netSales",      label: "Net Sales",      kind: "num",  align: "right", ph: "e.g. ≥1500", tip: "Net sales in $. Type a minimum (e.g. 1500) or a range (e.g. 1000-2000).", get: s => s.netSales,      render: s => money(s.netSales) },
        { key: "alcoholSales",  label: "Liquor $",       kind: "num",  align: "right", ph: "e.g. ≥150",  tip: "Liquor sales in $. Type a minimum or a range (e.g. 100-300).", get: s => s.alcoholSales,  render: s => <span className="text-muted-foreground">{money0(s.alcoholSales)}</span> },
        { key: "alcoholPct",    label: "Liquor %",       kind: "num",  align: "right", ph: "e.g. ≥12",   tip: "Liquor as % of net sales. Type a minimum (e.g. 12) or a range (e.g. 10-20).", get: s => s.alcoholPct,    render: s => `${s.alcoholPct}%` },
        { key: "beverageSales", label: "Bev $",          kind: "num",  align: "right", ph: "e.g. ≥100",  tip: "Beverage sales in $. Type a minimum or a range.", get: s => s.beverageSales, render: s => <span className="text-muted-foreground">{money0(s.beverageSales)}</span> },
        { key: "beveragePct",   label: "Bev %",          kind: "num",  align: "right", ph: "e.g. ≥8",    tip: "Beverage as % of net sales. Type a minimum (e.g. 8) or a range.", get: s => s.beveragePct,   render: s => `${s.beveragePct}%` },
        { key: "drinkPct",      label: "Liquor + Bev %", kind: "num",  align: "left",  ph: "e.g. ≥20",   tip: "Liquor + beverage combined as % of net sales. Type a minimum (e.g. 20) or a range (e.g. 18-28).", get: s => s.drinkPct,      render: s => bar(s.drinkPct, "#8b5cf6") },
        { key: "dessertSales",  label: "Dessert $",      kind: "num",  align: "right", ph: "e.g. ≥100",  tip: "Dessert sales in $. Type a minimum or a range.", get: s => s.dessertSales,  render: s => <span className="text-muted-foreground">{money0(s.dessertSales)}</span> },
        { key: "dessertPct",    label: "Dessert %",      kind: "num",  align: "right", ph: "e.g. ≥8",    tip: "Dessert as % of net sales. Type a minimum (e.g. 8) or a range.", get: s => s.dessertPct,    render: s => <span className="font-semibold text-pink-600 dark:text-pink-400">{s.dessertPct}%</span> },
    ];

    return <UpsellTableWrap ranked={ranked} cols={COLS} data={data} />;
}

function UpsellTableWrap({ ranked, cols, data }: { ranked: ServerPerfRow[]; cols: (LbCol & { align: "left" | "right" })[]; data: ServerPerfResult }) {
    const [sortKey, setSortKey] = useState("drinkPct");
    const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
    const [filters, setFilters] = useState<Record<string, string>>({});
    const toggleSort = (key: string) => { if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortKey(key); setSortDir(key === "name" ? "asc" : "desc"); } };

    const filtered = ranked.filter(s => cols.every(c => {
        const f = filters[c.key]; if (!f) return true;
        return c.kind === "text" ? true : numMatch(Number(c.get(s)), f);
    }));
    const col = cols.find(c => c.key === sortKey)!;
    const tRows = [...filtered].sort((a, b) => {
        const av = col.get(a), bv = col.get(b);
        const cmp = col.kind === "text" ? String(av).localeCompare(String(bv)) : Number(av) - Number(bv);
        return sortDir === "asc" ? cmp : -cmp;
    });
    const isDrinkSort = sortKey === "drinkPct" && sortDir === "desc";
    const activeFilters = Object.values(filters).filter(Boolean).length;

    return (
        <div className="space-y-4">
            {/* Team summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Kpi label="Liquor + Beverage %" value={`${data.team.avgDrinkPct}%`} icon={Wine} tone="violet" sub="team average" />
                <Kpi label="Liquor %" value={`${data.team.liquorPct}%`} icon={Wine} sub={money0(data.team.netSales * data.team.liquorPct / 100)} />
                <Kpi label="Beverage %" value={`${data.team.beveragePct}%`} icon={Wine} sub="of net sales" />
                <Kpi label="Dessert %" value={`${data.team.dessertPct}%`} icon={Award} tone="emerald" sub="of net sales" />
            </div>

            <Card>
                <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                        <CardTitle className="text-sm flex items-center gap-2"><Wine className="w-4 h-4 text-violet-500" /> Beverage, Liquor &amp; Dessert <span className="text-[10px] font-normal text-muted-foreground">({tRows.length}/{ranked.length})</span></CardTitle>
                        {activeFilters > 0 && <button onClick={() => setFilters({})} className="text-[11px] text-muted-foreground hover:text-foreground underline">Clear filters ({activeFilters})</button>}
                    </div>
                    <p className="text-[10px] text-muted-foreground">% is share of each server&apos;s net sales. Click a header to sort; type in a filter box (numbers accept &ldquo;≥n&rdquo; or a range &ldquo;a-b&rdquo;).</p>
                </CardHeader>
                <CardContent className="px-2 sm:px-4">
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs" style={{ minWidth: 780 }}>
                            <thead>
                                <tr className="text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border">
                                    <th className="text-left py-2 pl-1 w-7">#</th>
                                    {cols.map(c => (
                                        <th key={c.key} onClick={() => toggleSort(c.key)} className={`py-2 px-2 cursor-pointer select-none hover:text-foreground ${c.align === "left" ? "text-left" : "text-right"} ${c.key === "drinkPct" ? "min-w-[130px]" : ""}`}>
                                            <span className="inline-flex items-center gap-0.5">{c.align === "right" && <SortCaret active={sortKey === c.key} dir={sortDir} />}{c.label}{c.align === "left" && <SortCaret active={sortKey === c.key} dir={sortDir} />}</span>
                                        </th>
                                    ))}
                                </tr>
                                <tr className="border-b border-border">
                                    <th className="pl-1" />
                                    {cols.map(c => (
                                        <th key={c.key} className="px-1 pb-2">
                                            {c.kind === "num" && <Input value={filters[c.key] ?? ""} onChange={e => setFilters(f => ({ ...f, [c.key]: e.target.value }))} placeholder={c.ph} title={c.tip} className={`h-7 text-[11px] px-2 text-right tabular-nums rounded-md ${filters[c.key] ? "border-primary/60 bg-primary/5" : ""}`} />}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/40">
                                {tRows.map((s, i) => (
                                    <tr key={s.name} className={`hover:bg-muted/20 ${isDrinkSort && i === 0 ? "bg-violet-50/50 dark:bg-violet-950/20" : ""}`}>
                                        <td className="py-1.5 pl-1 text-muted-foreground text-center">{i + 1}</td>
                                        {cols.map(c => (
                                            <td key={c.key} className={`py-1.5 px-2 tabular-nums ${c.align === "left" ? "text-left" : "text-right"} ${c.key === "name" ? "max-w-[130px] truncate" : ""}`}>{c.render(s)}</td>
                                        ))}
                                    </tr>
                                ))}
                                {tRows.length === 0 && <tr><td colSpan={cols.length + 1} className="py-8 text-center text-muted-foreground italic">No servers match the filters</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
            <UpsellCharts ranked={ranked} />
        </div>
    );
}

function UpsellCharts({ ranked }: { ranked: ServerPerfRow[] }) {
    return (
        <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Liquor + Beverage % (stacked)">
                <ResponsiveContainer width="100%" height={Math.max(200, ranked.length * 40)}>
                    <BarChart layout="vertical" data={ranked.map(s => ({ name: s.name, Liquor: s.alcoholPct, Beverage: s.beveragePct }))} margin={{ left: 4, right: 48, top: 6, bottom: 6 }} barCategoryGap="22%">
                        <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                        <XAxis type="number" tick={{ fontSize: 11, fill: "currentColor", opacity: 0.65 }} tickFormatter={v => `${v}%`} tickLine={false} axisLine={false} />
                        <YAxis type="category" dataKey="name" width={118} tick={AXIS} tickLine={false} axisLine={false} interval={0} />
                        <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.35 }} formatter={(v) => `${Number(v ?? 0).toFixed(1)}%`} contentStyle={TOOLTIP} itemStyle={TIP_ITEM} labelStyle={TIP_ITEM} />
                        <Legend wrapperStyle={{ fontSize: 12, fontWeight: 600, paddingTop: 6 }} iconType="circle" />
                        <Bar dataKey="Liquor" stackId="a" fill="#8b5cf6" barSize={22} radius={[6, 0, 0, 6]} isAnimationActive={false} />
                        <Bar dataKey="Beverage" stackId="a" fill="#0ea5e9" barSize={22} radius={[0, 6, 6, 0]} isAnimationActive={false} />
                    </BarChart>
                </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Dessert % (attach)">
                <SimpleBar data={ranked.map(s => ({ name: s.name, value: s.dessertPct })).sort((a, b) => b.value - a.value)} color="#ec4899" fmt={v => `${v}%`} />
            </ChartCard>
        </div>
    );
}

// ── Sortable + per-column-filterable leaderboard ────────────────────────────
type LbCol = { key: string; label: string; kind: "text" | "num"; ph?: string; tip?: string; get: (s: ServerPerfRow) => string | number; render: (s: ServerPerfRow) => React.ReactNode };
const LB_COLS: LbCol[] = [
    { key: "name",          label: "Server",      kind: "text", get: s => s.name,          render: s => <span className="font-semibold">{s.name}</span> },
    { key: "score",         label: "Score",       kind: "num", ph: "e.g. ≥70",    tip: "Composite score 0–100. Type a minimum (e.g. 70) or a range (e.g. 60-80).", get: s => s.score,         render: s => <span className="font-bold text-primary tabular-nums">{s.score.toFixed(1)}</span> },
    { key: "netSales",      label: "Net Sales",   kind: "num", ph: "e.g. ≥1500",  tip: "Net sales in $. Type a minimum (e.g. 1500) or a range (e.g. 1000-2000).", get: s => s.netSales,      render: s => money(s.netSales) },
    { key: "salesPerHour",  label: "Sales/hr",    kind: "num", ph: "e.g. ≥250",   tip: "Sales per hour in $. Type a minimum (e.g. 250) or a range (e.g. 200-350).", get: s => s.salesPerHour,  render: s => money(s.salesPerHour) },
    { key: "guests",        label: "Guests",      kind: "num", ph: "e.g. ≥40",    tip: "Guests served. Type a minimum (e.g. 40) or a range (e.g. 30-60).", get: s => s.guests,        render: s => s.guests },
    { key: "avgPerGuest",   label: "Avg/Guest",   kind: "num", ph: "e.g. ≥40",    tip: "Average check per guest in $. Type a minimum (e.g. 40) or a range (e.g. 38-45).", get: s => s.avgPerGuest,   render: s => money(s.avgPerGuest) },
    { key: "drinkPct",      label: "Drink %",     kind: "num", ph: "e.g. ≥20",    tip: "Beverage + liquor as % of net sales. Type a minimum (e.g. 20) or a range (e.g. 15-25).", get: s => s.drinkPct,      render: s => `${s.drinkPct}%` },
    { key: "dessertPer100", label: "Dessert/100", kind: "num", ph: "e.g. ≥30",    tip: "Desserts sold per 100 guests. Type a minimum (e.g. 30) or a range (e.g. 20-50).", get: s => s.dessertPer100, render: s => s.dessertPer100.toFixed(0) },
    { key: "discountPct",   label: "Disc %",      kind: "num", ph: "e.g. 0-2",    tip: "Discount given as % of gross sales (lower is better). Type a max via a range (e.g. 0-2).", get: s => s.discountPct,   render: s => `${s.discountPct}%` },
];

function numMatch(value: number, expr: string): boolean {
    const e = expr.trim();
    if (!e) return true;
    const m = e.match(/^(-?\d*\.?\d*)\s*-\s*(-?\d*\.?\d*)$/);
    if (m && (m[1] !== "" || m[2] !== "")) {
        const lo = m[1] === "" ? -Infinity : parseFloat(m[1]);
        const hi = m[2] === "" ? Infinity : parseFloat(m[2]);
        return value >= lo && value <= hi;
    }
    const n = parseFloat(e);
    return isNaN(n) ? true : value >= n;
}

function Leaderboard({ rows }: { rows: ServerPerfRow[] }) {
    const [sortKey, setSortKey] = useState("score");
    const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
    const [filters, setFilters] = useState<Record<string, string>>({});

    const toggleSort = (key: string) => {
        if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
        else { setSortKey(key); setSortDir(key === "name" ? "asc" : "desc"); }
    };

    const filtered = rows.filter(s => LB_COLS.every(c => {
        const f = filters[c.key]; if (!f) return true;
        return c.kind === "text" ? String(c.get(s)).toLowerCase().includes(f.toLowerCase()) : numMatch(Number(c.get(s)), f);
    }));
    const col = LB_COLS.find(c => c.key === sortKey)!;
    const sorted = [...filtered].sort((a, b) => {
        const av = col.get(a), bv = col.get(b);
        const cmp = col.kind === "text" ? String(av).localeCompare(String(bv)) : Number(av) - Number(bv);
        return sortDir === "asc" ? cmp : -cmp;
    });
    const isScoreSort = sortKey === "score" && sortDir === "desc";
    const activeFilters = Object.values(filters).filter(Boolean).length;
    const medal = (i: number) => i === 0 ? <Crown className="w-4 h-4 text-amber-500" /> : i === 1 ? <Medal className="w-4 h-4 text-slate-400" /> : <Award className="w-4 h-4 text-amber-700" />;

    return (
        <Card>
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                    <CardTitle className="text-sm flex items-center gap-2"><Trophy className="w-4 h-4 text-amber-500" /> Performance Leaderboard <span className="text-[10px] font-normal text-muted-foreground">({sorted.length}/{rows.length})</span></CardTitle>
                    {activeFilters > 0 && <button onClick={() => setFilters({})} className="text-[11px] text-muted-foreground hover:text-foreground underline">Clear filters ({activeFilters})</button>}
                </div>
                <p className="text-[10px] text-muted-foreground">Score = Sales/hr 35% · Avg/Guest 25% · Drink% 20% · Dessert attach 12% · Discount discipline 8%. Click a header to sort; type in a filter box (numbers accept “≥n” or a range “a-b”).</p>
            </CardHeader>
            <CardContent className="px-2 sm:px-4">
                <div className="overflow-x-auto">
                    <table className="w-full text-xs" style={{ minWidth: 820 }}>
                        <thead>
                            <tr className="text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border">
                                <th className="text-left py-2 pl-1 w-8">#</th>
                                {LB_COLS.map(c => (
                                    <th key={c.key} onClick={() => toggleSort(c.key)}
                                        className={`py-2 px-2 cursor-pointer select-none hover:text-foreground ${c.kind === "text" ? "text-left" : "text-right"}`}>
                                        <span className="inline-flex items-center gap-0.5">{c.kind === "num" && <SortCaret active={sortKey === c.key} dir={sortDir} />}{c.label}{c.kind === "text" && <SortCaret active={sortKey === c.key} dir={sortDir} />}</span>
                                    </th>
                                ))}
                            </tr>
                            <tr className="border-b border-border">
                                <th className="pl-1" />
                                {LB_COLS.map(c => (
                                    <th key={c.key} className="px-1 pb-2">
                                        {c.kind === "num" && (
                                            <Input value={filters[c.key] ?? ""} onChange={e => setFilters(f => ({ ...f, [c.key]: e.target.value }))}
                                                placeholder={c.ph} title={c.tip}
                                                className={`h-7 text-[11px] px-2 text-right tabular-nums rounded-md ${filters[c.key] ? "border-primary/60 bg-primary/5" : ""}`} />
                                        )}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/40">
                            {sorted.map((s, i) => (
                                <tr key={s.name} className={`hover:bg-muted/20 ${isScoreSort && i === 0 ? "bg-amber-50/50 dark:bg-amber-950/20" : ""}`}>
                                    <td className="py-1.5 pl-1">{isScoreSort && i < 3 ? medal(i) : <span className="text-muted-foreground text-xs">{i + 1}</span>}</td>
                                    {LB_COLS.map(c => (
                                        <td key={c.key} className={`py-1.5 px-2 tabular-nums ${c.kind === "text" ? "text-left max-w-[150px] truncate" : "text-right"}`}>{c.render(s)}</td>
                                    ))}
                                </tr>
                            ))}
                            {sorted.length === 0 && <tr><td colSpan={LB_COLS.length + 1} className="py-8 text-center text-muted-foreground italic">No servers match the filters</td></tr>}
                        </tbody>
                    </table>
                </div>
            </CardContent>
        </Card>
    );
}

function SortCaret({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
    return <ChevronDown className={`w-3 h-3 transition-transform ${active ? "text-foreground" : "text-muted-foreground/30"} ${active && dir === "asc" ? "rotate-180" : ""}`} />;
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

// Compact, collapsible coverage calendar — green = day has server-sales uploaded
function SpCoverage({ coverage, range }: { coverage: ServerPerfResult["coverage"]; range: { from: string; to: string } }) {
    const [open, setOpen] = useState(false);
    if (coverage.length === 0) return null;
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
                        <span className="hidden sm:flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> uploaded</span>
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
                                            return (
                                                <div key={d} title={cov ? `${cov.serverCount} servers uploaded` : "No data"}
                                                    className={`w-7 h-7 rounded-md flex flex-col items-center justify-center text-[10px] tabular-nums border
                                                        ${cov ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300" : "border-transparent text-muted-foreground/40"}`}>
                                                    {d}
                                                    {cov && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
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

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
            <CardContent>{children}</CardContent></Card>
    );
}

// `currentColor` resolves to the inherited text color (foreground) and adapts to
// dark/light — CSS variables do NOT work inside SVG presentation attributes.
const AXIS = { fontSize: 12, fontWeight: 600, fill: "currentColor" } as const;
const TOOLTIP = { borderRadius: 12, fontSize: 12, border: "1px solid var(--border)", background: "var(--popover)", color: "var(--popover-foreground)", boxShadow: "0 4px 16px rgba(0,0,0,0.18)" } as const;
const TIP_ITEM = { color: "var(--popover-foreground)" } as const;

function SimpleBar({ data, color, fmt }: { data: { name: string; value: number }[]; color: string; fmt?: (v: number) => string }) {
    const label = (v: number) => fmt ? fmt(v) : (Math.round(v * 10) / 10).toString();
    return (
        <ResponsiveContainer width="100%" height={Math.max(200, data.length * 40)}>
            <BarChart layout="vertical" data={data} margin={{ left: 4, right: 64, top: 6, bottom: 6 }} barCategoryGap="22%">
                <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={118} tickLine={false} axisLine={false} tick={AXIS} interval={0} />
                <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.35 }} formatter={(v) => [label(Number(v ?? 0)), ""]} contentStyle={TOOLTIP} itemStyle={TIP_ITEM} labelStyle={TIP_ITEM} />
                <Bar dataKey="value" radius={[0, 7, 7, 0]} barSize={22} isAnimationActive={false}>
                    {data.map((_, i) => <Cell key={i} fill={i === 0 ? "#f59e0b" : color} />)}
                    <LabelList dataKey="value" position="right" formatter={(v) => label(Number(v ?? 0))} style={{ fontSize: 12, fontWeight: 700, fill: "currentColor" }} />
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    );
}
