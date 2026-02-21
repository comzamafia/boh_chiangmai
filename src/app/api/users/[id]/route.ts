import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSession } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

// GET single user
export async function GET(_req: Request, { params }: Params) {
    const session = await getSession();
    if (!session || session.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    const user = await prisma.user.findUnique({
        where: { id },
        select: { id: true, name: true, email: true, role: true, permissions: true, isActive: true, createdAt: true },
    });
    if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(user);
}

// PUT update user
export async function PUT(request: Request, { params }: Params) {
    const session = await getSession();
    if (!session || session.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    try {
        const body = await request.json();
        const data: Record<string, unknown> = {
            name: body.name,
            email: body.email?.toLowerCase().trim(),
            role: body.role,
            permissions: body.permissions ?? [],
            isActive: body.isActive ?? true,
        };
        if (body.password) {
            data.password = await bcrypt.hash(body.password, 12);
        }
        const user = await prisma.user.update({
            where: { id },
            data,
            select: { id: true, name: true, email: true, role: true, permissions: true, isActive: true, createdAt: true },
        });
        return NextResponse.json(user);
    } catch {
        return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
    }
}

// DELETE user
export async function DELETE(_req: Request, { params }: Params) {
    const session = await getSession();
    if (!session || session.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    // Prevent self-deletion
    if (id === session.userId) {
        return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 });
    }
    await prisma.user.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
}
