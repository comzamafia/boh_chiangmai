import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { cookies } from "next/headers";

const SECRET = new TextEncoder().encode(
    process.env.JWT_SECRET ?? "padthai-chaiyo-boh-secret-key-change-in-production"
);

export const COOKIE_NAME = "boh_session";
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export interface SessionPayload extends JWTPayload {
    userId: string;
    email: string;
    name: string;
    role: string;
    permissions: string[];
}

/** Sign a JWT and return the token string */
export async function signToken(payload: Omit<SessionPayload, "iat" | "exp">): Promise<string> {
    return new SignJWT(payload)
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("7d")
        .sign(SECRET);
}

/** Verify + decode a JWT token string */
export async function verifyToken(token: string): Promise<SessionPayload | null> {
    try {
        const { payload } = await jwtVerify(token, SECRET);
        return payload as SessionPayload;
    } catch {
        return null;
    }
}

/** Read the current session from request cookies (server component / route handler) */
export async function getSession(): Promise<SessionPayload | null> {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get(COOKIE_NAME)?.value;
        if (!token) return null;
        return verifyToken(token);
    } catch {
        return null;
    }
}
