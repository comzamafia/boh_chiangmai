import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSession } from "@/lib/auth";

// GET all users (admin sees all fields; manager sees limited fields for watcher mgmt)
export async function GET() {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (session.role === "admin") {
        const users = await prisma.user.findMany({
            select: { id: true, name: true, email: true, role: true, permissions: true, department: true, isActive: true, createdAt: true },
            orderBy: { createdAt: "asc" },
        });
        return NextResponse.json(users);
    }

    if (session.role === "manager") {
        const users = await prisma.user.findMany({
            select: { id: true, name: true, email: true, role: true, department: true, isActive: true },
            where:   { isActive: true },
            orderBy: { name: "asc" },
        });
        return NextResponse.json(users);
    }

    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

// POST create user (admin only)
export async function POST(request: Request) {
    const session = await getSession();
    if (!session || session.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    try {
        const body = await request.json();
        const { name, email, password, role, permissions } = body;
        if (!name || !email || !password) {
            return NextResponse.json({ error: "name, email and password are required" }, { status: 400 });
        }
        const hashed = await bcrypt.hash(password, 12);
        const user = await prisma.user.create({
            data: {
                name, email: email.toLowerCase().trim(),
                password: hashed,
                role: role ?? "staff",
                permissions: permissions ?? [],
            },
            select: { id: true, name: true, email: true, role: true, permissions: true, isActive: true, createdAt: true },
        });
        return NextResponse.json(user, { status: 201 });
    } catch (err: unknown) {
        if ((err as { code?: string }).code === "P2002") {
            return NextResponse.json({ error: "Email already exists" }, { status: 409 });
        }
        return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
    }
}
