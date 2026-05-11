import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const date = searchParams.get("date");
        const entries = await prisma.salesEntry.findMany({
            where: date ? { date } : undefined,
            orderBy: { createdAt: "asc" },
        });
        return NextResponse.json(entries);
    } catch {
        return NextResponse.json({ error: "Failed to fetch sales" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { date, recipeId, recipeName, qty, unitPrice, unitCost, notes } = body;
        if (!date || !recipeName || !qty || !unitPrice) {
            return NextResponse.json({ error: "date, recipeName, qty, unitPrice are required" }, { status: 400 });
        }
        const revenue = Number(qty) * Number(unitPrice);
        const entry = await prisma.salesEntry.create({
            data: {
                date,
                recipeId: recipeId ?? null,
                recipeName,
                qty: Number(qty),
                unitPrice: Number(unitPrice),
                revenue,
                unitCost: unitCost != null ? Number(unitCost) : null,
                notes: notes ?? null,
            },
        });
        return NextResponse.json(entry, { status: 201 });
    } catch {
        return NextResponse.json({ error: "Failed to create sales entry" }, { status: 500 });
    }
}
