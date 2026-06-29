import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { BRANCH_COOKIE } from "@/lib/branch";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { branchId } = await request.json();
  if (!branchId) {
    return NextResponse.json(
      { error: "branchId is required" },
      { status: 400 },
    );
  }

  const ub = await prisma.userBranch.findUnique({
    where: {
      userId_branchId: { userId: session.userId, branchId },
    },
    include: { branch: true },
  });

  if (!ub || !ub.branch.isActive) {
    return NextResponse.json(
      { error: "No access to this branch" },
      { status: 403 },
    );
  }

  const cookieStore = await cookies();
  cookieStore.set(BRANCH_COOKIE, branchId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });

  return NextResponse.json({
    id: ub.branch.id,
    name: ub.branch.name,
    slug: ub.branch.slug,
  });
}
