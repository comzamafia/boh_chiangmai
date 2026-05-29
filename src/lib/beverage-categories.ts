/**
 * Canonical list of POS category names treated as "beverages" in PMIX analytics.
 * Matching is case-insensitive against item.category from the PMIX upload.
 *
 * Add or rename entries here whenever new beverage categories appear in the POS.
 */
export const BEVERAGE_CATEGORIES = [
    "Cocktails",
    "Classic Cocktails",
    "Beer",
    "Shots & Spirits",
    "Red Wine",
    "White Wine",
] as const;

export type BeverageCategory = typeof BEVERAGE_CATEGORIES[number];
