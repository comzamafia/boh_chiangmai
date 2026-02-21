"use client";

import { useState, useEffect } from "react";
import { recipesApi, RecipeWithIngredients } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PieChartIcon, TrendingUp, TrendingDown, Loader2, CheckCircle2 } from "lucide-react";
import { useCurrency } from "@/components/currency-context";

function calcTotalCost(recipe: RecipeWithIngredients): number {
    const ingredientCost = recipe.ingredients.reduce((sum, row) => {
        const ing = row.ingredient;
        const costPerUnit = Number(ing.purchasePrice) / Number(ing.conversionRate) / (Number(ing.yieldPercent) / 100);
        return sum + costPerUnit * Number(row.quantity);
    }, 0);
    const laborCost = Number(recipe.laborCostPerHour) * ((recipe.prepTime + recipe.cookTime) / 60);
    const energyCost = Number(recipe.energyCostPerBatch);
    return ingredientCost + laborCost + energyCost;
}

export default function SalesSimulationPage() {
    const [recipes, setRecipes] = useState<RecipeWithIngredients[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedRecipe, setSelectedRecipe] = useState("");
    const [sellingPrice, setSellingPrice] = useState("120");
    const [expectedSales, setExpectedSales] = useState("50");
    const [saved, setSaved] = useState(false);
    const { format, symbol } = useCurrency();

    const handleSaveScenario = () => {
        if (!recipe) return;
        const scenario = {
            recipeName: recipe.name,
            sellingPrice,
            expectedSales,
            totalRevenue: totalRevenue.toFixed(2),
            grossProfit: grossProfit.toFixed(2),
            profitMargin: profitMargin.toFixed(1),
            savedAt: new Date().toISOString(),
        };
        const existing: typeof scenario[] = JSON.parse(localStorage.getItem("boh-scenarios") ?? "[]");
        existing.unshift(scenario);
        localStorage.setItem("boh-scenarios", JSON.stringify(existing.slice(0, 20)));
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
    };

    useEffect(() => {
        recipesApi.list().then(setRecipes).finally(() => setLoading(false));
    }, []);

    const recipe = recipes.find(r => r.id === selectedRecipe);
    const costPerYield = recipe ? calcTotalCost(recipe) / Number(recipe.yieldAmount) : 0;

    const price = parseFloat(sellingPrice) || 0;
    const qty = parseFloat(expectedSales) || 0;

    const totalRevenue = price * qty;
    const totalCost = costPerYield * qty;
    const grossProfit = totalRevenue - totalCost;
    const profitMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

    if (loading) return <div className="flex justify-center items-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

    return (
        <div className="space-y-6 max-w-4xl mx-auto animate-in fade-in duration-500 pb-12">
            <div className="flex items-center gap-4 mb-6">
                <div className="p-3 bg-primary/10 rounded-xl text-primary">
                    <PieChartIcon className="h-8 w-8" />
                </div>
                <div>
                    <h2 className="text-3xl font-bold font-playfair tracking-tight text-primary">Sales Simulation</h2>
                    <p className="text-muted-foreground">Simulate pricing strategies to maximize profit margins.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <Card>
                    <CardHeader>
                        <CardTitle>Simulation Parameters</CardTitle>
                        <CardDescription>Adjust variables to test scenarios</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-2">
                            <Label>Select Product (Recipe)</Label>
                            <Select value={selectedRecipe} onValueChange={setSelectedRecipe}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select recipe..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {recipes.filter(r => !r.isMainSauce).map(r => (
                                        <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Selling Price ({symbol})</Label>
                                <Input type="number" value={sellingPrice} onChange={e => setSellingPrice(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label>Expected Sales Qty</Label>
                                <Input type="number" value={expectedSales} onChange={e => setExpectedSales(e.target.value)} />
                            </div>
                        </div>

                        {recipe && (
                            <div className="p-4 bg-accent/50 rounded-lg text-sm space-y-2">
                                <div className="flex justify-between text-muted-foreground">
                                    <span>Unit Recipe Cost:</span>
                                    <span className="font-medium text-foreground">{format(costPerYield)}</span>
                                </div>
                                <div className="flex justify-between text-muted-foreground">
                                    <span>Gross Margin per Unit:</span>
                                    <span className="font-medium text-primary">{format(price - costPerYield)}</span>
                                </div>
                            </div>
                        )}
                    </CardContent>
                    <CardFooter>
                        <Button className="w-full" onClick={handleSaveScenario} disabled={!recipe || saved}>
                            {saved ? <><CheckCircle2 className="mr-2 h-4 w-4" /> Scenario Saved!</> : "Save Scenario"}
                        </Button>
                    </CardFooter>
                </Card>

                <Card className={`border-2 ${profitMargin >= 50 ? 'border-green-500/50' : profitMargin > 20 ? 'border-primary/50' : 'border-destructive/50'}`}>
                    <CardHeader>
                        <CardTitle>Projection Results</CardTitle>
                        <CardDescription>Based on selected parameters</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-8">
                        <div className="grid grid-cols-2 gap-8">
                            <div>
                                <Label className="text-muted-foreground">Total Revenue</Label>
                                <div className="text-3xl font-bold mt-1">{format(totalRevenue, 0)}</div>
                            </div>
                            <div>
                                <Label className="text-muted-foreground">Total Cost</Label>
                                <div className="text-3xl font-bold mt-1 text-red-500">{format(totalCost, 0)}</div>
                            </div>
                        </div>

                        <div className="relative pt-6">
                            <div className="absolute top-0 left-0 w-full h-px bg-border" />
                            <Label className="text-muted-foreground">Gross Profit</Label>
                            <div className={`flex items-center gap-2 mt-1 text-4xl font-black font-playfair tracking-tight ${profitMargin < 0 ? 'text-destructive' : 'text-green-600 dark:text-green-500'}`}>
                                {profitMargin < 0 ? <TrendingDown className="h-8 w-8" /> : <TrendingUp className="h-8 w-8" />}
                                {format(grossProfit, 0)}
                            </div>
                        </div>

                        <div>
                            <Label className="text-muted-foreground">Profit Margin %</Label>
                            <div className="flex items-center justify-between mt-2">
                                <div className="text-2xl font-bold">{profitMargin.toFixed(1)}%</div>
                                <Badge variant="outline" className={`text-sm py-1 px-3 ${profitMargin >= 50 ? 'bg-green-100 text-green-800 border-green-200' : ''}`}>
                                    {profitMargin >= 60 ? "Excellent" : profitMargin >= 40 ? "Healthy" : profitMargin > 20 ? "Average" : "Low Margin"}
                                </Badge>
                            </div>
                            <div className="w-full h-3 bg-accent rounded-full mt-3 overflow-hidden">
                                <div
                                    className={`h-full ${profitMargin >= 50 ? 'bg-green-500' : profitMargin > 20 ? 'bg-yellow-500' : 'bg-red-500'}`}
                                    style={{ width: `${Math.min(Math.max(profitMargin, 0), 100)}%` }}
                                />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

// Replaced by real import above
