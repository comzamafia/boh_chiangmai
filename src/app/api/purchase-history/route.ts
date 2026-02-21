import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const supplierId = searchParams.get("supplierId");

        const history = await prisma.purchaseHistory.findMany({
            where: supplierId ? { supplierId } : undefined,
            include: { supplier: { select: { id: true, name: true } } },
            orderBy: { date: "desc" },
        });
        return NextResponse.json(history);
    } catch {
        return NextResponse.json({ error: "Failed to fetch purchase history" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const record = await prisma.purchaseHistory.create({
            data: {
                date: new Date(body.date),
                supplierId: body.supplierId,
                ingredient: body.ingredient,
                qty: body.qty,
                unit: body.unit,
                unitPrice: body.unitPrice,
                total: body.total ?? body.qty * body.unitPrice,
            },
            include: { supplier: { select: { id: true, name: true } } },
        });
        return NextResponse.json(record, { status: 201 });
    } catch {
        return NextResponse.json({ error: "Failed to create purchase record" }, { status: 500 });
    }
}
