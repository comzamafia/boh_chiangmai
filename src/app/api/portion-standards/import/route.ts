/**
 * POST /api/portion-standards/import
 *   body: { rows: [{ ingredient, itemName, type?, portionSize, portionUnit, notes? }] }
 *
 * Matches each row's `ingredient` (name, case-insensitive, or SKU) to a tracked
 * ingredient and upserts the portion standard keyed by (ingredient, itemName,
 * type). Returns a per-row result summary.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

interface ImportRow {
    ingredient?:  string;
    itemName?:    string;
    type?:        string;
    portionSize?: string | number;
    portionUnit?: string;
    notes?:       string;
}

export async function POST(request: Request) {
    const session = await getSession();
    if (!session || !["admin", "manager"].includes(session.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const rows: ImportRow[] = Array.isArray(body.rows) ? body.rows : [];
    if (rows.length === 0) return NextResponse.json({ error: "No rows to import" }, { status: 400 });

    // Ingredient lookup (by lowercased name and by SKU)
    const ingredients = await prisma.ingredient.findMany({ select: { id: true, name: true, sku: true } });
    const byName = new Map<string, string>();
    const bySku  = new Map<string, string>();
    for (const i of ingredients) {
        byName.set(i.name.toLowerCase().trim(), i.id);
        if (i.sku) bySku.set(i.sku.toLowerCase().trim(), i.id);
    }

    let created = 0, updated = 0;
    const errors: { row: number; reason: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const line = i + 2; // header is line 1
        const ingKey = String(r.ingredient ?? "").toLowerCase().trim();
        const itemName = String(r.itemName ?? "").trim();
        const portionSize = Number(r.portionSize);
        const portionUnit = String(r.portionUnit ?? "").trim();
        const type = (String(r.type ?? "base").toLowerCase().trim() === "modifier") ? "modifier" : "base";

        if (!ingKey)                         { errors.push({ row: line, reason: "Missing Ingredient" }); continue; }
        if (!itemName)                       { errors.push({ row: line, reason: "Missing Menu Item / Modifier" }); continue; }
        if (!Number.isFinite(portionSize) || portionSize <= 0) { errors.push({ row: line, reason: "Invalid Portion Size" }); continue; }
        if (!portionUnit)                    { errors.push({ row: line, reason: "Missing Unit" }); continue; }

        const ingredientId = byName.get(ingKey) ?? bySku.get(ingKey);
        if (!ingredientId)                   { errors.push({ row: line, reason: `Ingredient "${r.ingredient}" not found` }); continue; }

        const existing = await prisma.portionStandard.findFirst({
            where: { ingredientId, itemName: { equals: itemName, mode: "insensitive" }, type },
            select: { id: true },
        });

        if (existing) {
            await prisma.portionStandard.update({
                where: { id: existing.id },
                data:  { portionSize, portionUnit, notes: String(r.notes ?? "").trim() || null },
            });
            updated++;
        } else {
            await prisma.portionStandard.create({
                data: { ingredientId, itemName, type, portionSize, portionUnit, notes: String(r.notes ?? "").trim() || null },
            });
            created++;
        }
    }

    logAudit({
        session, action: "CREATE", targetTable: "PortionStandard",
        targetId: "import", targetName: `Portion standards import (${created} new, ${updated} updated)`,
        newValues: { created, updated, errors: errors.length },
        request,
    });

    return NextResponse.json({ created, updated, errors });
}
