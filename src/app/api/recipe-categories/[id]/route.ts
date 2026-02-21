import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    try {
        const { name } = await req.json();
        if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });

        const existing = await prisma.recipeCategory.findUnique({ where: { id } });
        if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

        const oldName = existing.name;
        const newName = name.trim();

        const cat = await prisma.recipeCategory.update({
            where: { id },
            data: { name: newName },
        });
        // Cascade rename to all recipes that used the old category name
        if (oldName !== newName) {
            await prisma.recipe.updateMany({
                where: { category: oldName },
                data: { category: newName },
            });
        }
        return NextResponse.json(cat);
    } catch (err: unknown) {
        if ((err as { code?: string }).code === "P2002") {
            return NextResponse.json({ error: "Category name already exists" }, { status: 409 });
        }
        console.error(err);
        return NextResponse.json({ error: "Failed to update category" }, { status: 500 });
    }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    try {
        const cat = await prisma.recipeCategory.findUnique({ where: { id } });
        if (!cat) return NextResponse.json({ error: "Not found" }, { status: 404 });

        const usedBy = await prisma.recipe.count({ where: { category: cat.name } });
        if (usedBy > 0) {
            return NextResponse.json(
                { error: `Cannot delete — ${usedBy} recipe${usedBy > 1 ? "s" : ""} use this category.` },
                { status: 409 }
            );
        }

        await prisma.recipeCategory.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (err) {
        console.error(err);
        return NextResponse.json({ error: "Failed to delete category" }, { status: 500 });
    }
}
