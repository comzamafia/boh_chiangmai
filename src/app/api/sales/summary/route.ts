import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const date = searchParams.get("date") ?? new Date().toISOString().slice(0, 10);

        const entries = await prisma.salesEntry.findMany({ where: { date } });

        const totalRevenue = entries.reduce((s, e) => s + Number(e.revenue), 0);
        const totalCost = entries.reduce((s, e) => s + (e.unitCost != null ? Number(e.unitCost) * e.qty : 0), 0);
        const grossProfit = totalRevenue - totalCost;
        const foodCostPct = totalRevenue > 0 ? (totalCost / totalRevenue) * 100 : 0;
        const grossProfitPct = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
        const itemsSold = entries.reduce((s, e) => s + e.qty, 0);

        // Top menus
        const menuMap = new Map<string, { qty: number; revenue: number }>();
        for (const e of entries) {
            const cur = menuMap.get(e.recipeName) ?? { qty: 0, revenue: 0 };
            menuMap.set(e.recipeName, { qty: cur.qty + e.qty, revenue: cur.revenue + Number(e.revenue) });
        }
        const topMenus = [...menuMap.entries()]
            .map(([recipeName, v]) => ({ recipeName, ...v }))
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 5);

        return NextResponse.json({ date, totalRevenue, totalCost, grossProfit, foodCostPct, grossProfitPct, itemsSold, topMenus });
    } catch (e) {
        console.error("[sales/summary]", e);
        return NextResponse.json({ error: "Failed to fetch summary" }, { status: 500 });
    }
}
