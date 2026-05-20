import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { NextResponse } from "next/server";

/** GET /api/users/[id]/recipe-category-permissions — list which recipe categories a user can see */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const session = await getSession();
    if (!session || session.role !== "admin")
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const perms = await prisma.userRecipeCategoryPermission.findMany({
        where: { userId: id },
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
    const session = await getSession();
    if (!session || session.role !== "admin")
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const { categoryIds }: { categoryIds: string[] } = await req.json();

    await prisma.$transaction([
        prisma.userRecipeCategoryPermission.deleteMany({ where: { userId: id } }),
        prisma.userRecipeCategoryPermission.createMany({
            data: categoryIds.map(categoryId => ({ userId: id, categoryId })),
            skipDuplicates: true,
        }),
    ]);

    const perms = await prisma.userRecipeCategoryPermission.findMany({
        where: { userId: id },
        include: { category: { select: { id: true, name: true } } },
        orderBy: { category: { sortOrder: "asc" } },
    });
    return NextResponse.json(perms);
}
