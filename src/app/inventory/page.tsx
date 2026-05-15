"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Table, TableBody, TableCell, TableHead,
    TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, PackagePlus, Warehouse, History, Search, Pencil, Check, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
    Dialog, DialogContent, DialogDescription,
    DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
    Select, SelectContent, SelectItem,
    SelectTrigger, SelectValue,
} from "@/components/ui/select";

// ─── Types ────────────────────────────────────────────────────────────────────

interface StockItem {
    id: string;
    productName: string;
    category: string;
    currentStock: number;
    unit: string;
    max: number;
    safetyStock: number;
    rop: number;
}

interface GoodsReceipt {
    id: string;
    date: string;
    productName: string;
    supplier: string;
    purchaseQty: number;
    purchaseUnit: string;
    purchasePrice: number;
    currency: string;
    portionSize: number;
    portionUnit: string;
    packs: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = [
    "Vegetables", "Proteins", "Noodles & Rice",
    "Sauces", "Dairy", "Dry Goods", "Beverages", "Other",
];

const SUPPLIERS = [
    "Fresh Produce Co.",
    "Meat Select Providers",
    "Owner Sauce",
    "Seafood Direct Co.",
    "Golden Dry Goods",
    "Heritage Spice House",
];

const CURRENCIES = ["CAD"];

const UNITS = ["lbs", "kg", "g", "oz", "L", "ml", "piece", "dozen", "pack", "bag"];

const DEFAULT_STOCK: StockItem[] = [
    { id: "S001", productName: "Bean Sprouts",        category: "Vegetables",     currentStock: 10, unit: "pack", max: 100, safetyStock: 20, rop: 30 },
    { id: "S002", productName: "Pad Thai Noodles",    category: "Noodles & Rice", currentStock: 75, unit: "pack", max: 200, safetyStock: 40, rop: 60 },
    { id: "S003", productName: "Tiger Shrimp",        category: "Proteins",       currentStock: 8,  unit: "pack", max: 50,  safetyStock: 10, rop: 15 },
    { id: "S004", productName: "Chicken Breast",      category: "Proteins",       currentStock: 25, unit: "pack", max: 80,  safetyStock: 15, rop: 20 },
    { id: "S005", productName: "Pad Thai Sauce Base", category: "Sauces",         currentStock: 30, unit: "pack", max: 60,  safetyStock: 10, rop: 15 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

type StockStatus = "critical" | "low" | "ok";

function stockStatus(item: StockItem): StockStatus {
    if (item.currentStock <= item.safetyStock) return "critical";
    if (item.currentStock <= item.rop)         return "low";
    return "ok";
}

function StatusBadge({ status }: { status: StockStatus }) {
    if (status === "critical") return <Badge variant="destructive">Critical</Badge>;
    if (status === "low")      return <Badge className="bg-yellow-500 hover:bg-yellow-600 text-white">Reorder</Badge>;
    return <Badge className="bg-green-600 hover:bg-green-700 text-white">OK</Badge>;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function InventoryPage() {
    const [stockItems, setStockItems] = useState<StockItem[]>(DEFAULT_STOCK);
    const [receipts, setReceipts]     = useState<GoodsReceipt[]>([]);
    const [search, setSearch]         = useState("");

    // Inline edit state
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editRow, setEditRow]     = useState<Partial<StockItem>>({});

    // Add product dialog
    const [addOpen, setAddOpen] = useState(false);
    const [newStock, setNewStock] = useState<Partial<StockItem>>({
        category: "Vegetables", unit: "pack", max: 100, safetyStock: 10, rop: 20, currentStock: 0,
    });

    // Receive Goods form
    const [form, setForm] = useState({
        date:          new Date().toISOString().split("T")[0],
        productName:   "",
        supplier:      "",
        purchaseQty:   "",
        purchaseUnit:  "lbs",
        purchasePrice: "",
        currency:      "CAD",
        portionSize:   "",
        portionUnit:   "lbs",
    });
    const [receiveSuccess, setReceiveSuccess] = useState(false);

    // Auto-calculated packs
    const packs =
        form.purchaseQty && form.portionSize && parseFloat(form.portionSize) > 0
            ? Math.floor(parseFloat(form.purchaseQty) / parseFloat(form.portionSize))
            : 0;

    const filteredStock = stockItems.filter(s =>
        s.productName.toLowerCase().includes(search.toLowerCase()) ||
        s.category.toLowerCase().includes(search.toLowerCase())
    );

    const criticalCount = stockItems.filter(s => stockStatus(s) === "critical").length;
    const reorderCount  = stockItems.filter(s => stockStatus(s) === "low").length;
    const alertCount    = criticalCount + reorderCount;

    // ── Receive Goods ──────────────────────────────────────────────────────────
    function handleReceive() {
        if (!form.productName || !form.supplier || !form.purchaseQty || !form.portionSize || !form.purchasePrice) return;

        const receipt: GoodsReceipt = {
            id:            `RCV-${Date.now()}`,
            date:          form.date,
            productName:   form.productName,
            supplier:      form.supplier,
            purchaseQty:   parseFloat(form.purchaseQty),
            purchaseUnit:  form.purchaseUnit,
            purchasePrice: parseFloat(form.purchasePrice),
            currency:      form.currency,
            portionSize:   parseFloat(form.portionSize),
            portionUnit:   form.portionUnit,
            packs,
        };

        setReceipts(prev => [receipt, ...prev]);

        // Update existing stock or add new
        setStockItems(prev => {
            const match = prev.find(
                s => s.productName.toLowerCase() === form.productName.toLowerCase()
            );
            if (match) {
                return prev.map(s =>
                    s.id === match.id ? { ...s, currentStock: s.currentStock + packs } : s
                );
            }
            return [...prev, {
                id:           `S${Date.now()}`,
                productName:  form.productName,
                category:     "Other",
                currentStock: packs,
                unit:         "pack",
                max:          packs * 2,
                safetyStock:  Math.ceil(packs * 0.2),
                rop:          Math.ceil(packs * 0.3),
            }];
        });

        setReceiveSuccess(true);
        setForm({
            date:          new Date().toISOString().split("T")[0],
            productName:   "",
            supplier:      "",
            purchaseQty:   "",
            purchaseUnit:  "lbs",
            purchasePrice: "",
            currency:      "CAD",
            portionSize:   "",
            portionUnit:   "lbs",
        });
        setTimeout(() => setReceiveSuccess(false), 4000);
    }

    // ── Inline edit ────────────────────────────────────────────────────────────
    function startEdit(item: StockItem) { setEditingId(item.id); setEditRow({ ...item }); }
    function saveEdit() {
        setStockItems(prev => prev.map(s => s.id === editingId ? { ...s, ...editRow } as StockItem : s));
        setEditingId(null);
    }
    function cancelEdit() { setEditingId(null); }

    // ─── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="space-y-6 animate-in fade-in duration-500">

            {/* Header */}
            <div className="flex flex-wrap gap-3 justify-between items-start">
                <div>
                    <h2 className="text-3xl font-bold font-playfair tracking-tight text-primary">Inventory</h2>
                    <p className="text-muted-foreground">Stock management and goods receiving.</p>
                </div>
            </div>

            {/* Alert Banner */}
            {alertCount > 0 && (
                <Alert variant="destructive" className="bg-destructive/10 border-destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Stock Alert</AlertTitle>
                    <AlertDescription>
                        {criticalCount > 0 && <span><strong>{criticalCount}</strong> item(s) below Safety Stock. </span>}
                        {reorderCount  > 0 && <span><strong>{reorderCount}</strong> item(s) at Reorder Point.</span>}
                    </AlertDescription>
                </Alert>
            )}

            <Tabs defaultValue="stock">
                <div className="overflow-x-auto pb-1">
                <TabsList className="w-full sm:w-auto">
                    <TabsTrigger value="stock" className="flex-1 sm:flex-none">
                        <Warehouse className="mr-2 h-4 w-4" /> Stock Levels
                    </TabsTrigger>
                    <TabsTrigger value="receive" className="flex-1 sm:flex-none">
                        <PackagePlus className="mr-2 h-4 w-4" /> Receive Goods
                    </TabsTrigger>
                    <TabsTrigger value="history" className="flex-1 sm:flex-none">
                        <History className="mr-2 h-4 w-4" /> Receiving History
                    </TabsTrigger>
                </TabsList>
                </div>

                {/* ── STOCK LEVELS ─────────────────────────────────────────────── */}
                <TabsContent value="stock" className="space-y-4 mt-4">
                    <div className="flex items-center justify-between gap-4">
                        <div className="relative max-w-sm flex-1">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search product or category..."
                                className="pl-8"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                        </div>
                        <Button onClick={() => setAddOpen(true)}>
                            <PackagePlus className="mr-2 h-4 w-4" /> Add Product
                        </Button>
                    </div>

                    <div className="border rounded-md overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Product Name</TableHead>
                                    <TableHead className="hidden sm:table-cell">Category</TableHead>
                                    <TableHead className="text-right">Stock</TableHead>
                                    <TableHead className="text-right hidden md:table-cell">Max</TableHead>
                                    <TableHead className="text-right hidden md:table-cell">Safety</TableHead>
                                    <TableHead className="text-right hidden md:table-cell">ROP</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredStock.map(item => {
                                    const status    = stockStatus(item);
                                    const isEditing = editingId === item.id;
                                    return (
                                        <TableRow
                                            key={item.id}
                                            className={
                                                status === "critical" ? "bg-destructive/5" :
                                                status === "low"      ? "bg-yellow-500/5" : ""
                                            }
                                        >
                                                            <TableCell className="font-medium">
                                                {isEditing
                                                    ? <Input value={editRow.productName ?? ""} onChange={e => setEditRow(r => ({ ...r, productName: e.target.value }))} className="h-8 w-36" />
                                                    : <>
                                                        {item.productName}
                                                        <span className="sm:hidden block text-xs text-muted-foreground">{item.category}</span>
                                                      </>}
                                            </TableCell>
                                            <TableCell className="hidden sm:table-cell">
                                                {isEditing
                                                    ? (
                                                        <Select value={editRow.category} onValueChange={v => setEditRow(r => ({ ...r, category: v }))}>
                                                            <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                                                            <SelectContent>
                                                                {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                                                            </SelectContent>
                                                        </Select>
                                                    )
                                                    : <span className="text-muted-foreground text-sm">{item.category}</span>}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {isEditing
                                                    ? <Input type="number" value={editRow.currentStock ?? ""} onChange={e => setEditRow(r => ({ ...r, currentStock: parseFloat(e.target.value) }))} className="h-8 w-20 text-right ml-auto" />
                                                    : (
                                                        <>
                                                            <span className={`font-semibold ${status === "critical" ? "text-destructive" : status === "low" ? "text-yellow-600" : ""}`}>
                                                                {item.currentStock}
                                                            </span>
                                                            <span className="text-muted-foreground text-xs ml-1">{item.unit}</span>
                                                        </>
                                                    )}
                                            </TableCell>
                                            <TableCell className="text-right hidden md:table-cell">
                                                {isEditing
                                                    ? <Input type="number" value={editRow.max ?? ""} onChange={e => setEditRow(r => ({ ...r, max: parseFloat(e.target.value) }))} className="h-8 w-20 text-right ml-auto" />
                                                    : item.max}
                                            </TableCell>
                                            <TableCell className="text-right hidden md:table-cell">
                                                {isEditing
                                                    ? <Input type="number" value={editRow.safetyStock ?? ""} onChange={e => setEditRow(r => ({ ...r, safetyStock: parseFloat(e.target.value) }))} className="h-8 w-20 text-right ml-auto" />
                                                    : item.safetyStock}
                                            </TableCell>
                                            <TableCell className="text-right hidden md:table-cell">
                                                {isEditing
                                                    ? <Input type="number" value={editRow.rop ?? ""} onChange={e => setEditRow(r => ({ ...r, rop: parseFloat(e.target.value) }))} className="h-8 w-20 text-right ml-auto" />
                                                    : item.rop}
                                            </TableCell>
                                            <TableCell>
                                                <StatusBadge status={status} />
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {isEditing
                                                    ? (
                                                        <div className="flex justify-end gap-1">
                                                            <Button size="icon" variant="ghost" className="h-7 w-7 text-green-600" onClick={saveEdit}>
                                                                <Check className="h-4 w-4" />
                                                            </Button>
                                                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={cancelEdit}>
                                                                <X className="h-4 w-4" />
                                                            </Button>
                                                        </div>
                                                    )
                                                    : (
                                                        <Button variant="outline" size="sm" onClick={() => startEdit(item)}>
                                                            <Pencil className="mr-1 h-3 w-3" /> Edit
                                                        </Button>
                                                    )}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                                {filteredStock.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                                            No stock items found.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>

                    <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-destructive inline-block" /> Critical — at or below Safety Stock</span>
                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" /> Reorder — at or below ROP</span>
                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-600 inline-block" /> OK</span>
                    </div>
                </TabsContent>

                {/* ── RECEIVE GOODS ─────────────────────────────────────────────── */}
                <TabsContent value="receive" className="mt-4">
                    <Card className="max-w-2xl">
                        <CardHeader>
                            <CardTitle className="text-lg">Goods Receipt Entry</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-5">

                            {receiveSuccess && (
                                <Alert className="bg-green-500/10 border-green-500">
                                    <Check className="h-4 w-4 text-green-600" />
                                    <AlertTitle className="text-green-700">Received Successfully</AlertTitle>
                                    <AlertDescription className="text-green-700">
                                        Stock has been updated.
                                    </AlertDescription>
                                </Alert>
                            )}

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <Label>Date Received</Label>
                                    <Input
                                        type="date"
                                        value={form.date}
                                        onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label>Product Name</Label>
                                    <Input
                                        placeholder="e.g. Bean Sprouts"
                                        value={form.productName}
                                        onChange={e => setForm(f => ({ ...f, productName: e.target.value }))}
                                    />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <Label>Supplier</Label>
                                <Select value={form.supplier} onValueChange={v => setForm(f => ({ ...f, supplier: v }))}>
                                    <SelectTrigger><SelectValue placeholder="Select supplier..." /></SelectTrigger>
                                    <SelectContent>
                                        {SUPPLIERS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-1">
                                <Label>Purchase Quantity</Label>
                                <div className="flex gap-2">
                                    <Input
                                        type="number" min={0} step={0.01}
                                        placeholder="25"
                                        value={form.purchaseQty}
                                        onChange={e => setForm(f => ({ ...f, purchaseQty: e.target.value }))}
                                        className="flex-1"
                                    />
                                    <Select value={form.purchaseUnit} onValueChange={v => setForm(f => ({ ...f, purchaseUnit: v }))}>
                                        <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="space-y-1">
                                <Label>Purchase Price (total)</Label>
                                <div className="flex gap-2">
                                    <Select value={form.currency} onValueChange={v => setForm(f => ({ ...f, currency: v }))}>
                                        <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                    <Input
                                        type="number" min={0} step={0.01}
                                        placeholder="25.00"
                                        value={form.purchasePrice}
                                        onChange={e => setForm(f => ({ ...f, purchasePrice: e.target.value }))}
                                        className="flex-1"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <Label>Portion Size per Pack</Label>
                                <div className="flex gap-2">
                                    <Input
                                        type="number" min={0} step={0.01}
                                        placeholder="0.5"
                                        value={form.portionSize}
                                        onChange={e => setForm(f => ({ ...f, portionSize: e.target.value }))}
                                        className="flex-1"
                                    />
                                    <Select value={form.portionUnit} onValueChange={v => setForm(f => ({ ...f, portionUnit: v }))}>
                                        <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Packs = Purchase Qty ÷ Portion Size (rounded down)
                                </p>
                            </div>

                            {/* Live Summary */}
                            {packs > 0 && (
                                <div className="rounded-lg bg-muted/50 border p-4 space-y-3">
                                    <p className="font-semibold text-sm">Receipt Summary</p>
                                    <div className="grid grid-cols-2 gap-y-1.5 text-sm">
                                        <span className="text-muted-foreground">Product</span>
                                        <span className="font-medium">{form.productName || "—"}</span>
                                        <span className="text-muted-foreground">Supplier</span>
                                        <span>{form.supplier || "—"}</span>
                                        <span className="text-muted-foreground">Date</span>
                                        <span>{form.date}</span>
                                        <span className="text-muted-foreground">Purchased</span>
                                        <span>{form.purchaseQty} {form.purchaseUnit} @ {form.currency} {form.purchasePrice}</span>
                                        <span className="text-muted-foreground">Portion</span>
                                        <span>{form.portionSize} {form.portionUnit} / pack</span>
                                        <span className="text-muted-foreground">Packs to receive</span>
                                        <span className="text-primary font-bold text-base">{packs} packs</span>
                                    </div>
                                </div>
                            )}

                            <div className="flex justify-end">
                                <Button
                                    onClick={handleReceive}
                                    disabled={packs === 0 || !form.productName || !form.supplier || !form.purchasePrice}
                                >
                                    <PackagePlus className="mr-2 h-4 w-4" /> Confirm Receipt
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ── RECEIVING HISTORY ─────────────────────────────────────────── */}
                <TabsContent value="history" className="mt-4">
                    <div className="border rounded-md overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Receipt #</TableHead>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Product</TableHead>
                                    <TableHead>Supplier</TableHead>
                                    <TableHead>Qty Purchased</TableHead>
                                    <TableHead>Price</TableHead>
                                    <TableHead>Portion / Pack</TableHead>
                                    <TableHead className="text-right">Packs</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {receipts.length === 0
                                    ? (
                                        <TableRow>
                                            <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                                                No receiving records yet. Use &quot;Receive Goods&quot; tab to log incoming stock.
                                            </TableCell>
                                        </TableRow>
                                    )
                                    : receipts.map(r => (
                                        <TableRow key={r.id}>
                                            <TableCell className="text-xs text-muted-foreground font-mono">{r.id}</TableCell>
                                            <TableCell>{r.date}</TableCell>
                                            <TableCell className="font-medium">{r.productName}</TableCell>
                                            <TableCell className="text-muted-foreground">{r.supplier}</TableCell>
                                            <TableCell>{r.purchaseQty} {r.purchaseUnit}</TableCell>
                                            <TableCell>{r.currency} {r.purchasePrice.toFixed(2)}</TableCell>
                                            <TableCell>{r.portionSize} {r.portionUnit}</TableCell>
                                            <TableCell className="text-right font-semibold text-primary">{r.packs}</TableCell>
                                        </TableRow>
                                    ))
                                }
                            </TableBody>
                        </Table>
                    </div>
                </TabsContent>
            </Tabs>

            {/* ── ADD PRODUCT DIALOG ─────────────────────────────────────────────── */}
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Add New Product to Stock</DialogTitle>
                        <DialogDescription>
                            Set stock parameters. You can edit these later inline.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-2 gap-3 py-2">
                        <div className="col-span-2 space-y-1">
                            <Label>Product Name</Label>
                            <Input
                                value={newStock.productName ?? ""}
                                onChange={e => setNewStock(s => ({ ...s, productName: e.target.value }))}
                                placeholder="e.g. Bean Sprouts"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label>Category</Label>
                            <Select value={newStock.category} onValueChange={v => setNewStock(s => ({ ...s, category: v }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1">
                            <Label>Unit</Label>
                            <Select value={newStock.unit} onValueChange={v => setNewStock(s => ({ ...s, unit: v }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {["pack", "kg", "lbs", "L", "piece", "bag"].map(u =>
                                        <SelectItem key={u} value={u}>{u}</SelectItem>
                                    )}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1">
                            <Label>Max Stock</Label>
                            <Input type="number" value={newStock.max ?? ""} onChange={e => setNewStock(s => ({ ...s, max: parseFloat(e.target.value) }))} />
                        </div>
                        <div className="space-y-1">
                            <Label>Safety Stock</Label>
                            <Input type="number" value={newStock.safetyStock ?? ""} onChange={e => setNewStock(s => ({ ...s, safetyStock: parseFloat(e.target.value) }))} />
                        </div>
                        <div className="space-y-1">
                            <Label>ROP (Reorder Point)</Label>
                            <Input type="number" value={newStock.rop ?? ""} onChange={e => setNewStock(s => ({ ...s, rop: parseFloat(e.target.value) }))} />
                        </div>
                        <div className="space-y-1">
                            <Label>Current Stock</Label>
                            <Input type="number" value={newStock.currentStock ?? ""} onChange={e => setNewStock(s => ({ ...s, currentStock: parseFloat(e.target.value) }))} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
                        <Button onClick={() => {
                            if (!newStock.productName) return;
                            setStockItems(prev => [...prev, { ...newStock, id: `S${Date.now()}` } as StockItem]);
                            setAddOpen(false);
                            setNewStock({ category: "Vegetables", unit: "pack", max: 100, safetyStock: 10, rop: 20, currentStock: 0 });
                        }}>
                            Add Product
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
