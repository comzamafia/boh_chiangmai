import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { signToken, COOKIE_NAME, COOKIE_MAX_AGE } from "@/lib/auth";

export async function POST(request: Request) {
    try {
        const { email, password } = await request.json();

        if (!email || !password) {
            return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
        }

        const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });

        if (!user || !user.isActive) {
            return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
        }

        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
            return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
        }

        const token = await signToken({
            userId: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            permissions: user.permissions,
        });

        const response = NextResponse.json({
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            permissions: user.permissions,
        });

        response.cookies.set(COOKIE_NAME, token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: COOKIE_MAX_AGE,
            path: "/",
        });

        return response;
    } catch (err) {
        console.error("Login error:", err);
        return NextResponse.json({ error: "Authentication failed" }, { status: 500 });
    }
}
