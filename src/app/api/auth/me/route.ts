import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { BRANCH_COOKIE } from "@/lib/branch";
import { cookies } from "next/headers";

export async function GET() {
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userBranches = await prisma.userBranch.findMany({
        where: { userId: session.userId },
        include: { branch: true },
        orderBy: { branch: { sortOrder: "asc" } },
    });

    const cookieStore = await cookies();
    const activeBranchId = cookieStore.get(BRANCH_COOKIE)?.value;

    const branches = userBranches
        .filter((ub) => ub.branch.isActive)
        .map((ub) => ({
            id: ub.branch.id,
            name: ub.branch.name,
            slug: ub.branch.slug,
            isDefault: ub.isDefault,
        }));

    const activeBranch =
        branches.find((b) => b.id === activeBranchId) ??
        branches.find((b) => b.isDefault) ??
        branches[0] ??
        null;

    return NextResponse.json({
        id: session.userId,
        name: session.name,
        email: session.email,
        role: session.role,
        permissions: session.permissions,
        activeBranch,
        branches,
    });
}
