"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import {
    CurrencyCode,
    DEFAULT_CURRENCY,
    formatCurrency,
    getCurrencySymbol,
} from "@/lib/currency";

const STORAGE_KEY = "padthai-currency";

interface CurrencyContextValue {
    /** Currently selected currency */
    currency: CurrencyCode;
    /** Change the active currency */
    setCurrency: (code: CurrencyCode) => void;
    /**
     * Format an amount (stored as THB in DB) to the current currency string.
     * @param amount   THB amount
     * @param decimals Decimal places (default 2)
     */
    format: (amount: number, decimals?: number) => string;
    /** Just the symbol (e.g. "CA$", "US$", "฿") */
    symbol: string;
}

const CurrencyContext = createContext<CurrencyContextValue>({
    currency: DEFAULT_CURRENCY,
    setCurrency: () => {},
    format: (amount, decimals) => formatCurrency(amount, DEFAULT_CURRENCY, decimals),
    symbol: getCurrencySymbol(DEFAULT_CURRENCY),
});

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
    const [currency, setCurrencyState] = useState<CurrencyCode>(DEFAULT_CURRENCY);

    // Restore from localStorage on mount
    useEffect(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY) as CurrencyCode | null;
            if (stored && (["CAD"] as string[]).includes(stored)) {
                setCurrencyState(stored);
            }
        } catch {
            // localStorage not available (SSR safeguard)
        }
    }, []);

    const setCurrency = (code: CurrencyCode) => {
        setCurrencyState(code);
        try {
            localStorage.setItem(STORAGE_KEY, code);
        } catch {
            // ignore
        }
    };

    const format = (amount: number, decimals: number = 2): string =>
        formatCurrency(amount, currency, decimals);

    const symbol = getCurrencySymbol(currency);

    return (
        <CurrencyContext.Provider value={{ currency, setCurrency, format, symbol }}>
            {children}
        </CurrencyContext.Provider>
    );
}

/** Hook to access the current currency formatter from any client component. */
export function useCurrency(): CurrencyContextValue {
    return useContext(CurrencyContext);
}
