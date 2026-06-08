/**
 * GET /api/server-perf/dashboard?from&to  (Admin only)
 * Aggregates server-sales rows per staff member and computes multi-dimensional
 * KPIs + a weighted Performance Score for an executive leaderboard.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;
const r2 = (n: number) => Math.round(n * 100) / 100;
const STATIONS = new Set(["bar bar", "bar", "host", "host pos"]);

// Score weights (sum = 1)
const W = { salesPerHour: 0.30, avgPerGuest: 0.20, tipPct: 0.20, drinkPct: 0.15, dessertPer100: 0.10, discount: 0.05 };

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const sp = new URL(req.url).searchParams;
    const toStr = sp.get("to") ?? new Date().toISOString().slice(0, 10);
    const fromStr = sp.get("from") ?? toStr;
    const from = new Date(fromStr + "T00:00:00.000Z"), to = new Date(toStr + "T23:59:59.999Z");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: any[] = await db.serverSalesRow.findMany({ where: { businessDate: { gte: from, lte: to } } });
    const num = (x: unknown) => Number(x);

    type Agg = {
        name: string; isStation: boolean; shifts: number; hours: number;
        grossSales: number; discount: number; netSales: number; tips: number;
        guests: number; orders: number;
        foodSales: number; foodCount: number; beverageSales: number; beverageCount: number;
        alcoholSales: number; alcoholCount: number; dessertSales: number; dessertCount: number;
    };
    const m = new Map<string, Agg>();
    for (const x of rows) {
        const a = m.get(x.staffName) ?? {
            name: x.staffName, isStation: STATIONS.has(String(x.staffName).toLowerCase().trim()),
            shifts: 0, hours: 0, grossSales: 0, discount: 0, netSales: 0, tips: 0, guests: 0, orders: 0,
            foodSales: 0, foodCount: 0, beverageSales: 0, beverageCount: 0, alcoholSales: 0, alcoholCount: 0, dessertSales: 0, dessertCount: 0,
        };
        a.shifts++; a.hours += num(x.shiftHours);
        a.grossSales += num(x.grossSales); a.discount += num(x.discount); a.netSales += num(x.netSales);
        a.tips += num(x.chargeTips) + num(x.gratuity);
        a.guests += num(x.guests); a.orders += num(x.orders);
        a.foodSales += num(x.foodSales); a.foodCount += num(x.foodCount);
        a.beverageSales += num(x.beverageSales); a.beverageCount += num(x.beverageCount);
        a.alcoholSales += num(x.alcoholSales); a.alcoholCount += num(x.alcoholCount);
        a.dessertSales += num(x.dessertSales); a.dessertCount += num(x.dessertCount);
        m.set(x.staffName, a);
    }

    const base = [...m.values()].map(a => {
        const net = a.netSales || 0;
        const drink = a.beverageSales + a.alcoholSales;
        const pct = (x: number) => net > 0 ? r2((x / net) * 100) : 0;
        return {
            name: a.name, isStation: a.isStation, shifts: a.shifts, hours: r2(a.hours),
            netSales: r2(net), grossSales: r2(a.grossSales), discount: r2(a.discount),
            discountPct: a.grossSales > 0 ? r2((a.discount / a.grossSales) * 100) : 0,
            tips: r2(a.tips), tipPct: net > 0 ? r2((a.tips / net) * 100) : 0,
            guests: a.guests, orders: a.orders,
            salesPerHour: a.hours > 0 ? r2(net / a.hours) : 0,
            avgPerGuest: a.guests > 0 ? r2(net / a.guests) : 0,
            avgPerOrder: a.orders > 0 ? r2(net / a.orders) : 0,
            foodSales: r2(a.foodSales), beverageSales: r2(a.beverageSales), alcoholSales: r2(a.alcoholSales), dessertSales: r2(a.dessertSales),
            foodCount: a.foodCount, beverageCount: a.beverageCount, alcoholCount: a.alcoholCount, dessertCount: a.dessertCount,
            drinkSales: r2(drink),
            foodPct: pct(a.foodSales), beveragePct: pct(a.beverageSales), alcoholPct: pct(a.alcoholSales), dessertPct: pct(a.dessertSales),
            drinkPct: pct(drink),
            dessertPer100: a.guests > 0 ? r2((a.dessertCount / a.guests) * 100) : 0,
            liquorPerGuest: a.guests > 0 ? r2(a.alcoholSales / a.guests) : 0,
        };
    });

    // ── Composite score (normalise each metric across ranked servers) ──
    const ranked = base.filter(s => !s.isStation && s.netSales > 0);
    const range = (key: keyof typeof ranked[number]) => {
        const vals = ranked.map(s => Number(s[key]));
        return { min: Math.min(...vals), max: Math.max(...vals) };
    };
    const norm = (v: number, mn: number, mx: number) => mx > mn ? ((v - mn) / (mx - mn)) * 100 : 50;
    const rg = {
        salesPerHour: range("salesPerHour"), avgPerGuest: range("avgPerGuest"), tipPct: range("tipPct"),
        drinkPct: range("drinkPct"), dessertPer100: range("dessertPer100"), discountPct: range("discountPct"),
    };
    const scored = base.map(s => {
        if (s.isStation || s.netSales <= 0) return { ...s, score: 0 };
        const score =
            W.salesPerHour  * norm(s.salesPerHour,  rg.salesPerHour.min,  rg.salesPerHour.max) +
            W.avgPerGuest   * norm(s.avgPerGuest,   rg.avgPerGuest.min,   rg.avgPerGuest.max) +
            W.tipPct        * norm(s.tipPct,        rg.tipPct.min,        rg.tipPct.max) +
            W.drinkPct      * norm(s.drinkPct,      rg.drinkPct.min,      rg.drinkPct.max) +
            W.dessertPer100 * norm(s.dessertPer100, rg.dessertPer100.min, rg.dessertPer100.max) +
            W.discount      * (100 - norm(s.discountPct, rg.discountPct.min, rg.discountPct.max));
        return { ...s, score: r2(score) };
    }).sort((a, b) => b.score - a.score);

    // ── Team totals / averages ──
    const t = ranked;
    const sum = (k: keyof typeof t[number]) => r2(t.reduce((s, x) => s + Number(x[k]), 0));
    const team = {
        servers: t.length,
        netSales: sum("netSales"), tips: sum("tips"), guests: t.reduce((s, x) => s + x.guests, 0),
        avgPerGuest: t.reduce((s, x) => s + x.guests, 0) > 0 ? r2(sum("netSales") / t.reduce((s, x) => s + x.guests, 0)) : 0,
        avgTipPct: sum("netSales") > 0 ? r2((sum("tips") / sum("netSales")) * 100) : 0,
        avgDrinkPct: sum("netSales") > 0 ? r2(((t.reduce((s, x) => s + x.drinkSales, 0)) / sum("netSales")) * 100) : 0,
    };

    return NextResponse.json({ range: { from: fromStr, to: toStr }, servers: scored, team, weights: W });
}
