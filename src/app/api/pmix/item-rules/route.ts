/**
 * GET  /api/pmix/item-rules          — list all rules (sorted by priority desc, then pattern)
 * POST /api/pmix/item-rules          — create a new rule (admin/manager only)
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export async function GET() {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rules = await db.pmixItemRule.findMany({
        orderBy: [{ priority: "desc" }, { pattern: "asc" }],
    });
    return NextResponse.json(rules);
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || (session.role !== "admin" && session.role !== "manager")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { pattern, matchType = "contains", category, label, priority = 0, isActive = true, notes } = body;

    if (!pattern?.trim())  return NextResponse.json({ error: "pattern is required" }, { status: 400 });
    if (!category?.trim()) return NextResponse.json({ error: "category is required" }, { status: 400 });

    const validCategories = ["main_protein", "extra_protein", "dessert", "excluded"];
    if (!validCategories.includes(category)) {
        return NextResponse.json({ error: `category must be one of: ${validCategories.join(", ")}` }, { status: 400 });
    }

    const rule = await db.pmixItemRule.create({
        data: {
            pattern:   pattern.trim(),
            matchType: matchType ?? "contains",
            category,
            label:     label?.trim() || null,
            priority:  Number(priority) || 0,
            isActive:  Boolean(isActive),
            notes:     notes?.trim() || null,
        },
    });
    return NextResponse.json(rule, { status: 201 });
}
