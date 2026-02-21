import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
    try {
        const schedules = await prisma.productionSchedule.findMany({
            orderBy: { date: "asc" },
        });
        return NextResponse.json(schedules);
    } catch (err) {
        console.error(err);
        return NextResponse.json({ error: "Failed to fetch schedules" }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const { date, items, status } = await req.json();
        if (!date) return NextResponse.json({ error: "date is required" }, { status: 400 });

        const schedule = await prisma.productionSchedule.create({
            data: {
                date,
                items: items ?? [],
                status: status ?? "pending",
            },
        });
        return NextResponse.json(schedule, { status: 201 });
    } catch (err) {
        console.error(err);
        return NextResponse.json({ error: "Failed to create schedule" }, { status: 500 });
    }
}
