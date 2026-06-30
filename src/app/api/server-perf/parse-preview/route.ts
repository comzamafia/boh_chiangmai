/**
 * POST /api/server-perf/parse-preview  (Admin only)
 *   body: { content } — raw Server Sales CSV text
 *
 * Parses the CSV WITHOUT saving. Returns the classified totals AND a list of
 * every unique breakdown-category name the parser encountered, so admins can
 * verify that alcohol categories are being picked up correctly.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireBranch, isBranchContext } from "@/lib/branch";
import { detectServerSales, parseServerSales, classifyBreakdownCategory } from "@/lib/server-sales-parser";

export const dynamic = "force-dynamic";

function splitCsvLine(line: string): string[] {
    const out: string[] = [];
    let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (inQ) {
            if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
            else cur += c;
        } else if (c === '"') inQ = true;
        else if (c === ",") { out.push(cur); cur = ""; }
        else cur += c;
    }
    out.push(cur);
    return out.map(s => s.trim());
}

export async function POST(req: NextRequest) {
    const ctx = await requireBranch();
    if (!isBranchContext(ctx)) return ctx;
    const { session } = ctx;
    if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { content } = await req.json();
    if (!content || typeof content !== "string") return NextResponse.json({ error: "Missing content" }, { status: 400 });
    if (!detectServerSales(content)) return NextResponse.json({ error: "Not a Server Sales CSV" }, { status: 400 });

    // Collect unique breakdown category names and how they are classified
    const lines = content.split(/\r?\n/);
    let mode: "none" | "breakdown" | "payment" = "none";
    const categoryDebug: { raw: string; bucket: string }[] = [];
    const seen = new Set<string>();

    for (const line of lines) {
        if (!line.trim()) continue;
        const c = splitCsvLine(line);
        const first = (c[0] ?? "").trim();
        const low = first.toLowerCase();
        if (low === "breakdown:") { mode = "breakdown"; continue; }
        if (low === "payment breakdown:") { mode = "payment"; continue; }
        if (low === "name" || low === "payment method") continue;
        if (/^\d{4}-\d{2}-\d{2}/.test(first) && c.length >= 17) { mode = "none"; continue; }
        if (mode === "breakdown" && c.length >= 4 && first && !seen.has(low)) {
            seen.add(low);
            categoryDebug.push({ raw: first, bucket: classifyBreakdownCategory(first) });
        }
    }

    const { rows, date } = parseServerSales(content);

    return NextResponse.json({
        date,
        servers: rows.length,
        staffNames: [...new Set(rows.map(r => r.staffName))],
        totals: {
            foodSales:     +rows.reduce((s, r) => s + r.foodSales, 0).toFixed(2),
            beverageSales: +rows.reduce((s, r) => s + r.beverageSales, 0).toFixed(2),
            alcoholSales:  +rows.reduce((s, r) => s + r.alcoholSales, 0).toFixed(2),
            dessertSales:  +rows.reduce((s, r) => s + r.dessertSales, 0).toFixed(2),
            otherSales:    +rows.reduce((s, r) => s + r.otherSales, 0).toFixed(2),
        },
        categoryDebug,
    });
}
