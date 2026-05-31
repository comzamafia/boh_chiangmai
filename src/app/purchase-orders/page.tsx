"use client";

import { useState, useEffect, useRef } from "react";
import { suppliersApi, ingredientsApi, inventoryApi, purchaseOrdersApi, Supplier, Ingredient, InventoryAlert, type PurchaseOrder as ApiPurchaseOrder } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Table, TableBody, TableCell, TableHead,
    TableHeader, TableRow,
} from "@/components/ui/table";
import {
    Select, SelectContent, SelectItem,
    SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
    Dialog, DialogContent, DialogHeader,
    DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
    FilePlus2, Printer, Trash2, Plus, X, Search,
    CheckCircle2, Clock, PackageCheck, XCircle, ChevronRight,
    Loader2, FileText, Send, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type POStatus = "Draft" | "Sent" | "Received" | "Cancelled";

interface POLineItem {
    id: string;
    ingredientId: string;
    ingredientName: string;
    qty: number;
    unit: string;
    unitPrice: number;
    total: number;
    receivedQty?: number | null;
}

interface PurchaseOrder {
    id: string;
    poNumber: string;
    supplierId: string;
    supplierName: string;
    status: POStatus;
    orderDate: string;
    deliveryDate: string;
    notes: string;
    items: POLineItem[];
    grandTotal: number;
    createdAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<POStatus, { label: string; icon: React.ElementType; className: string }> = {
    Draft:     { label: "Draft",     icon: Clock,         className: "bg-slate-100 text-slate-700 border-slate-300" },
    Sent:      { label: "Sent",      icon: Send,          className: "bg-blue-50 text-blue-700 border-blue-300" },
    Received:  { label: "Received",  icon: PackageCheck,  className: "bg-green-50 text-green-700 border-green-300" },
    Cancelled: { label: "Cancelled", icon: XCircle,       className: "bg-red-50 text-red-700 border-red-300" },
};

function StatusBadge({ status }: { status: POStatus }) {
    const cfg = STATUS_CONFIG[status];
    const Icon = cfg.icon;
    return (
        <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold", cfg.className)}>
            <Icon className="h-3 w-3" />
            {cfg.label}
        </span>
    );
}


const UNITS = ["kg", "lbs", "g", "oz", "L", "ml", "piece", "dozen", "pack", "bag", "bottle", "box", "case"];

// Defined outside component to avoid hoisting issues and React Fast Refresh warnings
function emptyLineItem(): POLineItem {
    return { id: `li-${Date.now()}-${Math.random()}`, ingredientId: "", ingredientName: "", qty: 1, unit: "kg", unitPrice: 0, total: 0 };
}

/** Map an API PurchaseOrder into the local (null-free) shape this page uses. */
function fromApi(po: ApiPurchaseOrder): PurchaseOrder {
    return {
        id:           po.id,
        poNumber:     po.poNumber,
        supplierId:   po.supplierId,
        supplierName: po.supplierName,
        status:       po.status as POStatus,
        orderDate:    po.orderDate,
        deliveryDate: po.deliveryDate ?? "",
        notes:        po.notes ?? "",
        grandTotal:   Number(po.grandTotal),
        createdAt:    po.createdAt,
        items: (po.items ?? []).map(i => ({
            id:             i.id ?? `li-${Math.random()}`,
            ingredientId:   i.ingredientId ?? "",
            ingredientName: i.ingredientName,
            qty:            Number(i.qty),
            unit:           i.unit,
            unitPrice:      Number(i.unitPrice),
            total:          Number(i.total),
            receivedQty:    i.receivedQty != null ? Number(i.receivedQty) : null,
        })),
    };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PurchaseOrdersPage() {
    const [suppliers, setSuppliers]   = useState<Supplier[]>([]);
    const [ingredients, setIngredients] = useState<Ingredient[]>([]);
    const [orders, setOrders]         = useState<PurchaseOrder[]>([]);
    const [loading, setLoading]       = useState(true);
    const [search, setSearch]         = useState("");
    const [statusFilter, setStatusFilter] = useState<POStatus | "All">("All");
    const [stockAlerts, setStockAlerts] = useState<InventoryAlert[]>([]);
    const [alertsDismissed, setAlertsDismissed] = useState(false);

    // Views: "list" | "create" | "detail"
    const [view, setView]         = useState<"list" | "create" | "detail">("list");
    const [detailPO, setDetailPO] = useState<PurchaseOrder | null>(null);
    const [confirmCancel, setConfirmCancel] = useState<PurchaseOrder | null>(null);

    // Receive-goods dialog
    const [receivePO,    setReceivePO]    = useState<PurchaseOrder | null>(null);
    const [receiveDate,  setReceiveDate]  = useState(new Date().toISOString().split("T")[0]);
    const [receiveLines, setReceiveLines] = useState<Record<string, { qty: string; price: string }>>({});
    const [receiving,    setReceiving]    = useState(false);

    // New PO form state
    const [poSupplier, setPoSupplier]       = useState("");
    const [poOrderDate, setPoOrderDate]     = useState(new Date().toISOString().split("T")[0]);
    const [poDeliveryDate, setPoDeliveryDate] = useState("");
    const [poNotes, setPoNotes]             = useState("");
    const [poItems, setPoItems]             = useState<POLineItem[]>([emptyLineItem()]);
    const [saveSuccess, setSaveSuccess]     = useState(false);
    const [formErrors, setFormErrors]       = useState<string[]>([]);
    const [itemErrors, setItemErrors]       = useState<Record<string, boolean>>({});

    const printRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        Promise.all([
            suppliersApi.list(),
            ingredientsApi.list(),
            inventoryApi.alerts().catch(() => []),
            purchaseOrdersApi.list().catch(() => [] as ApiPurchaseOrder[]),
        ])
            .then(([sups, ings, alrts, pos]) => {
                setSuppliers(sups);
                setIngredients(ings);
                setStockAlerts(alrts);
                setOrders(pos.map(fromApi));
            })
            .finally(() => setLoading(false));
    }, []);

    // ── Computed ───────────────────────────────────────────────────────────────

    const filteredOrders = orders.filter(o => {
        const matchSearch = !search ||
            o.poNumber.toLowerCase().includes(search.toLowerCase()) ||
            o.supplierName.toLowerCase().includes(search.toLowerCase());
        const matchStatus = statusFilter === "All" || o.status === statusFilter;
        return matchSearch && matchStatus;
    });

    const grandTotal = poItems.reduce((s, i) => s + (i.total || 0), 0);

    const supplierIngredients = ingredients.filter(i =>
        !poSupplier || i.supplierId === poSupplier
    );

    // ── Line Items ─────────────────────────────────────────────────────────────

    function addItem() { setPoItems(p => [...p, emptyLineItem()]); }

    function removeItem(id: string) { setPoItems(p => p.filter(i => i.id !== id)); }

    function updateItem(id: string, field: keyof POLineItem, value: string | number) {
        setPoItems(prev => prev.map(item => {
            if (item.id !== id) return item;
            const updated = { ...item, [field]: value };
            const qty   = isNaN(Number(updated.qty))   ? 0 : Number(updated.qty);
            const price = isNaN(Number(updated.unitPrice)) ? 0 : Number(updated.unitPrice);
            updated.total = parseFloat((qty * price).toFixed(2));
            return updated;
        }));
        // Clear per-item error when user edits ingredient name
        if (field === "ingredientName") {
            setItemErrors(prev => { const { [id]: _, ...rest } = prev; return rest; });
        }
    }

    function fillFromIngredient(lineId: string, ing: Ingredient) {
        setPoItems(prev => prev.map(item => {
            if (item.id !== lineId) return item;
            const price = Number(ing.purchasePrice) || 0;
            return {
                ...item,
                ingredientId:   ing.id,
                ingredientName: ing.name,
                unit:           ing.purchaseUnit,
                unitPrice:      price,
                total:          parseFloat((item.qty * price).toFixed(2)),
            };
        }));
        // Clear validation error for this item once a product is selected
        setItemErrors(prev => { const { [lineId]: _, ...rest } = prev; return rest; });
    }

    // ── Save PO ────────────────────────────────────────────────────────────────

    function validateForm(): boolean {
        const errors: string[] = [];
        const newItemErrors: Record<string, boolean> = {};

        if (!poSupplier) errors.push("Please select a Supplier.");

        const filledItems = poItems.filter(i => i.ingredientName.trim());
        if (filledItems.length === 0) {
            errors.push("Please enter at least one line item with a product name.");
            // Mark all empty items
            poItems.forEach(i => { if (!i.ingredientName.trim()) newItemErrors[i.id] = true; });
        }

        setFormErrors(errors);
        setItemErrors(newItemErrors);
        return errors.length === 0;
    }

    async function saveDraft(sendNow = false) {
        if (!validateForm()) return;
        const supplier = suppliers.find(s => s.id === poSupplier);
        try {
            const created = await purchaseOrdersApi.create({
                supplierId:   poSupplier,
                supplierName: supplier?.name ?? "Unknown",
                status:       sendNow ? "Sent" : "Draft",
                orderDate:    poOrderDate,
                deliveryDate: poDeliveryDate || null,
                notes:        poNotes || null,
                items: poItems
                    .filter(i => i.ingredientName.trim())
                    .map(i => ({
                        ingredientId:   i.ingredientId || null,
                        ingredientName: i.ingredientName.trim(),
                        qty:            i.qty,
                        unit:           i.unit,
                        unitPrice:      i.unitPrice,
                    })),
            });
            setOrders(prev => [fromApi(created), ...prev]);
            setFormErrors([]);
            setSaveSuccess(true);
            setTimeout(() => {
                setSaveSuccess(false);
                setView("list");
                resetForm();
            }, 1500);
        } catch (e) {
            setFormErrors([e instanceof Error ? e.message : "Failed to save purchase order"]);
        }
    }

    function resetForm() {
        setPoSupplier(""); setPoOrderDate(new Date().toISOString().split("T")[0]);
        setPoDeliveryDate(""); setPoNotes("");
        setPoItems([emptyLineItem()]); setFormErrors([]); setItemErrors({});
    }

    function handleSupplierChange(supplierId: string) {
        setPoSupplier(supplierId);
        // Clear line items so selections from previous supplier don't linger
        setPoItems([emptyLineItem()]);
        setItemErrors({});
    }

    // ── PO Actions ────────────────────────────────────────────────────────────

    async function updateStatus(id: string, status: POStatus) {
        // Optimistic update
        setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o));
        if (detailPO?.id === id) setDetailPO(d => d ? { ...d, status } : d);
        try {
            await purchaseOrdersApi.update(id, { status });
        } catch {
            // Reload from server on failure to stay consistent
            try { setOrders((await purchaseOrdersApi.list()).map(fromApi)); } catch { /* ignore */ }
        }
    }

    // ── Receive goods ───────────────────────────────────────────────────────────
    function openReceive(po: PurchaseOrder) {
        // Default each line to ordered qty + PO unit price
        const init: Record<string, { qty: string; price: string }> = {};
        po.items.forEach(i => { init[i.id] = { qty: String(i.qty), price: String(i.unitPrice) }; });
        setReceiveLines(init);
        setReceiveDate(new Date().toISOString().split("T")[0]);
        setReceivePO(po);
    }

    async function handleReceive() {
        if (!receivePO) return;
        setReceiving(true);
        try {
            const lines = receivePO.items.map(i => ({
                itemId:      i.id,
                receivedQty: Number(receiveLines[i.id]?.qty ?? i.qty) || 0,
                unitPrice:   Number(receiveLines[i.id]?.price ?? i.unitPrice) || 0,
            }));
            const res = await purchaseOrdersApi.receive(receivePO.id, { date: receiveDate, lines });
            const mapped = fromApi(res.purchaseOrder);
            setOrders(prev => prev.map(o => o.id === mapped.id ? mapped : o));
            if (detailPO?.id === mapped.id) setDetailPO(mapped);
            setReceivePO(null);
        } catch (e) {
            console.error(e);
        } finally {
            setReceiving(false);
        }
    }

    // ── Print ─────────────────────────────────────────────────────────────────

    function handlePrint() { window.print(); }

    // ─── Loading ───────────────────────────────────────────────────────────────
    if (loading) return (
        <div className="flex justify-center items-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
    );

    // ─── CREATE VIEW ──────────────────────────────────────────────────────────
    if (view === "create") return (
        <div className="space-y-6 animate-in fade-in duration-300 pb-16">
            {/* Header */}
            <div className="flex items-center gap-3">
                <Button variant="ghost" size="sm" onClick={() => { setView("list"); resetForm(); }}>
                    <X className="h-4 w-4 mr-1" /> Cancel
                </Button>
                <div className="h-5 w-px bg-border" />
                <h2 className="text-2xl font-bold font-playfair text-primary">New Purchase Order</h2>
            </div>

            {saveSuccess && (
                <Alert className="bg-green-500/10 border-green-500 max-w-2xl">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <AlertDescription className="text-green-700 font-medium">
                        Purchase Order saved successfully!
                    </AlertDescription>
                </Alert>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* ── Left: PO Details ── */}
                <div className="lg:col-span-1 space-y-5">
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Order Details</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-1.5">
                                <Label>Supplier <span className="text-destructive">*</span></Label>
                                <Select value={poSupplier} onValueChange={handleSupplierChange}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select supplier..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {suppliers.filter(s => s.status === "Active").map(s => (
                                            <SelectItem key={s.id} value={s.id}>
                                                {s.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {poSupplier && (() => {
                                    const sup = suppliers.find(s => s.id === poSupplier);
                                    return sup ? (
                                        <div className="text-xs text-muted-foreground space-y-0.5 bg-muted/50 rounded-md p-2 mt-1">
                                            <p>📧 {sup.email}</p>
                                            <p>📞 {sup.phone}</p>
                                            <p>📍 {sup.address}</p>
                                        </div>
                                    ) : null;
                                })()}
                            </div>

                            <div className="space-y-1.5">
                                <Label>Order Date</Label>
                                <Input type="date" value={poOrderDate} onChange={e => setPoOrderDate(e.target.value)} />
                            </div>

                            <div className="space-y-1.5">
                                <Label>Expected Delivery</Label>
                                <Input type="date" value={poDeliveryDate} onChange={e => setPoDeliveryDate(e.target.value)} />
                            </div>

                            <div className="space-y-1.5">
                                <Label>Notes / Instructions</Label>
                                <Textarea
                                    placeholder="e.g. Deliver before 9am, call before arrival..."
                                    value={poNotes}
                                    onChange={e => setPoNotes(e.target.value)}
                                    rows={3}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    {/* Grand Total Card */}
                    <Card className="bg-primary/5 border-primary/20">
                        <CardContent className="pt-4 pb-4">
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-muted-foreground font-medium">Grand Total</span>
                                <span className="text-3xl font-bold font-playfair text-primary">
                                    ${grandTotal.toFixed(2)}
                                </span>
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                                {poItems.filter(i => i.ingredientName).length} line item(s)
                            </div>
                        </CardContent>
                    </Card>

                    {/* Validation Errors */}
                    {formErrors.length > 0 && (
                        <div className="rounded-md bg-destructive/10 border border-destructive/40 p-3 space-y-1">
                            {formErrors.map((err, i) => (
                                <p key={i} className="text-xs text-destructive flex items-start gap-1.5">
                                    <span className="mt-0.5">⚠</span> {err}
                                </p>
                            ))}
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex flex-col gap-2">
                        <Button className="w-full" onClick={() => saveDraft(true)}>
                            <Send className="mr-2 h-4 w-4" /> Save & Send to Supplier
                        </Button>
                        <Button variant="outline" className="w-full" onClick={() => saveDraft(false)}>
                            <FileText className="mr-2 h-4 w-4" /> Save as Draft
                        </Button>
                    </div>
                </div>

                {/* ── Right: Line Items ── */}
                <div className="lg:col-span-2 space-y-4">
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Line Items</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3 p-3">
                            {!poSupplier && (
                                <p className="text-xs text-muted-foreground text-center py-2 italic">
                                    ← Select a supplier first to see available products
                                </p>
                            )}
                            {poItems.map((item, idx) => (
                                    <div key={item.id} className="rounded-lg border bg-card p-3 space-y-3">
                                        {/* Row header */}
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                                                Item {idx + 1}
                                            </span>
                                            {poItems.length > 1 && (
                                                <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => removeItem(item.id)}>
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            )}
                                        </div>

                                        {/* Ingredient dropdown */}
                                        <div className="space-y-1">
                                            <Label className={`text-xs ${itemErrors[item.id] ? "text-destructive" : ""}`}>
                                                Product / Ingredient <span className="text-destructive">*</span>
                                            </Label>
                                            <Select
                                                value={item.ingredientId}
                                                onValueChange={v => {
                                                    const ing = supplierIngredients.find(i => i.id === v);
                                                    if (ing) fillFromIngredient(item.id, ing);
                                                }}
                                                disabled={!poSupplier}
                                            >
                                                <SelectTrigger className={`h-9 text-sm ${itemErrors[item.id] ? "border-destructive ring-1 ring-destructive" : ""}`}>
                                                    <SelectValue placeholder={poSupplier ? "Select product..." : "Select supplier first"} />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {supplierIngredients.length === 0 ? (
                                                        <div className="px-3 py-4 text-sm text-muted-foreground text-center">No products linked to this supplier</div>
                                                    ) : (
                                                        supplierIngredients.map(ing => (
                                                            <SelectItem key={ing.id} value={ing.id}>
                                                                <div className="flex items-center justify-between gap-8 w-full">
                                                                    <span>{ing.name}</span>
                                                                    <span className="text-xs text-muted-foreground">${Number(ing.purchasePrice).toFixed(2)}/{ing.purchaseUnit}</span>
                                                                </div>
                                                            </SelectItem>
                                                        ))
                                                    )}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        {/* Qty, Unit, Unit Price */}
                                        <div className="grid grid-cols-3 gap-2">
                                            <div className="space-y-1">
                                                <Label className="text-xs">Qty</Label>
                                                <Input
                                                    type="number" min={0} step={0.01}
                                                    className="h-8 text-sm"
                                                    value={item.qty}
                                                    onChange={e => updateItem(item.id, "qty", parseFloat(e.target.value) || 0)}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-xs">Unit</Label>
                                                <Select value={item.unit} onValueChange={v => updateItem(item.id, "unit", v)}>
                                                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                                                    <SelectContent>
                                                        {UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-xs">Unit Price ($)</Label>
                                                <Input
                                                    type="number" min={0} step={0.01}
                                                    className="h-8 text-sm"
                                                    value={item.unitPrice}
                                                    onChange={e => updateItem(item.id, "unitPrice", parseFloat(e.target.value) || 0)}
                                                />
                                            </div>
                                        </div>

                                        {/* Line Total */}
                                        <div className="flex justify-end">
                                            <span className="text-sm text-muted-foreground mr-2">Line Total:</span>
                                            <span className="text-sm font-semibold text-primary">${Number(item.total).toFixed(2)}</span>
                                        </div>
                                    </div>
                            ))}

                            <Button variant="outline" className="w-full border-dashed" onClick={addItem}>
                                <Plus className="mr-2 h-4 w-4" /> Add Line Item
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );

    // ─── DETAIL VIEW ──────────────────────────────────────────────────────────
    if (view === "detail" && detailPO) {
        const po = detailPO;
        return (
            <div className="space-y-6 animate-in fade-in duration-300 pb-16">
                {/* Header */}
                <div className="flex flex-wrap gap-3 items-center justify-between print:hidden">
                    <div className="flex items-center gap-3 flex-wrap">
                        <Button variant="ghost" size="sm" onClick={() => setView("list")}>
                            <X className="h-4 w-4 mr-1" /> Back
                        </Button>
                        <div className="h-5 w-px bg-border" />
                        <h2 className="text-2xl font-bold font-playfair text-primary">{po.poNumber}</h2>
                        <StatusBadge status={po.status} />
                    </div>
                    <div className="flex gap-2 flex-wrap">
                        {po.status === "Draft" && (
                            <Button size="sm" onClick={() => updateStatus(po.id, "Sent")}>
                                <Send className="mr-2 h-3.5 w-3.5" /> Mark as Sent
                            </Button>
                        )}
                        {po.status === "Sent" && (
                            <Button size="sm" variant="outline" className="border-green-500 text-green-700 hover:bg-green-50"
                                onClick={() => openReceive(po)}>
                                <PackageCheck className="mr-2 h-3.5 w-3.5" /> Receive Goods
                            </Button>
                        )}
                        {(po.status === "Draft" || po.status === "Sent") && (
                            <Button size="sm" variant="outline" className="border-destructive text-destructive hover:bg-destructive/10"
                                onClick={() => setConfirmCancel(po)}>
                                <XCircle className="mr-2 h-3.5 w-3.5" /> Cancel PO
                            </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={handlePrint}>
                            <Printer className="mr-2 h-3.5 w-3.5" /> Print
                        </Button>
                    </div>
                </div>

                {/* Printable PO Document */}
                <div ref={printRef} className="bg-white dark:bg-card border rounded-xl p-8 max-w-3xl mx-auto shadow-sm print:shadow-none print:border-none">
                    {/* PO Header */}
                    <div className="flex justify-between items-start mb-8">
                        <div>
                            <h1 className="text-3xl font-bold font-playfair text-primary">PURCHASE ORDER</h1>
                            <p className="text-muted-foreground mt-1">Chiang Mai — Back of House</p>
                        </div>
                        <div className="text-right space-y-1">
                            <p className="text-2xl font-mono font-bold">{po.poNumber}</p>
                            <StatusBadge status={po.status} />
                        </div>
                    </div>

                    {/* Supplier + Dates */}
                    <div className="grid grid-cols-2 gap-8 mb-8 pb-6 border-b">
                        <div className="space-y-1">
                            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Supplier</p>
                            <p className="font-semibold text-lg">{po.supplierName}</p>
                            {(() => {
                                const sup = suppliers.find(s => s.id === po.supplierId);
                                return sup ? (
                                    <div className="text-sm text-muted-foreground space-y-0.5 mt-1">
                                        <p>{sup.contact}</p>
                                        <p>{sup.email}</p>
                                        <p>{sup.phone}</p>
                                        <p>{sup.address}</p>
                                    </div>
                                ) : null;
                            })()}
                        </div>
                        <div className="space-y-3">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Order Date</p>
                                <p className="font-medium">{po.orderDate}</p>
                            </div>
                            {po.deliveryDate && (
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Expected Delivery</p>
                                    <p className="font-medium">{po.deliveryDate}</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Line Items Table */}
                    {(() => {
                        const showReceived = po.items.some(it => it.receivedQty != null);
                        return (
                    <table className="w-full text-sm mb-6">
                        <thead>
                            <tr className="border-b">
                                <th className="text-left py-2 text-xs uppercase tracking-widest text-muted-foreground font-semibold">#</th>
                                <th className="text-left py-2 text-xs uppercase tracking-widest text-muted-foreground font-semibold">Item</th>
                                <th className="text-right py-2 text-xs uppercase tracking-widest text-muted-foreground font-semibold">{showReceived ? "Ordered" : "Qty"}</th>
                                {showReceived && (
                                    <th className="text-right py-2 text-xs uppercase tracking-widest text-muted-foreground font-semibold">Received</th>
                                )}
                                <th className="text-right py-2 text-xs uppercase tracking-widest text-muted-foreground font-semibold">Unit Price</th>
                                <th className="text-right py-2 text-xs uppercase tracking-widest text-muted-foreground font-semibold">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {po.items.map((item, i) => {
                                const rq = item.receivedQty;
                                const variance = rq != null ? rq - Number(item.qty) : null;
                                return (
                                <tr key={item.id} className="border-b last:border-0">
                                    <td className="py-2 text-muted-foreground">{i + 1}</td>
                                    <td className="py-2 font-medium">{item.ingredientName}</td>
                                    <td className="py-2 text-right">{item.qty} {item.unit}</td>
                                    {showReceived && (
                                        <td className="py-2 text-right">
                                            {rq != null ? (
                                                <span className={variance === 0 ? "" : variance! < 0 ? "text-amber-600 font-medium" : "text-blue-600 font-medium"}>
                                                    {rq} {item.unit}
                                                    {variance !== 0 && variance != null && (
                                                        <span className="block text-[10px]">
                                                            ({variance > 0 ? "+" : ""}{variance.toFixed(2)})
                                                        </span>
                                                    )}
                                                </span>
                                            ) : <span className="text-muted-foreground">—</span>}
                                        </td>
                                    )}
                                    <td className="py-2 text-right">${Number(item.unitPrice).toFixed(2)}</td>
                                    <td className="py-2 text-right font-semibold">${Number(item.total).toFixed(2)}</td>
                                </tr>
                                );
                            })}
                        </tbody>
                    </table>
                        );
                    })()}

                    {/* Grand Total */}
                    <div className="flex justify-end mb-6">
                        <div className="rounded-lg bg-primary/5 border border-primary/20 px-6 py-3 text-right">
                            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">Grand Total</p>
                            <p className="text-3xl font-bold font-playfair text-primary">${Number(po.grandTotal).toFixed(2)}</p>
                        </div>
                    </div>

                    {/* Notes */}
                    {po.notes && (
                        <div className="rounded-lg bg-muted/40 border p-4">
                            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">Notes / Instructions</p>
                            <p className="text-sm">{po.notes}</p>
                        </div>
                    )}

                    {/* Signature area */}
                    <div className="grid grid-cols-2 gap-12 mt-10 print:mt-16">
                        <div className="border-t pt-3">
                            <p className="text-xs text-muted-foreground">Authorised by</p>
                        </div>
                        <div className="border-t pt-3">
                            <p className="text-xs text-muted-foreground">Supplier acknowledgement</p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // ─── LIST VIEW ─────────────────────────────────────────────────────────────
    const totalOrders  = orders.length;
    const draftCount   = orders.filter(o => o.status === "Draft").length;
    const sentCount    = orders.filter(o => o.status === "Sent").length;
    const totalSpend   = orders.filter(o => o.status === "Received").reduce((s, o) => s + o.grandTotal, 0);

    return (
        <div className="space-y-6 animate-in fade-in duration-500 pb-12">
            {/* Header */}
            <div className="flex flex-wrap gap-3 justify-between items-start">
                <div>
                    <h2 className="text-3xl font-bold font-playfair tracking-tight text-primary">Purchase Orders</h2>
                    <p className="text-muted-foreground">Create, track and manage orders with your suppliers.</p>
                </div>
                <Button onClick={() => setView("create")}>
                    <FilePlus2 className="mr-2 h-4 w-4" /> New PO
                </Button>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { label: "Total Orders",  value: String(totalOrders),         sub: "all time" },
                    { label: "Drafts",        value: String(draftCount),          sub: "pending action" },
                    { label: "Awaiting",      value: String(sentCount),           sub: "sent to supplier" },
                    { label: "Total Spend",   value: `$${totalSpend.toFixed(2)}`, sub: "received" },
                ].map(({ label, value, sub }) => (
                    <Card key={label}>
                        <CardContent className="pt-5 pb-4">
                            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
                            <p className="text-2xl font-bold font-playfair text-primary mt-1">{value}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* ── Suggested Orders Banner (Phase 3) ── */}
            {!alertsDismissed && stockAlerts.length > 0 && (
                <Card className="border-yellow-400/60 bg-yellow-50/60 dark:bg-yellow-950/20">
                    <CardHeader className="pb-2 flex flex-row items-center justify-between">
                        <div className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0" />
                            <CardTitle className="text-base text-yellow-800 dark:text-yellow-300">
                                {stockAlerts.length} item{stockAlerts.length !== 1 ? "s" : ""} need reordering
                            </CardTitle>
                        </div>
                        <button
                            onClick={() => setAlertsDismissed(true)}
                            className="text-muted-foreground hover:text-foreground"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </CardHeader>
                    <CardContent className="pt-0">
                        <div className="space-y-1.5 mb-3">
                            {stockAlerts.map(a => (
                                <div key={a.id} className="flex flex-wrap items-center gap-2 text-sm">
                                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${a.status === "critical" ? "bg-red-100 text-red-800 border-red-200" : "bg-yellow-100 text-yellow-800 border-yellow-200"}`}>
                                        {a.status === "critical" ? "Critical" : "Reorder"}
                                    </span>
                                    <span className="font-medium">{a.ingredient.name}</span>
                                    <span className="text-muted-foreground text-xs">
                                        {Number(a.currentStock).toFixed(1)} / {Number(a.parMax).toFixed(1)} {a.ingredient.recipeUnit} in stock
                                    </span>
                                    {a.suggestedSupplierName && (
                                        <span className="text-muted-foreground text-xs">· {a.suggestedSupplierName}</span>
                                    )}
                                    <span className="text-xs text-primary font-medium">
                                        Order ≈ {Number(a.qtyToOrder).toFixed(1)} {a.ingredient.recipeUnit}
                                    </span>
                                </div>
                            ))}
                        </div>
                        <Button
                            size="sm"
                            onClick={() => {
                                // Group alerts by supplier and pre-fill a new PO
                                const firstSupplierId = stockAlerts[0]?.suggestedSupplierId;
                                if (firstSupplierId) {
                                    handleSupplierChange(firstSupplierId);
                                    const sameSupplierAlerts = stockAlerts.filter(a => a.suggestedSupplierId === firstSupplierId);
                                    const lineItems = sameSupplierAlerts.map(a => ({
                                        id:             `li-${Date.now()}-${a.id}`,
                                        ingredientId:   a.ingredientId,
                                        ingredientName: a.ingredient.name,
                                        qty:            Number(a.qtyToOrder),
                                        unit:           a.ingredient.purchaseUnit,
                                        unitPrice:      Number(a.ingredient.purchasePrice),
                                        total:          Number(a.qtyToOrder) * Number(a.ingredient.purchasePrice),
                                    }));
                                    setPoItems(lineItems.length > 0 ? lineItems : [emptyLineItem()]);
                                }
                                setView("create");
                            }}
                        >
                            <FilePlus2 className="mr-2 h-4 w-4" /> Create Draft PO from Alerts
                        </Button>
                    </CardContent>
                </Card>
            )}

            {/* Filters */}
            <div className="flex flex-wrap gap-3 items-center">
                <div className="relative flex-1 min-w-[200px] max-w-xs">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search PO# or supplier..."
                        className="pl-8"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
                <div className="flex gap-1">
                    {(["All", "Draft", "Sent", "Received", "Cancelled"] as const).map(s => (
                        <button
                            key={s}
                            onClick={() => setStatusFilter(s)}
                            className={cn(
                                "rounded-full px-3 py-1 text-xs font-semibold border transition-all",
                                statusFilter === s
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "text-muted-foreground border-border hover:border-primary/40"
                            )}
                        >
                            {s}
                        </button>
                    ))}
                </div>
            </div>

            {/* PO Table */}
            {filteredOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 border rounded-xl bg-muted/10">
                    <FileText className="h-12 w-12 text-muted-foreground/40" />
                    <div>
                        <p className="font-semibold text-muted-foreground">No purchase orders yet</p>
                        <p className="text-sm text-muted-foreground/70 mt-1">Click &ldquo;New PO&rdquo; to create your first order.</p>
                    </div>
                    <Button onClick={() => setView("create")}>
                        <FilePlus2 className="mr-2 h-4 w-4" /> New PO
                    </Button>
                </div>
            ) : (
                <div className="border rounded-md overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>PO Number</TableHead>
                                <TableHead>Supplier</TableHead>
                                <TableHead className="hidden sm:table-cell">Order Date</TableHead>
                                <TableHead className="hidden md:table-cell">Delivery Date</TableHead>
                                <TableHead className="text-right hidden sm:table-cell">Items</TableHead>
                                <TableHead className="text-right">Total</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredOrders.map(po => (
                                <TableRow key={po.id} className="cursor-pointer hover:bg-muted/40"
                                    onClick={() => { setDetailPO(po); setView("detail"); }}>
                                    <TableCell className="font-mono font-semibold">{po.poNumber}</TableCell>
                                    <TableCell>{po.supplierName}</TableCell>
                                    <TableCell className="hidden sm:table-cell">{po.orderDate}</TableCell>
                                    <TableCell className="hidden md:table-cell text-muted-foreground">{po.deliveryDate || "—"}</TableCell>
                                    <TableCell className="text-right hidden sm:table-cell">{po.items.length}</TableCell>
                                    <TableCell className="text-right font-semibold">${Number(po.grandTotal).toFixed(2)}</TableCell>
                                    <TableCell><StatusBadge status={po.status} /></TableCell>
                                    <TableCell>
                                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}

            {/* Cancel Confirm Dialog */}
            <Dialog open={!!confirmCancel} onOpenChange={() => setConfirmCancel(null)}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Cancel {confirmCancel?.poNumber}?</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-muted-foreground py-2">
                        This will mark the PO as Cancelled. This action cannot be undone.
                    </p>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConfirmCancel(null)}>Keep</Button>
                        <Button variant="destructive" onClick={() => {
                            if (confirmCancel) updateStatus(confirmCancel.id, "Cancelled");
                            setConfirmCancel(null);
                        }}>
                            Cancel PO
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Receive Goods Dialog — reconcile ordered vs received */}
            <Dialog open={!!receivePO} onOpenChange={v => { if (!v) setReceivePO(null); }}>
                <DialogContent className="sm:max-w-2xl max-h-[90dvh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <PackageCheck className="h-4 w-4 text-green-600" />
                            Receive Goods — {receivePO?.poNumber}
                        </DialogTitle>
                    </DialogHeader>

                    {receivePO && (
                        <div className="space-y-4 overflow-y-auto flex-1 min-h-0">
                            <p className="text-sm text-muted-foreground">
                                Enter the qty actually delivered for each line. Tracked ingredients are added to inventory
                                automatically (stock + average cost updated). Differences vs ordered are flagged.
                            </p>

                            {/* Receive date */}
                            <div className="flex items-center gap-2">
                                <Label className="text-sm">Received date</Label>
                                <Input type="date" value={receiveDate} onChange={e => setReceiveDate(e.target.value)}
                                    className="h-9 w-44" max={new Date().toISOString().split("T")[0]} />
                            </div>

                            {/* Lines */}
                            <div className="border rounded-lg overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Item</TableHead>
                                            <TableHead className="text-right">Ordered</TableHead>
                                            <TableHead className="text-right">Received</TableHead>
                                            <TableHead className="text-right hidden sm:table-cell">Unit Price</TableHead>
                                            <TableHead className="text-right">Variance</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {receivePO.items.map(item => {
                                            const ln = receiveLines[item.id] ?? { qty: String(item.qty), price: String(item.unitPrice) };
                                            const recv = Number(ln.qty) || 0;
                                            const variance = recv - Number(item.qty);
                                            return (
                                                <TableRow key={item.id}>
                                                    <TableCell className="font-medium">
                                                        {item.ingredientName}
                                                        <span className="block text-xs text-muted-foreground">{item.unit}</span>
                                                    </TableCell>
                                                    <TableCell className="text-right tabular-nums text-muted-foreground">{item.qty}</TableCell>
                                                    <TableCell className="text-right">
                                                        <Input
                                                            type="number" min={0} step="0.001"
                                                            value={ln.qty}
                                                            onChange={e => setReceiveLines(m => ({ ...m, [item.id]: { ...ln, qty: e.target.value } }))}
                                                            className="w-24 h-8 text-right ml-auto"
                                                        />
                                                    </TableCell>
                                                    <TableCell className="text-right hidden sm:table-cell">
                                                        <Input
                                                            type="number" min={0} step="0.01"
                                                            value={ln.price}
                                                            onChange={e => setReceiveLines(m => ({ ...m, [item.id]: { ...ln, price: e.target.value } }))}
                                                            className="w-24 h-8 text-right ml-auto"
                                                        />
                                                    </TableCell>
                                                    <TableCell className="text-right tabular-nums">
                                                        {recv === 0 && Number(item.qty) > 0
                                                            ? <span className="text-red-600 text-xs font-medium">Not received</span>
                                                            : variance === 0
                                                                ? <span className="text-muted-foreground text-xs">—</span>
                                                                : <span className={`text-xs font-medium ${variance < 0 ? "text-amber-600" : "text-blue-600"}`}>
                                                                    {variance > 0 ? "+" : ""}{variance.toFixed(2)} {item.unit}
                                                                  </span>}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    )}

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setReceivePO(null)} disabled={receiving}>Cancel</Button>
                        <Button onClick={handleReceive} disabled={receiving}
                            className="bg-green-600 hover:bg-green-700">
                            {receiving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            <PackageCheck className="mr-2 h-4 w-4" /> Confirm Receipt
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
