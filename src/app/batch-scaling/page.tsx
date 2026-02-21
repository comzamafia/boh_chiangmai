"use client";

import { useState, useEffect } from "react";
import { recipesApi, RecipeWithIngredients } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select, SelectContent, SelectItem,
    SelectTrigger, SelectValue
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Scale, CheckCircle2, Loader2 } from "lucide-react";
import { useCurrency } from "@/components/currency-context";

function smartFormat(qty: number, unit: string): string {
    if (unit === "g" && qty >= 1000) return `${(qty / 1000).toFixed(3)} kg`;
    if (unit === "ml" && qty >= 1000) return `${(qty / 1000).toFixed(2)} L`;
    return `${qty % 1 === 0 ? qty : qty.toFixed(1)} ${unit}`;
}

export default function BatchScalingPage() {
    const [allRecipes, setAllRecipes] = useState<RecipeWithIngredients[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedRecipe, setSelectedRecipe] = useState("");
    const [targetYield, setTargetYield] = useState("10");
    const { format } = useCurrency();

    useEffect(() => {
        recipesApi.list().then(setAllRecipes).finally(() => setLoading(false));
    }, []);

    const recipe = allRecipes.find(r => r.id === selectedRecipe);
    const scalingFactor = recipe ? parseFloat(targetYield) / Number(recipe.yieldAmount) : 1;

    const enrichedRows = (recipe?.ingredients ?? []).map(row => {
        const ing = row.ingredient;
        const scaledQty = Number(row.quantity) * scalingFactor;
        const costPerUnit = Number(ing.purchasePrice) / Number(ing.conversionRate) / (Number(ing.yieldPercent) / 100);
        const lineCost = costPerUnit * scaledQty;
        return { ing, originalQty: Number(row.quantity), scaledQty, lineCost };
    });

    const totalScaledIngCost = enrichedRows.reduce((s, r) => s + r.lineCost, 0);
    const scaledLaborCost = recipe ? Number(recipe.laborCostPerHour) * ((recipe.prepTime + recipe.cookTime) / 60) * scalingFactor : 0;
    const scaledEnergyCost = recipe ? Number(recipe.energyCostPerBatch) * scalingFactor : 0;
    const scaledTotalCost = totalScaledIngCost + scaledLaborCost + scaledEnergyCost;

    if (loading) return <div className="flex justify-center items-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

    return (
        <div className="space-y-6 max-w-4xl mx-auto animate-in fade-in duration-500 pb-12">
            <div className="flex items-center gap-4 mb-2">
                <div className="p-3 bg-primary/10 rounded-xl text-primary">
                    <Scale className="h-8 w-8" />
                </div>
                <div>
                    <h2 className="text-3xl font-bold font-playfair tracking-tight text-primary">Batch Scaling</h2>
                    <p className="text-muted-foreground">Adjust recipe quantities for bulk production accurately.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="md:col-span-1 shadow-md border-primary/20">
                    <CardHeader>
                        <CardTitle>Select Recipe</CardTitle>
                        <CardDescription>Choose a recipe to scale</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label>Recipe</Label>
                            <Select value={selectedRecipe} onValueChange={setSelectedRecipe}>
                                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                                <SelectContent>
                                    {allRecipes.map(r => (
                                        <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>Target Yield</Label>
                            <div className="flex items-center gap-2">
                                <Input type="number" min={1} value={targetYield}
                                    onChange={e => setTargetYield(e.target.value)}
                                    disabled={!selectedRecipe} />
                                <span className="text-sm text-muted-foreground w-16 shrink-0">
                                    {recipe ? recipe.yieldUnit : "units"}
                                </span>
                            </div>
                        </div>

                        {recipe && (
                            <div className="p-4 bg-accent rounded-lg mt-4 text-sm space-y-2">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Original:</span>
                                    <span className="font-medium">{Number(recipe.yieldAmount)} {recipe.yieldUnit}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Scaling Factor:</span>
                                    <span className="font-bold text-primary">{scalingFactor.toFixed(2)}x</span>
                                </div>
                                <div className="h-px bg-border my-1" />
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Ingredients:</span>
                                    <span className="font-medium">{format(totalScaledIngCost)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Labor:</span>
                                    <span className="font-medium">{format(scaledLaborCost)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Energy:</span>
                                    <span className="font-medium">{format(scaledEnergyCost)}</span>
                                </div>
                                <div className="h-px bg-border my-1" />
                                <div className="flex justify-between text-base font-bold">
                                    <span>Total Cost:</span>
                                    <span className="text-primary">{format(scaledTotalCost)}</span>
                                </div>
                            </div>
                        )}

                        <Button className="w-full mt-2" disabled={!selectedRecipe || enrichedRows.length === 0}
                            onClick={() => {
                                const headers = ["Ingredient","Original Qty","Unit","Scaled Qty","Cost"].join(",");
                                const rows = enrichedRows.map(r => [
                                    r.ing.name,
                                    r.originalQty.toFixed(2), r.ing.recipeUnit,
                                    r.scaledQty.toFixed(2),
                                    r.lineCost.toFixed(2)
                                ].join(","));
                                const csv = [headers, ...rows].join("\n");
                                const blob = new Blob([csv], { type: "text/csv" });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement("a"); a.href = url;
                                a.download = `prep-list-${recipe?.name ?? "batch"}.csv`;
                                a.click(); URL.revokeObjectURL(url);
                            }}>
                            <CheckCircle2 className="mr-2 h-4 w-4" /> Export Prep List
                        </Button>
                    </CardContent>
                </Card>

                <Card className="md:col-span-2">
                    <CardHeader>
                        <CardTitle>Scaled Ingredient List</CardTitle>
                        <CardDescription>
                            {recipe
                                ? `Quantities for ${targetYield} ${recipe.yieldUnit} (${scalingFactor.toFixed(2)}x original)`
                                : "Select a recipe to view scaled ingredients"}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {recipe ? (
                            enrichedRows.length > 0 ? (
                                <div className="border rounded-md">
                                    <Table>
                                        <TableHeader className="bg-muted/50">
                                            <TableRow>
                                                <TableHead>Ingredient</TableHead>
                                                <TableHead className="text-right">Original</TableHead>
                                                <TableHead className="text-right bg-primary/5 text-primary font-bold">Scaled</TableHead>
                                                <TableHead className="text-right">Cost</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {enrichedRows.map((row, i) => (
                                                <TableRow key={i}>
                                                    <TableCell className="font-medium">{row.ing.name}</TableCell>
                                                    <TableCell className="text-right text-muted-foreground text-sm">
                                                        {smartFormat(row.originalQty, row.ing.recipeUnit)}
                                                    </TableCell>
                                                    <TableCell className="text-right font-bold text-primary bg-primary/5">
                                                        {smartFormat(row.scaledQty, row.ing.recipeUnit)}
                                                    </TableCell>
                                                    <TableCell className="text-right text-sm tabular-nums">
                                                        {format(row.lineCost)}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            ) : (
                                <div className="h-40 flex items-center justify-center text-muted-foreground border-2 border-dashed rounded-lg text-sm">
                                    No ingredient data linked to this recipe yet.
                                </div>
                            )
                        ) : (
                            <div className="h-64 flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed rounded-lg">
                                <Scale className="h-12 w-12 opacity-20 mb-4" />
                                <p>Select a recipe to generate scaling schedule</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );}