"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
    PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
    BarChart, Bar, XAxis, YAxis, CartesianGrid,
    LineChart, Line,
} from "recharts";
import { analysisApi, RecipeCostSummary } from "@/lib/api";
import { Download, TrendingUp, TrendingDown, Loader2 } from "lucide-react";

const monthlyIngredientTrend = [
    { month: "Sep", noodles: 43, shrimp: 390, chicken: 105 },
    { month: "Oct", noodles: 44, shrimp: 405, chicken: 108 },
    { month: "Nov", noodles: 44, shrimp: 400, chicken: 110 },
    { month: "Dec", noodles: 46, shrimp: 415, chicken: 115 },
    { month: "Jan", noodles: 44, shrimp: 410, chicken: 112 },
    { month: "Feb", noodles: 45, shrimp: 420, chicken: 110 },
];
import { Button } from "@/components/ui/button";
import { useCurrency } from "@/components/currency-context";

const costBreakdownData = [
    { name: 'Ingredients', value: 65, color: '#b8860b' },
    { name: 'Labor', value: 25, color: '#d4af37' },
    { name: 'Energy/Overhead', value: 10, color: '#f3e5ab' },
];

function ChartSkeleton() {
    return <div className="h-full w-full rounded-lg bg-muted/40 animate-pulse" />;
}

export default function AnalysisDashboard() {
    const [costs, setCosts] = useState<RecipeCostSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [mounted, setMounted] = useState(false);
    const { format, symbol } = useCurrency();

    useEffect(() => { setMounted(true); }, []);
    useEffect(() => {
        analysisApi.recipeCosts().then(setCosts).finally(() => setLoading(false));
    }, []);

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

    if (loading) return <div className="flex justify-center items-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

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
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={80}
                                    outerRadius={110}
                                    paddingAngle={5}
                                    dataKey="value"
                                    label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                                >
                                    {costBreakdownData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip formatter={(value) => [`${value}%`, 'Percentage']} />
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
                                <Tooltip formatter={(value) => [format(Number(value)), 'Cost/serving']} />
                                <Bar dataKey="cost" fill="#b8860b" radius={[0, 4, 4, 0]} barSize={20} />
                            </BarChart>
                        </ResponsiveContainer>}
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Monthly Price Trends</CardTitle>
                    <CardDescription>Key ingredient price fluctuations over the last 6 months ({symbol}/kg)</CardDescription>
                </CardHeader>
                <CardContent className="h-[300px]">
                    {!mounted ? <ChartSkeleton /> : <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={monthlyIngredientTrend} margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                            <YAxis tickFormatter={(v) => format(Number(v), 0)} tick={{ fontSize: 11 }} />
                            <Tooltip formatter={(value, name) => [format(Number(value)) + "/kg", name]} />
                            <Legend />
                            <Line type="monotone" dataKey="noodles" name="Noodles" stroke="#b8860b" strokeWidth={2} dot={{ r: 4 }} />
                            <Line type="monotone" dataKey="shrimp" name="Shrimp" stroke="#e07b39" strokeWidth={2} dot={{ r: 4 }} />
                            <Line type="monotone" dataKey="chicken" name="Chicken" stroke="#4a9e6b" strokeWidth={2} dot={{ r: 4 }} />
                        </LineChart>
                    </ResponsiveContainer>}
                </CardContent>
            </Card>
        </div>
    );
}
