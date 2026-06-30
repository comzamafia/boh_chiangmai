/**
 * Canonical list of POS category names treated as "beverages" in PMIX analytics.
 * Used for canonical ordering in output arrays — matching now uses classifyPosCategory().
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

/**
 * Classify a raw POS category name into a canonical drink bucket using
 * case-insensitive keyword matching — tolerant of singular/plural, brand names
 * like "Liquor"/"Alcohol"/"Spirits", and composite names like "Alcoholic Beverage(s)".
 *
 * ORDER MATTERS:
 *  - "alcohol" is tested BEFORE "beverage" because "Alcoholic Beverage" contains
 *    the word "beverage".
 *  - The non-alcoholic guard prevents "Non-Alcoholic Beverage" (which contains
 *    "alcohol") from being miscounted as spirits.
 *
 * Returns:
 *  "alcohol"  — spirits / wine / cocktails / shots / liquor (→ LIQUOR bucket)
 *  "beverage" — beer / mocktails / soft-drinks / non-alcoholic (→ BEVERAGE bucket)
 *  null       — food or unknown (caller treats as FOOD)
 */
export function classifyPosCategory(rawCategory: string): "alcohol" | "beverage" | null {
    const n = rawCategory.toLowerCase().trim();
    if (!n) return null;
    const isNonAlcoholic = /non[-\s]?alcohol/.test(n);
    if (
        !isNonAlcoholic &&
        /\balcohol|\bliquor|\bspirit|\bcocktail|\bwine\b|\bshots?\b|sake|soju|whisky|whiskey|\bvodka\b|\brum\b|\bgin\b|\btequila\b/.test(n)
    ) return "alcohol";
    if (/\bbeer\b|\bmocktail|\bbeverage|\bdrink\b|\bsoda\b|juice|\btea\b|coffee|smoothie|\bwater\b|non[-\s]?alcohol/.test(n)) return "beverage";
    return null;
}
