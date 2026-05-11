"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
    LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
    ResponsiveContainer, CartesianGrid, Cell,
} from "recharts";
import { salesApi, SalesSummary, SalesTrend, recipesApi, RecipeWithIngredients } from "@/lib/api";
import { useCurrency } from "@/components/currency-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    TrendingUp, TrendingDown, DollarSign, ShoppingBag,
    ChefHat, AlertTriangle, Plus, BarChart2, Utensils,
    Loader2, ArrowRight,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcCostPerYield(recipe: RecipeWithIngredients): number {
    const ing = recipe.ingredients.reduce((s, row) => {
        const i = row.ingredient;
        return s + (Number(i.purchasePrice) / Number(i.conversionRate) / (Number(i.yieldPercent) / 100)) * Number(row.quantity);
    }, 0);
    const labor = Number(recipe.laborCostPerHour) * ((recipe.prepTime + recipe.cookTime) / 60);
    return (ing + labor + Number(recipe.energyCostPerBatch)) / Number(recipe.yieldAmount);
}

function formatDate(d: string) {
    const dt = new Date(d + "T00:00:00");
    return `${dt.getDate()}/${dt.getMonth() + 1}`;
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
    title, value, sub, icon: Icon, color, trend,
}: {
    title: string; value: string; sub?: string;
    icon: React.ElementType; color?: string; trend?: "up" | "down" | "neutral";
}) {
    return (
        <Card>
            <CardContent className="pt-5 pb-4">
                <div className="flex justify-between items-start">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{title}</p>
                    <div className="p-1.5 bg-primary/10 rounded-md">
                        <Icon className="h-4 w-4 text-primary" />
                    </div>
                </div>
                <p className={`text-2xl font-bold mt-2 tabular-nums ${color ?? "text-primary"}`}>{value}</p>
                {sub && (
                    <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                        {trend === "up" && <TrendingUp className="h-3 w-3 text-green-500" />}
                        {trend === "down" && <TrendingDown className="h-3 w-3 text-red-500" />}
                        {sub}
                    </p>
                )}
            </CardContent>
        </Card>
    );
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

function RevenueTooltip({ active, payload, label, format }: {
    active?: boolean; payload?: { value: number; name: string; color: string }[]; label?: string;
    format: (n: number) => string;
}) {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-card border rounded-lg shadow-lg p-3 text-xs space-y-1">
            <p className="font-semibold text-foreground mb-1">{label}</p>
            {payload.map((p, i) => (
                <div key={i} className="flex justify-between gap-4">
                    <span style={{ color: p.color }}>{p.name}</span>
                    <span className="font-medium tabular-nums">{format(p.value)}</span>
                </div>
            ))}
        </div>
    );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function DashboardPage() {
    const { format } = useCurrency();
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    const [todaySummary, setTodaySummary] = useState<SalesSummary | null>(null);
    const [yesterdaySummary, setYesterdaySummary] = useState<SalesSummary | null>(null);
    const [trend, setTrend] = useState<SalesTrend[]>([]);
    const [recipes, setRecipes] = useState<RecipeWithIngredients[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        Promise.all([
            salesApi.summary(today),
            salesApi.summary(yesterday),
            salesApi.trend(7),
            recipesApi.list(),
        ]).then(([ts, ys, tr, recs]) => {
            setTodaySummary(ts);
            setYesterdaySummary(ys);
            setTrend(tr);
            setRecipes(recs);
        }).finally(() => setLoading(false));
    }, [today, yesterday]);

    // Recipes with no selling price set
    const missingPrice = recipes.filter(r => !r.isMainSauce && r.sellingPrice == null);

    // Revenue vs yesterday
    const revenueDiff = todaySummary && yesterdaySummary
        ? todaySummary.totalRevenue - yesterdaySummary.totalRevenue : null;

    // FC status
    const fcColor = !todaySummary || todaySummary.totalRevenue === 0 ? "text-muted-foreground"
        : todaySummary.foodCostPct <= 30 ? "text-green-600"
        : todaySummary.foodCostPct <= 40 ? "text-yellow-600"
        : "text-red-600";

    const gpColor = !todaySummary || todaySummary.totalRevenue === 0 ? "text-muted-foreground"
        : todaySummary.grossProfitPct >= 60 ? "text-green-600"
        : todaySummary.grossProfitPct >= 50 ? "text-yellow-600"
        : "text-red-600";

    const totalRecipes = recipes.length;
    const retailRecipes = recipes.filter(r => !r.isMainSauce);
    const avgCost = retailRecipes.length
        ? retailRecipes.reduce((s, r) => s + calcCostPerYield(r), 0) / retailRecipes.length : 0;

    if (loading) {
        return (
            <div className="flex justify-center items-center py-32">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-wrap justify-between items-center gap-3">
                <div>
                    <h2 className="text-3xl font-bold font-playfair tracking-tight text-primary">Dashboard</h2>
                    <p className="text-muted-foreground">
                        {new Date().toLocaleDateString("en-CA", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                    </p>
                </div>
                <Link href="/daily-sales">
                    <Button><Plus className="mr-2 h-4 w-4" /> Record Sales</Button>
                </Link>
            </div>

            {/* KPI Row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard
                    title="Today's Revenue"
                    value={todaySummary ? format(todaySummary.totalRevenue) : "–"}
                    sub={revenueDiff != null
                        ? `${revenueDiff >= 0 ? "+" : ""}${format(revenueDiff)} vs yesterday`
                        : "No data for yesterday"}
                    icon={DollarSign}
                    trend={revenueDiff != null ? (revenueDiff >= 0 ? "up" : "down") : undefined}
                />
                <KpiCard
                    title="Food Cost %"
                    value={todaySummary?.totalRevenue ? `${todaySummary.foodCostPct.toFixed(1)}%` : "–"}
                    sub={todaySummary?.totalRevenue
                        ? (todaySummary.foodCostPct <= 30 ? "✓ Excellent" : todaySummary.foodCostPct <= 40 ? "⚠ Acceptable" : "⚠ Too High!")
                        : "No sales yet"}
                    icon={TrendingUp}
                    color={fcColor}
                />
                <KpiCard
                    title="Today's Gross Profit"
                    value={todaySummary?.totalRevenue ? format(todaySummary.grossProfit) : "–"}
                    sub={todaySummary?.totalRevenue ? `${todaySummary.grossProfitPct.toFixed(1)}% margin` : undefined}
                    icon={TrendingUp}
                    color={gpColor}
                />
                <KpiCard
                    title="Items Sold"
                    value={todaySummary ? `${todaySummary.itemsSold}` : "0"}
                    sub={`${totalRecipes} recipes · avg cost ${format(avgCost)}/serving`}
                    icon={ShoppingBag}
                />
            </div>

            {/* Charts Row */}
            <div className="grid lg:grid-cols-5 gap-4">
                {/* 7-day Revenue Trend */}
                <Card className="lg:col-span-3">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">Revenue — Last 7 Days</CardTitle>
                        <CardDescription>Revenue vs Cost</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {trend.every(t => t.revenue === 0) ? (
                            <div className="h-44 flex items-center justify-center text-sm text-muted-foreground">
                                No sales data yet — <Link href="/daily-sales" className="text-primary ml-1 underline">Record Sales</Link>
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height={180}>
                                <LineChart data={trend.map(t => ({ ...t, date: formatDate(t.date) }))}>
                                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                                    <YAxis tick={{ fontSize: 11 }} width={55}
                                        tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)} />
                                    <Tooltip content={<RevenueTooltip format={format} />} />
                                    <Line type="monotone" dataKey="revenue" name="Revenue" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                                    <Line type="monotone" dataKey="cost" name="Cost" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} strokeDasharray="4 2" />
                                    <Line type="monotone" dataKey="profit" name="Gross Profit" stroke="#22c55e" strokeWidth={2} dot={false} />
                                </LineChart>
                            </ResponsiveContainer>
                        )}
                    </CardContent>
                </Card>

                {/* Top 5 Menus */}
                <Card className="lg:col-span-2">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">Top 5 Menus Today</CardTitle>
                        <CardDescription>Sorted by Revenue</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {!todaySummary?.topMenus?.length ? (
                            <div className="h-44 flex items-center justify-center text-sm text-muted-foreground text-center">
                                No sales today
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height={180}>
                                <BarChart data={todaySummary.topMenus} layout="vertical" margin={{ left: 0, right: 16 }}>
                                    <XAxis type="number" tick={{ fontSize: 10 }}
                                        tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)} />
                                    <YAxis type="category" dataKey="recipeName" tick={{ fontSize: 10 }} width={90} />
                                    <Tooltip formatter={(v: number | undefined) => v != null ? format(v) : ""} />
                                    <Bar dataKey="revenue" name="Revenue" radius={[0, 4, 4, 0]}>
                                        {todaySummary.topMenus.map((_, i) => (
                                            <Cell key={i} fill={`hsl(var(--primary) / ${1 - i * 0.15})`} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Bottom Row */}
            <div className="grid lg:grid-cols-3 gap-4">
                {/* Alerts */}
                <Card className={missingPrice.length > 0 ? "border-yellow-300 dark:border-yellow-800" : ""}>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-yellow-500" /> Action Required
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {missingPrice.length === 0 ? (
                            <p className="text-sm text-green-600">✓ All recipes have a selling price set</p>
                        ) : (
                            <>
                                <p className="text-sm text-yellow-600 font-medium">
                                    {missingPrice.length} recipe{missingPrice.length !== 1 ? "s" : ""} missing selling price (Food Cost % cannot be calculated)
                                </p>
                                <div className="space-y-1 max-h-28 overflow-y-auto">
                                    {missingPrice.slice(0, 6).map(r => (
                                        <Link key={r.id} href={`/recipes/new?id=${r.id}`}>
                                            <div className="flex items-center justify-between text-xs p-1.5 rounded hover:bg-accent cursor-pointer">
                                                <span className="truncate">{r.name}</span>
                                                <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                                            </div>
                                        </Link>
                                    ))}
                                    {missingPrice.length > 6 && (
                                        <p className="text-xs text-muted-foreground pl-1.5">+{missingPrice.length - 6} more</p>
                                    )}
                                </div>
                                <Link href="/recipes">
                                    <Button variant="outline" size="sm" className="w-full mt-1 text-xs">
                                        Manage Recipes
                                    </Button>
                                </Link>
                            </>
                        )}
                        {todaySummary && todaySummary.foodCostPct > 40 && todaySummary.totalRevenue > 0 && (
                            <div className="p-2 bg-red-50 dark:bg-red-950/30 rounded text-xs text-red-600 border border-red-200 dark:border-red-900 mt-2">
                                ⚠️ Today's Food Cost {todaySummary.foodCostPct.toFixed(1)}% exceeds 40% — review portion sizes or ingredient costs
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Quick Access */}
                <Card className="lg:col-span-2">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">Quick Access</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {[
                                { href: "/daily-sales", icon: ShoppingBag, label: "Record Sales", desc: "Daily Sales" },
                                { href: "/recipes", icon: Utensils, label: "Recipes", desc: `${totalRecipes} recipes` },
                                { href: "/recipes/new", icon: ChefHat, label: "New Recipe", desc: "Add a recipe" },
                                { href: "/analysis", icon: BarChart2, label: "Cost Analysis", desc: "Per-recipe cost" },
                                { href: "/production-planning", icon: TrendingUp, label: "Production", desc: "Production plan" },
                                { href: "/sales-simulation", icon: TrendingUp, label: "Sales Sim", desc: "Profit simulation" },
                            ].map((item, i) => (
                                <Link key={i} href={item.href}>
                                    <div className="p-3 rounded-lg border hover:border-primary/50 hover:bg-accent/50 transition-all cursor-pointer group">
                                        <item.icon className="h-5 w-5 text-primary mb-1.5 group-hover:scale-110 transition-transform" />
                                        <p className="text-sm font-medium leading-tight">{item.label}</p>
                                        <p className="text-xs text-muted-foreground">{item.desc}</p>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
