import { NextResponse } from "next/server";
import { COOKIE_NAME } from "@/lib/auth";
import { BRANCH_COOKIE } from "@/lib/branch";

export async function POST() {
    const response = NextResponse.json({ success: true });
    response.cookies.set(COOKIE_NAME, "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 0,
        path: "/",
    });
    response.cookies.set(BRANCH_COOKIE, "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 0,
        path: "/",
    });
    return response;
}
