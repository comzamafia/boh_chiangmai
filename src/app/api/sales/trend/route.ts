import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const days = Math.min(parseInt(searchParams.get("days") ?? "7"), 30);
        // Accept client-supplied end date (local timezone) so the trend window aligns
        // with what the user sees — otherwise server UTC date can be off by ±1 day
        const endDate = searchParams.get("endDate"); // YYYY-MM-DD in client's local tz

        // Build array of last N dates ending at endDate (or today UTC as fallback)
        const dates: string[] = [];
        const base = endDate && /^\d{4}-\d{2}-\d{2}$/.test(endDate)
            ? new Date(endDate + "T12:00:00") // noon so no UTC-shift issues
            : new Date();

        for (let i = days - 1; i >= 0; i--) {
            const d = new Date(base);
            d.setDate(d.getDate() - i);
            dates.push(d.toISOString().slice(0, 10));
        }

        const entries = await prisma.salesEntry.findMany({
            where: { date: { in: dates } },
        });

        // Also find the most recent date that actually has revenue (for smart fallback)
        const latestEntry = await prisma.salesEntry.findFirst({
            orderBy: { date: "desc" },
            select: { date: true },
            where: { revenue: { gt: 0 } },
        });

        const trend = dates.map((date) => {
            const dayEntries = entries.filter((e) => e.date === date);
            const revenue = dayEntries.reduce((s, e) => s + Number(e.revenue), 0);
            const cost = dayEntries.reduce((s, e) => s + (e.unitCost != null ? Number(e.unitCost) * e.qty : 0), 0);
            return { date, revenue, cost, profit: revenue - cost };
        });

        return NextResponse.json({ trend, latestDate: latestEntry?.date ?? null });
    } catch {
        return NextResponse.json({ error: "Failed to fetch trend" }, { status: 500 });
    }
}
