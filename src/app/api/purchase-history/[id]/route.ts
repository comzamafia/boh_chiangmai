import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const record = await prisma.purchaseHistory.findUnique({
            where: { id },
            include: { supplier: { select: { id: true, name: true } } },
        });
        if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });
        return NextResponse.json(record);
    } catch {
        return NextResponse.json({ error: "Failed to fetch purchase record" }, { status: 500 });
    }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        await prisma.purchaseHistory.delete({ where: { id } });
        return new NextResponse(null, { status: 204 });
    } catch {
        return NextResponse.json({ error: "Failed to delete purchase record" }, { status: 500 });
    }
}
