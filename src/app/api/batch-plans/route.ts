import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
    try {
        const plans = await prisma.batchPlan.findMany({
            include: { items: true },
            orderBy: { date: "desc" },
        });
        return NextResponse.json(plans);
    } catch (err) {
        console.error(err);
        return NextResponse.json({ error: "Failed to fetch batch plans" }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const { date, status, progress, items } = await req.json();
        if (!date) return NextResponse.json({ error: "date is required" }, { status: 400 });

        const plan = await prisma.batchPlan.create({
            data: {
                date,
                status: status ?? "Pending",
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
        return NextResponse.json(plan, { status: 201 });
    } catch (err) {
        console.error(err);
        return NextResponse.json({ error: "Failed to create batch plan" }, { status: 500 });
    }
}
