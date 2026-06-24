"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
    LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
    ResponsiveContainer, CartesianGrid, Cell,
} from "recharts";
import { salesApi, SalesSummary, SalesTrend, recipesApi, RecipeWithIngredients } from "@/lib/api";
import { useCurrency } from "@/components/currency-context";
import { STORE_NAME, STORE_SHORT } from "@/lib/branding";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    TrendingUp, TrendingDown, DollarSign, ShoppingBag,
    ChefHat, AlertTriangle, Plus, BarChart2, Utensils,
    Loader2, ArrowRight, CalendarDays, PieChart, RefreshCw,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Get today's date in the user's LOCAL timezone as YYYY-MM-DD */
function localToday(): string {
    return new Date().toLocaleDateString("en-CA"); // "en-CA" always returns YYYY-MM-DD
}

function calcCostPerYield(recipe: RecipeWithIngredients): number {
    const ing = recipe.ingredients.reduce((s, row) => {
        const i = row.ingredient;
        return s + (Number(i.purchasePrice) / Number(i.conversionRate) / (Number(i.yieldPercent) / 100)) * Number(row.quantity);
    }, 0);
    const labor = Number(recipe.laborCostPerHour) * ((recipe.prepTime + recipe.cookTime) / 60);
    return (ing + labor + Number(recipe.energyCostPerBatch)) / Number(recipe.yieldAmount);
}

function formatDate(d: string) {
    const dt = new Date(d + "T12:00:00");
    return `${dt.getDate()}/${dt.getMonth() + 1}`;
}

function formatFull(d: string) {
    return new Date(d + "T12:00:00").toLocaleDateString("en-CA", {
        weekday: "short", year: "numeric", month: "short", day: "numeric",
    });
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
    const today = localToday();

    const [selectedDate, setSelectedDate] = useState(today);
    const [prevDate, setPrevDate] = useState(() => {
        const d = new Date(today + "T12:00:00");
        d.setDate(d.getDate() - 1);
        return d.toLocaleDateString("en-CA");
    });

    const [summary, setSummary] = useState<SalesSummary | null>(null);
    const [prevSummary, setPrevSummary] = useState<SalesSummary | null>(null);
    const [trend, setTrend] = useState<SalesTrend[]>([]);
    const [latestDate, setLatestDate] = useState<string | null>(null);
    const [recipes, setRecipes] = useState<RecipeWithIngredients[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const load = useCallback(async (date: string, showSpinner = false) => {
        if (showSpinner) setRefreshing(true);
        const prevD = new Date(date + "T12:00:00");
        prevD.setDate(prevD.getDate() - 1);
        const prev = prevD.toLocaleDateString("en-CA");
        setPrevDate(prev);

        try {
            const [s, ps, trendResp, recs] = await Promise.all([
                salesApi.summary(date),
                salesApi.summary(prev),
                salesApi.trend(7, date),
                recipesApi.list(),
            ]);
            setSummary(s);
            setPrevSummary(ps);
            setTrend(trendResp.trend);
            setLatestDate(trendResp.latestDate);
            setRecipes(recs);

            // Smart fallback: if selected date has no data but a more recent date does,
            // auto-switch once (only when user hasn't manually changed the date)
            if (date === today && s.itemsSold === 0 && trendResp.latestDate && trendResp.latestDate !== today) {
                // don't auto-switch — just show the banner so user can choose
            }
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [today]);

    useEffect(() => {
        setLoading(true);
        load(selectedDate);
    }, [selectedDate, load]);

    // When user picks a new date from input
    function handleDateChange(e: React.ChangeEvent<HTMLInputElement>) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) {
            setSelectedDate(e.target.value);
        }
    }

    function jumpToLatest() {
        if (latestDate) setSelectedDate(latestDate);
    }

    function jumpToToday() {
        setSelectedDate(today);
    }

    const isToday = selectedDate === today;
    const noDataToday = isToday && (summary?.itemsSold ?? 0) === 0;
    const hasLatest = latestDate && latestDate !== selectedDate;

    const missingPrice = recipes.filter(r => !r.isMainSauce && r.sellingPrice == null);
    const revenueDiff = summary && prevSummary
        ? summary.totalRevenue - prevSummary.totalRevenue : null;

    const fcColor = !summary || summary.totalRevenue === 0 ? "text-muted-foreground"
        : summary.foodCostPct <= 30 ? "text-green-600"
        : summary.foodCostPct <= 40 ? "text-yellow-600"
        : "text-red-600";

    const gpColor = !summary || summary.totalRevenue === 0 ? "text-muted-foreground"
        : summary.grossProfitPct >= 60 ? "text-green-600"
        : summary.grossProfitPct >= 50 ? "text-yellow-600"
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
            <div className="flex flex-wrap justify-between items-start gap-3">
                <div>
                    <h2 className="text-3xl font-bold font-playfair tracking-tight text-primary">Dashboard</h2>
                    <p className="text-sm font-medium text-primary/80">{STORE_NAME}</p>
                    <p className="text-muted-foreground">
                        {isToday
                            ? new Date().toLocaleDateString("en-CA", { weekday: "long", year: "numeric", month: "long", day: "numeric" })
                            : formatFull(selectedDate)}
                    </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    {/* Date picker */}
                    <div className="flex items-center gap-1.5 border rounded-md px-2 py-1 bg-background">
                        <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
                        <Input
                            type="date"
                            value={selectedDate}
                            max={today}
                            onChange={handleDateChange}
                            className="border-0 p-0 h-auto text-sm w-36 focus-visible:ring-0 bg-transparent"
                        />
                    </div>
                    {!isToday && (
                        <Button variant="outline" size="sm" onClick={jumpToToday} className="text-xs">
                            Today
                        </Button>
                    )}
                    <Button
                        variant="ghost" size="sm"
                        onClick={() => load(selectedDate, true)}
                        disabled={refreshing}
                        className="text-xs"
                    >
                        <RefreshCw className={`h-3.5 w-3.5 mr-1 ${refreshing ? "animate-spin" : ""}`} />
                        Refresh
                    </Button>
                    <Link href="/daily-sales">
                        <Button size="sm"><Plus className="mr-2 h-4 w-4" /> Record Sales</Button>
                    </Link>
                </div>
            </div>

            {/* Smart Fallback Banner */}
            {noDataToday && hasLatest && (
                <div className="flex items-center justify-between gap-3 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-sm">
                    <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                        <span className="text-amber-700 dark:text-amber-300">
                            No sales recorded for today. Latest data available: <strong>{formatFull(latestDate!)}</strong>
                        </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <Button variant="outline" size="sm" className="text-xs border-amber-300" onClick={jumpToLatest}>
                            View {latestDate}
                        </Button>
                        <Link href="/analysis/pmix">
                            <Button size="sm" className="text-xs bg-amber-600 hover:bg-amber-700">
                                <PieChart className="h-3.5 w-3.5 mr-1" /> PMIX Sync
                            </Button>
                        </Link>
                    </div>
                </div>
            )}

            {/* Non-today indicator */}
            {!isToday && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/40 px-3 py-1.5 rounded-md">
                    <CalendarDays className="h-4 w-4" />
                    Showing data for <strong className="text-foreground ml-1">{formatFull(selectedDate)}</strong>
                    <Button variant="link" size="sm" className="text-xs h-auto p-0 ml-2" onClick={jumpToToday}>
                        ← Back to today
                    </Button>
                </div>
            )}

            {/* KPI Row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard
                    title={isToday ? "Today's Revenue" : "Revenue"}
                    value={summary ? format(summary.totalRevenue) : "–"}
                    sub={revenueDiff != null
                        ? `${revenueDiff >= 0 ? "+" : ""}${format(revenueDiff)} vs prev day`
                        : "No data for previous day"}
                    icon={DollarSign}
                    trend={revenueDiff != null ? (revenueDiff >= 0 ? "up" : "down") : undefined}
                />
                <KpiCard
                    title="Food Cost %"
                    value={summary?.totalRevenue ? `${summary.foodCostPct.toFixed(1)}%` : "–"}
                    sub={summary?.totalRevenue
                        ? (summary.foodCostPct <= 30 ? "✓ Excellent" : summary.foodCostPct <= 40 ? "⚠ Acceptable" : "⚠ Too High!")
                        : "No sales yet"}
                    icon={TrendingUp}
                    color={fcColor}
                />
                <KpiCard
                    title="Gross Profit"
                    value={summary?.totalRevenue ? format(summary.grossProfit) : "–"}
                    sub={summary?.totalRevenue ? `${summary.grossProfitPct.toFixed(1)}% margin` : undefined}
                    icon={TrendingUp}
                    color={gpColor}
                />
                <KpiCard
                    title="Items Sold"
                    value={summary ? `${summary.itemsSold}` : "0"}
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
                        <CardDescription>
                            Revenue vs Cost
                            {latestDate && latestDate !== today && (
                                <Badge variant="secondary" className="ml-2 text-xs">
                                    Latest: {latestDate}
                                </Badge>
                            )}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {trend.every(t => t.revenue === 0) ? (
                            <div className="h-44 flex flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
                                <p>No sales data in the last 7 days</p>
                                <div className="flex gap-2">
                                    <Link href="/daily-sales">
                                        <Button variant="outline" size="sm" className="text-xs">
                                            <Plus className="h-3 w-3 mr-1" /> Record Sales
                                        </Button>
                                    </Link>
                                    <Link href="/analysis/pmix">
                                        <Button size="sm" className="text-xs">
                                            <PieChart className="h-3 w-3 mr-1" /> Sync from PMIX
                                        </Button>
                                    </Link>
                                </div>
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
                        <CardTitle className="text-base">Top 5 Menus</CardTitle>
                        <CardDescription>Sorted by Revenue · {isToday ? "Today" : selectedDate}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {!summary?.topMenus?.length ? (
                            <div className="h-44 flex items-center justify-center text-sm text-muted-foreground text-center">
                                No sales {isToday ? "today" : "for this date"}
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height={180}>
                                <BarChart data={summary.topMenus} layout="vertical" margin={{ left: 0, right: 16 }}>
                                    <XAxis type="number" tick={{ fontSize: 10 }}
                                        tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)} />
                                    <YAxis type="category" dataKey="recipeName" tick={{ fontSize: 10 }} width={90} />
                                    <Tooltip formatter={(v: number | undefined) => v != null ? format(v) : ""} />
                                    <Bar dataKey="revenue" name="Revenue" radius={[0, 4, 4, 0]}>
                                        {summary.topMenus.map((_, i) => (
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
                        {summary && summary.foodCostPct > 40 && summary.totalRevenue > 0 && (
                            <div className="p-2 bg-red-50 dark:bg-red-950/30 rounded text-xs text-red-600 border border-red-200 dark:border-red-900 mt-2">
                                ⚠️ Food Cost {summary.foodCostPct.toFixed(1)}% exceeds 40% — review portion sizes or ingredient costs
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
                                { href: "/analysis/pmix", icon: PieChart, label: "PMIX Dashboard", desc: "Sync POS data" },
                                { href: "/recipes", icon: Utensils, label: "Recipes", desc: `${totalRecipes} recipes` },
                                { href: "/recipes/new", icon: ChefHat, label: "New Recipe", desc: "Add a recipe" },
                                { href: "/analysis", icon: BarChart2, label: "Cost Analysis", desc: "Per-recipe cost" },
                                { href: "/production-planning", icon: TrendingUp, label: "Production", desc: "Production plan" },
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
