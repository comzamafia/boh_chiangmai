/**
 * GET    /api/purchase-orders/[id]   — single PO
 * PUT    /api/purchase-orders/[id]   — update status / fields (and items when provided)
 * DELETE /api/purchase-orders/[id]   — delete a PO
 */
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { NextRequest, NextResponse } from "next/server";

const INCLUDE = { items: true, supplier: { select: { id: true, name: true } } };

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const po = await prisma.purchaseOrder.findUnique({ where: { id }, include: INCLUDE });
        if (!po) return NextResponse.json({ error: "Not found" }, { status: 404 });
        return NextResponse.json(po);
    } catch {
        return NextResponse.json({ error: "Failed to fetch purchase order" }, { status: 500 });
    }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await getSession();
        if (!session || !["admin", "manager"].includes(session.role)) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        const { id } = await params;
        const body = await req.json();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data: Record<string, any> = {};
        if (body.status       !== undefined) data.status       = body.status;
        if (body.deliveryDate !== undefined) data.deliveryDate = body.deliveryDate || null;
        if (body.notes        !== undefined) data.notes        = body.notes || null;
        if (body.orderDate    !== undefined) data.orderDate    = body.orderDate;

        // Optional full item replacement (edit mode)
        if (Array.isArray(body.items)) {
            const lineItems = body.items
                .filter((i: { ingredientName?: string }) => (i.ingredientName ?? "").trim())
                .map((i: { ingredientId?: string; ingredientName: string; qty: number; unit: string; unitPrice: number }) => {
                    const qty = Number(i.qty) || 0;
                    const unitPrice = Number(i.unitPrice) || 0;
                    return {
                        ingredientId:   i.ingredientId || null,
                        ingredientName: i.ingredientName.trim(),
                        qty, unit: i.unit || "", unitPrice,
                        total: Math.round(qty * unitPrice * 100) / 100,
                    };
                });
            data.grandTotal = lineItems.reduce((s: number, i: { total: number }) => s + i.total, 0);
            await prisma.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id } });
            data.items = { create: lineItems };
        }

        const po = await prisma.purchaseOrder.update({ where: { id }, data, include: INCLUDE });

        logAudit({
            session,
            action:      "UPDATE",
            targetTable: "PurchaseOrder",
            targetId:    id,
            targetName:  `${po.poNumber} · ${po.supplierName}`,
            newValues:   { status: po.status },
            request:     req,
        });

        return NextResponse.json(po);
    } catch {
        return NextResponse.json({ error: "Failed to update purchase order" }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await getSession();
        if (!session || !["admin", "manager"].includes(session.role)) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        const { id } = await params;
        const po = await prisma.purchaseOrder.findUnique({ where: { id }, select: { poNumber: true, supplierName: true } });
        await prisma.purchaseOrder.delete({ where: { id } });

        if (po) {
            logAudit({
                session,
                action:      "DELETE",
                targetTable: "PurchaseOrder",
                targetId:    id,
                targetName:  `${po.poNumber} · ${po.supplierName}`,
                request:     req,
            });
        }
        return new NextResponse(null, { status: 204 });
    } catch {
        return NextResponse.json({ error: "Failed to delete purchase order" }, { status: 500 });
    }
}
