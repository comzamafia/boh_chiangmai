import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
    try {
        const equipment = await prisma.equipment.findMany({ orderBy: { name: "asc" } });
        return NextResponse.json(equipment);
    } catch {
        return NextResponse.json({ error: "Failed to fetch equipment" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const equipment = await prisma.equipment.create({
            data: { name: body.name, type: body.type, status: body.status ?? "Available" },
        });
        return NextResponse.json(equipment, { status: 201 });
    } catch {
        return NextResponse.json({ error: "Failed to create equipment" }, { status: 500 });
    }
}
