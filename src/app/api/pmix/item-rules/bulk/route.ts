/**
 * POST /api/pmix/item-rules/bulk
 *
 * Bulk-import classification rules exported from another branch.
 * Skips rows whose (pattern + matchType + category) triple already exists.
 * Returns { created, skipped }.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireBranch, isBranchContext } from "@/lib/branch";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

const VALID_CATEGORIES = new Set(["main_protein", "extra_protein", "dessert", "excluded"]);
const VALID_MATCH_TYPES = new Set(["exact", "contains", "starts_with"]);

export async function POST(req: NextRequest) {
    const ctx = await requireBranch();
    if (!isBranchContext(ctx)) return ctx;
    const { session, branchId } = ctx;
    if (session.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: unknown;
    try { body = await req.json(); } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const rows = Array.isArray(body) ? body : (body as Record<string, unknown>)?.rules;
    if (!Array.isArray(rows) || rows.length === 0) {
        return NextResponse.json({ error: "Expected a JSON array of rules (or { rules: [...] })" }, { status: 400 });
    }

    // Fetch existing (pattern, matchType, category) triples to detect duplicates
    const existing: { pattern: string; matchType: string; category: string }[] =
        await db.pmixItemRule.findMany({ where: { branchId }, select: { pattern: true, matchType: true, category: true } });
    const existingSet = new Set(existing.map(r => `${r.pattern}||${r.matchType}||${r.category}`));

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const r = rows[i] as any;
        const pattern   = (r.pattern   ?? "").toString().trim();
        const matchType = (r.matchType ?? "contains").toString().trim();
        const category  = (r.category  ?? "").toString().trim();

        if (!pattern)                         { errors.push(`Row ${i}: pattern is required`); continue; }
        if (!VALID_CATEGORIES.has(category))  { errors.push(`Row ${i}: invalid category "${category}"`); continue; }
        if (!VALID_MATCH_TYPES.has(matchType)){ errors.push(`Row ${i}: invalid matchType "${matchType}"`); continue; }

        const key = `${pattern}||${matchType}||${category}`;
        if (existingSet.has(key)) { skipped++; continue; }

        await db.pmixItemRule.create({
            data: {
                pattern,
                matchType,
                category,
                label:    r.label    ? String(r.label).trim()    : null,
                priority: Number(r.priority) || 0,
                isActive: r.isActive !== false,
                notes:    r.notes    ? String(r.notes).trim()    : null,
                branchId,
            },
        });
        existingSet.add(key);
        created++;
    }

    return NextResponse.json({ created, skipped, errors });
}
