"use client";

import { Button } from "@/components/ui/button";
import {
    Select, SelectContent, SelectItem,
    SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

export interface PaginationState {
    page: number;
    pageSize: number;
}

interface DataPaginationProps {
    total: number;
    page: number;
    pageSize: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (size: number) => void;
    pageSizeOptions?: number[];
    className?: string;
}

export function DataPagination({
    total,
    page,
    pageSize,
    onPageChange,
    onPageSizeChange,
    pageSizeOptions = [10, 25, 50, 100],
    className = "",
}: DataPaginationProps) {
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const start = Math.min(total, (page - 1) * pageSize + 1);
    const end   = Math.min(total, page * pageSize);

    /** Clamp page on size change */
    const handleSizeChange = (val: string) => {
        const size = Number(val);
        const newMaxPage = Math.max(1, Math.ceil(total / size));
        onPageSizeChange(size);
        if (page > newMaxPage) onPageChange(newMaxPage);
    };

    return (
        <div className={`flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 ${className}`}>
            {/* Row count info */}
            <p className="text-sm text-muted-foreground tabular-nums order-2 sm:order-1">
                {total === 0 ? "No results" : `${start}–${end} of ${total}`}
            </p>

            {/* Controls */}
            <div className="flex items-center gap-2 order-1 sm:order-2">
                {/* Page size */}
                <span className="text-sm text-muted-foreground whitespace-nowrap hidden sm:inline">Rows per page</span>
                <Select value={String(pageSize)} onValueChange={handleSizeChange}>
                    <SelectTrigger className="h-8 w-[68px] text-sm">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent side="top">
                        {pageSizeOptions.map(n => (
                            <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                {/* Navigation */}
                <div className="flex items-center gap-1">
                    <Button
                        variant="outline" size="icon" className="h-8 w-8"
                        onClick={() => onPageChange(1)}
                        disabled={page <= 1}
                        aria-label="First page"
                    >
                        <ChevronsLeft className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="outline" size="icon" className="h-8 w-8"
                        onClick={() => onPageChange(page - 1)}
                        disabled={page <= 1}
                        aria-label="Previous page"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </Button>

                    <span className="text-sm tabular-nums px-1 min-w-[80px] text-center">
                        {page} / {totalPages}
                    </span>

                    <Button
                        variant="outline" size="icon" className="h-8 w-8"
                        onClick={() => onPageChange(page + 1)}
                        disabled={page >= totalPages}
                        aria-label="Next page"
                    >
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="outline" size="icon" className="h-8 w-8"
                        onClick={() => onPageChange(totalPages)}
                        disabled={page >= totalPages}
                        aria-label="Last page"
                    >
                        <ChevronsRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        </div>
    );
}

/** Slice any array to the current page window */
export function paginate<T>(items: T[], page: number, pageSize: number): T[] {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
}
