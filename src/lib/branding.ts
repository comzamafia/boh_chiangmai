/**
 * Per-branch display names (Option A multi-branch).
 *
 * Each Vercel deployment sets these to its own branch; defaults keep the
 * original Mississauga branch working if unset. NEXT_PUBLIC_ vars are inlined
 * at build time and readable on both client and server.
 *
 *   NEXT_PUBLIC_STORE_NAME   full name, e.g. "Chiang Mai York Mills"
 *   NEXT_PUBLIC_STORE_SHORT  short location label, e.g. "York Mills"
 */
export const STORE_NAME =
    (process.env.NEXT_PUBLIC_STORE_NAME ?? "").trim() || "Chiang Mai Mississauga";

export const STORE_SHORT =
    (process.env.NEXT_PUBLIC_STORE_SHORT ?? "").trim() || "Mississauga";
