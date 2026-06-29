import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSession, type SessionPayload } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const BRANCH_COOKIE = "boh_active_branch";

export interface BranchContext {
  session: SessionPayload;
  branchId: string;
  branchSlug: string;
  branchName: string;
}

export async function getActiveBranch(): Promise<BranchContext | null> {
  const session = await getSession();
  if (!session) return null;

  const cookieStore = await cookies();
  const branchIdFromCookie = cookieStore.get(BRANCH_COOKIE)?.value;

  const userBranches = await prisma.userBranch.findMany({
    where: { userId: session.userId },
    include: { branch: true },
  });

  if (userBranches.length === 0) return null;

  if (branchIdFromCookie) {
    const match = userBranches.find(
      (ub) => ub.branchId === branchIdFromCookie && ub.branch.isActive,
    );
    if (match) {
      return {
        session,
        branchId: match.branchId,
        branchSlug: match.branch.slug,
        branchName: match.branch.name,
      };
    }
  }

  const defaultUb = userBranches.find((ub) => ub.isDefault) ?? userBranches[0];
  if (!defaultUb.branch.isActive) return null;

  return {
    session,
    branchId: defaultUb.branchId,
    branchSlug: defaultUb.branch.slug,
    branchName: defaultUb.branch.name,
  };
}

export async function requireBranch(): Promise<BranchContext | NextResponse> {
  const ctx = await getActiveBranch();
  if (!ctx) {
    return NextResponse.json(
      { error: "Unauthorized or no branch access" },
      { status: 401 },
    );
  }
  return ctx;
}

export function isBranchContext(
  result: BranchContext | NextResponse,
): result is BranchContext {
  return !(result instanceof NextResponse);
}
