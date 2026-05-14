"use client";

import { useState } from "react";
import Link from "next/link";
import { suppliersApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Card, CardContent, CardDescription,
    CardFooter, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
    Table, TableBody, TableCell,
    TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
    UploadCloud, FileSpreadsheet, CheckCircle2,
    AlertCircle, ArrowLeft, Download, Loader2,
} from "lucide-react";

// ─── CSV row shape ────────────────────────────────────────────────────────────
interface ParsedRow {
    name: string;
    contact: string;
    email: string;
    phone: string;
    address: string;
    status: "Active" | "Inactive";
    isSpecial: boolean;
    error?: string;
}

interface ImportResult {
    success: number;
    skipped: number;
    failed: number;
    errors: string[];
}

// ─── Parser ───────────────────────────────────────────────────────────────────
function parseCSV(text: string): ParsedRow[] {
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) return [];
    return lines.slice(1).map((line, i) => {
        // Handle quoted fields containing commas
        const cols: string[] = [];
        let inQuote = false;
        let cur = "";
        for (const ch of line) {
            if (ch === '"') { inQuote = !inQuote; continue; }
            if (ch === "," && !inQuote) { cols.push(cur.trim()); cur = ""; continue; }
            cur += ch;
        }
        cols.push(cur.trim());

        const [name, contact, email, phone, address, statusRaw, isSpecialRaw] = cols;
        const errors: string[] = [];
        if (!name) errors.push(`Row ${i + 2}: Name is required`);
        const status = statusRaw === "Inactive" ? "Inactive" : "Active";
        const isSpecial = isSpecialRaw?.toLowerCase() === "true";

        return {
            name: name ?? "",
            contact: contact ?? "",
            email: email ?? "",
            phone: phone ?? "",
            address: address ?? "",
            status,
            isSpecial,
            error: errors.join("; ") || undefined,
        };
    });
}

// ─── Template CSV ─────────────────────────────────────────────────────────────
const TEMPLATE_CSV = [
    "Name,Contact Person,Email,Phone,Address,Status,Is Special",
    "Fresh Market Co.,John Smith,john@freshmarket.com,+66-81-234-5678,\"123 Market St, Chiang Mai\",Active,false",
    "Dry Goods Supplier,Sarah Johnson,sarah@drygoods.com,+66-89-876-5432,\"456 Warehouse Rd, Chiang Mai\",Active,false",
    "Heritage Spice House,Chai Wongsri,chai@spicehouse.com,+66-82-111-2222,\"789 Spice Lane, Chiang Mai\",Active,false",
    "Owner Sauce,Chef Owner,owner@restaurant.com,+66-81-000-0000,Restaurant Kitchen,Active,true",
].join("\n");

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ImportSuppliersPage() {
    const [file, setFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [importStatus, setImportStatus] = useState<"idle" | "success" | "error">("idle");
    const [importResult, setImportResult] = useState<ImportResult | null>(null);
    const [preview, setPreview] = useState<ParsedRow[]>([]);

    // ── Download template ──────────────────────────────────────────────────
    const handleDownloadTemplate = () => {
        const blob = new Blob([TEMPLATE_CSV], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "supplier-import-template.csv";
        a.click();
        URL.revokeObjectURL(url);
    };

    // ── File pick ──────────────────────────────────────────────────────────
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        const f = e.target.files[0];
        setFile(f);
        setImportStatus("idle");
        setImportResult(null);
        const reader = new FileReader();
        reader.onload = ev =>
            setPreview(parseCSV(ev.target?.result as string).slice(0, 5));
        reader.readAsText(f);
    };

    // ── Import ─────────────────────────────────────────────────────────────
    const handleImport = async () => {
        if (!file) return;
        setIsUploading(true);
        try {
            const text = await file.text();
            const rows = parseCSV(text);
            const validRows = rows.filter(r => !r.error);
            const errors: string[] = rows.filter(r => r.error).map(r => r.error!);

            // Fetch existing suppliers to detect duplicates
            let existingNames: Set<string> = new Set();
            try {
                const existing = await suppliersApi.list();
                existingNames = new Set(existing.map(s => s.name.toLowerCase()));
            } catch { /* proceed without duplicate check */ }

            let success = 0;
            let skipped = 0;

            for (const row of validRows) {
                // Skip exact name duplicates
                if (existingNames.has(row.name.toLowerCase())) {
                    skipped++;
                    continue;
                }
                try {
                    await suppliersApi.create({
                        name: row.name,
                        contact: row.contact,
                        email: row.email,
                        phone: row.phone,
                        address: row.address,
                        status: row.status,
                        isSpecial: row.isSpecial,
                    });
                    existingNames.add(row.name.toLowerCase());
                    success++;
                } catch (err) {
                    errors.push(
                        `${row.name}: ${err instanceof Error ? err.message : "Failed"}`
                    );
                }
            }

            setImportResult({ success, skipped, failed: errors.length, errors: errors.slice(0, 10) });
            setImportStatus(success > 0 || skipped > 0 ? "success" : "error");
        } catch {
            setImportStatus("error");
            setImportResult({ success: 0, skipped: 0, failed: 1, errors: ["Failed to read file."] });
        } finally {
            setIsUploading(false);
        }
    };

    const handleClear = () => {
        setFile(null);
        setImportStatus("idle");
        setImportResult(null);
        setPreview([]);
    };

    // ─────────────────────────────────────────────────────────────────────────
    return (
        <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex items-center gap-4 mb-2">
                <Link href="/suppliers">
                    <Button variant="ghost" size="icon">
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                </Link>
                <div>
                    <h2 className="text-3xl font-bold font-playfair tracking-tight text-primary">
                        Import Suppliers
                    </h2>
                    <p className="text-muted-foreground">
                        Upload a CSV file to add suppliers in bulk. Duplicate names are skipped.
                    </p>
                </div>
            </div>

            {/* Format guide */}
            <Card className="bg-muted/30">
                <CardHeader className="pb-3">
                    <CardTitle className="text-sm">CSV Column Format</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs border-collapse">
                            <thead>
                                <tr className="border-b">
                                    <th className="text-left py-1.5 pr-4 font-semibold text-muted-foreground">Column</th>
                                    <th className="text-left py-1.5 pr-4 font-semibold text-muted-foreground">Required</th>
                                    <th className="text-left py-1.5 font-semibold text-muted-foreground">Notes</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/50">
                                {[
                                    ["Name",           "✅ Yes", "Unique supplier name"],
                                    ["Contact Person", "No",     "Contact person's name"],
                                    ["Email",          "No",     "Contact email address"],
                                    ["Phone",          "No",     "Phone number"],
                                    ["Address",        "No",     "Wrap in quotes if it contains commas"],
                                    ["Status",         "No",     '"Active" or "Inactive" — defaults to Active'],
                                    ["Is Special",     "No",     '"true" for house-made / owner sauces, otherwise false'],
                                ].map(([col, req, note]) => (
                                    <tr key={col}>
                                        <td className="py-1.5 pr-4 font-mono font-medium">{col}</td>
                                        <td className="py-1.5 pr-4">{req}</td>
                                        <td className="py-1.5 text-muted-foreground">{note}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            {/* Upload card */}
            <Card>
                <CardHeader>
                    <div className="flex justify-between items-start gap-3 flex-wrap">
                        <div>
                            <CardTitle>Upload CSV</CardTitle>
                            <CardDescription>
                                Download the template, fill in your suppliers, then upload.
                            </CardDescription>
                        </div>
                        <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
                            <Download className="mr-2 h-4 w-4" /> Download Template
                        </Button>
                    </div>
                </CardHeader>

                <CardContent className="space-y-6">
                    {/* Drop zone */}
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

                    {/* Selected file */}
                    {file && (
                        <div className="flex items-center gap-4 p-4 border rounded-md bg-accent/20">
                            <FileSpreadsheet className="h-8 w-8 text-green-500 shrink-0" />
                            <div className="flex-1 min-w-0">
                                <p className="font-medium truncate">{file.name}</p>
                                <p className="text-xs text-muted-foreground">
                                    {(file.size / 1024).toFixed(1)} KB
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Preview table */}
                    {preview.length > 0 && importStatus === "idle" && (
                        <div className="space-y-2">
                            <p className="text-sm font-medium text-muted-foreground">
                                Preview (first 5 rows)
                            </p>
                            <div className="border rounded-md overflow-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Name</TableHead>
                                            <TableHead>Contact</TableHead>
                                            <TableHead>Phone</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead>Special</TableHead>
                                            <TableHead>Valid</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {preview.map((row, i) => (
                                            <TableRow key={i}>
                                                <TableCell className="font-medium">{row.name}</TableCell>
                                                <TableCell className="text-muted-foreground">{row.contact || "—"}</TableCell>
                                                <TableCell className="text-muted-foreground">{row.phone || "—"}</TableCell>
                                                <TableCell>
                                                    <Badge variant={row.status === "Active" ? "default" : "secondary"}>
                                                        {row.status}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>
                                                    {row.isSpecial
                                                        ? <Badge variant="secondary" className="text-xs">House-made</Badge>
                                                        : <span className="text-muted-foreground text-xs">—</span>}
                                                </TableCell>
                                                <TableCell>
                                                    {row.error
                                                        ? <Badge variant="destructive">Error</Badge>
                                                        : <Badge className="bg-green-100 text-green-800 border-green-200 dark:bg-green-950/40 dark:text-green-400">Valid</Badge>}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    )}

                    {/* Success result */}
                    {importStatus === "success" && importResult && (
                        <div className="flex items-start gap-4 p-4 border border-green-200 bg-green-50 text-green-800 rounded-md dark:bg-green-950/30 dark:border-green-900 dark:text-green-400">
                            <CheckCircle2 className="h-5 w-5 mt-0.5 shrink-0" />
                            <div>
                                <p className="font-medium">Import Complete</p>
                                <p className="text-sm opacity-90 mt-1">
                                    {importResult.success} supplier{importResult.success !== 1 ? "s" : ""} added.
                                    {importResult.skipped > 0 && ` ${importResult.skipped} skipped (already exist).`}
                                    {importResult.failed > 0 && ` ${importResult.failed} failed.`}
                                </p>
                                {importResult.errors.length > 0 && (
                                    <ul className="mt-2 text-xs space-y-1 list-disc list-inside opacity-80">
                                        {importResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                                    </ul>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Error result */}
                    {importStatus === "error" && importResult && (
                        <div className="flex items-start gap-4 p-4 border border-destructive/30 bg-destructive/10 text-destructive rounded-md">
                            <AlertCircle className="h-5 w-5 mt-0.5 shrink-0" />
                            <div>
                                <p className="font-medium">Import Failed</p>
                                {importResult.errors.map((e, i) => (
                                    <p key={i} className="text-sm mt-1">{e}</p>
                                ))}
                            </div>
                        </div>
                    )}
                </CardContent>

                <CardFooter className="border-t pt-6 flex justify-between gap-3">
                    <Button variant="outline" onClick={handleClear}>Clear</Button>
                    <Button
                        onClick={handleImport}
                        disabled={!file || isUploading}
                        className="min-w-36"
                    >
                        {isUploading
                            ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importing…</>
                            : "Start Import"}
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
}
