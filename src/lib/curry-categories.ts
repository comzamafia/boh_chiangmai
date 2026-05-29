/**
 * Curry group definitions for PMIX analytics.
 *
 * Curry items are detected by matching itemName against the patterns below
 * (case-insensitive substring). Group order matters: more specific groups
 * are listed first so they win over broader patterns (e.g. "Khao Soi Surf
 * & Turf" must be matched before plain "Khao Soi", which excludes "surf").
 *
 * Edit this file to add / rename / reorganise curry groups.
 */
export interface CurryGroup {
    label:    string;
    patterns: string[];   // any-of substring match (lowercase)
    exclude?: string[];   // skip if itemName contains any of these
}

export const CURRY_GROUPS: CurryGroup[] = [
    { label: "Khao Soi Surf & Turf", patterns: ["khao soi surf"] },
    { label: "Khao Soi",             patterns: ["khao soi"], exclude: ["surf"] },
    { label: "Islamic Noodles",      patterns: ["islamic noodle"] },
    { label: "Green Curry",          patterns: ["green curry"] },
    // Panang Curry group bundles: Panang Curry, Duck Panang, Malay Curry
    { label: "Panang Curry",         patterns: ["panang", "malay curry"] },
    { label: "Massaman Curry",       patterns: ["massaman"] },
    { label: "Tom Kha",              patterns: ["tom kha"] },
];

export const CURRY_LABELS: readonly string[] = CURRY_GROUPS.map(g => g.label);

/**
 * Returns the canonical group label for an item name, or null if it is not
 * a curry. Designed to be called per-item during PMIX accumulation.
 */
export function matchCurryGroup(itemName: string): string | null {
    const lower = itemName.toLowerCase();
    for (const g of CURRY_GROUPS) {
        if (!g.patterns.some(p => lower.includes(p))) continue;
        if (g.exclude?.some(p => lower.includes(p)))   continue;
        return g.label;
    }
    return null;
}
