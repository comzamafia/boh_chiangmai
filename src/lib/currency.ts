/**
 * Currency configuration for Chiang Mai BOH
 * Base currency stored in DB: THB (฿)
 * Exchange rates: 1 THB = X other currency
 */

export type CurrencyCode = "CAD";

export interface CurrencyConfig {
    code: CurrencyCode;
    symbol: string;
    label: string;
    /** How many units of this currency equals 1 THB */
    rateFromTHB: number;
}

/** Exchange rate: 1 THB → CAD */
export const CURRENCIES: Record<CurrencyCode, CurrencyConfig> = {
    CAD: {
        code: "CAD",
        symbol: "CA$",
        label: "$CAD",
        rateFromTHB: 0.037,   // 1 THB ≈ 0.037 CAD  (1 CAD ≈ 27 THB)
    },
};

export const DEFAULT_CURRENCY: CurrencyCode = "CAD";

/**
 * Convert an amount from THB and format it with the target currency symbol.
 * @param amountTHB  Raw amount in Thai Baht (as stored in DB)
 * @param currency   Target currency code
 * @param decimals   Decimal places (default 2)
 */
export function formatCurrency(
    amountTHB: number,
    currency: CurrencyCode,
    decimals: number = 2
): string {
    const cfg = CURRENCIES[currency];
    const converted = amountTHB * cfg.rateFromTHB;
    return `${cfg.symbol}${converted.toFixed(decimals)}`;
}

/**
 * Return only the currency symbol for the given code.
 */
export function getCurrencySymbol(currency: CurrencyCode): string {
    return CURRENCIES[currency].symbol;
}
