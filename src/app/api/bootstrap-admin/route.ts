/**
 * One-time admin bootstrap (for a freshly-deployed branch with an empty DB).
 *
 *   GET/POST /api/bootstrap-admin?secret=<KEY>&email=...&password=...&name=...
 *   Auth: secret must match BOOTSTRAP_SECRET (preferred) or CRON_SECRET.
 *
 * Safety: only ever creates an admin when the users table is COMPLETELY empty.
 * Once any user exists it refuses (409) — so it cannot be abused to add admins
 * or overwrite anyone. Remove this route after the branch is bootstrapped.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

async function handle(req: NextRequest) {
    const url = new URL(req.url);
    let body: Record<string, string> = {};
    if (req.method === "POST") { try { body = await req.json(); } catch { /* ignore */ } }
    const param = (k: string) => body[k] ?? url.searchParams.get(k) ?? undefined;

    const configured = [process.env.BOOTSTRAP_SECRET, process.env.CRON_SECRET].filter(Boolean) as string[];
    if (configured.length === 0) {
        return NextResponse.json({ error: "Not configured. Set BOOTSTRAP_SECRET (or CRON_SECRET) in this project's env vars." }, { status: 503 });
    }
    const secret = param("secret") ?? req.headers.get("x-bootstrap-secret") ?? "";
    if (!configured.includes(secret)) {
        return NextResponse.json({ error: "Invalid or missing secret." }, { status: 401 });
    }

    const userCount = await db.user.count();
    if (userCount > 0) {
        return NextResponse.json({ error: "Users already exist — bootstrap disabled. Create further users in the app, and remove this route." }, { status: 409 });
    }

    const email = (param("email") ?? "admin@padthaichaiyo.com").trim().toLowerCase();
    const password = param("password") ?? "Admin@1234";
    const name = param("name") ?? "Admin";
    const hash = await bcrypt.hash(password, 12);

    await db.user.create({ data: { name, email, password: hash, role: "admin", permissions: [], isActive: true } });

    return NextResponse.json({
        ok: true,
        message: "Admin created. LOG IN AND CHANGE THE PASSWORD NOW, then remove the /api/bootstrap-admin route.",
        email,
        usedDefaultPassword: password === "Admin@1234",
    });
}

export const GET = handle;
export const POST = handle;
