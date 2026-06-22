"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
    Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
    UtensilsCrossed, Plus, Pencil, Trash2, Loader2, AlertCircle,
    Search, Download, Info, Upload, FileSpreadsheet,
} from "lucide-react";
import { portionStandardsApi, ingredientsApi, type PortionStandard, type Ingredient } from "@/lib/api";
import { useAuth } from "@/components/auth-provider";
import CompositeManager from "./composite-manager";

const EDIT_ROLES = ["admin", "manager", "chef"];

// ─── Units ────────────────────────────────────────────────────────────────────
const UNITS = ["oz", "g", "kg", "ml", "L", "fl oz", "piece", "portion", "scoop", "tbsp", "tsp"];

const TYPE_LABELS: Record<string, { label: string; desc: string; color: string }> = {
    base:     { label: "Base Item",  desc: "Matched to a menu item sold",         color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"   },
    modifier: { label: "Modifier",   desc: "Matched to a modifier/add-on sold",   color: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300" },
};

interface FormState {
    ingredientId: string;
    itemName:     string;
    type:         string;
    portionSize:  string;
    portionUnit:  string;
    notes:        string;
}

const EMPTY_FORM: FormState = {
    ingredientId: "",
    itemName:     "",
    type:         "base",
    portionSize:  "",
    portionUnit:  "oz",
    notes:        "",
};

// ─── Searchable Ingredient Picker ─────────────────────────────────────────────
function IngredientPicker({
    ingredients, value, onChange,
}: { ingredients: Ingredient[]; value: string; onChange: (id: string) => void }) {
    const [search, setSearch] = useState("");
    const selected = ingredients.find(i => i.id === value);
    const filtered = useMemo(() => {
        const q = search.toLowerCase();
        return q
            ? ingredients.filter(i => i.name.toLowerCase().includes(q) ||
                (i.category?.name ?? "").toLowerCase().includes(q))
            : ingredients;
    }, [ingredients, search]);

    if (selected && !search) {
        return (
            <div className="flex items-center gap-2 border rounded-lg px-3 py-2 bg-muted/30">
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{selected.name}</p>
                    {selected.category && <p className="text-xs text-muted-foreground">{selected.category.name}</p>}
                </div>
                <button onClick={() => onChange("")} className="text-xs text-muted-foreground hover:text-destructive shrink-0">
                    ✕ Change
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-1.5">
            <div className="relative">
                <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search ingredient…"
                    className="pl-8 h-9 text-sm"
                    autoFocus={!value}
                />
            </div>
            <div className="border rounded-lg max-h-44 overflow-y-auto">
                {filtered.length === 0 ? (
                    <p className="text-xs text-muted-foreground p-3 text-center">No ingredients found</p>
                ) : (
                    filtered.map(ing => (
                        <button key={ing.id}
                            type="button"
                            onClick={() => { onChange(ing.id); setSearch(""); }}
                            className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors
                                ${ing.id === value ? "bg-primary/10" : ""}`}
                        >
                            <span className="text-sm font-medium truncate">{ing.name}</span>
                            <div className="flex items-center gap-1.5 shrink-0">
                                {ing.category && (
                                    <span className="text-[10px] text-muted-foreground">{ing.category.name}</span>
                                )}
                                <span className="text-[10px] border rounded px-1 text-muted-foreground">{ing.recipeUnit}</span>
                            </div>
                        </button>
                    ))
                )}
            </div>
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function PortionStandardsPage() {
    const { user } = useAuth();
    const canManage = EDIT_ROLES.includes(user?.role ?? "");
    const [standards,    setStandards]   = useState<PortionStandard[]>([]);
    const [ingredients,  setIngredients] = useState<Ingredient[]>([]);
    const [loading,      setLoading]     = useState(true);
    const [saving,       setSaving]      = useState(false);
    const [error,        setError]       = useState<string | null>(null);
    const [dialogOpen,   setDialogOpen]  = useState(false);
    const [editRow,      setEditRow]     = useState<PortionStandard | null>(null);
    const [deleteRow,    setDeleteRow]   = useState<PortionStandard | null>(null);
    const [form,         setForm]        = useState<FormState>(EMPTY_FORM);
    const [search,       setSearch]      = useState("");
    const [typeFilter,   setTypeFilter]  = useState<string>("all");
    const [importing,    setImporting]   = useState(false);
    const [importResult, setImportResult] = useState<{ created: number; updated: number; errors: { row: number; reason: string }[] } | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [stds, ings] = await Promise.all([
                portionStandardsApi.list(),
                ingredientsApi.list(),
            ]);
            setStandards(stds);
            setIngredients(ings.sort((a, b) => a.name.localeCompare(b.name)));
        } catch {
            setError("Failed to load data");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    // ── Filter ──
    const filtered = useMemo(() => {
        const q = search.toLowerCase();
        return standards.filter(s => {
            const matchSearch = !q ||
                s.ingredient?.name.toLowerCase().includes(q) ||
                s.itemName.toLowerCase().includes(q) ||
                s.portionUnit.toLowerCase().includes(q);
            const matchType = typeFilter === "all" || s.type === typeFilter;
            return matchSearch && matchType;
        });
    }, [standards, search, typeFilter]);

    // ── Dialog helpers ──
    const openAdd = () => {
        setEditRow(null);
        setForm(EMPTY_FORM);
        setError(null);
        setDialogOpen(true);
    };

    const openEdit = (row: PortionStandard) => {
        setEditRow(row);
        setForm({
            ingredientId: row.ingredientId,
            itemName:     row.itemName,
            type:         row.type,
            portionSize:  String(row.portionSize),
            portionUnit:  row.portionUnit,
            notes:        row.notes ?? "",
        });
        setError(null);
        setDialogOpen(true);
    };

    const f = (k: keyof FormState) => (v: string) => setForm(p => ({ ...p, [k]: v }));

    // ── Save ──
    const handleSave = async () => {
        if (!form.ingredientId || !form.itemName.trim() || !form.portionSize || !form.portionUnit) {
            setError("Ingredient, item name, portion size and unit are required");
            return;
        }
        setSaving(true); setError(null);
        try {
            const data = {
                ingredientId: form.ingredientId,
                itemName:     form.itemName.trim(),
                type:         form.type as "base" | "modifier",
                portionSize:  Number(form.portionSize),
                portionUnit:  form.portionUnit,
                notes:        form.notes.trim() || undefined,
            };
            if (editRow) {
                const updated = await portionStandardsApi.update(editRow.id, data);
                setStandards(prev => prev.map(s => s.id === editRow.id ? updated : s));
            } else {
                const created = await portionStandardsApi.create(data);
                setStandards(prev => [...prev, created]);
            }
            setDialogOpen(false);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to save");
        } finally {
            setSaving(false);
        }
    };

    // ── Delete ──
    const handleDelete = async () => {
        if (!deleteRow) return;
        try {
            await portionStandardsApi.delete(deleteRow.id);
            setStandards(prev => prev.filter(s => s.id !== deleteRow.id));
            setDeleteRow(null);
        } catch {
            setError("Failed to delete");
        }
    };

    // ── Export CSV ──
    const handleExport = () => {
        const rows = [
            ["Ingredient", "Category", "Menu Item / Modifier", "Type", "Portion Size", "Unit", "Notes"],
            ...standards.map(s => [
                s.ingredient?.name ?? "",
                s.ingredient?.category?.name ?? "",
                s.itemName,
                s.type,
                String(s.portionSize),
                s.portionUnit,
                s.notes ?? "",
            ]),
        ];
        const csv  = rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
        const blob = new Blob([csv], { type: "text/csv" });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement("a");
        a.href = url; a.download = "portion-standards.csv"; a.click();
        URL.revokeObjectURL(url);
    };

    // ── Download Excel template (with an Ingredients reference sheet) ──
    const handleTemplate = async () => {
        const XLSX = await import("xlsx");
        const headers = ["Ingredient", "Menu Item / Modifier", "Type", "Portion Size", "Unit", "Notes"];
        const example = [
            ["Chicken Breast", "Pad Thai", "base", 6, "oz", "main protein per plate"],
            ["Chicken", "Extra Chicken", "modifier", 3, "oz", "add-on portion"],
        ];
        const ws = XLSX.utils.aoa_to_sheet([headers, ...example]);
        ws["!cols"] = [{ wch: 24 }, { wch: 26 }, { wch: 10 }, { wch: 12 }, { wch: 8 }, { wch: 30 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Portion Standards");

        const ref = XLSX.utils.aoa_to_sheet([
            ["Valid Ingredient names — copy into column A (or use the SKU)"],
            ...ingredients.map(i => [i.name, i.sku ?? ""]),
        ]);
        ref["!cols"] = [{ wch: 40 }, { wch: 20 }];
        XLSX.utils.book_append_sheet(wb, ref, "Ingredients");

        const units = XLSX.utils.aoa_to_sheet([["Type: base | modifier"], ["Units:"], ...UNITS.map(u => [u])]);
        XLSX.utils.book_append_sheet(wb, units, "Help");

        XLSX.writeFile(wb, "portion-standards-template.xlsx");
    };

    // ── Import Excel / CSV ──
    const pick = (o: Record<string, unknown>, names: string[]): string => {
        const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
        for (const k of Object.keys(o)) {
            if (names.some(n => norm(k) === norm(n))) return String(o[k] ?? "");
        }
        return "";
    };
    const handleImportFile = async (file: File) => {
        setImporting(true); setError(null);
        try {
            const XLSX = await import("xlsx");
            const wb = XLSX.read(await file.arrayBuffer());
            const ws = wb.Sheets[wb.SheetNames[0]];
            const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
            const rows = json.map(o => ({
                ingredient:  pick(o, ["ingredient", "ingredientname", "sku"]).trim(),
                itemName:    pick(o, ["menuitemmodifier", "itemname", "item", "menuitem", "modifier"]).trim(),
                type:        pick(o, ["type"]).trim() || "base",
                portionSize: pick(o, ["portionsize", "size", "qty", "portion"]),
                portionUnit: pick(o, ["unit", "portionunit"]).trim(),
                notes:       pick(o, ["notes", "note"]).trim(),
            })).filter(r => r.ingredient || r.itemName);

            if (rows.length === 0) { setError("No data rows found. Use the template's column headers."); return; }

            const res = await portionStandardsApi.import(rows);
            setImportResult(res);
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Import failed");
        } finally { setImporting(false); }
    };

    // ── Stats ──
    const baseCount = standards.filter(s => s.type === "base").length;
    const modCount  = standards.filter(s => s.type === "modifier").length;
    const ingCovered = new Set(standards.map(s => s.ingredientId)).size;

    return (
        <div className="space-y-5 pb-16">

            {/* ── Header ── */}
            <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-gradient-to-br from-violet-100 to-purple-100 dark:from-violet-900/40 dark:to-purple-900/40">
                    <UtensilsCrossed className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                </div>
                <div className="flex-1 min-w-0">
                    <h1 className="text-lg sm:text-xl font-bold">Portion Standards</h1>
                    <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">
                        Define standard portion sizes per menu item — used by the Portion Calc tab in PMIX Analytics
                    </p>
                </div>
                <div className="flex gap-2 shrink-0 flex-wrap">
                    <Button variant="outline" size="sm" className="h-9 gap-1.5 rounded-xl" onClick={handleTemplate}>
                        <FileSpreadsheet className="w-3.5 h-3.5" /> Template
                    </Button>
                    <Button variant="outline" size="sm" className="h-9 gap-1.5 rounded-xl" disabled={importing}
                        onClick={() => document.getElementById("portion-import-input")?.click()}>
                        {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Import
                    </Button>
                    <input id="portion-import-input" type="file" accept=".xlsx,.xls,.csv" className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) { handleImportFile(f); e.target.value = ""; } }} />
                    {standards.length > 0 && (
                        <Button variant="outline" size="sm" className="h-9 gap-1.5 rounded-xl hidden sm:flex" onClick={handleExport}>
                            <Download className="w-3.5 h-3.5" /> Export
                        </Button>
                    )}
                    <Button size="sm" className="h-9 gap-1.5 rounded-xl" onClick={openAdd}>
                        <Plus className="w-3.5 h-3.5" /> Add Standard
                    </Button>
                </div>
            </div>

            {/* ── How it works ── */}
            <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-sm text-blue-800 dark:text-blue-300">
                <Info className="w-4 h-4 mt-0.5 shrink-0" />
                <div className="space-y-0.5">
                    <p className="font-medium">How portion standards work</p>
                    <p className="text-xs opacity-80">
                        Set a <strong>Base Item</strong> standard to match a PMIX menu item (e.g. "Pad Thai Chicken" → Chicken 6 oz).
                        Set a <strong>Modifier</strong> standard to match an add-on modifier (e.g. "Extra Chicken" → Chicken 3 oz).
                        Open the <strong>Portion Calc</strong> tab in PMIX Analytics to see total usage calculated automatically.
                    </p>
                </div>
            </div>

            {/* ── Stats ── */}
            {standards.length > 0 && (
                <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-xl border bg-card p-4">
                        <p className="text-xs text-muted-foreground font-medium">Total Standards</p>
                        <p className="text-2xl font-bold mt-1">{standards.length}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{baseCount} base · {modCount} modifier</p>
                    </div>
                    <div className="rounded-xl border bg-card p-4">
                        <p className="text-xs text-muted-foreground font-medium">Ingredients</p>
                        <p className="text-2xl font-bold mt-1">{ingCovered}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">with portion rules</p>
                    </div>
                    <div className="rounded-xl border bg-card p-4">
                        <p className="text-xs text-muted-foreground font-medium">Menu Items</p>
                        <p className="text-2xl font-bold mt-1">{new Set(standards.filter(s => s.type === "base").map(s => s.itemName)).size}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">base portions defined</p>
                    </div>
                </div>
            )}

            {/* ── Error ── */}
            {error && !dialogOpen && (
                <div className="flex items-center gap-2 p-3.5 rounded-xl bg-destructive/10 text-destructive text-sm border border-destructive/20">
                    <AlertCircle className="w-4 h-4 shrink-0" /> {error}
                </div>
            )}

            {/* ── Filters ── */}
            {standards.length > 0 && (
                <div className="flex gap-2 flex-col sm:flex-row">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                        <Input value={search} onChange={e => setSearch(e.target.value)}
                            placeholder="Search ingredient or menu item…"
                            className="pl-9 rounded-xl h-10" />
                    </div>
                    <Select value={typeFilter} onValueChange={setTypeFilter}>
                        <SelectTrigger className="sm:w-36 h-10 rounded-xl">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Types</SelectItem>
                            <SelectItem value="base">Base Items</SelectItem>
                            <SelectItem value="modifier">Modifiers</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            )}

            {/* ── Table ── */}
            {loading ? (
                <Card><CardContent className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></CardContent></Card>
            ) : standards.length === 0 ? (
                <Card>
                    <CardContent className="flex flex-col items-center justify-center py-16 gap-4 text-center">
                        <div className="p-5 rounded-2xl bg-muted/40">
                            <UtensilsCrossed className="w-10 h-10 text-muted-foreground/40" />
                        </div>
                        <div>
                            <p className="text-lg font-semibold">No portion standards yet</p>
                            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                                Add your first standard to start calculating ingredient usage from PMIX sales data without BOM linkage.
                            </p>
                        </div>
                        <Button className="gap-2 rounded-xl" onClick={openAdd}>
                            <Plus className="w-4 h-4" /> Add First Standard
                        </Button>
                    </CardContent>
                </Card>
            ) : (
                <Card className="overflow-hidden">
                    <CardHeader className="px-5 py-3 border-b bg-muted/20">
                        <CardTitle className="text-sm font-semibold">
                            {filtered.length} of {standards.length} standard{standards.length !== 1 ? "s" : ""}
                        </CardTitle>
                    </CardHeader>

                    {/* Desktop table */}
                    <div className="hidden sm:block overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/10">
                                    <TableHead>Ingredient</TableHead>
                                    <TableHead>Menu Item / Modifier Name</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead className="text-right">Portion</TableHead>
                                    <TableHead>Notes</TableHead>
                                    <TableHead className="w-20"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filtered.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                            No standards match your search
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filtered.map(row => (
                                        <TableRow key={row.id} className="group">
                                            <TableCell>
                                                <div>
                                                    <p className="font-medium text-sm">{row.ingredient?.name ?? row.ingredientId}</p>
                                                    {row.ingredient?.category && (
                                                        <p className="text-xs text-muted-foreground">{row.ingredient.category.name}</p>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <p className="text-sm font-medium">{row.itemName}</p>
                                            </TableCell>
                                            <TableCell>
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${TYPE_LABELS[row.type]?.color ?? ""}`}>
                                                    {TYPE_LABELS[row.type]?.label ?? row.type}
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <span className="font-bold tabular-nums">{Number(row.portionSize)}</span>
                                                <span className="text-muted-foreground text-xs ml-1">{row.portionUnit}</span>
                                                <span className="text-muted-foreground text-xs">/serve</span>
                                            </TableCell>
                                            <TableCell className="text-xs text-muted-foreground max-w-[160px] truncate">
                                                {row.notes ?? "—"}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => openEdit(row)}>
                                                        <Pencil className="w-3.5 h-3.5" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-destructive hover:text-destructive" onClick={() => setDeleteRow(row)}>
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>

                    {/* Mobile cards */}
                    <div className="sm:hidden divide-y">
                        {filtered.map(row => (
                            <div key={row.id} className="flex items-start gap-3 p-4">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <p className="text-sm font-semibold">{row.ingredient?.name ?? row.ingredientId}</p>
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${TYPE_LABELS[row.type]?.color ?? ""}`}>
                                            {TYPE_LABELS[row.type]?.label}
                                        </span>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-0.5">{row.itemName}</p>
                                    <p className="text-sm font-bold mt-1 tabular-nums">
                                        {Number(row.portionSize)} {row.portionUnit}/serve
                                    </p>
                                    {row.notes && <p className="text-xs text-muted-foreground mt-0.5">{row.notes}</p>}
                                </div>
                                <div className="flex gap-1 shrink-0">
                                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => openEdit(row)}>
                                        <Pencil className="w-3.5 h-3.5" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-destructive" onClick={() => setDeleteRow(row)}>
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>
            )}

            {/* ══════════════════════════════════════════
                ADD / EDIT DIALOG
            ══════════════════════════════════════════ */}
            <Dialog open={dialogOpen} onOpenChange={o => { if (!o) setDialogOpen(false); }}>
                <DialogContent className="sm:max-w-lg max-h-[90dvh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <UtensilsCrossed className="w-4 h-4 text-violet-600" />
                            {editRow ? "Edit Portion Standard" : "Add Portion Standard"}
                        </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4 py-2">

                        {/* Ingredient */}
                        <div className="space-y-1.5">
                            <Label className="text-sm font-medium">Ingredient <span className="text-destructive">*</span></Label>
                            <IngredientPicker
                                ingredients={ingredients}
                                value={form.ingredientId}
                                onChange={f("ingredientId")}
                            />
                        </div>

                        {/* Type */}
                        <div className="space-y-1.5">
                            <Label className="text-sm font-medium">Type <span className="text-destructive">*</span></Label>
                            <div className="grid grid-cols-2 gap-2">
                                {(["base", "modifier"] as const).map(t => (
                                    <button key={t} type="button"
                                        onClick={() => f("type")(t)}
                                        className={`rounded-xl border p-3 text-left transition-all
                                            ${form.type === t
                                                ? "border-primary bg-primary/8 ring-1 ring-primary"
                                                : "border-border hover:bg-muted/50"
                                            }`}
                                    >
                                        <p className="text-sm font-semibold">{TYPE_LABELS[t].label}</p>
                                        <p className="text-xs text-muted-foreground mt-0.5">{TYPE_LABELS[t].desc}</p>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Item Name */}
                        <div className="space-y-1.5">
                            <Label className="text-sm font-medium">
                                {form.type === "modifier" ? "Modifier Name" : "Menu Item Name"} <span className="text-destructive">*</span>
                            </Label>
                            <Input
                                value={form.itemName}
                                onChange={e => f("itemName")(e.target.value)}
                                placeholder={form.type === "modifier" ? "e.g. Extra Chicken" : "e.g. Pad Thai Chicken"}
                                className="rounded-xl h-10"
                            />
                            <p className="text-xs text-muted-foreground">
                                Must match the <strong>exact name</strong> shown in your PMIX report (case-insensitive)
                            </p>
                        </div>

                        {/* Portion Size + Unit */}
                        <div className="space-y-1.5">
                            <Label className="text-sm font-medium">Portion per Serve <span className="text-destructive">*</span></Label>
                            <div className="flex gap-2">
                                <Input
                                    type="number"
                                    value={form.portionSize}
                                    onChange={e => f("portionSize")(e.target.value)}
                                    placeholder="6"
                                    min="0.001"
                                    step="0.001"
                                    className="rounded-xl h-10 flex-1"
                                />
                                <Select value={form.portionUnit} onValueChange={f("portionUnit")}>
                                    <SelectTrigger className="w-28 h-10 rounded-xl">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            {form.portionSize && form.portionUnit && form.itemName && (
                                <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
                                    Example: 100 orders of <strong>{form.itemName || "…"}</strong> →{" "}
                                    <strong>{(Number(form.portionSize || 0) * 100).toLocaleString()} {form.portionUnit}</strong> of {ingredients.find(i => i.id === form.ingredientId)?.name ?? "ingredient"}
                                </p>
                            )}
                        </div>

                        {/* Notes */}
                        <div className="space-y-1.5">
                            <Label className="text-sm font-medium text-muted-foreground">Notes (optional)</Label>
                            <Input
                                value={form.notes}
                                onChange={e => f("notes")(e.target.value)}
                                placeholder="e.g. Adjusted for bone-in yield"
                                className="rounded-xl h-10"
                            />
                        </div>

                        {error && (
                            <div className="flex items-center gap-2 p-3 rounded-xl bg-destructive/10 text-destructive text-sm border border-destructive/20">
                                <AlertCircle className="w-4 h-4 shrink-0" /> {error}
                            </div>
                        )}
                    </div>

                    <DialogFooter className="gap-2">
                        <Button variant="outline" className="rounded-xl" onClick={() => setDialogOpen(false)} disabled={saving}>
                            Cancel
                        </Button>
                        <Button className="rounded-xl gap-2" onClick={handleSave} disabled={saving}>
                            {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</> : editRow ? "Save Changes" : "Add Standard"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── Delete Confirm ── */}
            <Dialog open={!!deleteRow} onOpenChange={o => { if (!o) setDeleteRow(null); }}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle className="text-destructive">Delete Portion Standard?</DialogTitle>
                    </DialogHeader>
                    {deleteRow && (
                        <div className="py-2 space-y-3">
                            <p className="text-sm text-muted-foreground">
                                This will permanently remove the standard for{" "}
                                <strong>{deleteRow.ingredient?.name}</strong> matched to{" "}
                                &ldquo;<strong>{deleteRow.itemName}</strong>&rdquo;.
                            </p>
                            <div className="rounded-xl bg-muted/40 px-4 py-3 text-sm">
                                <span className="font-medium">{deleteRow.ingredient?.name}</span>
                                <span className="text-muted-foreground mx-2">→</span>
                                <span>{Number(deleteRow.portionSize)} {deleteRow.portionUnit}/serve</span>
                            </div>
                        </div>
                    )}
                    <DialogFooter className="gap-2">
                        <Button variant="outline" className="rounded-xl" onClick={() => setDeleteRow(null)}>Cancel</Button>
                        <Button variant="destructive" className="rounded-xl gap-2" onClick={handleDelete}>
                            <Trash2 className="w-3.5 h-3.5" /> Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Import result */}
            <Dialog open={!!importResult} onOpenChange={o => { if (!o) setImportResult(null); }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2"><Upload className="w-4 h-4 text-primary" /> Import complete</DialogTitle>
                    </DialogHeader>
                    {importResult && (
                        <div className="space-y-3 py-1">
                            <div className="flex gap-3">
                                <div className="flex-1 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-3 text-center">
                                    <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{importResult.created}</p>
                                    <p className="text-[11px] text-muted-foreground">created</p>
                                </div>
                                <div className="flex-1 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 p-3 text-center">
                                    <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{importResult.updated}</p>
                                    <p className="text-[11px] text-muted-foreground">updated</p>
                                </div>
                                <div className="flex-1 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3 text-center">
                                    <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">{importResult.errors.length}</p>
                                    <p className="text-[11px] text-muted-foreground">skipped</p>
                                </div>
                            </div>
                            {importResult.errors.length > 0 && (
                                <div className="max-h-48 overflow-y-auto rounded-lg border border-border divide-y text-xs">
                                    {importResult.errors.map((e, i) => (
                                        <div key={i} className="flex gap-2 px-2.5 py-1.5">
                                            <span className="text-muted-foreground shrink-0">Row {e.row}</span>
                                            <span className="text-amber-700 dark:text-amber-400">{e.reason}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                    <DialogFooter><Button size="sm" onClick={() => setImportResult(null)}>Done</Button></DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── Composites + combined settings export/import ── */}
            {!loading && <CompositeManager ingredients={ingredients} canManage={canManage} />}
        </div>
    );
}
