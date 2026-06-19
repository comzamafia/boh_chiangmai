/**
 * Per-branch display names (Option A multi-branch).
 *
 * Each Vercel deployment sets these to its own branch; defaults keep the
 * original Mississauga branch working if unset. NEXT_PUBLIC_ vars are inlined
 * at build time and readable on both client and server.
 *
 *   NEXT_PUBLIC_STORE_NAME   full name, e.g. "Chiang Mai York Mills"
 *   NEXT_PUBLIC_STORE_SHORT  short location label, e.g. "York Mills"
 *   NEXT_PUBLIC_STORE_ID     stable slug for APIs, e.g. "yorkmills" (optional)
 */
export const STORE_NAME =
    (process.env.NEXT_PUBLIC_STORE_NAME ?? "").trim() || "Chiang Mai Mississauga";

export const STORE_SHORT =
    (process.env.NEXT_PUBLIC_STORE_SHORT ?? "").trim() || "Mississauga";

/**
 * Stable machine-readable branch id used by external systems to key data per
 * branch (e.g. "yorkmills", "parklawn"). Defaults to a slug of STORE_SHORT, but
 * can be pinned explicitly per branch via NEXT_PUBLIC_STORE_ID so the id never
 * changes even if the display label is edited later.
 */
export const STORE_ID =
    ((process.env.NEXT_PUBLIC_STORE_ID ?? "").trim() ||
        STORE_SHORT.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")) || "default";
