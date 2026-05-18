"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
    PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
    BarChart, Bar, XAxis, YAxis, CartesianGrid,
    LineChart, Line,
} from "recharts";
import {
    analysisApi, RecipeCostSummary, PriceTrendsResult, PriceVarianceAlert,
} from "@/lib/api";
import { Download, TrendingUp, TrendingDown, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useCurrency } from "@/components/currency-context";

const LINE_COLORS = ["#b8860b", "#e07b39", "#4a9e6b", "#6366f1", "#f43f5e", "#94a3b8", "#0ea5e9", "#8b5cf6"];

const costBreakdownData = [
    { name: "Ingredients",      value: 65, color: "#b8860b" },
    { name: "Labor",            value: 25, color: "#d4af37" },
    { name: "Energy/Overhead",  value: 10, color: "#f3e5ab" },
];

function ChartSkeleton() {
    return <div className="h-full w-full rounded-lg bg-muted/40 animate-pulse" />;
}

export default function AnalysisDashboard() {
    const [costs,       setCosts]       = useState<RecipeCostSummary[]>([]);
    const [trends,      setTrends]      = useState<PriceTrendsResult | null>(null);
    const [loading,     setLoading]     = useState(true);
    const [trendsLoading, setTrendsLoading] = useState(true);
    const [mounted,     setMounted]     = useState(false);
    const [trendMonths, setTrendMonths] = useState("6");
    // Which ingredients to show on the price trend chart (up to 4)
    const [selectedIngr, setSelectedIngr] = useState<string[]>([]);
    const { format, symbol } = useCurrency();

    useEffect(() => { setMounted(true); }, []);

    useEffect(() => {
        analysisApi.recipeCosts().then(setCosts).finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        setTrendsLoading(true);
        analysisApi.priceTrends(Number(trendMonths))
            .then(data => {
                setTrends(data);
                // Auto-select first 3 ingredients if none selected
                if (data.ingredientNames.length > 0) {
                    setSelectedIngr(prev =>
                        prev.length > 0 ? prev.filter(n => data.ingredientNames.includes(n)) : data.ingredientNames.slice(0, 3)
                    );
                }
            })
            .catch(() => setTrends(null))
            .finally(() => setTrendsLoading(false));
    }, [trendMonths]);

    const retailCosts = costs.filter(c => c.costPerYield > 0);
    const recipeComparisonData = retailCosts
        .map(c => ({
            name: c.name.length > 16 ? c.name.substring(0, 14) + "…" : c.name,
            cost: parseFloat(c.costPerYield.toFixed(2)),
        }))
        .sort((a, b) => b.cost - a.cost);

    const allCostValues = retailCosts.map(c => c.costPerYield);
    const avgCost = allCostValues.length ? allCostValues.reduce((a, b) => a + b, 0) / allCostValues.length : 0;
    const maxCost = allCostValues.length ? Math.max(...allCostValues) : 0;
    const minCost = allCostValues.length ? Math.min(...allCostValues) : 0;

    // Format month label "2025-09" → "Sep 25"
    function fmtMonth(m: string) {
        const [y, mo] = m.split("-");
        const d = new Date(Number(y), Number(mo) - 1, 1);
        return d.toLocaleString("default", { month: "short" }) + " " + String(y).slice(2);
    }

    const priceChartData = (trends?.monthlyTrend ?? []).map(row => ({
        ...row,
        monthLabel: fmtMonth(String(row.month)),
    }));

    const priceAlerts: PriceVarianceAlert[] = trends?.alerts ?? [];
    const ingredientNames = trends?.ingredientNames ?? [];

    if (loading) return (
        <div className="flex justify-center items-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
    );

    return (
        <div className="space-y-6 animate-in fade-in duration-500 pb-10">
            <div className="flex flex-wrap gap-3 justify-between items-start">
                <div>
                    <h2 className="text-3xl font-bold font-playfair tracking-tight text-primary">Cost Analysis</h2>
                    <p className="text-muted-foreground">Interactive charts and profit margins across your menu.</p>
                </div>
                <Button variant="outline" onClick={() => {
                    const rows = [
                        ["Recipe", "Cost per Yield"],
                        ...retailCosts.map(c => [c.name, c.costPerYield.toFixed(2)]),
                    ];
                    const csv = rows.map(r => r.join(",")).join("\n");
                    const blob = new Blob([csv], { type: "text/csv" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a"); a.href = url;
                    a.download = "cost-analysis.csv"; a.click();
                    URL.revokeObjectURL(url);
                }}>
                    <Download className="mr-2 h-4 w-4" /> Export CSV
                </Button>
            </div>

            {/* Summary stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-xl border bg-card px-5 py-4">
                    <p className="text-xs text-muted-foreground mb-1">Avg Cost / Serving</p>
                    <p className="text-2xl font-bold text-primary font-playfair">{format(avgCost)}</p>
                </div>
                <div className="rounded-xl border bg-card px-5 py-4 flex gap-3 items-center">
                    <TrendingUp className="h-6 w-6 text-red-500 opacity-70" />
                    <div>
                        <p className="text-xs text-muted-foreground mb-1">Highest Cost Recipe</p>
                        <p className="text-2xl font-bold tabular-nums">{format(maxCost)}</p>
                    </div>
                </div>
                <div className="rounded-xl border bg-card px-5 py-4 flex gap-3 items-center">
                    <TrendingDown className="h-6 w-6 text-green-500 opacity-70" />
                    <div>
                        <p className="text-xs text-muted-foreground mb-1">Lowest Cost Recipe</p>
                        <p className="text-2xl font-bold tabular-nums">{format(minCost)}</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="border-primary/20 shadow-md">
                    <CardHeader>
                        <CardTitle>Average Cost Breakdown</CardTitle>
                        <CardDescription>System-wide average cost distribution</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                        {!mounted ? <ChartSkeleton /> : <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={costBreakdownData}
                                    cx="50%" cy="50%"
                                    innerRadius={80} outerRadius={110}
                                    paddingAngle={5} dataKey="value"
                                    label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                                >
                                    {costBreakdownData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip formatter={(value) => [`${value}%`, "Percentage"]} />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Recipes by Cost per Serving</CardTitle>
                        <CardDescription>Calculated from ingredients, labor & energy</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                        {!mounted ? <ChartSkeleton /> : <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={recipeComparisonData} layout="vertical" margin={{ top: 5, right: 30, left: 60, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                <XAxis type="number" tickFormatter={(v) => format(Number(v), 0)} tick={{ fontSize: 11 }} />
                                <YAxis dataKey="name" type="category" width={130} tick={{ fontSize: 12 }} />
                                <Tooltip formatter={(value) => [format(Number(value)), "Cost/serving"]} />
                                <Bar dataKey="cost" fill="#b8860b" radius={[0, 4, 4, 0]} barSize={20} />
                            </BarChart>
                        </ResponsiveContainer>}
                    </CardContent>
                </Card>
            </div>

            {/* ── Price Alerts (Phase 4) ── */}
            {priceAlerts.length > 0 && (
                <Card className="border-yellow-400/60 bg-yellow-50/60 dark:bg-yellow-950/20">
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-yellow-800 dark:text-yellow-300">
                            <AlertTriangle className="h-5 w-5" />
                            Price Variance Alerts — {priceAlerts.length} ingredient{priceAlerts.length !== 1 ? "s" : ""} rose &gt;10%
                        </CardTitle>
                        <CardDescription>Based on your purchase history. Consider switching supplier or adjusting menu prices.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            {priceAlerts.map((a, i) => (
                                <div key={i} className="flex flex-wrap items-center gap-3 text-sm rounded-lg border bg-card px-3 py-2">
                                    <Badge variant="outline" className="bg-red-100 text-red-800 border-red-200 text-xs">
                                        +{a.changePct}%
                                    </Badge>
                                    <span className="font-medium">{a.ingredient}</span>
                                    <span className="text-muted-foreground text-xs">
                                        {format(a.prevPrice)} → {format(a.newPrice)} / unit
                                    </span>
                                    {a.supplierName && (
                                        <span className="text-muted-foreground text-xs">· {a.supplierName}</span>
                                    )}
                                    <span className="text-muted-foreground text-xs ml-auto">{a.date}</span>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* ── Monthly Price Trends (Phase 4 — real data) ── */}
            <Card>
                <CardHeader>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <CardTitle>Purchase Price Trends</CardTitle>
                            <CardDescription>
                                Unit price history from purchase records ({symbol}/unit).
                                {ingredientNames.length === 0 && !trendsLoading && " Add purchase history records to see trends."}
                            </CardDescription>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                            <Select value={trendMonths} onValueChange={setTrendMonths}>
                                <SelectTrigger className="w-32 h-8 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="3">Last 3 months</SelectItem>
                                    <SelectItem value="6">Last 6 months</SelectItem>
                                    <SelectItem value="12">Last 12 months</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Ingredient selector chips */}
                    {ingredientNames.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-2">
                            {ingredientNames.map((name, i) => (
                                <button
                                    key={name}
                                    onClick={() => setSelectedIngr(prev =>
                                        prev.includes(name)
                                            ? prev.filter(n => n !== name)
                                            : [...prev, name]
                                    )}
                                    className={`rounded-full border px-3 py-0.5 text-xs font-medium transition-colors ${
                                        selectedIngr.includes(name)
                                            ? "border-transparent text-white"
                                            : "border-border text-muted-foreground hover:border-primary/40"
                                    }`}
                                    style={selectedIngr.includes(name) ? { backgroundColor: LINE_COLORS[i % LINE_COLORS.length] } : {}}
                                >
                                    {name}
                                </button>
                            ))}
                        </div>
                    )}
                </CardHeader>
                <CardContent className="h-[300px]">
                    {!mounted || trendsLoading ? (
                        <ChartSkeleton />
                    ) : priceChartData.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                            No purchase price data available yet. Log receipts in Inventory to build history.
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={priceChartData} margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="monthLabel" tick={{ fontSize: 12 }} />
                                <YAxis tickFormatter={(v) => format(Number(v), 2)} tick={{ fontSize: 11 }} />
                                <Tooltip formatter={(value, name) => [format(Number(value)) + "/unit", String(name)]} />
                                <Legend />
                                {selectedIngr.map((name, i) => (
                                    <Line
                                        key={name}
                                        type="monotone"
                                        dataKey={name}
                                        stroke={LINE_COLORS[ingredientNames.indexOf(name) % LINE_COLORS.length]}
                                        strokeWidth={2}
                                        dot={{ r: 4 }}
                                        connectNulls
                                    />
                                ))}
                            </LineChart>
                        </ResponsiveContainer>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
