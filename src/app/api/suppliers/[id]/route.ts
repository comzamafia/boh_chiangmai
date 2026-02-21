import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const supplier = await prisma.supplier.findUnique({ where: { id } });
        if (!supplier) return NextResponse.json({ error: "Not found" }, { status: 404 });
        return NextResponse.json(supplier);
    } catch {
        return NextResponse.json({ error: "Failed to fetch supplier" }, { status: 500 });
    }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const body = await request.json();
        const supplier = await prisma.supplier.update({
            where: { id },
            data: {
                name: body.name,
                contact: body.contact,
                email: body.email,
                phone: body.phone,
                address: body.address,
                status: body.status,
                isSpecial: body.isSpecial,
            },
        });
        return NextResponse.json(supplier);
    } catch {
        return NextResponse.json({ error: "Failed to update supplier" }, { status: 500 });
    }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        await prisma.supplier.delete({ where: { id } });
        return new NextResponse(null, { status: 204 });
    } catch {
        return NextResponse.json({ error: "Failed to delete supplier" }, { status: 500 });
    }
}
