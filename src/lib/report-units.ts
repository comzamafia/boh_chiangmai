/**
 * Display-unit conversion for the Station Prep Report.
 *
 * The report engine returns ingredient quantities in each ingredient's
 * `recipeUnit`. This helper lets the UI show that quantity in a chosen unit
 * (per ingredient, inline) — standard weight/volume units within the same
 * measurement group, plus the ingredient's own purchase unit via conversionRate.
 */

// Canonical factors (to grams / to millilitres)
const WEIGHT_TO_G: Record<string, number> = { g: 1, gram: 1, grams: 1, kg: 1000, lb: 453.592, lbs: 453.592, oz: 28.3495 };
const VOLUME_TO_ML: Record<string, number> = { ml: 1, milliliter: 1, l: 1000, liter: 1000, litre: 1000 };

const WEIGHT_UNITS = ["g", "kg", "lb", "oz"];
const VOLUME_UNITS = ["ml", "L"];

export interface UnitMeta {
    recipeUnit: string;
    groupId: string;        // "Weight" | "Volume" | "Count"
    conversionRate: number; // 1 purchaseUnit = conversionRate recipeUnits
    purchaseUnit: string;
}

function norm(u: string) { return u.trim().toLowerCase(); }

/** Ordered list of units the user may pick for this ingredient. */
export function unitOptions(m: UnitMeta): string[] {
    const opts: string[] = [m.recipeUnit];
    const ru = norm(m.recipeUnit);
    const group = (m.groupId ?? "").toLowerCase();

    if (group.includes("weight") && ru in WEIGHT_TO_G) {
        for (const u of WEIGHT_UNITS) if (norm(u) !== ru) opts.push(u);
    } else if (group.includes("volume") && ru in VOLUME_TO_ML) {
        for (const u of VOLUME_UNITS) if (norm(u) !== ru) opts.push(u);
    }
    // Purchase unit (e.g. Case, Bag, lb) via conversion rate
    if (m.conversionRate > 0 && m.purchaseUnit && norm(m.purchaseUnit) !== ru && !opts.some(o => norm(o) === norm(m.purchaseUnit))) {
        opts.push(m.purchaseUnit);
    }
    return opts;
}

/** Convert a quantity expressed in recipeUnit into `target`. Returns null if not convertible. */
export function convertQty(qtyInRecipeUnit: number, target: string, m: UnitMeta): number | null {
    const ru = norm(m.recipeUnit);
    const tu = norm(target);
    if (tu === ru) return qtyInRecipeUnit;

    // Purchase unit
    if (m.purchaseUnit && tu === norm(m.purchaseUnit) && m.conversionRate > 0) {
        return qtyInRecipeUnit / m.conversionRate;
    }
    // Weight
    if (ru in WEIGHT_TO_G && tu in WEIGHT_TO_G) {
        return (qtyInRecipeUnit * WEIGHT_TO_G[ru]) / WEIGHT_TO_G[tu];
    }
    // Volume
    if (ru in VOLUME_TO_ML && tu in VOLUME_TO_ML) {
        return (qtyInRecipeUnit * VOLUME_TO_ML[ru]) / VOLUME_TO_ML[tu];
    }
    return null;
}

/** Format a converted quantity with sensible precision. */
export function fmtQty(n: number): string {
    if (n === 0) return "0";
    const abs = Math.abs(n);
    const dp = abs >= 100 ? 0 : abs >= 10 ? 1 : abs >= 1 ? 2 : 3;
    return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: dp });
}
