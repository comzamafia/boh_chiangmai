import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const item = await prisma.equipment.findUnique({ where: { id } });
        if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
        return NextResponse.json(item);
    } catch {
        return NextResponse.json({ error: "Failed to fetch equipment" }, { status: 500 });
    }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const body = await request.json();
        const item = await prisma.equipment.update({
            where: { id },
            data: { name: body.name, type: body.type, status: body.status },
        });
        return NextResponse.json(item);
    } catch {
        return NextResponse.json({ error: "Failed to update equipment" }, { status: 500 });
    }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        await prisma.equipment.delete({ where: { id } });
        return new NextResponse(null, { status: 204 });
    } catch {
        return NextResponse.json({ error: "Failed to delete equipment" }, { status: 500 });
    }
}
