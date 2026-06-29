/**
 * Per-branch display names.
 *
 * Legacy env-var-based constants are kept as fallbacks for code that hasn't
 * been migrated to the DB-driven branch system yet.
 */
export const STORE_NAME =
    (process.env.NEXT_PUBLIC_STORE_NAME ?? "").trim() || "Chiang Mai Mississauga";

export const STORE_SHORT =
    (process.env.NEXT_PUBLIC_STORE_SHORT ?? "").trim() || "Mississauga";

export const STORE_ID =
    ((process.env.NEXT_PUBLIC_STORE_ID ?? "").trim() ||
        STORE_SHORT.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")) || "default";

export interface BranchBranding {
    STORE_NAME: string;
    STORE_SHORT: string;
    STORE_ID: string;
}

export function brandingFromBranch(branch: { name: string; slug: string }): BranchBranding {
    return {
        STORE_NAME: branch.name,
        STORE_SHORT: branch.slug,
        STORE_ID: branch.slug,
    };
}
