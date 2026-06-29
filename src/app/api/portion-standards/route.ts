/**
 * GET  /api/portion-standards          — list all portion standards
 * POST /api/portion-standards          — create a new portion standard
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireBranch, isBranchContext } from "@/lib/branch";
import { logAudit } from "@/lib/audit";

const INCLUDE = {
    ingredient: {
        select: {
            id: true, name: true, sku: true, recipeUnit: true, groupId: true,
            category: { select: { id: true, name: true, sortOrder: true } },
        },
    },
};

export async function GET() {
    const ctx = await requireBranch();
    if (!isBranchContext(ctx)) return ctx;
    const { branchId } = ctx;

    try {
        const rows = await prisma.portionStandard.findMany({
            where: { branchId },
            include: INCLUDE,
            orderBy: [
                { ingredient: { name: "asc" } },
                { itemName: "asc" },
            ],
        });
        return NextResponse.json(rows);
    } catch {
        return NextResponse.json({ error: "Failed to fetch portion standards" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    const ctx = await requireBranch();
    if (!isBranchContext(ctx)) return ctx;
    const { session, branchId } = ctx;
    if (!["admin", "manager"].includes(session.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    try {
        const body = await request.json();
        const { ingredientId, itemName, type, portionSize, portionUnit, notes } = body;

        if (!ingredientId || !itemName?.trim() || !portionSize || !portionUnit) {
            return NextResponse.json({ error: "ingredientId, itemName, portionSize and portionUnit are required" }, { status: 400 });
        }

        const row = await prisma.portionStandard.create({
            data: {
                ingredientId,
                itemName:    itemName.trim(),
                type:        type ?? "base",
                portionSize: Number(portionSize),
                portionUnit: portionUnit.trim(),
                notes:       notes?.trim() || null,
                branchId,
            },
            include: INCLUDE,
        });

        logAudit({
            session, action: "CREATE", targetTable: "PortionStandard",
            targetId: row.id, targetName: `${row.ingredient.name} — ${row.itemName}`,
            newValues: { portionSize: row.portionSize, portionUnit: row.portionUnit, type: row.type },
            branchId,
            request,
        });

        return NextResponse.json(row, { status: 201 });
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: "Failed to create portion standard" }, { status: 500 });
    }
}
