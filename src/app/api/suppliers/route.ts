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
        const supplier = await prisma.supplier.create({
            data: {
                name: body.name,
                contact: body.contact,
                email: body.email,
                phone: body.phone,
                address: body.address,
                status: body.status ?? "Active",
                isSpecial: body.isSpecial ?? false,
            },
        });
        return NextResponse.json(supplier, { status: 201 });
    } catch {
        return NextResponse.json({ error: "Failed to create supplier" }, { status: 500 });
    }
}
