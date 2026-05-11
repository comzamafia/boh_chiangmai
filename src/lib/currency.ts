/**
 * Currency configuration for Chiang Mai BOH
 * Base currency stored in DB: THB (฿)
 * Exchange rates: 1 THB = X other currency
 */

export type CurrencyCode = "CAD" | "USD" | "THB";

export interface CurrencyConfig {
    code: CurrencyCode;
    symbol: string;
    label: string;
    /** How many units of this currency equals 1 THB */
    rateFromTHB: number;
}

/** Approximate exchange rates (1 THB → target currency) */
export const CURRENCIES: Record<CurrencyCode, CurrencyConfig> = {
    CAD: {
        code: "CAD",
        symbol: "CA$",
        label: "$CAD",
        rateFromTHB: 0.037,   // 1 THB ≈ 0.037 CAD  (1 CAD ≈ 27 THB)
    },
    USD: {
        code: "USD",
        symbol: "US$",
        label: "$USD",
        rateFromTHB: 0.028,   // 1 THB ≈ 0.028 USD  (1 USD ≈ 35.7 THB)
    },
    THB: {
        code: "THB",
        symbol: "฿",
        label: "฿THB",
        rateFromTHB: 1.0,
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
