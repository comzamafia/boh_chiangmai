import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    try {
        const { date, items, status } = await req.json();
        const schedule = await prisma.productionSchedule.update({
            where: { id },
            data: { date, items, status },
        });
        return NextResponse.json(schedule);
    } catch (err) {
        console.error(err);
        return NextResponse.json({ error: "Failed to update schedule" }, { status: 500 });
    }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    try {
        await prisma.productionSchedule.delete({ where: { id } });
        return NextResponse.json({ ok: true });
    } catch (err) {
        console.error(err);
        return NextResponse.json({ error: "Failed to delete schedule" }, { status: 500 });
    }
}
