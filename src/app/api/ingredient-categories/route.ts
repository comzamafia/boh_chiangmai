import { prisma } from "@/lib/db";
import { requireBranch, isBranchContext } from "@/lib/branch";
import { logAudit } from "@/lib/audit";
import { NextResponse } from "next/server";

// GET /api/ingredient-categories — any authenticated user
export async function GET() {
    try {
        const ctx = await requireBranch();
        if (!isBranchContext(ctx)) return ctx;
        const { branchId } = ctx;

        const categories = await prisma.ingredientCategory.findMany({
            where: { branchId },
            orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
            include: { _count: { select: { ingredients: true } } },
        });
        return NextResponse.json(categories);
    } catch {
        return NextResponse.json({ error: "Failed to fetch categories" }, { status: 500 });
    }
}

// POST /api/ingredient-categories — admin only
export async function POST(request: Request) {
    try {
        const ctx = await requireBranch();
        if (!isBranchContext(ctx)) return ctx;
        const { session, branchId } = ctx;
        if (session.role !== "admin") {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        const body = await request.json();
        if (!body.name?.trim()) {
            return NextResponse.json({ error: "name is required" }, { status: 400 });
        }
        const category = await prisma.ingredientCategory.create({
            data: {
                name:        body.name.trim(),
                description: body.description?.trim() ?? null,
                sortOrder:   Number(body.sortOrder ?? 0),
                branchId,
            },
        });
        logAudit({ session, action: "CREATE", targetTable: "IngredientCategory", targetId: category.id, targetName: category.name, newValues: { name: category.name }, branchId, request });
        return NextResponse.json(category, { status: 201 });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "";
        if (msg.includes("Unique constraint")) {
            return NextResponse.json({ error: "A category with this name already exists" }, { status: 409 });
        }
        return NextResponse.json({ error: "Failed to create category" }, { status: 500 });
    }
}
