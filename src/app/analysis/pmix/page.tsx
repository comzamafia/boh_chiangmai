"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
    ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ReferenceLine,
    ResponsiveContainer, BarChart, Bar, Cell, PieChart, Pie, Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
    Upload, Loader2, AlertTriangle, Star, TrendingDown, HelpCircle,
    Dog, ChefHat, FlameKindling, Beaker, UtensilsCrossed, Beer,
    IceCream, X, RefreshCw, BarChart3, PieChart as PieIcon,
    ClipboardList, Link2,
} from "lucide-react";
import {
    pmixApi, PmixUpload, PmixAnalytics, PmixBcgItem, BcgQuadrant,
} from "@/lib/api";

// ─── Constants ────────────────────────────────────────────────────────────────
const BCG_COLORS: Record<BcgQuadrant, string> = {
    Star:      "#22c55e",
    Plowhorse: "#f59e0b",
    Puzzle:    "#6366f1",
    Dog:       "#ef4444",
};

const BCG_ICONS: Record<BcgQuadrant, React.ReactNode> = {
    Star:      <Star className="w-4 h-4" />,
    Plowhorse: <TrendingDown className="w-4 h-4" />,
    Puzzle:    <HelpCircle className="w-4 h-4" />,
    Dog:       <Dog className="w-4 h-4" />,
};

const BCG_DESC: Record<BcgQuadrant, { label: string; action: string; bg: string }> = {
    Star:      { label: "Stars",      action: "Maintain & promote",           bg: "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300" },
    Plowhorse: { label: "Plowhorses", action: "Review BOM cost / raise price", bg: "bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300" },
    Puzzle:    { label: "Puzzles",    action: "Push marketing / promotions",   bg: "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-300" },
    Dog:       { label: "Dogs",       action: "Consider removing from menu",   bg: "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300" },
};

const STATION_ICONS: Record<string, React.ReactNode> = {
    "Wok":              <FlameKindling className="w-4 h-4" />,
    "Grill / Appetizer":<ChefHat className="w-4 h-4" />,
    "Curry":            <Beaker className="w-4 h-4" />,
    "Expo":             <UtensilsCrossed className="w-4 h-4" />,
    "Bar":              <Beer className="w-4 h-4" />,
    "Dessert":          <IceCream className="w-4 h-4" />,
    "Other":            <ChefHat className="w-4 h-4" />,
};

const STATION_COLORS: Record<string, string> = {
    "Wok":              "#f59e0b",
    "Grill / Appetizer":"#ef4444",
    "Curry":            "#6366f1",
    "Expo":             "#14b8a6",
    "Bar":              "#8b5cf6",
    "Dessert":          "#ec4899",
    "Other":            "#94a3b8",
};

const DONUT_COLORS = ["#ef4444", "#f59e0b"];

const fmt = (n: number) => n.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtQty = (n: number) => n.toLocaleString();

// ─── Custom Scatter Tooltip ───────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function BcgTooltip({ active, payload }: any) {
    if (!active || !payload?.[0]) return null;
    const d: PmixBcgItem = payload[0].payload;
    return (
        <div className="bg-popover text-popover-foreground border rounded-lg shadow-lg p-3 text-sm max-w-[220px]">
            <p className="font-semibold leading-tight mb-1">{d.itemName}</p>
            <p className="text-muted-foreground text-xs mb-2">{d.category}</p>
            <div className="flex items-center gap-2 mb-1">
                <Badge style={{ background: BCG_COLORS[d.quadrant], color: "#fff" }} className="text-[11px]">
                    {BCG_ICONS[d.quadrant]} <span className="ml-1">{d.quadrant}</span>
                </Badge>
            </div>
            <p className="text-xs">Qty sold: <strong>{fmtQty(d.qtySold)}</strong></p>
            <p className="text-xs">Avg price: <strong>${fmt(d.unitPrice)}</strong></p>
            <p className="text-xs">Net sales: <strong>${fmt(d.netSales)}</strong></p>
        </div>
    );
}

// ─── Custom Donut Tooltip ─────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DonutTooltip({ active, payload }: any) {
    if (!active || !payload?.[0]) return null;
    return (
        <div className="bg-popover text-popover-foreground border rounded-lg shadow-lg p-2 text-sm">
            <p className="font-medium">{payload[0].name}</p>
            <p>${fmt(payload[0].value)}</p>
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function PmixDashboardPage() {
    const [uploads,      setUploads]      = useState<PmixUpload[]>([]);
    const [selectedId,   setSelectedId]   = useState<string>("");
    const [analytics,    setAnalytics]    = useState<PmixAnalytics | null>(null);
    const [loading,      setLoading]      = useState(false);
    const [uploading,    setUploading]    = useState(false);
    const [error,        setError]        = useState<string | null>(null);
    const [activeTab,    setActiveTab]    = useState<"bcg" | "prep" | "qc" | "bom">("bcg");
    const [stationFilter,setStationFilter]= useState<string>("All");
    const [catFilter,    setCatFilter]    = useState<string>("All");
    const [drillItem,    setDrillItem]    = useState<PmixBcgItem | null>(null);
    const [mounted,      setMounted]      = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    useEffect(() => { setMounted(true); }, []);

    const loadUploads = useCallback(async () => {
        try {
            const list = await pmixApi.listUploads();
            setUploads(list);
            if (list.length > 0 && !selectedId) setSelectedId(list[0].id);
        } catch { /* ignore */ }
    }, [selectedId]);

    useEffect(() => { loadUploads(); }, [loadUploads]);

    const loadAnalytics = useCallback(async (id: string) => {
        if (!id) return;
        setLoading(true); setError(null);
        try {
            const data = await pmixApi.analytics(id);
            setAnalytics(data);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load analytics");
        } finally { setLoading(false); }
    }, []);

    useEffect(() => { if (selectedId) loadAnalytics(selectedId); }, [selectedId, loadAnalytics]);

    async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true); setError(null);
        try {
            const label = file.name.replace(/\.[^.]+$/, "");
            const result = await pmixApi.upload(file, label);
            await loadUploads();
            setSelectedId(result.uploadId);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Upload failed");
        } finally {
            setUploading(false);
            if (fileRef.current) fileRef.current.value = "";
        }
    }

    async function handleDelete(id: string) {
        await pmixApi.deleteUpload(id);
        setUploads(u => u.filter(x => x.id !== id));
        if (selectedId === id) {
            const remaining = uploads.filter(x => x.id !== id);
            setSelectedId(remaining[0]?.id ?? "");
            setAnalytics(null);
        }
    }

    // Derived data
    const bcgItems    = analytics?.axis1.items ?? [];
    const bcgSummary  = analytics?.axis1.summary;
    const stations    = analytics?.axis2.stations ?? [];
    const prepList    = analytics?.axis2.prepList ?? [];
    const qcData      = analytics?.axis3;
    const bomData     = analytics?.axis4;

    const allStations  = ["All", ...Array.from(new Set(bcgItems.map(i => i.station)))];
    const allCats      = ["All", ...Array.from(new Set(bcgItems.map(i => i.category)))];

    const filteredBcg = bcgItems.filter(i =>
        (stationFilter === "All" || i.station === stationFilter) &&
        (catFilter     === "All" || i.category === catFilter)
    );

    const selectedUpload = uploads.find(u => u.id === selectedId);

    if (!mounted) return null;

    return (
        <div className="space-y-6 pb-10">
            {/* ── Header ── */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                        <BarChart3 className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold">PMIX Analytics Dashboard</h1>
                        <p className="text-sm text-muted-foreground">
                            Product-mix analysis — 4 strategic axes
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    {/* Upload selector */}
                    {uploads.length > 0 && (
                        <Select value={selectedId} onValueChange={setSelectedId}>
                            <SelectTrigger className="w-60">
                                <SelectValue placeholder="Select a PMIX report…" />
                            </SelectTrigger>
                            <SelectContent>
                                {uploads.map(u => (
                                    <SelectItem key={u.id} value={u.id}>
                                        {u.periodLabel ?? u.fileName} &mdash; {u.totalItems} items
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}

                    {/* Upload new file */}
                    <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv"
                        className="hidden" onChange={handleFileUpload} />
                    <Button onClick={() => fileRef.current?.click()} disabled={uploading} className="gap-2">
                        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                        {uploading ? "Uploading…" : "Upload PMIX"}
                    </Button>

                    {selectedId && (
                        <Button variant="ghost" size="icon" onClick={() => loadAnalytics(selectedId)}>
                            <RefreshCw className="w-4 h-4" />
                        </Button>
                    )}
                </div>
            </div>

            {/* Error */}
            {error && (
                <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                    <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
                </div>
            )}

            {/* No data yet */}
            {!analytics && !loading && (
                <div className="flex flex-col items-center justify-center py-24 text-center text-muted-foreground gap-4">
                    <Upload className="w-12 h-12 opacity-30" />
                    <p className="text-lg font-medium">Upload a PMIX report to get started</p>
                    <p className="text-sm">Supports .xlsx, .xls and .csv exported from your POS</p>
                    <Button onClick={() => fileRef.current?.click()} disabled={uploading} className="gap-2 mt-2">
                        <Upload className="w-4 h-4" /> Choose File
                    </Button>
                </div>
            )}

            {loading && (
                <div className="flex justify-center py-24">
                    <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                </div>
            )}

            {analytics && !loading && (
                <>
                    {/* ── KPI Bar ── */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <Card>
                            <CardContent className="pt-4 pb-4">
                                <p className="text-xs text-muted-foreground">Period</p>
                                <p className="text-base font-semibold truncate">
                                    {selectedUpload?.periodLabel ?? selectedUpload?.fileName ?? "—"}
                                </p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="pt-4 pb-4">
                                <p className="text-xs text-muted-foreground">Menu Items</p>
                                <p className="text-2xl font-bold">{analytics.totalItems}</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="pt-4 pb-4">
                                <p className="text-xs text-muted-foreground">Total Covers</p>
                                <p className="text-2xl font-bold">{fmtQty(analytics.totalQty)}</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="pt-4 pb-4">
                                <p className="text-xs text-muted-foreground">Net Sales</p>
                                <p className="text-2xl font-bold text-green-600">${fmt(analytics.totalSales)}</p>
                            </CardContent>
                        </Card>
                    </div>

                    {/* ── Delete Upload Button ── */}
                    <div className="flex justify-end">
                        <Button variant="ghost" size="sm" className="text-destructive gap-1 text-xs"
                            onClick={() => handleDelete(selectedId)}>
                            <X className="w-3 h-3" /> Remove this report
                        </Button>
                    </div>

                    {/* ── Tab Nav ── */}
                    <div className="flex gap-1 border-b pb-0 overflow-x-auto">
                        {([
                            { key: "bcg",  label: "🟥 Menu Engineering", icon: <BarChart3 className="w-4 h-4" /> },
                            { key: "prep", label: "🟧 Kitchen Prep",     icon: <ClipboardList className="w-4 h-4" /> },
                            { key: "qc",   label: "🟨 Quality & Loss",   icon: <PieIcon className="w-4 h-4" /> },
                            { key: "bom",  label: "🟩 BOM Linkage",      icon: <Link2 className="w-4 h-4" /> },
                        ] as { key: "bcg"|"prep"|"qc"|"bom"; label: string; icon: React.ReactNode }[]).map(t => (
                            <button key={t.key}
                                onClick={() => setActiveTab(t.key)}
                                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors
                                    ${activeTab === t.key
                                        ? "border-primary text-primary"
                                        : "border-transparent text-muted-foreground hover:text-foreground"}`}
                            >
                                {t.icon} {t.label}
                            </button>
                        ))}
                    </div>

                    {/* ══ AXIS 1: BCG MATRIX ══════════════════════════════════ */}
                    {activeTab === "bcg" && (
                        <div className="space-y-6">
                            {/* BCG summary cards */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                {(["Star","Plowhorse","Puzzle","Dog"] as BcgQuadrant[]).map(q => (
                                    <div key={q} className={`rounded-lg p-4 ${BCG_DESC[q].bg}`}>
                                        <div className="flex items-center gap-2 font-semibold text-sm mb-1">
                                            {BCG_ICONS[q]} {BCG_DESC[q].label}
                                        </div>
                                        <p className="text-3xl font-bold">{bcgSummary?.[q] ?? 0}</p>
                                        <p className="text-xs mt-1 opacity-80">{BCG_DESC[q].action}</p>
                                    </div>
                                ))}
                            </div>

                            {/* Filters */}
                            <div className="flex flex-wrap gap-2 items-center">
                                <span className="text-sm text-muted-foreground">Filter:</span>
                                <Select value={stationFilter} onValueChange={setStationFilter}>
                                    <SelectTrigger className="w-44 h-8 text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {allStations.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                                <Select value={catFilter} onValueChange={setCatFilter}>
                                    <SelectTrigger className="w-44 h-8 text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {allCats.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                                <span className="text-xs text-muted-foreground ml-2">
                                    {filteredBcg.length} items — click a dot to drill down
                                </span>
                            </div>

                            {/* Scatter Chart */}
                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-base">Menu Engineering Matrix</CardTitle>
                                    <p className="text-xs text-muted-foreground">
                                        X = Qty Sold (Popularity) &bull; Y = Avg Unit Price (Profitability proxy)
                                        &bull; Crosshairs = portfolio averages
                                    </p>
                                </CardHeader>
                                <CardContent>
                                    <ResponsiveContainer width="100%" height={440}>
                                        <ScatterChart margin={{ top: 20, right: 30, bottom: 30, left: 20 }}>
                                            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                                            <XAxis
                                                type="number" dataKey="qtySold" name="Qty Sold"
                                                label={{ value: "← Qty Sold (Popularity) →", position: "insideBottom", offset: -15, fontSize: 11 }}
                                                tick={{ fontSize: 11 }}
                                            />
                                            <YAxis
                                                type="number" dataKey="unitPrice" name="Avg Price"
                                                label={{ value: "Avg Price ($)", angle: -90, position: "insideLeft", fontSize: 11 }}
                                                tick={{ fontSize: 11 }}
                                            />
                                            <ZAxis range={[60, 60]} />
                                            <Tooltip content={<BcgTooltip />} />

                                            {/* Reference lines at averages */}
                                            {bcgSummary && (
                                                <>
                                                    <ReferenceLine x={bcgSummary.avgQty}
                                                        stroke="#94a3b8" strokeDasharray="6 3"
                                                        label={{ value: "Avg Qty", position: "top", fontSize: 10, fill: "#94a3b8" }} />
                                                    <ReferenceLine y={bcgSummary.avgPrice}
                                                        stroke="#94a3b8" strokeDasharray="6 3"
                                                        label={{ value: "Avg Price", position: "right", fontSize: 10, fill: "#94a3b8" }} />
                                                </>
                                            )}

                                            {/* One Scatter series per quadrant for color */}
                                            {(["Star","Plowhorse","Puzzle","Dog"] as BcgQuadrant[]).map(q => (
                                                <Scatter
                                                    key={q}
                                                    name={q}
                                                    data={filteredBcg.filter(i => i.quadrant === q)}
                                                    fill={BCG_COLORS[q]}
                                                    opacity={0.85}
                                                    onClick={(d) => setDrillItem(d as PmixBcgItem)}
                                                    style={{ cursor: "pointer" }}
                                                />
                                            ))}
                                        </ScatterChart>
                                    </ResponsiveContainer>
                                    <div className="flex flex-wrap gap-4 justify-center mt-2">
                                        {(["Star","Plowhorse","Puzzle","Dog"] as BcgQuadrant[]).map(q => (
                                            <div key={q} className="flex items-center gap-1.5 text-xs">
                                                <span className="w-3 h-3 rounded-full inline-block" style={{ background: BCG_COLORS[q] }} />
                                                {BCG_DESC[q].label}
                                            </div>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>

                            {/* BCG Table */}
                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-base">Item Classification List</CardTitle>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <div className="overflow-x-auto">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Item</TableHead>
                                                    <TableHead>Category</TableHead>
                                                    <TableHead className="text-center">Station</TableHead>
                                                    <TableHead className="text-right">Qty Sold</TableHead>
                                                    <TableHead className="text-right">Avg Price</TableHead>
                                                    <TableHead className="text-right">Net Sales</TableHead>
                                                    <TableHead className="text-center">Quadrant</TableHead>
                                                    <TableHead className="text-center">Action</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {filteredBcg.map(item => (
                                                    <TableRow key={item.id}
                                                        className="cursor-pointer hover:bg-muted/40"
                                                        onClick={() => setDrillItem(item)}>
                                                        <TableCell className="font-medium max-w-[200px] truncate">{item.itemName}</TableCell>
                                                        <TableCell className="text-sm text-muted-foreground">{item.category}</TableCell>
                                                        <TableCell className="text-center">
                                                            <span className="flex items-center justify-center gap-1 text-xs">
                                                                {STATION_ICONS[item.station] ?? null} {item.station}
                                                            </span>
                                                        </TableCell>
                                                        <TableCell className="text-right font-mono text-sm">{fmtQty(item.qtySold)}</TableCell>
                                                        <TableCell className="text-right font-mono text-sm">${fmt(item.unitPrice)}</TableCell>
                                                        <TableCell className="text-right font-mono text-sm">${fmt(item.netSales)}</TableCell>
                                                        <TableCell className="text-center">
                                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${BCG_DESC[item.quadrant].bg}`}>
                                                                {BCG_ICONS[item.quadrant]} {item.quadrant}
                                                            </span>
                                                        </TableCell>
                                                        <TableCell className="text-center text-xs text-muted-foreground">
                                                            {BCG_DESC[item.quadrant].action}
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    )}

                    {/* ══ AXIS 2: KITCHEN PREP ═══════════════════════════════ */}
                    {activeTab === "prep" && (
                        <div className="space-y-6">
                            {/* Station overview bar chart */}
                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-base">Total Covers by Station</CardTitle>
                                    <p className="text-xs text-muted-foreground">
                                        Forecast prep volumes — click a bar for item breakdown
                                    </p>
                                </CardHeader>
                                <CardContent>
                                    <ResponsiveContainer width="100%" height={260}>
                                        <BarChart data={stations} layout="vertical"
                                            margin={{ top: 5, right: 30, left: 90, bottom: 5 }}>
                                            <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-border" />
                                            <XAxis type="number" tick={{ fontSize: 11 }} />
                                            <YAxis type="category" dataKey="station" tick={{ fontSize: 12 }} width={85} />
                                            <Tooltip
                                                formatter={(v) => [fmtQty(Number(v ?? 0)), "Covers"]}
                                                contentStyle={{ fontSize: 12 }}
                                            />
                                            <Bar dataKey="totalQty" radius={[0, 4, 4, 0]}>
                                                {stations.map(s => (
                                                    <Cell key={s.station}
                                                        fill={STATION_COLORS[s.station] ?? "#94a3b8"} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </CardContent>
                            </Card>

                            {/* Per-station item breakdowns */}
                            <div className="grid md:grid-cols-2 gap-4">
                                {stations.map(station => (
                                    <Card key={station.station}>
                                        <CardHeader className="pb-2">
                                            <CardTitle className="text-sm flex items-center gap-2">
                                                <span style={{ color: STATION_COLORS[station.station] ?? "#94a3b8" }}>
                                                    {STATION_ICONS[station.station] ?? null}
                                                </span>
                                                {station.station}
                                                <Badge variant="secondary" className="ml-auto">
                                                    {fmtQty(station.totalQty)} covers
                                                </Badge>
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent className="p-0">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>Item</TableHead>
                                                        <TableHead className="text-right">Qty</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {station.items.slice(0, 10).map((item, idx) => (
                                                        <TableRow key={idx}>
                                                            <TableCell className="text-sm py-1.5 max-w-[180px] truncate">{item.name}</TableCell>
                                                            <TableCell className="text-right font-mono text-sm py-1.5">{fmtQty(item.qty)}</TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>

                            {/* Modifier / Prep list */}
                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-base">Prep List — Modifier Aggregation</CardTitle>
                                    <p className="text-xs text-muted-foreground">
                                        Ranked by total modifier orders — use for pre-service mise en place
                                    </p>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>#</TableHead>
                                                <TableHead>Modifier Group</TableHead>
                                                <TableHead>Choice</TableHead>
                                                <TableHead className="text-right">Orders</TableHead>
                                                <TableHead>Applies To</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {prepList.map((p, i) => (
                                                <TableRow key={i}>
                                                    <TableCell className="text-muted-foreground text-sm w-8">{i+1}</TableCell>
                                                    <TableCell className="text-sm text-muted-foreground">{p.group}</TableCell>
                                                    <TableCell className="font-medium text-sm">{p.modifier}</TableCell>
                                                    <TableCell className="text-right font-mono font-semibold">{fmtQty(p.qty)}</TableCell>
                                                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                                                        {p.items.join(", ")}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>
                        </div>
                    )}

                    {/* ══ AXIS 3: QUALITY CONTROL ════════════════════════════ */}
                    {activeTab === "qc" && qcData && (
                        <div className="space-y-6">
                            {/* Summary KPIs */}
                            <div className="grid grid-cols-3 gap-4">
                                <Card>
                                    <CardContent className="pt-4 pb-4">
                                        <p className="text-xs text-muted-foreground">Total Refunds</p>
                                        <p className="text-2xl font-bold text-red-600">${fmt(qcData.totalRefunds)}</p>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardContent className="pt-4 pb-4">
                                        <p className="text-xs text-muted-foreground">Total Discounts</p>
                                        <p className="text-2xl font-bold text-amber-600">${fmt(qcData.totalDiscounts)}</p>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardContent className="pt-4 pb-4">
                                        <p className="text-xs text-muted-foreground">Total Operational Loss</p>
                                        <p className="text-2xl font-bold text-destructive">${fmt(qcData.totalLoss)}</p>
                                    </CardContent>
                                </Card>
                            </div>

                            <div className="grid md:grid-cols-2 gap-6">
                                {/* Donut Chart */}
                                <Card>
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-base">Loss Breakdown</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <ResponsiveContainer width="100%" height={260}>
                                            <PieChart>
                                                <Pie data={qcData.donutData} dataKey="value" nameKey="name"
                                                    cx="50%" cy="50%" innerRadius={70} outerRadius={110}
                                                    paddingAngle={3}>
                                                    {qcData.donutData.map((_, i) => (
                                                        <Cell key={i} fill={DONUT_COLORS[i]} />
                                                    ))}
                                                </Pie>
                                                <Tooltip content={<DonutTooltip />} />
                                                <Legend />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </CardContent>
                                </Card>

                                {/* Alerts */}
                                <Card>
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-base flex items-center gap-2">
                                            <AlertTriangle className="w-4 h-4 text-amber-500" />
                                            Quality Risk Alerts
                                            <Badge variant="destructive" className="ml-auto">{qcData.alerts.length}</Badge>
                                        </CardTitle>
                                        <p className="text-xs text-muted-foreground">
                                            Items with refund rate &gt; 5% (min 3 orders)
                                        </p>
                                    </CardHeader>
                                    <CardContent className="p-0">
                                        {qcData.alerts.length === 0 ? (
                                            <div className="text-center py-8 text-muted-foreground text-sm">
                                                ✅ No quality alerts this period
                                            </div>
                                        ) : (
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>Item</TableHead>
                                                        <TableHead className="text-right">Refund %</TableHead>
                                                        <TableHead className="text-right">Loss</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {qcData.alerts.map(a => (
                                                        <TableRow key={a.id} className="bg-red-50/50 dark:bg-red-950/20">
                                                            <TableCell className="text-sm font-medium">{a.itemName}</TableCell>
                                                            <TableCell className="text-right text-red-600 font-bold">{a.refundRate}%</TableCell>
                                                            <TableCell className="text-right text-sm">${fmt(a.totalLoss)}</TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        )}
                                    </CardContent>
                                </Card>
                            </div>

                            {/* Top 5 Refunded */}
                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-base">Top 5 Refunded Items</CardTitle>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>#</TableHead>
                                                <TableHead>Item</TableHead>
                                                <TableHead>Category</TableHead>
                                                <TableHead className="text-right">Refund Qty</TableHead>
                                                <TableHead className="text-right">Refund $</TableHead>
                                                <TableHead className="text-right">Discount $</TableHead>
                                                <TableHead className="text-right">Total Loss</TableHead>
                                                <TableHead className="text-right">Refund Rate</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {qcData.top5Refunded.map((item, i) => (
                                                <TableRow key={item.id}
                                                    className={item.alert ? "bg-red-50/50 dark:bg-red-950/20" : ""}>
                                                    <TableCell className="text-muted-foreground">{i+1}</TableCell>
                                                    <TableCell className="font-medium text-sm">{item.itemName}</TableCell>
                                                    <TableCell className="text-sm text-muted-foreground">{item.category}</TableCell>
                                                    <TableCell className="text-right">{item.refundQty}</TableCell>
                                                    <TableCell className="text-right text-red-600">${fmt(item.refundAmount)}</TableCell>
                                                    <TableCell className="text-right text-amber-600">${fmt(item.discountAmount)}</TableCell>
                                                    <TableCell className="text-right font-bold">${fmt(item.totalLoss)}</TableCell>
                                                    <TableCell className="text-right">
                                                        <Badge variant={item.alert ? "destructive" : "secondary"}>
                                                            {item.refundRate}%
                                                        </Badge>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>

                            {/* Full loss table */}
                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-base">All Items — Financial Loss Ranking</CardTitle>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <div className="overflow-x-auto max-h-80 overflow-y-auto">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Item</TableHead>
                                                    <TableHead className="text-right">Qty</TableHead>
                                                    <TableHead className="text-right">Refund $</TableHead>
                                                    <TableHead className="text-right">Discount $</TableHead>
                                                    <TableHead className="text-right">Total Loss</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {qcData.items.filter(i => i.totalLoss > 0).map(item => (
                                                    <TableRow key={item.id}>
                                                        <TableCell className="text-sm max-w-[180px] truncate">{item.itemName}</TableCell>
                                                        <TableCell className="text-right text-sm">{fmtQty(item.qtySold)}</TableCell>
                                                        <TableCell className="text-right text-red-600 text-sm">${fmt(item.refundAmount)}</TableCell>
                                                        <TableCell className="text-right text-amber-600 text-sm">${fmt(item.discountAmount)}</TableCell>
                                                        <TableCell className="text-right font-semibold text-sm">${fmt(item.totalLoss)}</TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    )}

                    {/* ══ AXIS 4: BOM LINKAGE ════════════════════════════════ */}
                    {activeTab === "bom" && bomData && (
                        <div className="space-y-6">
                            {/* Link status */}
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                <Card>
                                    <CardContent className="pt-4 pb-4">
                                        <p className="text-xs text-muted-foreground">Linked to Recipes</p>
                                        <p className="text-2xl font-bold text-green-600">{bomData.linkedCount}</p>
                                        <p className="text-xs text-muted-foreground">items auto-matched</p>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardContent className="pt-4 pb-4">
                                        <p className="text-xs text-muted-foreground">Not Linked</p>
                                        <p className="text-2xl font-bold text-muted-foreground">{bomData.unlinkedCount}</p>
                                        <p className="text-xs text-muted-foreground">no recipe match</p>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardContent className="pt-4 pb-4">
                                        <p className="text-xs text-muted-foreground">Ingredients Tracked</p>
                                        <p className="text-2xl font-bold text-blue-600">{bomData.consumption.length}</p>
                                        <p className="text-xs text-muted-foreground">unique ingredients depleted</p>
                                    </CardContent>
                                </Card>
                            </div>

                            {bomData.linkedCount === 0 ? (
                                <Card>
                                    <CardContent className="py-12 text-center text-muted-foreground">
                                        <Link2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
                                        <p className="font-medium">No recipes matched yet</p>
                                        <p className="text-sm mt-1">
                                            Make sure recipe names in your BOH system match the POS item names.
                                            Matching is automatic when names are similar.
                                        </p>
                                    </CardContent>
                                </Card>
                            ) : (
                                <>
                                    {/* Ingredient consumption bar chart */}
                                    {bomData.consumption.length > 0 && (
                                        <Card>
                                            <CardHeader className="pb-2">
                                                <CardTitle className="text-base">Estimated Ingredient Consumption</CardTitle>
                                                <p className="text-xs text-muted-foreground">
                                                    Derived from qty sold × BOM recipe ratios (linked items only)
                                                </p>
                                            </CardHeader>
                                            <CardContent>
                                                <ResponsiveContainer width="100%" height={Math.max(200, bomData.consumption.length * 28)}>
                                                    <BarChart
                                                        data={bomData.consumption.map(c => ({
                                                            name: `${c.ingredientName} (${c.unit})`,
                                                            qty:  c.totalQty,
                                                        }))}
                                                        layout="vertical"
                                                        margin={{ top: 5, right: 40, left: 140, bottom: 5 }}
                                                    >
                                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-border" />
                                                        <XAxis type="number" tick={{ fontSize: 11 }} />
                                                        <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={135} />
                                                        <Tooltip
                                                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                                            formatter={(v: any, _: any, p: any) =>
                                                                [`${Number(v ?? 0).toLocaleString(undefined, {maximumFractionDigits:2})} ${(p?.payload?.name ?? "").match(/\(([^)]+)\)/)?.[1] ?? ""}`, "Consumed"]}
                                                            contentStyle={{ fontSize: 12 }}
                                                        />
                                                        <Bar dataKey="qty" fill="#22c55e" radius={[0, 4, 4, 0]} />
                                                    </BarChart>
                                                </ResponsiveContainer>
                                            </CardContent>
                                        </Card>
                                    )}

                                    {/* Consumption table */}
                                    <Card>
                                        <CardHeader className="pb-2">
                                            <CardTitle className="text-base">Depletion Table</CardTitle>
                                        </CardHeader>
                                        <CardContent className="p-0">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>#</TableHead>
                                                        <TableHead>Ingredient</TableHead>
                                                        <TableHead>Type</TableHead>
                                                        <TableHead className="text-right">Consumed</TableHead>
                                                        <TableHead>Unit</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {bomData.consumption.map((c, i) => (
                                                        <TableRow key={c.ingredientId}>
                                                            <TableCell className="text-muted-foreground">{i+1}</TableCell>
                                                            <TableCell className="font-medium text-sm">{c.ingredientName}</TableCell>
                                                            <TableCell>
                                                                <Badge variant="outline" className="text-xs">{c.groupId}</Badge>
                                                            </TableCell>
                                                            <TableCell className="text-right font-mono font-semibold">
                                                                {c.totalQty.toLocaleString(undefined, {maximumFractionDigits: 3})}
                                                            </TableCell>
                                                            <TableCell className="text-sm text-muted-foreground">{c.unit}</TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </CardContent>
                                    </Card>

                                    {/* Linked items */}
                                    <Card>
                                        <CardHeader className="pb-2">
                                            <CardTitle className="text-base">Matched POS Items → BOH Recipes</CardTitle>
                                        </CardHeader>
                                        <CardContent className="p-0">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>POS Item Name</TableHead>
                                                        <TableHead>Category</TableHead>
                                                        <TableHead className="text-right">Qty Sold</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {bomData.linkedItems.map((item, i) => (
                                                        <TableRow key={i}>
                                                            <TableCell className="text-sm font-medium">{item.itemName}</TableCell>
                                                            <TableCell className="text-sm text-muted-foreground">{item.category}</TableCell>
                                                            <TableCell className="text-right font-mono">{fmtQty(item.qtySold)}</TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </CardContent>
                                    </Card>
                                </>
                            )}
                        </div>
                    )}
                </>
            )}

            {/* ── Drill-down Dialog ─────────────────────────────────────────── */}
            <Dialog open={!!drillItem} onOpenChange={open => { if (!open) setDrillItem(null); }}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="leading-tight">{drillItem?.itemName}</DialogTitle>
                    </DialogHeader>
                    {drillItem && (() => {
                        // Find modifiers for this item from axis2 prepList context
                        const fullItem = analytics?.axis1.items.find(i => i.id === drillItem.id);
                        const stationItems = analytics?.axis2.stations
                            .find(s => s.station === drillItem.station)?.items
                            .find(i => i.name === drillItem.itemName);
                        const mods = stationItems?.modifiers ?? [];

                        return (
                            <div className="space-y-4 mt-2">
                                <div className="grid grid-cols-2 gap-3 text-sm">
                                    <div className="bg-muted/40 rounded-lg p-3">
                                        <p className="text-xs text-muted-foreground">Category</p>
                                        <p className="font-semibold">{drillItem.category}</p>
                                    </div>
                                    <div className="bg-muted/40 rounded-lg p-3">
                                        <p className="text-xs text-muted-foreground">Station</p>
                                        <p className="font-semibold">{drillItem.station}</p>
                                    </div>
                                    <div className="bg-muted/40 rounded-lg p-3">
                                        <p className="text-xs text-muted-foreground">Qty Sold</p>
                                        <p className="font-semibold text-lg">{fmtQty(drillItem.qtySold)}</p>
                                    </div>
                                    <div className="bg-muted/40 rounded-lg p-3">
                                        <p className="text-xs text-muted-foreground">Net Sales</p>
                                        <p className="font-semibold text-lg">${fmt(drillItem.netSales)}</p>
                                    </div>
                                    <div className="bg-muted/40 rounded-lg p-3">
                                        <p className="text-xs text-muted-foreground">Avg Unit Price</p>
                                        <p className="font-semibold">${fmt(drillItem.unitPrice)}</p>
                                    </div>
                                    <div className={`rounded-lg p-3 ${BCG_DESC[drillItem.quadrant].bg}`}>
                                        <p className="text-xs opacity-70">BCG Quadrant</p>
                                        <p className="font-semibold flex items-center gap-1">
                                            {BCG_ICONS[drillItem.quadrant]} {drillItem.quadrant}
                                        </p>
                                        <p className="text-xs mt-0.5">{BCG_DESC[drillItem.quadrant].action}</p>
                                    </div>
                                </div>

                                {mods.length > 0 && (
                                    <div>
                                        <p className="text-sm font-semibold mb-2">Customer Modifier Choices</p>
                                        <div className="space-y-1">
                                            {Object.entries(
                                                mods.reduce<Record<string, typeof mods>>((acc, m) => {
                                                    if (!acc[m.group]) acc[m.group] = [];
                                                    acc[m.group].push(m);
                                                    return acc;
                                                }, {})
                                            ).map(([group, choices]) => (
                                                <div key={group} className="bg-muted/40 rounded-lg p-3">
                                                    <p className="text-xs text-muted-foreground mb-2">{group}</p>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {choices
                                                            .sort((a, b) => b.qty - a.qty)
                                                            .map(c => (
                                                                <div key={c.modifier}
                                                                    className="flex items-center gap-1.5 bg-background rounded px-2 py-1 text-xs border">
                                                                    <span className="font-medium">{c.modifier}</span>
                                                                    <Badge variant="secondary" className="text-[10px] px-1 py-0">
                                                                        {c.qty}
                                                                    </Badge>
                                                                </div>
                                                            ))}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })()}
                </DialogContent>
            </Dialog>
        </div>
    );
}
