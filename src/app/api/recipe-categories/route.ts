import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireBranch, isBranchContext } from "@/lib/branch";
import { getPermittedSlugs } from "@/lib/permissions";

export async function GET() {
    const ctx = await requireBranch();
    if (!isBranchContext(ctx)) return ctx;
    const { branchId } = ctx;

    try {
        const cats = await prisma.recipeCategory.findMany({
            where: { branchId },
            orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        });
        return NextResponse.json(cats);
    } catch (err) {
        console.error(err);
        return NextResponse.json({ error: "Failed to fetch categories" }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const ctx = await requireBranch();
    if (!isBranchContext(ctx)) return ctx;
    const { session, branchId } = ctx;
    const slugs = getPermittedSlugs(session.role, session.permissions);
    if (!slugs.includes("recipes-manage-categories"))
        return NextResponse.json({ error: "Forbidden — you don't have permission to manage recipe categories." }, { status: 403 });

    try {
        const { name } = await req.json();
        if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });

        const maxOrder = await prisma.recipeCategory.aggregate({ where: { branchId }, _max: { sortOrder: true } });
        const nextOrder = (maxOrder._max.sortOrder ?? -1) + 1;

        const cat = await prisma.recipeCategory.create({
            data: { name: name.trim(), sortOrder: nextOrder, branchId },
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
