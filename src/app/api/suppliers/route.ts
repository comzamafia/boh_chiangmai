import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
    try {
        const suppliers = await prisma.supplier.findMany({
            orderBy: { name: "asc" },
        });
        return NextResponse.json(suppliers);
    } catch {
        return NextResponse.json({ error: "Failed to fetch suppliers" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const data: Record<string, unknown> = {
            name:      body.name,
            contact:   body.contact,
            email:     body.email,
            phone:     body.phone,
            address:   body.address,
            status:    body.status    ?? "Active",
            isSpecial: body.isSpecial ?? false,
        };

        // Delivery-schedule fields (all optional on create)
        if (Array.isArray(body.deliveryDays)) {
            data.deliveryDays = body.deliveryDays.filter((d: unknown): d is number =>
                typeof d === "number" && d >= 1 && d <= 7);
        }
        if (typeof body.orderCutoffTime === "string")      data.orderCutoffTime      = body.orderCutoffTime || null;
        if (typeof body.orderCutoffDayOffset === "number") data.orderCutoffDayOffset = body.orderCutoffDayOffset;
        if (typeof body.deliveryTimeWindow === "string")   data.deliveryTimeWindow   = body.deliveryTimeWindow || null;
        if (body.minOrderValue != null)                    data.minOrderValue        = Number(body.minOrderValue);
        if (typeof body.deliveryNotes === "string")        data.deliveryNotes        = body.deliveryNotes || null;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const supplier = await prisma.supplier.create({ data: data as any });
        return NextResponse.json(supplier, { status: 201 });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ error: "Failed to create supplier", details: msg }, { status: 500 });
    }
}
