import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const days = Math.min(parseInt(searchParams.get("days") ?? "7"), 30);

        // Build array of last N dates
        const dates: string[] = [];
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            dates.push(d.toISOString().slice(0, 10));
        }

        const entries = await prisma.salesEntry.findMany({
            where: { date: { in: dates } },
        });

        const trend = dates.map((date) => {
            const dayEntries = entries.filter((e) => e.date === date);
            const revenue = dayEntries.reduce((s, e) => s + Number(e.revenue), 0);
            const cost = dayEntries.reduce((s, e) => s + (e.unitCost != null ? Number(e.unitCost) * e.qty : 0), 0);
            return { date, revenue, cost, profit: revenue - cost };
        });

        return NextResponse.json(trend);
    } catch {
        return NextResponse.json({ error: "Failed to fetch trend" }, { status: 500 });
    }
}
