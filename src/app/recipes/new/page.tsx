"use client";

import { useState, useMemo, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ingredientsApi, equipmentApi, recipesApi, Ingredient, Equipment } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Save, FileText, ArrowLeft, Plus, Trash2, Loader2, ImageIcon } from "lucide-react";
import { useCurrency } from "@/components/currency-context";
import { useCategories, DEFAULT_CATEGORY } from "@/lib/use-categories";

interface IngredientRow {
    id: number;
    ingredientId: string;
    quantity: string;
}

function RecipeBuilderInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const editId = searchParams.get("id");
    const { format, symbol } = useCurrency();
    const { categories } = useCategories();
    const [loadingData, setLoadingData] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState("");
    const [ingredients, setIngredients] = useState<Ingredient[]>([]);
    const [equipment, setEquipment] = useState<Equipment[]>([]);
    const [activeTab, setActiveTab] = useState("info");

    // Basic form state
    const [recipeName, setRecipeName] = useState("");
    const [category, setCategory] = useState(DEFAULT_CATEGORY);
    const [yieldAmount, setYieldAmount] = useState("1");
    const [yieldUnit, setYieldUnit] = useState("serving");
    const [instructions, setInstructions] = useState("");
    const [imageUrl, setImageUrl] = useState("");

    // Recipe Ingredients - real state
    const [ingredientRows, setIngredientRows] = useState<IngredientRow[]>([
        { id: 1, ingredientId: "", quantity: "" }
    ]);

    // Equipment checkboxes
    const [selectedEquipment, setSelectedEquipment] = useState<Set<string>>(new Set());

    // Labor & energy cost
    const [laborCostPerHour, setLaborCostPerHour] = useState("50");
    const [prepMinutes, setPrepMinutes] = useState("15");
    const [cookMinutes, setCookMinutes] = useState("5");
    const [energyCost, setEnergyCost] = useState("5");
    const [sellingPrice, setSellingPrice] = useState("");

    useEffect(() => {
        const loadAll = async () => {
            const [ings, eqs] = await Promise.all([ingredientsApi.list(), equipmentApi.list()]);
            setIngredients(ings);
            setEquipment(eqs);

            // Edit mode: load existing recipe
            if (editId) {
                try {
                    const recipe = await recipesApi.get(editId);
                    setRecipeName(recipe.name);
                    setCategory(recipe.category);
                    setYieldAmount(String(recipe.yieldAmount));
                    setYieldUnit(recipe.yieldUnit);
                    setInstructions(recipe.instructions ?? "");
                    setImageUrl(recipe.imageUrl ?? "");
                    setLaborCostPerHour(String(recipe.laborCostPerHour));
                    setPrepMinutes(String(recipe.prepTime));
                    setCookMinutes(String(recipe.cookTime));
                    setEnergyCost(String(recipe.energyCostPerBatch));
                    setSellingPrice(recipe.sellingPrice != null ? String(recipe.sellingPrice) : "");
                    if (recipe.ingredients.length > 0) {
                        setIngredientRows(recipe.ingredients.map((r, idx) => ({
                            id: idx + 1,
                            ingredientId: r.ingredientId,
                            quantity: String(r.quantity),
                        })));
                    }
                } catch (err) {
                    console.error("Failed to load recipe:", err);
                }
            }
            setLoadingData(false);
        };
        loadAll();
    }, [editId]);

    // Real-time ingredient cost calculation
    const totalIngredientCost = useMemo(() => {
        return ingredientRows.reduce((sum, row) => {
            const ing = ingredients.find(i => i.id === row.ingredientId);
            const qty = parseFloat(row.quantity);
            if (!ing || !qty || isNaN(qty)) return sum;
            const costPerUnit = Number(ing.purchasePrice) / Number(ing.conversionRate) / (Number(ing.yieldPercent) / 100);
            return sum + costPerUnit * qty;
        }, 0);
    }, [ingredientRows, ingredients]);

    const totalLaborCost = (parseFloat(laborCostPerHour) || 0) *
        ((parseFloat(prepMinutes) + parseFloat(cookMinutes) || 0) / 60);
    const totalEnergyCost = parseFloat(energyCost) || 0;
    const totalCost = totalIngredientCost + totalLaborCost + totalEnergyCost;
    const yieldQty = parseFloat(yieldAmount) || 1;
    const costPerYield = totalCost / yieldQty;

    const addIngredientRow = () => {
        setIngredientRows(prev => [...prev, { id: Date.now(), ingredientId: "", quantity: "" }]);
    };

    const updateRow = (id: number, field: keyof IngredientRow, value: string) => {
        setIngredientRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
    };

    const removeRow = (id: number) => {
        setIngredientRows(prev => prev.filter(r => r.id !== id));
    };

    const toggleEquipment = (id: string) => {
        setSelectedEquipment(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const handleSave = async () => {
        if (!recipeName.trim()) {
            setSaveError("Please enter a recipe name.");
            return;
        }
        setSaveError("");
        setSaving(true);
        try {
            const rows = ingredientRows
                .filter(r => r.ingredientId && parseFloat(r.quantity) > 0)
                .map(r => ({ ingredientId: r.ingredientId, quantity: parseFloat(r.quantity) }));
            const payload = {
                name: recipeName, category, yieldAmount: parseFloat(yieldAmount) || 1,
                yieldUnit, prepTime: parseFloat(prepMinutes) || 0,
                cookTime: parseFloat(cookMinutes) || 0,
                laborCostPerHour: parseFloat(laborCostPerHour) || 0,
                energyCostPerBatch: parseFloat(energyCost) || 0,
                sellingPrice: parseFloat(sellingPrice) > 0 ? parseFloat(sellingPrice) : null,
                isMainSauce: category === "Sauce Base",
                instructions,
                imageUrl: imageUrl.trim() || undefined,
                ingredients: rows,
            };

            if (editId) {
                await recipesApi.update(editId, payload);
                await recipesApi.setIngredients(editId, rows);
            } else {
                await recipesApi.create(payload);
            }
            router.push("/recipes");
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Failed to save recipe. Please try again.";
            setSaveError(msg);
            console.error(err);
        } finally { setSaving(false); }
    };

    // Cost bar percentages (avoid NaN)
    const ingPct = totalCost > 0 ? (totalIngredientCost / totalCost) * 100 : 0;
    const labPct = totalCost > 0 ? (totalLaborCost / totalCost) * 100 : 0;
    const engPct = totalCost > 0 ? (totalEnergyCost / totalCost) * 100 : 0;

    // ─── Export S.O.P PDF ────────────────────────────────────────────────────
    const handleExportSOP = () => {
        const prep  = parseFloat(prepMinutes) || 0;
        const cook  = parseFloat(cookMinutes) || 0;
        const ready = prep + cook;

        // Build ingredient list html
        const ingListHtml = ingredientRows
            .filter(r => r.ingredientId && parseFloat(r.quantity) > 0)
            .map(r => {
                const ing = ingredients.find(i => i.id === r.ingredientId);
                if (!ing) return "";
                const qty  = parseFloat(r.quantity);
                const label = `${qty} ${ing.recipeUnit} ${ing.name}`;
                return `<li>${label}</li>`;
            })
            .join("\n");

        // Build directions from instructions text
        const directionItems = (instructions || "")
            .split("\n")
            .map(line => line.trim())
            .filter(Boolean)
            .map((line, i) => `<p><strong>${i + 1}.</strong> ${line}</p>`)
            .join("\n");

        const docCode = `SOP-${editId ? editId.slice(0, 8).toUpperCase() : "NEW"}-${new Date().toISOString().slice(0, 10)}`;
        const imageBlock = imageUrl
            ? `<img src="${imageUrl}" alt="${recipeName}" class="recipe-image" onerror="this.style.display='none'" />`
            : `<div class="recipe-image-placeholder"></div>`;

        const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>S.O.P — ${recipeName || "Recipe"}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: Georgia, "Times New Roman", serif;
      color: #222;
      background: #fff;
      padding: 40px 48px;
      max-width: 800px;
      margin: 0 auto;
    }

    /* ── Header ── */
    .header { text-align: center; margin-bottom: 24px; }
    .header h1 {
      font-size: 2.4rem;
      font-weight: 700;
      letter-spacing: 0.01em;
      margin-bottom: 4px;
    }
    .header .subtitle {
      font-family: Arial, sans-serif;
      font-size: 1rem;
      color: #555;
      font-style: normal;
    }

    /* ── Recipe image ── */
    .recipe-image {
      display: block;
      width: 100%;
      max-height: 260px;
      object-fit: cover;
      border-radius: 6px;
      margin-bottom: 0;
    }
    .recipe-image-placeholder {
      width: 100%;
      height: 180px;
      background: #f0ece4;
      border-radius: 6px;
    }

    /* ── Time bar ── */
    .time-bar {
      display: flex;
      border: 1px solid #ccc;
      border-radius: 0 0 6px 6px;
      overflow: hidden;
      font-family: Arial, sans-serif;
    }
    .time-cell {
      flex: 1;
      text-align: center;
      padding: 10px 0;
      background: #f5f5f5;
      border-right: 1px solid #ccc;
    }
    .time-cell:last-child { border-right: none; }
    .time-cell .tc-label {
      font-weight: 700;
      font-size: 0.88rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .time-cell .tc-value {
      font-size: 0.82rem;
      color: #555;
      margin-top: 2px;
    }

    /* ── Body columns ── */
    .body-grid {
      display: grid;
      grid-template-columns: 1fr 1.6fr;
      gap: 32px;
      margin-top: 28px;
    }
    h2 {
      font-size: 1.1rem;
      font-weight: 700;
      border-bottom: 2px solid #222;
      padding-bottom: 4px;
      margin-bottom: 12px;
      font-family: Arial, sans-serif;
    }

    /* Ingredients */
    .ingredients-col ul {
      list-style: disc;
      padding-left: 18px;
      font-size: 0.88rem;
      line-height: 1.8;
    }

    /* Directions */
    .directions-col p {
      font-size: 0.88rem;
      line-height: 1.7;
      margin-bottom: 8px;
      text-align: justify;
    }
    .directions-col p strong { font-family: Arial, sans-serif; }

    /* ── Footer ── */
    .footer {
      margin-top: 36px;
      padding-top: 10px;
      border-top: 1px solid #ccc;
      font-family: Arial, sans-serif;
      font-size: 0.75rem;
      color: #888;
      display: flex;
      justify-content: space-between;
    }

    @media print {
      body { padding: 20px 24px; }
      @page { margin: 1cm; size: A4; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${recipeName || "Untitled Recipe"}</h1>
    <p class="subtitle">${category}</p>
  </div>

  ${imageBlock}

  <div class="time-bar">
    <div class="time-cell">
      <div class="tc-label">Prep</div>
      <div class="tc-value">${prep} mins</div>
    </div>
    <div class="time-cell">
      <div class="tc-label">Cook</div>
      <div class="tc-value">${cook} mins</div>
    </div>
    <div class="time-cell">
      <div class="tc-label">Ready In</div>
      <div class="tc-value">${ready} mins</div>
    </div>
  </div>

  <div class="body-grid">
    <div class="ingredients-col">
      <h2>Ingredients</h2>
      <ul>
        ${ingListHtml || "<li><em>No ingredients added.</em></li>"}
      </ul>
    </div>
    <div class="directions-col">
      <h2>Directions</h2>
      ${directionItems || "<p><em>No instructions provided.</em></p>"}
    </div>
  </div>

  <div class="footer">
    <span>Document: ${docCode}</span>
    <span>Yield: ${yieldAmount} ${yieldUnit} &nbsp;|&nbsp; Total Cost: ${format(totalCost)}</span>
    <span>Chiang Mai BOH &copy; ${new Date().getFullYear()}</span>
  </div>

  <script>window.onload = function(){ window.print(); };<\/script>
</body>
</html>`;

        const win = window.open("", "_blank");
        if (win) {
            win.document.write(html);
            win.document.close();
        }
    };

    if (loadingData) return <div className="flex justify-center items-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

    return (
        <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in duration-500 pb-12">
            <div className="flex items-center gap-4 mb-2">
                <Button variant="ghost" size="icon" onClick={() => router.push("/recipes")}>
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <div className="flex-1">
                    <h2 className="text-3xl font-bold font-playfair tracking-tight text-primary">
                        {editId ? (recipeName || "Edit Recipe") : (recipeName || "New Recipe")}
                    </h2>
                    <p className="text-muted-foreground text-sm">{editId ? "Editing recipe" : "Recipe Builder & Cost Calculator"}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                    {saveError && (
                        <p className="text-sm text-destructive font-medium">{saveError}</p>
                    )}
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={handleExportSOP} disabled={!recipeName.trim()}>
                            <FileText className="mr-2 h-4 w-4" /> Export S.O.P
                        </Button>
                        <Button disabled={!recipeName.trim() || saving} onClick={handleSave}>
                            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} {editId ? "Update Recipe" : "Save Recipe"}
                        </Button>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                        <TabsList className="grid w-full grid-cols-3 mb-4">
                            <TabsTrigger value="info">Info & Ingredients</TabsTrigger>
                            <TabsTrigger value="process">Equipment & Labor</TabsTrigger>
                            <TabsTrigger value="instructions">Instructions</TabsTrigger>
                        </TabsList>

                        {/* TAB 1: Info & Ingredients */}
                        <TabsContent value="info" className="space-y-4">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Recipe Information</CardTitle>
                                    <CardDescription>Basic details about this recipe</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="name">Recipe Name *</Label>
                                            <Input id="name" value={recipeName} onChange={e => setRecipeName(e.target.value)} placeholder="e.g. Pad Thai Sauce" />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Category</Label>
                                            <Select value={category} onValueChange={setCategory}>
                                                <SelectTrigger><SelectValue placeholder="Select Category" /></SelectTrigger>
                                                <SelectContent>
                                                {categories.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Yield Amount</Label>
                                            <Input type="number" min={1} value={yieldAmount} onChange={e => setYieldAmount(e.target.value)} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Yield Unit</Label>
                                            <Input value={yieldUnit} onChange={e => setYieldUnit(e.target.value)} placeholder="e.g. serving, L" />
                                        </div>
                                    </div>
                                    {/* Image URL */}
                                    <div className="space-y-2">
                                        <Label className="flex items-center gap-1.5">
                                            <ImageIcon className="h-3.5 w-3.5" /> Recipe Image URL (optional)
                                        </Label>
                                        <Input
                                            value={imageUrl}
                                            onChange={e => setImageUrl(e.target.value)}
                                            placeholder="https://example.com/photo.jpg"
                                        />
                                        {imageUrl && (
                                            <div className="mt-2 h-32 w-full rounded-lg border overflow-hidden bg-muted">
                                                <img
                                                    src={imageUrl}
                                                    alt="Recipe preview"
                                                    className="w-full h-full object-cover"
                                                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                                />
                                            </div>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between">
                                    <div>
                                        <CardTitle>Ingredients</CardTitle>
                                        <CardDescription>Select ingredients and quantities for real-time cost calculation</CardDescription>
                                    </div>
                                    <Button variant="outline" size="sm" onClick={addIngredientRow}>
                                        <Plus className="mr-2 h-4 w-4" /> Add Item
                                    </Button>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    {/* Header row */}
                                    <div className="grid grid-cols-[1fr_100px_80px_80px_36px] gap-2 px-1">
                                        <span className="text-xs text-muted-foreground font-medium">Ingredient</span>
                                        <span className="text-xs text-muted-foreground font-medium">Qty (recipe unit)</span>
                                        <span className="text-xs text-muted-foreground font-medium">Unit</span>
                                        <span className="text-xs text-muted-foreground font-medium text-right">Cost</span>
                                        <span></span>
                                    </div>
                                    {ingredientRows.map((row) => {
                                        const ing = ingredients.find(i => i.id === row.ingredientId);
                                        const qty = parseFloat(row.quantity);
                                        const costPerUnit = ing ? Number(ing.purchasePrice) / Number(ing.conversionRate) / (Number(ing.yieldPercent) / 100) : 0;
                                        const lineCost = ing && qty ? costPerUnit * qty : 0;
                                        return (
                                            <div key={row.id} className="grid grid-cols-[1fr_100px_80px_80px_36px] gap-2 items-center">
                                                <Select value={row.ingredientId} onValueChange={v => updateRow(row.id, "ingredientId", v)}>
                                                    <SelectTrigger className="h-9">
                                                        <SelectValue placeholder="Select ingredient" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {ingredients.map(mi => (
                                                            <SelectItem key={mi.id} value={mi.id}>
                                                                {mi.name}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <Input
                                                    className="h-9"
                                                    type="number"
                                                    min={0}
                                                    step={0.1}
                                                    placeholder="0"
                                                    value={row.quantity}
                                                    onChange={e => updateRow(row.id, "quantity", e.target.value)}
                                                />
                                                <div className="h-9 flex items-center text-xs text-muted-foreground px-2 border rounded-md bg-muted/50">
                                                    {ing?.recipeUnit ?? "—"}
                                                </div>
                                                <div className="h-9 flex items-center justify-end text-sm font-medium px-2 border rounded-md bg-muted/50">
                                                    {lineCost > 0 ? format(lineCost) : format(0)}
                                                </div>
                                                <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive" onClick={() => removeRow(row.id)}>
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        );
                                    })}

                                    {/* Ingredient total */}
                                    <div className="flex justify-end pt-2 border-t">
                                        <span className="text-sm text-muted-foreground mr-4">Ingredients Subtotal</span>
                                        <span className="text-sm font-bold text-primary">{format(totalIngredientCost)}</span>
                                    </div>

                                    {category === "Main Sauce" && (
                                        <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-md text-sm text-yellow-800 dark:text-yellow-400">
                                            <strong>Main Sauce mode:</strong> This recipe will be available as an ingredient in other recipes (via Owner Sauce supplier).
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {/* TAB 2: Equipment & Labor */}
                        <TabsContent value="process" className="space-y-4">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Labor & Energy Costs</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label>Prep Time (minutes)</Label>
                                            <Input type="number" min={0} value={prepMinutes} onChange={e => setPrepMinutes(e.target.value)} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Cook Time (minutes)</Label>
                                            <Input type="number" min={0} value={cookMinutes} onChange={e => setCookMinutes(e.target.value)} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Labor Cost ({symbol}/hour)</Label>
                                            <Input type="number" min={0} value={laborCostPerHour} onChange={e => setLaborCostPerHour(e.target.value)} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Energy Cost ({symbol}/batch est.)</Label>
                                            <Input type="number" min={0} step={0.5} value={energyCost} onChange={e => setEnergyCost(e.target.value)} />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-3 gap-3 pt-2 border-t">
                                        <div className="rounded-lg bg-muted/50 p-3 text-center">
                                            <p className="text-xs text-muted-foreground mb-1">Total time</p>
                                            <p className="font-bold">{(parseFloat(prepMinutes) || 0) + (parseFloat(cookMinutes) || 0)} min</p>
                                        </div>
                                        <div className="rounded-lg bg-muted/50 p-3 text-center">
                                            <p className="text-xs text-muted-foreground mb-1">Labor cost</p>
                                            <p className="font-bold text-primary">{format(totalLaborCost)}</p>
                                        </div>
                                        <div className="rounded-lg bg-muted/50 p-3 text-center">
                                            <p className="text-xs text-muted-foreground mb-1">Energy cost</p>
                                            <p className="font-bold text-primary">{format(totalEnergyCost)}</p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle>Equipment Required</CardTitle>
                                    <CardDescription>{selectedEquipment.size} item{selectedEquipment.size !== 1 ? "s" : ""} selected</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="grid grid-cols-2 gap-2">
                                        {equipment.filter(e => e.status !== "Retired").map(eq => (
                                            <label
                                                key={eq.id}
                                                className="flex items-center gap-3 p-2.5 border rounded-lg hover:bg-accent cursor-pointer transition-colors"
                                            >
                                                <Checkbox
                                                    checked={selectedEquipment.has(eq.id)}
                                                    onCheckedChange={() => toggleEquipment(eq.id)}
                                                />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium truncate">{eq.name}</p>
                                                </div>
                                                <Badge variant="outline" className="text-xs shrink-0">{eq.type}</Badge>
                                            </label>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {/* TAB 3: Instructions */}
                        <TabsContent value="instructions">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Preparation Instructions</CardTitle>
                                    <CardDescription>Step-by-step Standard Operating Procedure</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <Textarea
                                        className="min-h-[320px] font-mono text-sm"
                                        placeholder={"1. Prepare all ingredients...\n2. Heat the wok to high...\n3. Add oil and..."}
                                        value={instructions}
                                        onChange={e => setInstructions(e.target.value)}
                                    />
                                    <p className="text-xs text-muted-foreground mt-2">{instructions.split("\n").filter(Boolean).length} steps written</p>
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>
                </div>

                {/* Cost Breakdown Sidebar */}
                <div>
                    <Card className="sticky top-6 border-primary/20 shadow-md">
                        <CardHeader className="bg-primary/5 rounded-t-lg pb-4">
                            <CardTitle>Cost Breakdown</CardTitle>
                            <CardDescription>Real-time calculation</CardDescription>
                        </CardHeader>
                        <CardContent className="pt-6 space-y-4">
                            <div className="space-y-2">
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-muted-foreground flex items-center gap-1.5">
                                        <span className="w-2.5 h-2.5 rounded-full bg-chart-1 inline-block"></span>
                                        Ingredients
                                    </span>
                                    <span className="font-medium tabular-nums">{format(totalIngredientCost)}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-muted-foreground flex items-center gap-1.5">
                                        <span className="w-2.5 h-2.5 rounded-full bg-chart-2 inline-block"></span>
                                        Labor ({(parseFloat(prepMinutes)||0)+(parseFloat(cookMinutes)||0)}m)
                                    </span>
                                    <span className="font-medium tabular-nums">{format(totalLaborCost)}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-muted-foreground flex items-center gap-1.5">
                                        <span className="w-2.5 h-2.5 rounded-full bg-chart-3 inline-block"></span>
                                        Energy
                                    </span>
                                    <span className="font-medium tabular-nums">{format(totalEnergyCost)}</span>
                                </div>
                            </div>

                            {/* Stacked bar */}
                            <div className="h-2.5 rounded-full overflow-hidden flex bg-muted">
                                <div className="bg-chart-1 transition-all duration-300" style={{ width: `${ingPct}%` }}></div>
                                <div className="bg-chart-2 transition-all duration-300" style={{ width: `${labPct}%` }}></div>
                                <div className="bg-chart-3 transition-all duration-300" style={{ width: `${engPct}%` }}></div>
                            </div>

                            <div className="h-px bg-border" />

                            <div className="flex justify-between items-center">
                                <span className="font-semibold">Total Batch Cost</span>
                                <span className="font-bold text-lg tabular-nums">{format(totalCost)}</span>
                            </div>

                            <div className="p-4 bg-primary text-primary-foreground rounded-xl text-center">
                                <div className="text-xs opacity-80 mb-1">Cost per {yieldUnit || "yield"}</div>
                                <div className="text-3xl font-bold font-playfair tabular-nums">{format(costPerYield)}</div>
                                {yieldQty > 1 && (
                                    <div className="text-xs opacity-70 mt-1">({yieldQty} {yieldUnit}s total)</div>
                                )}
                            </div>

                            {/* Actual selling price + Food Cost % */}
                            <div className="rounded-lg border p-3 space-y-2">
                                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Selling Price / Food Cost</p>
                                <div className="flex items-center gap-2">
                                    <span className="text-sm text-muted-foreground shrink-0">{symbol}</span>
                                    <Input
                                        type="number"
                                        min="0"
                                        step="0.5"
                                        placeholder="Selling price"
                                        value={sellingPrice}
                                        onChange={e => setSellingPrice(e.target.value)}
                                        className="h-8 text-sm"
                                    />
                                </div>
                                {(() => {
                                    const sp = parseFloat(sellingPrice);
                                    if (!sp || sp <= 0 || costPerYield <= 0) return (
                                        <p className="text-xs text-muted-foreground">Enter selling price to see Food Cost %</p>
                                    );
                                    const pct = (costPerYield / sp) * 100;
                                    const color = pct <= 30 ? "text-green-600" : pct <= 40 ? "text-yellow-600" : "text-red-600";
                                    const label = pct <= 30 ? "Excellent" : pct <= 40 ? "Acceptable" : "Too High";
                                    return (
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm text-muted-foreground">Food Cost %</span>
                                            <span className={`text-lg font-bold tabular-nums ${color}`}>
                                                {pct.toFixed(1)}% <span className="text-xs font-normal">({label})</span>
                                            </span>
                                        </div>
                                    );
                                })()}
                            </div>

                            {/* Suggested price */}
                            {costPerYield > 0 && (
                                <div className="rounded-lg border border-dashed p-3 space-y-1">
                                    <p className="text-xs text-muted-foreground font-medium">Suggested selling price</p>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">30% food cost</span>
                                        <span className="font-semibold">{format(costPerYield / 0.3, 0)}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">35% food cost</span>
                                        <span className="font-semibold">{format(costPerYield / 0.35, 0)}</span>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}

export default function RecipeBuilder() {
    return (
        <Suspense fallback={<div className="flex justify-center items-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
            <RecipeBuilderInner />
        </Suspense>
    );
}