/**
 * pmix-classifier.ts
 *
 * Shared item-name → category classification engine for PMIX analytics.
 *
 * How it works
 * ────────────
 * 1. Rules are loaded from `PmixItemRule` (DB), sorted by priority DESC.
 * 2. For each PmixItem that has NO protein/extra modifier (modifier-group-based
 *    items are handled separately), we run `classifyItem()`.
 * 3. The first matching rule wins. Matching modes: "exact" | "contains" | "starts_with".
 * 4. Result category: "main_protein" | "extra_protein" | "dessert" | "excluded" | null (no match).
 *
 * Null means "uncategorized" — shown to admins for review so they can add rules.
 */

export type ItemCategory = "main_protein" | "extra_protein" | "dessert" | "excluded";

export interface RuleRow {
    id:        string;
    pattern:   string;
    matchType: string;   // "exact" | "contains" | "starts_with"
    category:  string;
    label:     string | null;
    priority:  number;
    isActive:  boolean;
}

export interface ClassifyResult {
    category: ItemCategory;
    label:    string;   // protein type or dessert name to display
    ruleId:   string;
}

/**
 * Test a single item name against a sorted rule list.
 * Rules must already be sorted by priority DESC before calling.
 * Returns the first matching rule result, or null if no rule matches.
 */
export function classifyItem(
    itemName: string,
    rules: RuleRow[],
): ClassifyResult | null {
    const lower = itemName.toLowerCase().trim();

    for (const rule of rules) {
        if (!rule.isActive) continue;
        const pat = rule.pattern.toLowerCase().trim();

        let hit = false;
        switch (rule.matchType) {
            case "exact":       hit = lower === pat;           break;
            case "starts_with": hit = lower.startsWith(pat);  break;
            default:            hit = lower.includes(pat);     break; // "contains"
        }

        if (hit) {
            return {
                category: rule.category as ItemCategory,
                label:    rule.label ?? rule.pattern,
                ruleId:   rule.id,
            };
        }
    }
    return null;
}

/**
 * Given a list of PmixItem rows (each may have a `.modifiers` array),
 * decide whether it has already been classified via modifier groups.
 *
 * Rule: an item is "modifier-classified" if any of its modifiers belongs to
 * a group whose name contains "protein" (case-insensitive) or whose modifier
 * name starts with "Extra ".
 */
export function hasProteinModifier(
    modifiers: Array<{ modifierGroup: string; modifier: string; qtySold: number }>,
): boolean {
    return modifiers.some(m => {
        const grp  = (m.modifierGroup ?? "").toLowerCase();
        const name = (m.modifier      ?? "").toLowerCase();
        return grp.includes("protein") || grp.includes("extra") || name.startsWith("extra ");
    });
}
