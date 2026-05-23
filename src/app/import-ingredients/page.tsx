"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ingredientsApi, suppliersApi, ingredientCategoriesApi, storageAreasApi,
  Supplier, IngredientCategory, StorageArea,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { UploadCloud, FileSpreadsheet, CheckCircle2, AlertCircle, ArrowLeft, Download, Loader2 } from "lucide-react";

interface ParsedRow {
  name: string;
  supplierName: string;
  purchaseUnit: string;
  purchasePrice: number;
  recipeUnit: string;
  yieldPercent: number;
  conversionRate: number;
  groupId: string;
  category: string;
  sku: string;
  storageArea: string;
  imageUrl: string;
  error?: string;
}

interface ImportResult {
  success: number;
  failed: number;
  errors: string[];
}

const VALID_GROUPS = ["Weight", "Volume", "Count"] as const;

function parseCSV(text: string): ParsedRow[] {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  return lines.slice(1).map((line, i) => {
    // Handle quoted fields with commas inside
    const cols: string[] = [];
    let cur = "";
    let inQuote = false;
    for (let ci = 0; ci < line.length; ci++) {
      const ch = line[ci];
      if (ch === '"') { inQuote = !inQuote; continue; }
      if (ch === "," && !inQuote) { cols.push(cur.trim()); cur = ""; continue; }
      cur += ch;
    }
    cols.push(cur.trim());

    const [
      name = "", supplierName = "", purchaseUnit = "", purchasePrice = "",
      recipeUnit = "", yieldPct = "", convRate = "", groupId = "",
      category = "", sku = "", storageArea = "", imageUrl = "",
    ] = cols;

    const errors: string[] = [];
    if (!name) errors.push(`Row ${i + 2}: Name required`);
    if (isNaN(parseFloat(purchasePrice))) errors.push(`Row ${i + 2}: Invalid purchase price`);
    if (isNaN(parseFloat(yieldPct))) errors.push(`Row ${i + 2}: Invalid yield %`);
    if (isNaN(parseFloat(convRate))) errors.push(`Row ${i + 2}: Invalid conversion rate`);
    if (groupId && !VALID_GROUPS.includes(groupId as (typeof VALID_GROUPS)[number]))
      errors.push(`Row ${i + 2}: Group must be Weight, Volume, or Count`);

    return {
      name,
      supplierName,
      purchaseUnit: purchaseUnit || "kg",
      purchasePrice: parseFloat(purchasePrice) || 0,
      recipeUnit: recipeUnit || "g",
      yieldPercent: parseFloat(yieldPct) || 100,
      conversionRate: parseFloat(convRate) || 1000,
      groupId: VALID_GROUPS.includes(groupId as (typeof VALID_GROUPS)[number]) ? groupId : "Weight",
      category,
      sku,
      storageArea,
      imageUrl,
      error: errors.join("; ") || undefined,
    };
  });
}

export default function ImportIngredientsPage() {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [importStatus, setImportStatus] = useState<"idle" | "success" | "error">("idle");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [preview, setPreview] = useState<ParsedRow[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [categories, setCategories] = useState<IngredientCategory[]>([]);
  const [storageAreas, setStorageAreas] = useState<StorageArea[]>([]);

  useEffect(() => {
    suppliersApi.list().then(setSuppliers).catch(() => {});
    ingredientCategoriesApi.list().then(setCategories).catch(() => {});
    storageAreasApi.list().then(setStorageAreas).catch(() => {});
  }, []);

  const handleDownloadTemplate = () => {
    const header = [
      "Name",
      "Supplier Name",
      "Purchase Unit",
      "Purchase Price",
      "Recipe Unit",
      "Yield %",
      "Conversion Rate",
      "Group",
      "Category",
      "SKU",
      "Storage Area",
      "Image URL",
    ].join(",");

    const examples = [
      // Name, Supplier Name, Purchase Unit, Purchase Price, Recipe Unit, Yield %, Conversion Rate, Group, Category, SKU, Storage Area, Image URL
      ["Shrimp (Medium)", "Fresh Market Co.", "kg", "180.00", "g", "85", "1000", "Weight", "Seafood", "SEA-WGT-SHRMPM", "Walk-in Fridge", ""].join(","),
      ["Rice Noodles (Dry)", "Dry Goods Supplier", "kg", "32.00", "g", "100", "1000", "Weight", "Dry Goods", "DRY-WGT-RCNDL", "Dry Store", ""].join(","),
      ["Tamarind Paste", "Sauce House", "kg", "68.00", "g", "100", "1000", "Weight", "Sauces & Pastes", "SAU-WGT-TMRND", "Dry Store", ""].join(","),
      ["Fish Sauce", "Thai Condiment Co.", "L", "45.00", "ml", "100", "1000", "Volume", "Sauces & Pastes", "SAU-VOL-FSHSC", "Dry Store", ""].join(","),
      ["Chicken Egg", "Local Farm", "pack", "72.00", "pc", "100", "30", "Count", "Proteins", "PRO-CNT-CHKEG", "Walk-in Fridge", ""].join(","),
      ["Galangal (Fresh)", "Fresh Market Co.", "kg", "55.00", "g", "95", "1000", "Weight", "Herbs & Spices", "HRB-WGT-GLNGL", "Walk-in Fridge", ""].join(","),
      ["Coconut Milk (can)", "Dry Goods Supplier", "L", "38.00", "ml", "100", "1000", "Volume", "Dairy & Alternatives", "DAI-VOL-CCMK", "Dry Store", ""].join(","),
      ["Lime", "Fresh Market Co.", "kg", "40.00", "pc", "100", "8", "Count", "Produce", "PRD-CNT-LIME", "Walk-in Fridge", ""].join(","),
    ];

    const csv = [header, ...examples].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ingredient-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const f = e.target.files[0];
    setFile(f);
    setImportStatus("idle");
    setImportResult(null);
    const reader = new FileReader();
    reader.onload = ev => setPreview(parseCSV(ev.target?.result as string).slice(0, 5));
    reader.readAsText(f);
  };

  const handleImport = async () => {
    if (!file) return;
    setIsUploading(true);
    try {
      const text = await file.text();
      const rows = parseCSV(text);
      const validRows = rows.filter(r => !r.error);
      const errors = rows.filter(r => r.error).map(r => r.error!);
      let success = 0;

      for (const row of validRows) {
        try {
          // Resolve supplier
          const matched = suppliers.find(s => s.name.toLowerCase() === row.supplierName.toLowerCase())
            ?? suppliers.find(s => s.status === "Active")
            ?? suppliers[0];
          if (!matched) { errors.push(`${row.name}: No supplier found`); continue; }

          // Resolve category by name (case-insensitive)
          const matchedCategory = categories.find(
            c => c.name.toLowerCase() === row.category.toLowerCase()
          );

          // Resolve storage area by name (case-insensitive)
          const matchedArea = storageAreas.find(
            a => a.name.toLowerCase() === row.storageArea.toLowerCase()
          );

          await ingredientsApi.create({
            name: row.name,
            supplierId: matched.id,
            purchaseUnit: row.purchaseUnit,
            purchasePrice: row.purchasePrice,
            recipeUnit: row.recipeUnit,
            yieldPercent: row.yieldPercent,
            conversionRate: row.conversionRate,
            groupId: row.groupId as "Weight" | "Volume" | "Count",
            imageUrl: row.imageUrl || null,
            ...(row.sku ? { sku: row.sku } : {}),
            ...(matchedCategory ? { categoryId: matchedCategory.id } : {}),
            ...(matchedArea ? { storageAreaId: matchedArea.id } : {}),
          });
          success++;
        } catch (err) {
          errors.push(`${row.name}: ${err instanceof Error ? err.message : "Failed"}`);
        }
      }
      setImportResult({ success, failed: errors.length, errors: errors.slice(0, 10) });
      setImportStatus(success > 0 ? "success" : "error");
    } catch {
      setImportStatus("error");
      setImportResult({ success: 0, failed: 1, errors: ["Failed to read file."] });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center gap-4 mb-2">
        <Link href="/ingredients">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h2 className="text-3xl font-bold font-playfair tracking-tight text-primary">Import Ingredients</h2>
          <p className="text-muted-foreground">Upload a CSV to bulk-import ingredients with all V3 fields.</p>
        </div>
      </div>

      {/* Column guide */}
      <Card className="border-muted">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">CSV Column Reference</CardTitle>
          <CardDescription>12 columns — optional fields can be left blank</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-1 text-sm">
            {[
              ["1", "Name", "required"],
              ["2", "Supplier Name", "matched by name"],
              ["3", "Purchase Unit", "kg / L / pack …"],
              ["4", "Purchase Price", "THB per purchase unit"],
              ["5", "Recipe Unit", "g / ml / pc …"],
              ["6", "Yield %", "e.g. 85"],
              ["7", "Conversion Rate", "e.g. 1000 (kg→g)"],
              ["8", "Group", "Weight / Volume / Count"],
              ["9", "Category", "matched by name, optional"],
              ["10", "SKU", "auto-generated if blank"],
              ["11", "Storage Area", "matched by name, optional"],
              ["12", "Image URL", "optional"],
            ].map(([num, col, hint]) => (
              <div key={num} className="flex gap-2 py-0.5">
                <span className="text-muted-foreground w-5 shrink-0">{num}.</span>
                <span className="font-medium">{col}</span>
                <span className="text-muted-foreground text-xs self-center">({hint})</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle>Upload CSV</CardTitle>
              <CardDescription>
                Download the template, fill it in, then upload here.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
              <Download className="mr-2 h-4 w-4" /> Download Template
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="border-2 border-dashed border-border rounded-lg p-12 text-center hover:bg-accent/50 transition-colors cursor-pointer relative">
            <Input
              type="file"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              accept=".csv"
              onChange={handleFileChange}
            />
            <div className="flex flex-col items-center justify-center space-y-4 pointer-events-none">
              <div className="p-4 bg-primary/10 rounded-full">
                <UploadCloud className="h-10 w-10 text-primary" />
              </div>
              <div>
                <p className="font-medium text-lg">Click to upload or drag and drop</p>
                <p className="text-sm text-muted-foreground mt-1">CSV files only · max 10 MB</p>
              </div>
            </div>
          </div>

          {file && (
            <div className="flex items-center gap-4 p-4 border rounded-md bg-accent/20">
              <FileSpreadsheet className="h-8 w-8 text-green-500" />
              <div className="flex-1">
                <p className="font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(2)} KB</p>
              </div>
            </div>
          )}

          {preview.length > 0 && importStatus === "idle" && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Preview (first 5 rows)</p>
              <div className="border rounded-md overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead>Group</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Storage Area</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{row.name}</TableCell>
                        <TableCell>{row.supplierName || <span className="text-muted-foreground italic">auto</span>}</TableCell>
                        <TableCell>{row.groupId}</TableCell>
                        <TableCell>{row.category || <span className="text-muted-foreground italic">—</span>}</TableCell>
                        <TableCell className="font-mono text-xs">{row.sku || <span className="text-muted-foreground italic">auto</span>}</TableCell>
                        <TableCell>{row.storageArea || <span className="text-muted-foreground italic">—</span>}</TableCell>
                        <TableCell>฿{row.purchasePrice.toFixed(2)}</TableCell>
                        <TableCell>
                          {row.error
                            ? <Badge variant="destructive" title={row.error}>Error</Badge>
                            : <Badge className="bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400">Valid</Badge>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {importStatus === "success" && importResult && (
            <div className="flex items-start gap-4 p-4 border border-green-200 bg-green-50 text-green-800 rounded-md dark:bg-green-950/30 dark:border-green-900 dark:text-green-400">
              <CheckCircle2 className="h-5 w-5 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Import Complete</p>
                <p className="text-sm opacity-90 mt-1">
                  {importResult.success} ingredient{importResult.success !== 1 ? "s" : ""} imported successfully.
                  {importResult.failed > 0 && ` ${importResult.failed} row${importResult.failed !== 1 ? "s" : ""} failed.`}
                </p>
                {importResult.errors.length > 0 && (
                  <ul className="mt-2 text-xs space-y-1 list-disc list-inside opacity-80">
                    {importResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                )}
              </div>
            </div>
          )}

          {importStatus === "error" && importResult && (
            <div className="flex items-start gap-4 p-4 border border-destructive/30 bg-destructive/10 text-destructive rounded-md">
              <AlertCircle className="h-5 w-5 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Import Failed</p>
                {importResult.errors.map((e, i) => <p key={i} className="text-sm mt-1">{e}</p>)}
              </div>
            </div>
          )}
        </CardContent>
        <CardFooter className="border-t pt-6 flex justify-between">
          <Button variant="outline" onClick={() => { setFile(null); setImportStatus("idle"); setImportResult(null); setPreview([]); }}>
            Clear
          </Button>
          <Button onClick={handleImport} disabled={!file || isUploading} className="min-w-36">
            {isUploading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importing...</> : "Start Import"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
