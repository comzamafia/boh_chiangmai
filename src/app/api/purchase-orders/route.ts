/**
 * GET  /api/purchase-orders            — list all POs (newest first)
 * POST /api/purchase-orders            — create a PO with line items
 *   Body: {
 *     supplierId, supplierName, status?, orderDate, deliveryDate?, notes?,
 *     items: [{ ingredientId?, ingredientName, qty, unit, unitPrice }]
 *   }
 *   poNumber is generated server-side (PO-{year}-{seq}).
 */
import { prisma } from "@/lib/db";
import { requireBranch, isBranchContext } from "@/lib/branch";
import { logAudit } from "@/lib/audit";
import { NextRequest, NextResponse } from "next/server";

const INCLUDE = { items: true, supplier: { select: { id: true, name: true } } };

export async function GET() {
    try {
        const ctx = await requireBranch();
        if (!isBranchContext(ctx)) return ctx;
        const { branchId } = ctx;

        const orders = await prisma.purchaseOrder.findMany({
            where: { branchId },
            include: INCLUDE,
            orderBy: { createdAt: "desc" },
        });
        return NextResponse.json(orders);
    } catch {
        return NextResponse.json({ error: "Failed to fetch purchase orders" }, { status: 500 });
    }
}

/** Generate the next PO number for the current year, race-tolerant. */
async function nextPoNumber(branchId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `PO-${year}-`;
    const last = await prisma.purchaseOrder.findFirst({
        where:   { poNumber: { startsWith: prefix }, branchId },
        orderBy: { poNumber: "desc" },
        select:  { poNumber: true },
    });
    const lastSeq = last ? parseInt(last.poNumber.slice(prefix.length), 10) || 0 : 0;
    return `${prefix}${String(lastSeq + 1).padStart(4, "0")}`;
}

export async function POST(req: NextRequest) {
    try {
        const ctx = await requireBranch();
        if (!isBranchContext(ctx)) return ctx;
        const { session, branchId } = ctx;
        if (!["admin", "manager"].includes(session.role)) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const body = await req.json();
        const {
            supplierId, supplierName, status = "Draft",
            orderDate, deliveryDate, notes, items = [],
        } = body;

        if (!supplierId || !orderDate || !Array.isArray(items) || items.length === 0) {
            return NextResponse.json(
                { error: "supplierId, orderDate and at least one item are required" },
                { status: 400 },
            );
        }

        const lineItems = items
            .filter((i: { ingredientName?: string }) => (i.ingredientName ?? "").trim())
            .map((i: { ingredientId?: string; ingredientName: string; qty: number; unit: string; unitPrice: number }) => {
                const qty = Number(i.qty) || 0;
                const unitPrice = Number(i.unitPrice) || 0;
                return {
                    ingredientId:   i.ingredientId || null,
                    ingredientName: i.ingredientName.trim(),
                    qty,
                    unit:           i.unit || "",
                    unitPrice,
                    total:          Math.round(qty * unitPrice * 100) / 100,
                    branchId,
                };
            });

        const grandTotal = lineItems.reduce((s: number, i: { total: number }) => s + i.total, 0);

        // Retry once on the (rare) unique-poNumber race.
        let order;
        for (let attempt = 0; attempt < 2; attempt++) {
            const poNumber = await nextPoNumber(branchId);
            try {
                order = await prisma.purchaseOrder.create({
                    data: {
                        poNumber,
                        supplierId,
                        supplierName: supplierName ?? "",
                        status,
                        orderDate,
                        deliveryDate: deliveryDate || null,
                        notes:        notes || null,
                        grandTotal,
                        createdById:  session.userId ?? null,
                        branchId,
                        items:        { create: lineItems },
                    },
                    include: INCLUDE,
                });
                break;
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : "";
                if (msg.includes("Unique constraint") && attempt === 0) continue;
                throw e;
            }
        }

        if (order) {
            logAudit({
                session,
                action:      "CREATE",
                targetTable: "PurchaseOrder",
                targetId:    order.id,
                targetName:  `${order.poNumber} · ${order.supplierName}`,
                newValues:   { status: order.status, grandTotal: order.grandTotal, items: lineItems.length },
                branchId,
                request:     req,
            });
        }

        return NextResponse.json(order, { status: 201 });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Failed to create purchase order";
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
