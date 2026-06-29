import { prisma } from "@/lib/db";
import { requireBranch, isBranchContext } from "@/lib/branch";
import { NextResponse } from "next/server";

/** GET /api/users/[id]/recipe-category-permissions — list which recipe categories a user can see */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const ctx = await requireBranch();
    if (!isBranchContext(ctx)) return ctx;
    const { session, branchId } = ctx;
    if (session.role !== "admin")
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const perms = await prisma.userRecipeCategoryPermission.findMany({
        where: { userId: id, branchId },
        include: { category: { select: { id: true, name: true } } },
        orderBy: { category: { sortOrder: "asc" } },
    });
    return NextResponse.json(perms);
}

/**
 * PUT /api/users/[id]/recipe-category-permissions
 * Body: { categoryIds: string[] }
 * Atomically replaces the full set of permitted recipe categories for this user.
 * An empty array means "no restrictions — user sees all categories".
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const ctx = await requireBranch();
    if (!isBranchContext(ctx)) return ctx;
    const { session, branchId } = ctx;
    if (session.role !== "admin")
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const { categoryIds }: { categoryIds: string[] } = await req.json();

    await prisma.$transaction([
        prisma.userRecipeCategoryPermission.deleteMany({ where: { userId: id, branchId } }),
        prisma.userRecipeCategoryPermission.createMany({
            data: categoryIds.map(categoryId => ({ userId: id, categoryId, branchId })),
            skipDuplicates: true,
        }),
    ]);

    const perms = await prisma.userRecipeCategoryPermission.findMany({
        where: { userId: id, branchId },
        include: { category: { select: { id: true, name: true } } },
        orderBy: { category: { sortOrder: "asc" } },
    });
    return NextResponse.json(perms);
}
