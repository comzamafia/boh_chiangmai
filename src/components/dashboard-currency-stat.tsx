"use client";

import { useCurrency } from "@/components/currency-context";

interface DashboardCurrencyStatProps {
    /** Raw amount in THB as stored in DB */
    amountTHB: number;
    decimals?: number;
}

/** Renders a THB amount formatted in the user's selected currency. Used by the server-rendered Dashboard page. */
export function DashboardCurrencyStat({ amountTHB, decimals = 2 }: DashboardCurrencyStatProps) {
    const { format } = useCurrency();
    return <span>{format(amountTHB, decimals)}</span>;
}
