"use client";

import { useState, useEffect } from "react";
import { suppliersApi, Supplier } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select, SelectContent, SelectItem,
    SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
    Table, TableBody, TableCell, TableHead,
    TableHeader, TableRow
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Download, Search, Filter, Loader2, PackageCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCurrency } from "@/components/currency-context";

// ─── Types (mirrors purchase-orders/page.tsx) ─────────────────────────────────

interface POLineItem {
    id: string;
    ingredientId: string;
    ingredientName: string;
    qty: number;
    unit: string;
    unitPrice: number;
    total: number;
}

interface PurchaseOrder {
    id: string;
    poNumber: string;
    supplierId: string;
    supplierName: string;
    status: "Draft" | "Sent" | "Received" | "Cancelled";
    orderDate: string;
    deliveryDate: string;
    notes: string;
    items: POLineItem[];
    grandTotal: number;
    createdAt: string;
}

// Flat row for the table (one row per line item)
interface HistoryRow {
    rowId: string;
    poNumber: string;
    date: string;
    supplierId: string;
    supplierName: string;
    ingredientName: string;
    qty: number;
    unit: string;
    unitPrice: number;
    total: number;
}

function loadReceivedPOs(): PurchaseOrder[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = localStorage.getItem("padthai-purchase-orders");
        if (!raw) return [];
        const all: PurchaseOrder[] = JSON.parse(raw);
        return all.filter(po => po.status === "Received");
    } catch {
        return [];
    }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PurchaseHistoryPage() {
    const [rows, setRows]               = useState<HistoryRow[]>([]);
    const [suppliers, setSuppliers]     = useState<Supplier[]>([]);
    const [loading, setLoading]         = useState(true);
    const [searchTerm, setSearchTerm]   = useState("");
    const [supplierFilter, setSupplierFilter] = useState("all");
    const [dateFrom, setDateFrom]       = useState("");
    const [dateTo, setDateTo]           = useState("");
    const { format, symbol }            = useCurrency();

    useEffect(() => {
        suppliersApi.list()
            .then(sups => setSuppliers(sups))
            .finally(() => setLoading(false));

        // Expand received POs into flat line-item rows
        const pos = loadReceivedPOs();
        const flat: HistoryRow[] = pos.flatMap(po =>
            po.items.map(item => ({
                rowId:          `${po.id}-${item.id}`,
                poNumber:       po.poNumber,
                date:           po.orderDate,
                supplierId:     po.supplierId,
                supplierName:   po.supplierName,
                ingredientName: item.ingredientName,
                qty:            Number(item.qty),
                unit:           item.unit,
                unitPrice:      Number(item.unitPrice),
                total:          Number(item.total),
            }))
        );
        setRows(flat);
    }, []);

    // ── Filters ───────────────────────────────────────────────────────────────

    const filtered = rows.filter(r => {
        const matchSearch   = !searchTerm ||
            r.ingredientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            r.poNumber.toLowerCase().includes(searchTerm.toLowerCase());
        const matchSupplier = supplierFilter === "all" || r.supplierId === supplierFilter;
        const matchFrom     = !dateFrom || r.date >= dateFrom;
        const matchTo       = !dateTo   || r.date <= dateTo;
        return matchSearch && matchSupplier && matchFrom && matchTo;
    });

    const grandTotal = filtered.reduce((acc, r) => acc + r.total, 0);

    // ── Export CSV ────────────────────────────────────────────────────────────

    function exportCSV() {
        const headers = ["PO #", "Date", "Supplier", "Ingredient", "Qty", "Unit", "Unit Price", "Total"].join(",");
        const csvRows = filtered.map(r => [
            r.poNumber, r.date, r.supplierName, r.ingredientName,
            r.qty, r.unit, r.unitPrice.toFixed(2), r.total.toFixed(2)
        ].join(","));
        const csv  = [headers, ...csvRows].join("\n");
        const blob = new Blob([csv], { type: "text/csv" });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement("a");
        a.href = url;
        a.download = `purchase-history-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    // ── Loading ───────────────────────────────────────────────────────────────

    if (loading) return (
        <div className="flex justify-center items-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
    );

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div className="space-y-6 animate-in fade-in duration-500 pb-12">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-3xl font-bold font-playfair tracking-tight text-primary">Purchase History</h2>
                    <p className="text-muted-foreground flex items-center gap-1.5 mt-1">
                        <PackageCheck className="h-4 w-4 text-green-600" />
                        Showing received purchase orders only
                    </p>
                </div>
                <Button variant="outline" onClick={exportCSV}>
                    <Download className="mr-2 h-4 w-4" /> Export CSV
                </Button>
            </div>

            {/* Filters */}
            <Card>
                <CardHeader className="pb-4">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Filter className="h-4 w-4" /> Filters
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="relative">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search PO# or item..."
                                className="pl-8"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <Select value={supplierFilter} onValueChange={setSupplierFilter}>
                            <SelectTrigger>
                                <SelectValue placeholder="All Suppliers" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Suppliers</SelectItem>
                                {suppliers.map(s => (
                                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">From</Label>
                            <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">To</Label>
                            <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Table */}
            <div className="border rounded-md overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>PO #</TableHead>
                            <TableHead>Order Date</TableHead>
                            <TableHead>Supplier</TableHead>
                            <TableHead>Ingredient</TableHead>
                            <TableHead className="text-right">Qty</TableHead>
                            <TableHead className="text-right">Unit Price</TableHead>
                            <TableHead className="text-right">Total ({symbol})</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filtered.map(r => (
                            <TableRow key={r.rowId}>
                                <TableCell className="font-medium font-mono text-sm">{r.poNumber}</TableCell>
                                <TableCell>{r.date}</TableCell>
                                <TableCell>
                                    <Badge variant="outline">{r.supplierName}</Badge>
                                </TableCell>
                                <TableCell>{r.ingredientName}</TableCell>
                                <TableCell className="text-right">{r.qty} {r.unit}</TableCell>
                                <TableCell className="text-right">{format(r.unitPrice)}</TableCell>
                                <TableCell className="text-right font-semibold">{format(r.total)}</TableCell>
                            </TableRow>
                        ))}
                        {filtered.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                                    {rows.length === 0
                                        ? "No received purchase orders yet. Mark a PO as Received in Purchase Orders to see it here."
                                        : "No records match your filters."}
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Grand Total */}
            <div className="flex justify-end">
                <div className="bg-primary/5 border border-primary/20 rounded-lg px-6 py-3 text-right">
                    <span className="text-sm text-muted-foreground mr-4">Grand Total:</span>
                    <span className="text-2xl font-bold font-playfair text-primary">{format(grandTotal)}</span>
                </div>
            </div>
        </div>
    );
}
