import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    try {
        const { date, status, progress, items } = await req.json();

        // Replace items: delete old, create new
        await prisma.batchPlanItem.deleteMany({ where: { batchPlanId: id } });

        const plan = await prisma.batchPlan.update({
            where: { id },
            data: {
                date,
                status,
                progress: progress ?? 0,
                items: {
                    create: (items ?? []).map((item: { recipeId?: string; recipeName: string; qty: string; unit: string }) => ({
                        recipeId: item.recipeId ?? null,
                        recipeName: item.recipeName,
                        qty: item.qty,
                        unit: item.unit,
                    })),
                },
            },
            include: { items: true },
        });
        return NextResponse.json(plan);
    } catch (err) {
        console.error(err);
        return NextResponse.json({ error: "Failed to update batch plan" }, { status: 500 });
    }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    try {
        await prisma.batchPlan.delete({ where: { id } });
        return NextResponse.json({ ok: true });
    } catch (err) {
        console.error(err);
        return NextResponse.json({ error: "Failed to delete batch plan" }, { status: 500 });
    }
}
