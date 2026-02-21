"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { recipesApi, RecipeWithIngredients } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calculator, Plus, Trash2, ArrowRight, Loader2 } from "lucide-react";
import { useCurrency } from "@/components/currency-context";

interface BatchItem {
    id: number;
    recipeId: string;
    qty: string;
}

export default function BatchCalculationPage() {
    const [allRecipes, setAllRecipes] = useState<RecipeWithIngredients[]>([]);
    const [loading, setLoading] = useState(true);
    const [items, setItems] = useState<BatchItem[]>([{ id: 1, recipeId: "", qty: "1" }]);
    const { format } = useCurrency();

    useEffect(() => {
        recipesApi.list().then(setAllRecipes).finally(() => setLoading(false));
    }, []);

    const addItem = () => setItems([...items, { id: Date.now(), recipeId: "", qty: "1" }]);
    const removeItem = (id: number) => setItems(items.filter(i => i.id !== id));

    const updateItem = (id: number, field: keyof BatchItem, value: string) => {
        setItems(items.map(i => i.id === id ? { ...i, [field]: value } : i));
    };

    if (loading) return <div className="flex justify-center items-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

    let totalCost = 0;
    let totalIngredientCost = 0;
    let totalLaborCost = 0;
    let totalEnergyCost = 0;

    return (
        <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in duration-500 pb-12">
            <div className="flex items-center gap-4 mb-2">
                <div className="p-3 bg-primary/10 rounded-xl text-primary">
                    <Calculator className="h-8 w-8" />
                </div>
                <div>
                    <h2 className="text-3xl font-bold font-playfair tracking-tight text-primary">Batch Calculation</h2>
                    <p className="text-muted-foreground">Calculate combined costs for multiple recipe productions.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <div>
                                <CardTitle>Production Items</CardTitle>
                                <CardDescription>Select recipes and quantities to calculate total mixed batch costs</CardDescription>
                            </div>
                            <Button size="sm" onClick={addItem} variant="outline">
                                <Plus className="mr-2 h-4 w-4" /> Add Item
                            </Button>
                        </CardHeader>
                        <CardContent>
                            <div className="border rounded-md">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Recipe</TableHead>
                                            <TableHead className="w-32">Number of Batches</TableHead>
                                            <TableHead className="text-right w-32">Est. Cost</TableHead>
                                            <TableHead className="w-16"></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {items.map((item) => {
                                            const recipe = allRecipes.find(r => r.id === item.recipeId);
                                            const mul = parseFloat(item.qty) || 0;
                                            const ingCost = recipe
                                                ? recipe.ingredients.reduce((sum, row) => {
                                                    const ing = row.ingredient;
                                                    const costPerUnit = Number(ing.purchasePrice) / Number(ing.conversionRate) / (Number(ing.yieldPercent) / 100);
                                                    return sum + costPerUnit * Number(row.quantity);
                                                }, 0) * mul
                                                : 0;
                                            const labCost = recipe ? (Number(recipe.laborCostPerHour) * ((recipe.prepTime + recipe.cookTime) / 60)) * mul : 0;
                                            const enCost = recipe ? Number(recipe.energyCostPerBatch) * mul : 0;
                                            const itemTotal = ingCost + labCost + enCost;
                                            if (recipe) {
                                                totalCost += itemTotal;
                                                totalIngredientCost += ingCost;
                                                totalLaborCost += labCost;
                                                totalEnergyCost += enCost;
                                            }

                                            return (
                                                <TableRow key={item.id}>
                                                    <TableCell>
                                                        <Select value={item.recipeId} onValueChange={(v) => updateItem(item.id, "recipeId", v)}>
                                                            <SelectTrigger>
                                                                <SelectValue placeholder="Select recipe..." />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {allRecipes.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                                                            </SelectContent>
                                                        </Select>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Input
                                                            type="number"
                                                            value={item.qty}
                                                            onChange={(e) => updateItem(item.id, "qty", e.target.value)}
                                                        />
                                                    </TableCell>
                                                    <TableCell className="text-right font-medium">
                                                        {format(itemTotal)}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Button variant="ghost" size="icon" className="text-destructive h-8 w-8" onClick={() => removeItem(item.id)}>
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div>
                    <Card className="sticky top-6 shadow-md border-primary/20 bg-primary/5">
                        <CardHeader>
                            <CardTitle>Total Batch Cost</CardTitle>
                            <CardDescription>Combined cost of selected recipes</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="text-4xl font-bold font-playfair text-primary mb-6">
                                {format(totalCost)}
                            </div>

                            <div className="space-y-3 mb-6">
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-muted-foreground">Total Ingredients</span>
                                    <span className="font-medium">{format(totalIngredientCost)}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-muted-foreground">Total Labor</span>
                                    <span className="font-medium">{format(totalLaborCost)}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-muted-foreground">Total Energy/Overhead</span>
                                    <span className="font-medium">{format(totalEnergyCost)}</span>
                                </div>
                            </div>

                            <Link href="/batch-planning" className="block">
                                <Button className="w-full" size="lg">
                                    Proceed to Prep List <ArrowRight className="ml-2 h-4 w-4" />
                                </Button>
                            </Link>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
