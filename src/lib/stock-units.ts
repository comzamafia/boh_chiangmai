/**
 * stock-units.ts — the single source of truth for inventory unit conversions.
 *
 * Three-layer chain (largest → smallest):
 *
 *   1 pack (ลัง)  = packSize  purchaseUnits        (e.g. 1 Case = 50 lb)
 *   1 purchaseUnit = conversionRate recipeUnits     (e.g. 1 lb  = 16 oz)
 *   → 1 pack       = packSize × conversionRate recipeUnits  (1 Case = 800 oz)
 *
 * `currentStock` is always stored in recipeUnits, so every count is converted
 * down to recipeUnits before saving.
 */

export interface StockUnitConfig {
    /** Recipe (base) unit, e.g. "oz", "g", "ml", "piece". Stock is stored here. */
    recipeUnit:     string;
    /** Purchase unit, e.g. "lb", "kg". */
    purchaseUnit:   string;
    /** 1 purchaseUnit = conversionRate recipeUnits. */
    conversionRate: number;
    /** Optional pack label, e.g. "Case", "ลัง". Null = no pack layer. */
    packUnit:       string | null;
    /** 1 pack = packSize purchaseUnits. Null/0 = no pack layer. */
    packSize:       number | null;
}

/** A physical count entered by staff, in up to three units at once. */
export interface CountEntry {
    packs?:    number;   // whole packs / cases
    purchase?: number;   // loose purchase units (lb)
    recipe?:   number;   // loose recipe units (oz)
}

/** True when this item has a usable pack layer configured. */
export function hasPack(cfg: Pick<StockUnitConfig, "packUnit" | "packSize">): boolean {
    return !!cfg.packUnit && !!cfg.packSize && cfg.packSize > 0;
}

/** How many recipeUnits are in one pack (0 when no pack configured). */
export function recipeUnitsPerPack(cfg: StockUnitConfig): number {
    if (!hasPack(cfg)) return 0;
    return (cfg.packSize ?? 0) * cfg.conversionRate;
}

/** How many recipeUnits are in one purchaseUnit. */
export function recipeUnitsPerPurchase(cfg: StockUnitConfig): number {
    return cfg.conversionRate > 0 ? cfg.conversionRate : 1;
}

/**
 * Convert a mixed-unit physical count into total recipeUnits.
 * e.g. { packs: 2, purchase: 10, recipe: 4 } with 1 case=50lb, 1lb=16oz
 *      → 2×800 + 10×16 + 4 = 1764 oz
 */
export function countToRecipeUnits(entry: CountEntry, cfg: StockUnitConfig): number {
    const fromPacks    = (entry.packs    ?? 0) * recipeUnitsPerPack(cfg);
    const fromPurchase = (entry.purchase ?? 0) * recipeUnitsPerPurchase(cfg);
    const fromRecipe   = (entry.recipe   ?? 0);
    return round4(fromPacks + fromPurchase + fromRecipe);
}

/** True when the entry has at least one non-empty number. */
export function countHasValue(entry: CountEntry): boolean {
    return [entry.packs, entry.purchase, entry.recipe].some(v => v != null && v !== 0 && !Number.isNaN(v));
}

/** Express a recipeUnit amount as { packs, purchase, recipe } for display. */
export function recipeUnitsToBreakdown(recipeQty: number, cfg: StockUnitConfig): {
    packs: number; purchase: number; recipe: number;
} {
    let remaining = recipeQty;
    let packs = 0, purchase = 0;

    const perPack = recipeUnitsPerPack(cfg);
    if (perPack > 0) {
        packs = Math.floor(remaining / perPack);
        remaining = round4(remaining - packs * perPack);
    }
    const perPurch = recipeUnitsPerPurchase(cfg);
    if (perPurch > 1) {
        purchase = Math.floor(remaining / perPurch);
        remaining = round4(remaining - purchase * perPurch);
    }
    return { packs, purchase, recipe: round4(remaining) };
}

/** Human label, e.g. "2 Case + 10 lb + 4 oz". Skips zero parts. */
export function describeBreakdown(entry: CountEntry, cfg: StockUnitConfig): string {
    const parts: string[] = [];
    if (entry.packs)    parts.push(`${trimNum(entry.packs)} ${cfg.packUnit ?? "pack"}`);
    if (entry.purchase) parts.push(`${trimNum(entry.purchase)} ${cfg.purchaseUnit}`);
    if (entry.recipe)   parts.push(`${trimNum(entry.recipe)} ${cfg.recipeUnit}`);
    return parts.length ? parts.join(" + ") : `0 ${cfg.recipeUnit}`;
}

/** Convert recipeUnits → purchaseUnits (for "≈ N lb" previews). */
export function recipeToPurchase(recipeQty: number, cfg: StockUnitConfig): number {
    return cfg.conversionRate > 0 ? round4(recipeQty / cfg.conversionRate) : recipeQty;
}

/** Convert recipeUnits → packs (fractional, for "≈ N cases" previews). */
export function recipeToPacks(recipeQty: number, cfg: StockUnitConfig): number | null {
    const perPack = recipeUnitsPerPack(cfg);
    return perPack > 0 ? round4(recipeQty / perPack) : null;
}

// ─── internals ────────────────────────────────────────────────────────────────
function round4(n: number): number {
    return Math.round(n * 10000) / 10000;
}
function trimNum(n: number): string {
    return n % 1 === 0 ? String(n) : String(round4(n));
}
