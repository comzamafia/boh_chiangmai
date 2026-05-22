import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

// GET /api/storage-areas — list all storage areas (authenticated)
export async function GET() {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const areas = await prisma.storageArea.findMany({
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        include: { _count: { select: { ingredients: true } } },
    });

    return NextResponse.json(areas);
}

// POST /api/storage-areas — create (admin only)
export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { name, temperature, isActive, sortOrder } = await req.json();
    if (!name?.trim()) {
        return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    try {
        const area = await prisma.storageArea.create({
            data: {
                name: name.trim(),
                temperature: temperature?.trim() || null,
                isActive: isActive !== false,
                sortOrder: sortOrder ?? 0,
            },
            include: { _count: { select: { ingredients: true } } },
        });
        return NextResponse.json(area, { status: 201 });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("Unique constraint") || msg.includes("unique")) {
            return NextResponse.json({ error: "A storage area with this name already exists" }, { status: 409 });
        }
        throw e;
    }
}
