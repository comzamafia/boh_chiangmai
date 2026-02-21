import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET() {
    try {
        const cats = await prisma.recipeCategory.findMany({
            orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        });
        return NextResponse.json(cats);
    } catch (err) {
        console.error(err);
        return NextResponse.json({ error: "Failed to fetch categories" }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const { name } = await req.json();
        if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });

        const maxOrder = await prisma.recipeCategory.aggregate({ _max: { sortOrder: true } });
        const nextOrder = (maxOrder._max.sortOrder ?? -1) + 1;

        const cat = await prisma.recipeCategory.create({
            data: { name: name.trim(), sortOrder: nextOrder },
        });
        return NextResponse.json(cat, { status: 201 });
    } catch (err: unknown) {
        if ((err as { code?: string }).code === "P2002") {
            return NextResponse.json({ error: "Category already exists" }, { status: 409 });
        }
        console.error(err);
        return NextResponse.json({ error: "Failed to create category" }, { status: 500 });
    }
}
