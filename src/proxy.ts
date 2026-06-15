import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { COOKIE_NAME, type SessionPayload } from "@/lib/auth";
import { SLUG_TO_PATH, getPermittedSlugs } from "@/lib/permissions";

const SECRET = new TextEncoder().encode(
    process.env.JWT_SECRET ?? "padthai-chaiyo-boh-secret-key-change-in-production"
);

// Routes that are always public (no session required).
// `/api/public/*` is API-key authenticated by its own route handler, so it
// must bypass the session redirect (external systems have no auth cookie).
const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/public", "/api/bootstrap-admin"];

export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Always allow public paths
    if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
        return NextResponse.next();
    }

    // Allow Next.js internals and static files
    if (
        pathname.startsWith("/_next") ||
        pathname.startsWith("/favicon") ||
        pathname === "/robots.txt" ||
        /\.(svg|png|jpg|jpeg|gif|webp|ico)$/i.test(pathname)
    ) {
        return NextResponse.next();
    }

    // Get session token
    const token = request.cookies.get(COOKIE_NAME)?.value;

    if (!token) {
        const loginUrl = new URL("/login", request.url);
        loginUrl.searchParams.set("from", pathname);
        return NextResponse.redirect(loginUrl);
    }

    // Verify token
    let session: SessionPayload;
    try {
        const { payload } = await jwtVerify(token, SECRET);
        session = payload as SessionPayload;
    } catch {
        const loginUrl = new URL("/login", request.url);
        loginUrl.searchParams.set("from", pathname);
        const response = NextResponse.redirect(loginUrl);
        response.cookies.delete(COOKIE_NAME);
        return response;
    }

    // Always allow API routes (each API route handler checks auth itself)
    if (pathname.startsWith("/api/")) {
        return NextResponse.next();
    }

    // RBAC: check if this user is permitted to access the requested UI path
    const permittedSlugs = getPermittedSlugs(session.role, session.permissions);
    const permittedPaths = permittedSlugs.map(slug => SLUG_TO_PATH[slug]);

    const allowed = permittedPaths.some(p => {
        if (p === "/") return pathname === "/";
        return pathname === p || pathname.startsWith(p + "/");
    });

    if (!allowed) {
        // Redirect unauthorized to dashboard (first permitted page)
        const fallback = permittedPaths.find(p => p !== "/") ?? "/dashboard";
        return NextResponse.redirect(new URL(fallback, request.url));
    }

    return NextResponse.next();
}

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
