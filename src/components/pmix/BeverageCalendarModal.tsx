"use client";
/**
 * BeverageCalendarModal — thin wrapper around GroupCalendarModal that
 * binds the purple theme and beverageDaily fetcher. Kept for backwards
 * compatibility with existing callers.
 */
import GroupCalendarModal from "./GroupCalendarModal";
import { pmixApi } from "@/lib/api";

interface Props {
    group:     string;
    rangeFrom: string;
    rangeTo:   string;
    open:      boolean;
    onClose:   () => void;
}

export default function BeverageCalendarModal(props: Props) {
    return (
        <GroupCalendarModal
            {...props}
            color="purple"
            fetchFn={pmixApi.beverageDaily}
            exportPrefix="beverage"
        />
    );
}
