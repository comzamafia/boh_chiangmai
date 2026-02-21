"use client";

import { useState } from "react";
import Link from "next/link";
import { recipesApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { UploadCloud, FileSpreadsheet, CheckCircle2, AlertCircle, ArrowLeft, Download, Loader2 } from "lucide-react";

interface ParsedRecipe {
    name: string;
    category: string;
    yieldAmount: number;
    yieldUnit: string;
    prepTime: number;
    cookTime: number;
    laborCostPerHour: number;
    energyCostPerBatch: number;
    instructions: string;
    error?: string;
}

interface ImportResult {
    success: number;
    failed: number;
    errors: string[];
}

function parseRecipeCSV(text: string): ParsedRecipe[] {
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) return [];
    return lines.slice(1).map((line, i) => {
        const cols = line.split(",").map(c => c.trim().replace(/^"|"$/g, ""));
        const [name, category, yieldAmount, yieldUnit, prepTime, cookTime, laborCost, energyCost, instructions] = cols;
        const errors: string[] = [];
        if (!name) errors.push(`Row ${i + 2}: Name required`);
        if (isNaN(parseFloat(yieldAmount))) errors.push(`Row ${i + 2}: Invalid yield amount`);
        return {
            name: name ?? "",
            category: category || "Other",
            yieldAmount: parseFloat(yieldAmount) || 1,
            yieldUnit: yieldUnit || "serving",
            prepTime: parseInt(prepTime) || 15,
            cookTime: parseInt(cookTime) || 15,
            laborCostPerHour: parseFloat(laborCost) || 25,
            energyCostPerBatch: parseFloat(energyCost) || 2,
            instructions: instructions || "",
            error: errors.join("; ") || undefined,
        };
    });
}

export default function ImportRecipesPage() {
    const [file, setFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [importStatus, setImportStatus] = useState<"idle" | "success" | "error">("idle");
    const [importResult, setImportResult] = useState<ImportResult | null>(null);

    const handleDownloadTemplate = () => {
        const csv = [
            "Name,Category,Yield Amount,Yield Unit,Prep Time (min),Cook Time (min),Labor Cost/Hour,Energy Cost/Batch,Instructions",
            "Pad Thai Sauce,Sauce,10,L,15,30,25,2.50,Mix all ingredients and simmer for 20 minutes",
            "Chili Oil,Condiment,5,L,10,20,25,1.50,Heat oil with dried chilies until fragrant",
        ].join("\n");
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "recipe-import-template.csv";
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            setFile(e.target.files[0]);
            setImportStatus("idle");
            setImportResult(null);
        }
    };

    const handleImport = async () => {
        if (!file) return;
        setIsUploading(true);
        try {
            const text = await file.text();
            const rows = parseRecipeCSV(text);
            const validRows = rows.filter(r => !r.error);
            const errors = rows.filter(r => r.error).map(r => r.error!);
            let success = 0;
            for (const row of validRows) {
                try {
                    await recipesApi.create({
                        name: row.name, category: row.category,
                        yieldAmount: row.yieldAmount, yieldUnit: row.yieldUnit,
                        prepTime: row.prepTime, cookTime: row.cookTime,
                        laborCostPerHour: row.laborCostPerHour,
                        energyCostPerBatch: row.energyCostPerBatch,
                        instructions: row.instructions,
                        isMainSauce: false,
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
        <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-500">
            <div className="flex items-center gap-4 mb-2">
                <Link href="/recipes">
                    <Button variant="ghost" size="icon">
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                </Link>
                <div>
                    <h2 className="text-3xl font-bold font-playfair tracking-tight text-primary">Import Recipes</h2>
                    <p className="text-muted-foreground">Upload and validate recipe data from CSV or Excel files.</p>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Batch Upload Data</CardTitle>
                    <div className="flex justify-between items-start">
                        <CardDescription>
                            Download our template to ensure your columns match system requirements.
                        </CardDescription>
                        <Button variant="outline" size="sm" onClick={handleDownloadTemplate} className="ml-4 shrink-0">
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
                            <FileSpreadsheet className="h-8 w-8 text-blue-500" />
                            <div className="flex-1">
                                <p className="font-medium">{file.name}</p>
                                <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(2)} KB</p>
                            </div>
                        </div>
                    )}

                    {importStatus === "success" && importResult && (
                        <div className="flex items-start gap-4 p-4 border border-green-200 bg-green-50 text-green-800 rounded-md dark:bg-green-950/30 dark:border-green-900 dark:text-green-400">
                            <CheckCircle2 className="h-5 w-5 mt-0.5" />
                            <div>
                                <p className="font-medium">Import Complete</p>
                                <p className="text-sm opacity-90 mt-1">
                                    {importResult.success} recipe{importResult.success !== 1 ? "s" : ""} imported successfully.
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
                            <AlertCircle className="h-5 w-5 mt-0.5" />
                            <div>
                                <p className="font-medium">Import Failed</p>
                                {importResult.errors.map((e, i) => <p key={i} className="text-sm mt-1">{e}</p>)}
                            </div>
                        </div>
                    )}
                </CardContent>
                <CardFooter className="border-t pt-6 flex justify-between">
                    <Button variant="outline" onClick={() => { setFile(null); setImportStatus("idle"); setImportResult(null); }}>
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
