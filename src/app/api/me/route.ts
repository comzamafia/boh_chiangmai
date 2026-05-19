import { getSession } from "@/lib/auth";
import { getPermittedSlugs } from "@/lib/permissions";
import { NextResponse } from "next/server";

/**
 * GET /api/me
 * Returns the current user's identity + effective permission slugs.
 * Used by client components that need to show/hide UI based on role.
 */
export async function GET() {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

    const slugs = getPermittedSlugs(session.role, session.permissions);

    return NextResponse.json({
        userId:      session.userId,
        name:        session.name,
        email:       session.email,
        role:        session.role,
        permissions: slugs,          // effective slugs (role defaults merged with custom overrides)
    });
}
