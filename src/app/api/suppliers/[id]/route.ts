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

        const data: Record<string, unknown> = {};
        // Core fields — only patch when explicitly present in body
        if (body.name      !== undefined) data.name      = body.name;
        if (body.contact   !== undefined) data.contact   = body.contact;
        if (body.email     !== undefined) data.email     = body.email;
        if (body.phone     !== undefined) data.phone     = body.phone;
        if (body.address   !== undefined) data.address   = body.address;
        if (body.status    !== undefined) data.status    = body.status;
        if (body.isSpecial !== undefined) data.isSpecial = body.isSpecial;

        // Delivery schedule
        if (body.deliveryDays !== undefined) {
            data.deliveryDays = Array.isArray(body.deliveryDays)
                ? body.deliveryDays.filter((d: unknown): d is number =>
                    typeof d === "number" && d >= 1 && d <= 7)
                : [];
        }
        if (body.orderCutoffTime      !== undefined) data.orderCutoffTime      = body.orderCutoffTime || null;
        if (body.orderCutoffDayOffset !== undefined) data.orderCutoffDayOffset = Number(body.orderCutoffDayOffset);
        if (body.deliveryTimeWindow   !== undefined) data.deliveryTimeWindow   = body.deliveryTimeWindow || null;
        if (body.minOrderValue        !== undefined) data.minOrderValue        = body.minOrderValue == null ? null : Number(body.minOrderValue);
        if (body.deliveryNotes        !== undefined) data.deliveryNotes        = body.deliveryNotes || null;

        const supplier = await prisma.supplier.update({
            where: { id },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data: data as any,
        });
        return NextResponse.json(supplier);
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ error: "Failed to update supplier", details: msg }, { status: 500 });
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
