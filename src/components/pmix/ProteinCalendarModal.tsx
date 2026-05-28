"use client";
/**
 * ProteinCalendarModal — thin wrapper around DailyCalendarModal.
 * Preserved for backwards compatibility; internally uses the generic component.
 */
import DailyCalendarModal, { type ParApplyItem } from "./DailyCalendarModal";
import { pmixApi, type ParSuggestion } from "@/lib/api";

interface Props {
    protein:        string;
    portionUnit:    string | null;
    rangeFrom:      string;
    rangeTo:        string;
    open:           boolean;
    onClose:        () => void;
    parSuggestion?: ParSuggestion | null;
    onApplyPar?:    (item: ParApplyItem) => Promise<void>;
}

export default function ProteinCalendarModal({
    protein, portionUnit, rangeFrom, rangeTo, open, onClose,
    parSuggestion, onApplyPar,
}: Props) {
    const showLb = portionUnit === "oz";
    return (
        <DailyCalendarModal
            itemName={protein}
            unitLabel={showLb ? "lb / day" : "orders / day"}
            color="teal"
            rangeFrom={rangeFrom}
            rangeTo={rangeTo}
            open={open}
            onClose={onClose}
            fetchFn={pmixApi.proteinDaily}
            showLb={showLb}
            parSuggestion={parSuggestion}
            onApplyPar={onApplyPar}
        />
    );
}
