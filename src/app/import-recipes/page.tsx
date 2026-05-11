"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import { recipesApi, ingredientsApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
    UploadCloud, FileSpreadsheet, CheckCircle2, AlertCircle,
    ArrowLeft, Download, Loader2, ChefHat, Info, XCircle,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface IngredientRow {
    recipeName: string;
    ingredientName: string;
    quantity: number;
    ingredientId?: string;
    matched: boolean;
}

interface ParsedRecipe {
    name: string;
    category: string;
    yieldAmount: number;
    yieldUnit: string;
    prepTime: number;
    cookTime: number;
    laborCostPerHour: number;
    energyCostPerBatch: number;
    sellingPrice: number | null;
    instructions: string;
    ingredientRows: IngredientRow[];
    errors: string[];
}

interface ImportResult {
    success: number;
    failed: number;
    errors: string[];
}

// ─── Template Download ────────────────────────────────────────────────────────

function downloadTemplate() {
    const wb = XLSX.utils.book_new();

    // ── Sheet 1: Recipes ──
    const recipesData = [
        [
            "Recipe Name *",
            "Category",
            "Yield Amount *",
            "Yield Unit",
            "Prep Time (min)",
            "Cook Time (min)",
            "Labor Cost/Hour (฿)",
            "Energy Cost/Batch (฿)",
            "Selling Price (฿)",
            "Instructions",
        ],
        [
            "Pad Thai",
            "Main Dish",
            1,
            "serving",
            15,
            10,
            50,
            5,
            180,
            "1. Soak rice noodles in cold water for 30 min\n2. Heat wok over high heat\n3. Add oil and fry eggs\n4. Add noodles and sauce\n5. Toss until well combined",
        ],
        [
            "Tom Yum Soup",
            "Soup",
            4,
            "serving",
            10,
            20,
            50,
            3,
            280,
            "1. Bring water to a boil\n2. Add lemongrass, galangal, kaffir lime leaves\n3. Add mushrooms and shrimp\n4. Season with fish sauce, lime juice, chilli\n5. Ladle into bowls and garnish with coriander",
        ],
        [
            "Green Curry",
            "Curry",
            4,
            "serving",
            10,
            25,
            50,
            4,
            260,
            "1. Fry green curry paste with coconut milk\n2. Add chicken and cook through\n3. Add remaining coconut milk\n4. Add vegetables and season\n5. Finish with Thai basil",
        ],
    ];

    const wsRecipes = XLSX.utils.aoa_to_sheet(recipesData);
    wsRecipes["!cols"] = [
        { wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 12 },
        { wch: 16 }, { wch: 15 }, { wch: 20 }, { wch: 22 },
        { wch: 18 }, { wch: 55 },
    ];
    // Enable text wrap for Instructions column
    const range = XLSX.utils.decode_range(wsRecipes["!ref"] ?? "A1");
    for (let r = 1; r <= range.e.r; r++) {
        const cellRef = XLSX.utils.encode_cell({ r, c: 9 });
        if (wsRecipes[cellRef]) {
            wsRecipes[cellRef].s = { alignment: { wrapText: true, vertical: "top" } };
        }
    }
    XLSX.utils.book_append_sheet(wb, wsRecipes, "Recipes");

    // ── Sheet 2: Ingredients ──
    const ingredientsData = [
        ["Recipe Name *", "Ingredient Name *", "Quantity *"],
        ["Pad Thai", "Rice Noodles", 200],
        ["Pad Thai", "Eggs", 2],
        ["Pad Thai", "Bean Sprouts", 100],
        ["Pad Thai", "Shrimp", 80],
        ["Tom Yum Soup", "Lemongrass", 2],
        ["Tom Yum Soup", "Galangal", 30],
        ["Tom Yum Soup", "Kaffir Lime Leaves", 4],
        ["Tom Yum Soup", "Shrimp", 200],
        ["Tom Yum Soup", "Mushrooms", 150],
        ["Green Curry", "Green Curry Paste", 50],
        ["Green Curry", "Coconut Milk", 400],
        ["Green Curry", "Chicken Breast", 300],
    ];

    const wsIngredients = XLSX.utils.aoa_to_sheet(ingredientsData);
    wsIngredients["!cols"] = [{ wch: 22 }, { wch: 28 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, wsIngredients, "Ingredients");

    // ── Sheet 3: Guide ──
    const guideData = [
        ["📋 RECIPE IMPORT GUIDE"],
        [""],
        ["Sheet: Recipes"],
        ["Column", "Required", "Description", "Example"],
        ["Recipe Name", "Yes", "Unique recipe name", "Pad Thai"],
        ["Category", "No", "Category (defaults to Other if blank)", "Main Dish, Soup, Curry, Sauce"],
        ["Yield Amount", "Yes", "Quantity produced per batch", "1, 4, 10"],
        ["Yield Unit", "No", "Unit of yield", "serving, L, kg, portion"],
        ["Prep Time (min)", "No", "Preparation time in minutes", "15"],
        ["Cook Time (min)", "No", "Cooking time in minutes", "10"],
        ["Labor Cost/Hour (฿)", "No", "Labour cost per hour", "50"],
        ["Energy Cost/Batch (฿)", "No", "Energy cost per batch", "5"],
        ["Selling Price (฿)", "No", "Selling price per unit (used to calculate Food Cost %)", "180"],
        ["Instructions", "No", "Step-by-step instructions — each step on a new line within the cell", "1. Soak noodles\n2. Heat wok"],
        [""],
        ["Sheet: Ingredients"],
        ["Column", "Required", "Description", "Example"],
        ["Recipe Name", "Yes", "Must match a name in the Recipes sheet", "Pad Thai"],
        ["Ingredient Name", "Yes", "Must match an ingredient in the system (case-insensitive)", "Rice Noodles"],
        ["Quantity", "Yes", "Amount used (in the ingredient's defined unit)", "200"],
        [""],
        ["⚠️ Important Notes"],
        ["- Ingredient Name must match an ingredient that exists in the system (see Ingredients page)"],
        ["- Unmatched ingredients will be skipped but the recipe will still be imported"],
        ["- Both .xlsx and .csv are supported (CSV supports Recipe Info only — no Ingredients)"],
    ];
    const wsGuide = XLSX.utils.aoa_to_sheet(guideData);
    wsGuide["!cols"] = [{ wch: 30 }, { wch: 10 }, { wch: 55 }, { wch: 35 }];
    XLSX.utils.book_append_sheet(wb, wsGuide, "Guide");

    XLSX.writeFile(wb, "recipe-import-template.xlsx");
}

// ─── Parse Excel ──────────────────────────────────────────────────────────────

function parseExcel(
    buffer: ArrayBuffer,
    ingredientMap: Map<string, string>,
): ParsedRecipe[] {
    const wb = XLSX.read(buffer, { type: "array", cellText: true, cellDates: true });

    const recipeSheet = wb.Sheets["Recipes"];
    const ingredientSheet = wb.Sheets["Ingredients"];

    if (!recipeSheet) throw new Error('Sheet named "Recipes" not found in file');

    // Parse recipes
    const recipeRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(recipeSheet, { defval: "" });
    const ingredientRows: IngredientRow[] = ingredientSheet
        ? XLSX.utils.sheet_to_json<Record<string, unknown>>(ingredientSheet, { defval: "" }).map((row) => {
              const recipeName = String(row["Recipe Name *"] ?? row["Recipe Name"] ?? "").trim();
              const ingName = String(row["Ingredient Name *"] ?? row["Ingredient Name"] ?? "").trim();
              const qty = parseFloat(String(row["Quantity *"] ?? row["Quantity"] ?? "0")) || 0;
              const ingId = ingredientMap.get(ingName.toLowerCase());
              return {
                  recipeName,
                  ingredientName: ingName,
                  quantity: qty,
                  ingredientId: ingId,
                  matched: !!ingId,
              };
          })
        : [];

    return recipeRows.map((row, i) => {
        const name = String(row["Recipe Name *"] ?? row["Recipe Name"] ?? "").trim();
        const errors: string[] = [];
        if (!name) errors.push(`Row ${i + 2}: Recipe Name is required`);

        const yieldAmount = parseFloat(String(row["Yield Amount *"] ?? row["Yield Amount"] ?? "1")) || 1;
        if (!row["Yield Amount *"] && !row["Yield Amount"]) errors.push(`Row ${i + 2}: Yield Amount is required`);

        const sp = parseFloat(String(row["Selling Price (฿)"] ?? row["Selling Price"] ?? ""));
        const instructions = String(row["Instructions"] ?? "").trim();

        const myIngRows = ingredientRows.filter(
            (r) => r.recipeName.toLowerCase() === name.toLowerCase()
        );

        return {
            name,
            category: String(row["Category"] ?? "Other").trim() || "Other",
            yieldAmount,
            yieldUnit: String(row["Yield Unit"] ?? "serving").trim() || "serving",
            prepTime: parseInt(String(row["Prep Time (min)"] ?? "15")) || 15,
            cookTime: parseInt(String(row["Cook Time (min)"] ?? "10")) || 10,
            laborCostPerHour: parseFloat(String(row["Labor Cost/Hour (฿)"] ?? row["Labor Cost/Hour"] ?? "50")) || 50,
            energyCostPerBatch: parseFloat(String(row["Energy Cost/Batch (฿)"] ?? row["Energy Cost/Batch"] ?? "5")) || 5,
            sellingPrice: !isNaN(sp) && sp > 0 ? sp : null,
            instructions,
            ingredientRows: myIngRows,
            errors,
        };
    });
}

// ─── Parse legacy CSV (no ingredients) ───────────────────────────────────────

function parseCSV(text: string): ParsedRecipe[] {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) return [];
    return lines.slice(1).map((line, i) => {
        const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
        const [name, category, yieldAmount, yieldUnit, prepTime, cookTime, laborCost, energyCost, sellingPriceStr, instructions] = cols;
        const errors: string[] = [];
        if (!name) errors.push(`Row ${i + 2}: Recipe Name required`);
        if (isNaN(parseFloat(yieldAmount))) errors.push(`Row ${i + 2}: Invalid Yield Amount`);
        const sp = parseFloat(sellingPriceStr);
        return {
            name: name ?? "",
            category: category || "Other",
            yieldAmount: parseFloat(yieldAmount) || 1,
            yieldUnit: yieldUnit || "serving",
            prepTime: parseInt(prepTime) || 15,
            cookTime: parseInt(cookTime) || 10,
            laborCostPerHour: parseFloat(laborCost) || 50,
            energyCostPerBatch: parseFloat(energyCost) || 5,
            sellingPrice: !isNaN(sp) && sp > 0 ? sp : null,
            instructions: instructions || "",
            ingredientRows: [],
            errors,
        };
    });
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ImportRecipesPage() {
    const [file, setFile] = useState<File | null>(null);
    const [parsed, setParsed] = useState<ParsedRecipe[]>([]);
    const [parsing, setParsing] = useState(false);
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState<ImportResult | null>(null);
    const [importStatus, setImportStatus] = useState<"idle" | "success" | "error">("idle");

    const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (!f) return;
        setFile(f);
        setParsed([]);
        setImportResult(null);
        setImportStatus("idle");
        setParsing(true);
        try {
            if (f.name.endsWith(".xlsx") || f.name.endsWith(".xls")) {
                // Fetch ingredients for name→id lookup
                const ings = await ingredientsApi.list();
                const ingMap = new Map<string, string>(
                    ings.map((ing) => [ing.name.toLowerCase(), ing.id])
                );
                const buf = await f.arrayBuffer();
                const recipes = parseExcel(buf, ingMap);
                setParsed(recipes);
            } else {
                const text = await f.text();
                setParsed(parseCSV(text));
            }
        } catch (err) {
            setParsed([]);
            setImportStatus("error");
            setImportResult({ success: 0, failed: 1, errors: [err instanceof Error ? err.message : "Failed to parse file"] });
        } finally {
            setParsing(false);
        }
    }, []);

    const handleImport = async () => {
        if (!parsed.length) return;
        setImporting(true);
        const errors: string[] = [];
        let success = 0;

        for (const recipe of parsed) {
            if (recipe.errors.length > 0) {
                errors.push(...recipe.errors);
                continue;
            }
            try {
                const matchedIngredients = recipe.ingredientRows
                    .filter((r) => r.matched && r.ingredientId && r.quantity > 0)
                    .map((r) => ({ ingredientId: r.ingredientId!, quantity: r.quantity }));

                await recipesApi.create({
                    name: recipe.name,
                    category: recipe.category,
                    yieldAmount: recipe.yieldAmount,
                    yieldUnit: recipe.yieldUnit,
                    prepTime: recipe.prepTime,
                    cookTime: recipe.cookTime,
                    laborCostPerHour: recipe.laborCostPerHour,
                    energyCostPerBatch: recipe.energyCostPerBatch,
                    sellingPrice: recipe.sellingPrice,
                    instructions: recipe.instructions,
                    isMainSauce: recipe.category === "Sauce Base",
                    ingredients: matchedIngredients,
                });
                success++;
            } catch (err) {
                errors.push(`${recipe.name}: ${err instanceof Error ? err.message : "Failed"}`);
            }
        }

        setImportResult({ success, failed: errors.length, errors: errors.slice(0, 15) });
        setImportStatus(success > 0 ? "success" : "error");
        setImporting(false);
    };

    const validRecipes = parsed.filter((r) => r.errors.length === 0);
    const invalidRecipes = parsed.filter((r) => r.errors.length > 0);
    const totalIngredients = parsed.reduce((s, r) => s + r.ingredientRows.length, 0);
    const matchedIngredients = parsed.reduce((s, r) => s + r.ingredientRows.filter((i) => i.matched).length, 0);

    return (
        <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex items-center gap-4 mb-2">
                <Link href="/recipes">
                    <Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button>
                </Link>
                <div>
                    <h2 className="text-3xl font-bold font-playfair tracking-tight text-primary">Import Recipes</h2>
                    <p className="text-muted-foreground">Upload Excel (.xlsx) to import recipes with ingredients and instructions.</p>
                </div>
            </div>

            {/* Upload Card */}
            <Card>
                <CardHeader>
                    <div className="flex justify-between items-start">
                        <div>
                            <CardTitle>Upload Recipe File</CardTitle>
                            <CardDescription className="mt-1">
                                Excel (.xlsx) supports Ingredients · CSV supports Recipe Info only
                            </CardDescription>
                        </div>
                        <Button variant="outline" size="sm" onClick={downloadTemplate} className="shrink-0 ml-4">
                            <Download className="mr-2 h-4 w-4" /> Download Template (.xlsx)
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Drop Zone */}
                    <div className="border-2 border-dashed border-border rounded-lg p-10 text-center hover:bg-accent/50 transition-colors cursor-pointer relative">
                        <Input
                            type="file"
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            accept=".xlsx,.xls,.csv"
                            onChange={handleFileChange}
                        />
                        <div className="flex flex-col items-center justify-center gap-3 pointer-events-none">
                            <div className="p-4 bg-primary/10 rounded-full">
                                <UploadCloud className="h-10 w-10 text-primary" />
                            </div>
                            <div>
                                <p className="font-medium text-lg">Click to upload or drag and drop</p>
                                <p className="text-sm text-muted-foreground mt-1">.xlsx (recommended) or .csv · max 10 MB</p>
                            </div>
                        </div>
                    </div>

                    {/* File info */}
                    {file && (
                        <div className="flex items-center gap-3 p-3 border rounded-md bg-accent/20">
                            <FileSpreadsheet className="h-8 w-8 text-blue-500 shrink-0" />
                            <div className="flex-1 min-w-0">
                                <p className="font-medium truncate">{file.name}</p>
                                <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
                            </div>
                            {parsing && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
                        </div>
                    )}

                    {/* Info banner */}
                    {!file && (
                        <div className="flex items-start gap-3 p-3 border border-blue-200 bg-blue-50 rounded-md text-blue-800 dark:bg-blue-950/30 dark:border-blue-900 dark:text-blue-300 text-sm">
                            <Info className="h-4 w-4 mt-0.5 shrink-0" />
                            <div>
                                <p className="font-medium">Template has 3 Sheets:</p>
                                <ul className="mt-1 space-y-0.5 list-disc list-inside text-xs opacity-90">
                                    <li><strong>Recipes</strong> — Recipe details (name, category, yield, time, cost, selling price, instructions)</li>
                                    <li><strong>Ingredients</strong> — Ingredients per recipe (must match names in the system)</li>
                                    <li><strong>Guide</strong> — Description of each column</li>
                                </ul>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Preview */}
            {parsed.length > 0 && !parsing && importStatus === "idle" && (
                <Card>
                    <CardHeader>
                        <CardTitle>Preview — {parsed.length} recipe{parsed.length !== 1 ? "s" : ""} found</CardTitle>
                        <div className="flex gap-2 flex-wrap mt-1">
                            <Badge variant="default">{validRecipes.length} valid</Badge>
                            {invalidRecipes.length > 0 && <Badge variant="destructive">{invalidRecipes.length} errors</Badge>}
                            {totalIngredients > 0 && (
                                <Badge variant="secondary">
                                    {matchedIngredients}/{totalIngredients} ingredients matched
                                </Badge>
                            )}
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                            {parsed.map((recipe, i) => (
                                <div
                                    key={i}
                                    className={`rounded-lg border p-3 text-sm ${recipe.errors.length > 0 ? "border-destructive/40 bg-destructive/5" : "border-border bg-accent/10"}`}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex items-center gap-2 min-w-0">
                                            {recipe.errors.length > 0
                                                ? <XCircle className="h-4 w-4 text-destructive shrink-0" />
                                                : <ChefHat className="h-4 w-4 text-primary shrink-0" />}
                                            <span className="font-medium truncate">{recipe.name || "(no name)"}</span>
                                        </div>
                                        <div className="flex gap-1.5 shrink-0 flex-wrap justify-end">
                                            <Badge variant="outline" className="text-xs">{recipe.category}</Badge>
                                            <Badge variant="outline" className="text-xs">
                                                {recipe.yieldAmount} {recipe.yieldUnit}
                                            </Badge>
                                            {recipe.sellingPrice && (
                                                <Badge variant="outline" className="text-xs text-green-700 border-green-300">
                                                    ฿{recipe.sellingPrice}
                                                </Badge>
                                            )}
                                        </div>
                                    </div>

                                    {/* Ingredients */}
                                    {recipe.ingredientRows.length > 0 && (
                                        <div className="mt-2 flex flex-wrap gap-1.5 pl-6">
                                            {recipe.ingredientRows.map((ing, j) => (
                                                <span
                                                    key={j}
                                                    className={`text-xs px-1.5 py-0.5 rounded border ${ing.matched ? "bg-green-50 border-green-200 text-green-700 dark:bg-green-950/30 dark:border-green-800 dark:text-green-400" : "bg-red-50 border-red-200 text-red-700 dark:bg-red-950/30 dark:border-red-800 dark:text-red-400"}`}
                                                >
                                                    {ing.matched ? "✓" : "✗"} {ing.ingredientName} {ing.quantity}
                                                </span>
                                            ))}
                                        </div>
                                    )}

                                    {/* Instructions preview */}
                                    {recipe.instructions && (
                                        <p className="mt-1.5 pl-6 text-xs text-muted-foreground line-clamp-1">
                                            📝 {recipe.instructions.replace(/\n/g, " · ")}
                                        </p>
                                    )}

                                    {/* Errors */}
                                    {recipe.errors.map((e, j) => (
                                        <p key={j} className="mt-1 pl-6 text-xs text-destructive">{e}</p>
                                    ))}
                                </div>
                            ))}
                        </div>
                    </CardContent>
                    <CardFooter className="border-t pt-4 flex justify-between">
                        <Button variant="outline" onClick={() => { setFile(null); setParsed([]); setImportStatus("idle"); setImportResult(null); }}>
                            Clear
                        </Button>
                        <Button onClick={handleImport} disabled={validRecipes.length === 0 || importing} className="min-w-40">
                            {importing
                                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importing...</>
                                : `Import ${validRecipes.length} Recipe${validRecipes.length !== 1 ? "s" : ""}`}
                        </Button>
                    </CardFooter>
                </Card>
            )}

            {/* Result */}
            {importStatus === "success" && importResult && (
                <div className="flex items-start gap-4 p-4 border border-green-200 bg-green-50 text-green-800 rounded-lg dark:bg-green-950/30 dark:border-green-900 dark:text-green-400">
                    <CheckCircle2 className="h-5 w-5 mt-0.5 shrink-0" />
                    <div className="flex-1">
                        <p className="font-medium">Import Complete</p>
                        <p className="text-sm mt-1">
                            {importResult.success} recipe{importResult.success !== 1 ? "s" : ""} imported successfully.
                            {importResult.failed > 0 && ` ${importResult.failed} failed.`}
                        </p>
                        {importResult.errors.length > 0 && (
                            <ul className="mt-2 text-xs space-y-0.5 list-disc list-inside opacity-80">
                                {importResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                            </ul>
                        )}
                        <div className="mt-3">
                            <Link href="/recipes">
                                <Button size="sm" variant="outline" className="border-green-400 text-green-800 hover:bg-green-100">
                                    View Recipes
                                </Button>
                            </Link>
                        </div>
                    </div>
                </div>
            )}

            {importStatus === "error" && importResult && (
                <div className="flex items-start gap-4 p-4 border border-destructive/30 bg-destructive/10 text-destructive rounded-lg">
                    <AlertCircle className="h-5 w-5 mt-0.5 shrink-0" />
                    <div>
                        <p className="font-medium">Import Failed</p>
                        {importResult.errors.map((e, i) => <p key={i} className="text-sm mt-1">{e}</p>)}
                    </div>
                </div>
            )}
        </div>
    );
}
