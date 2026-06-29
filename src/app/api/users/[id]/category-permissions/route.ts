import { prisma } from "@/lib/db";
import { requireBranch, isBranchContext } from "@/lib/branch";
import { NextResponse } from "next/server";

// GET /api/users/[id]/category-permissions — admin only
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const ctx = await requireBranch();
        if (!isBranchContext(ctx)) return ctx;
        const { session, branchId } = ctx;
        if (session.role !== "admin") {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        const { id } = await params;
        const perms = await prisma.userCategoryPermission.findMany({
            where:   { userId: id, branchId },
            include: { category: true },
            orderBy: { category: { name: "asc" } },
        });
        return NextResponse.json(perms);
    } catch {
        return NextResponse.json({ error: "Failed to fetch category permissions" }, { status: 500 });
    }
}

// PUT /api/users/[id]/category-permissions — admin only
// Body: { permissions: [{ categoryId: string; canEdit: boolean }] }
// Replaces the entire permission set for this user.
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const ctx = await requireBranch();
        if (!isBranchContext(ctx)) return ctx;
        const { session, branchId } = ctx;
        if (session.role !== "admin") {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        const { id: userId } = await params;
        const body  = await request.json();
        const perms: { categoryId: string; canEdit: boolean }[] = body.permissions ?? [];

        // Replace atomically: delete all existing (for this branch), create new set
        await prisma.$transaction([
            prisma.userCategoryPermission.deleteMany({ where: { userId, branchId } }),
            ...perms.map(p =>
                prisma.userCategoryPermission.create({
                    data: { userId, categoryId: p.categoryId, canEdit: p.canEdit, branchId },
                })
            ),
        ]);

        // Return updated list
        const updated = await prisma.userCategoryPermission.findMany({
            where:   { userId, branchId },
            include: { category: true },
            orderBy: { category: { name: "asc" } },
        });
        return NextResponse.json(updated);
    } catch {
        return NextResponse.json({ error: "Failed to update category permissions" }, { status: 500 });
    }
}
