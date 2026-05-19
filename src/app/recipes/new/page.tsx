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
import { Save, FileText, ArrowLeft, Plus, Trash2, Loader2, ImageIcon, UtensilsCrossed, Bike, ChevronDown, Upload, X, Link } from "lucide-react";
import { useCurrency } from "@/components/currency-context";
import { CURRENCIES } from "@/lib/currency";
import { useCategories, DEFAULT_CATEGORY } from "@/lib/use-categories";
import { IngredientPicker } from "@/components/ingredient-picker";

// ─── Protein keyword detection ───────────────────────────────────────────────
const PROTEIN_KEYWORDS: Record<string, string> = {
    chicken: "Chicken",
    shrimp: "Shrimp",
    prawn: "Shrimp",
    tiger: "Shrimp",
    beef: "Beef",
    pork: "Pork",
    duck: "Duck",
    fish: "Fish",
    crab: "Crab",
    squid: "Squid",
    tofu: "Tofu",
    egg: "Egg",
};

function detectProteinType(name: string): string | null {
    const lower = name.toLowerCase();
    for (const [key, label] of Object.entries(PROTEIN_KEYWORDS)) {
        if (lower.includes(key)) return label;
    }
    return null;
}

function detectIngredientCategory(name: string): "protein" | "produce" | "sauce" | "dry" {
    if (detectProteinType(name)) return "protein";
    const lower = name.toLowerCase();
    if (["spring", "bean", "sprout", "vegetable", "herb", "lime", "onion", "garlic"].some(k => lower.includes(k)))
        return "produce";
    if (["sauce", "oil", "paste", "sugar", "vinegar", "tamarind"].some(k => lower.includes(k)))
        return "sauce";
    return "dry";
}

interface IngredientRow {
    id: number;
    ingredientId: string;
    quantity: string;
}

function fcPctColor(pct: number) {
    if (pct <= 30) return "text-green-600";
    if (pct <= 40) return "text-yellow-600";
    return "text-red-600";
}

function fcLabel(pct: number) {
    if (pct <= 30) return "Excellent";
    if (pct <= 40) return "Acceptable";
    return "Too High";
}

function RecipeBuilderInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const editId = searchParams.get("id");
    const { format, symbol, currency } = useCurrency();
    const rate = CURRENCIES[currency].rateFromTHB;
    // show: render a value already in display currency (no THB→CAD conversion)
    const show = (amt: number, dec = 2) => `${symbol}${amt.toFixed(dec)}`;
    const { categories } = useCategories();
    const [loadingData, setLoadingData] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState("");
    const [savedFlash, setSavedFlash] = useState(false);
    const [ingredients, setIngredients] = useState<Ingredient[]>([]);
    const [equipment, setEquipment] = useState<Equipment[]>([]);
    const [activeTab, setActiveTab] = useState("info");
    const [showCostBreakdown, setShowCostBreakdown] = useState(false);

    // Form state
    const [recipeName, setRecipeName] = useState("");
    const [category, setCategory] = useState(DEFAULT_CATEGORY);
    const [yieldAmount, setYieldAmount] = useState("1");
    const [yieldUnit, setYieldUnit] = useState("serving");
    const [instructions, setInstructions] = useState("");
    const [imageUrl, setImageUrl] = useState("");
    const [ingredientRows, setIngredientRows] = useState<IngredientRow[]>([
        { id: 1, ingredientId: "", quantity: "" }
    ]);
    const [selectedEquipment, setSelectedEquipment] = useState<Set<string>>(new Set());
    const [laborCostPerHour, setLaborCostPerHour] = useState("50");
    const [prepMinutes, setPrepMinutes] = useState("15");
    const [cookMinutes, setCookMinutes] = useState("5");
    const [energyCost, setEnergyCost] = useState("5");
    const [diningPrice, setDiningPrice] = useState("");
    const [deliveryPrice, setDeliveryPrice] = useState("");
    const [isSubRecipe, setIsSubRecipe] = useState(false);

    // Image upload state
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState("");
    const [dragOver, setDragOver] = useState(false);
    const [imageInputMode, setImageInputMode] = useState<"upload" | "url">("upload");

    useEffect(() => {
        const loadAll = async () => {
            const [ings, eqs] = await Promise.all([ingredientsApi.list(), equipmentApi.list()]);
            setIngredients(ings);
            setEquipment(eqs);

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
                    setDiningPrice(recipe.sellingPrice != null ? String(recipe.sellingPrice) : "");
                    setDeliveryPrice(recipe.deliveryPrice != null ? String(recipe.deliveryPrice) : "");
                    setIsSubRecipe(recipe.isSubRecipe ?? false);
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

    // ─── Cost calculations ────────────────────────────────────────────────────
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
    const ingCostPerYield = totalIngredientCost / yieldQty;         // THB (raw DB value)
    const ingCostPerYieldDisplay = ingCostPerYield * rate;           // display currency (CAD)
    const totalCostPerYield = totalCost / yieldQty;

    // Cost bar percentages
    const ingPct = totalCost > 0 ? (totalIngredientCost / totalCost) * 100 : 0;
    const labPct = totalCost > 0 ? (totalLaborCost / totalCost) * 100 : 0;
    const engPct = totalCost > 0 ? (totalEnergyCost / totalCost) * 100 : 0;

    // Protein breakdown
    const proteinBreakdown = useMemo(() => {
        const groups: Record<string, number> = {};
        for (const row of ingredientRows) {
            const ing = ingredients.find(i => i.id === row.ingredientId);
            const qty = parseFloat(row.quantity);
            if (!ing || !qty || isNaN(qty)) continue;
            const cat = detectIngredientCategory(ing.name);
            const cost = (Number(ing.purchasePrice) / Number(ing.conversionRate) / (Number(ing.yieldPercent) / 100)) * qty;
            const key = cat === "protein" ? (detectProteinType(ing.name) ?? "Protein") : cat;
            groups[key] = (groups[key] ?? 0) + cost;
        }
        return groups;
    }, [ingredientRows, ingredients]);

    const CATEGORY_LABELS: Record<string, string> = {
        produce: "Produce",
        sauce: "Sauce & Condiments",
        dry: "Dry Goods & Spices",
    };

    // ─── Row ops ─────────────────────────────────────────────────────────────
    const addIngredientRow = () => setIngredientRows(prev => [...prev, { id: Date.now(), ingredientId: "", quantity: "" }]);
    const updateRow = (id: number, field: keyof IngredientRow, value: string) =>
        setIngredientRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
    const removeRow = (id: number) => setIngredientRows(prev => prev.filter(r => r.id !== id));
    const toggleEquipment = (id: string) => setSelectedEquipment(prev => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
    });

    // ─── Image upload via FormData → /api/upload → Vercel Blob ──────────────
    const handleUploadFile = async (file: File) => {
        const ALLOWED = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
        if (!ALLOWED.includes(file.type)) {
            setUploadError("Please select an image file (JPG, PNG, WebP, GIF)");
            return;
        }
        if (file.size > 4 * 1024 * 1024) {
            setUploadError("Image must be under 4 MB");
            return;
        }
        setUploadError("");
        setUploading(true);
        try {
            const fd = new FormData();
            fd.append("file", file);
            const res = await fetch("/api/upload", { method: "POST", body: fd });

            // Safely parse response regardless of content-type
            let data: { url?: string; error?: string } = {};
            try { data = await res.json(); } catch {
                data = { error: await res.text().catch(() => `Upload error (${res.status})`) };
            }
            if (!res.ok) throw new Error(data.error ?? `Upload error (${res.status})`);
            setImageUrl(data.url!);
        } catch (err) {
            setUploadError(err instanceof Error ? err.message : "Upload failed");
        } finally {
            setUploading(false);
        }
    };

    const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleUploadFile(file);
        e.target.value = "";
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) handleUploadFile(file);
    };

    // ─── Save ─────────────────────────────────────────────────────────────────
    const handleSave = async () => {
        if (!recipeName.trim()) { setSaveError("Please enter a recipe name."); return; }
        setSaveError("");
        setSaving(true);
        try {
            const rows = ingredientRows
                .filter(r => r.ingredientId && parseFloat(r.quantity) > 0)
                .map(r => ({ ingredientId: r.ingredientId, quantity: parseFloat(r.quantity) }));
            const payload = {
                name: recipeName, category,
                yieldAmount: parseFloat(yieldAmount) || 1, yieldUnit,
                prepTime: parseFloat(prepMinutes) || 0,
                cookTime: parseFloat(cookMinutes) || 0,
                laborCostPerHour: parseFloat(laborCostPerHour) || 0,
                energyCostPerBatch: parseFloat(energyCost) || 0,
                sellingPrice: parseFloat(diningPrice) > 0 ? parseFloat(diningPrice) : null,
                deliveryPrice: parseFloat(deliveryPrice) > 0 ? parseFloat(deliveryPrice) : null,
                isMainSauce: category === "Sauce Base",
                isSubRecipe,
                instructions,
                imageUrl: imageUrl.trim() || undefined,
                ingredients: rows,
            };
            if (editId) {
                await recipesApi.update(editId, payload);
                await recipesApi.setIngredients(editId, rows);
                // Stay on the editor — flash a "Saved ✓" confirmation
                setSavedFlash(true);
                setTimeout(() => setSavedFlash(false), 2500);
            } else {
                await recipesApi.create(payload);
                router.push("/recipes");
            }
        } catch (err) {
            setSaveError(err instanceof Error ? err.message : "Failed to save recipe. Please try again.");
            console.error(err);
        } finally { setSaving(false); }
    };

    // ─── Export SOP ───────────────────────────────────────────────────────────
    const handleExportSOP = () => {
        const prep  = parseFloat(prepMinutes) || 0;
        const cook  = parseFloat(cookMinutes) || 0;
        const ready = prep + cook;
        const docCode = `SOP-${editId ? editId.slice(0, 8).toUpperCase() : "NEW"}-${new Date().toISOString().slice(0, 10)}`;

        // Build ingredient rows
        const ingRows = ingredientRows
            .filter(r => r.ingredientId && parseFloat(r.quantity) > 0)
            .map(r => {
                const ing = ingredients.find(i => i.id === r.ingredientId);
                if (!ing) return "";
                const qty = parseFloat(r.quantity);
                return `<tr>
                  <td class="ing-qty">${qty} ${ing.recipeUnit}</td>
                  <td class="ing-name">${ing.name}</td>
                  <td class="ing-cost">${format((Number(ing.purchasePrice) / Number(ing.conversionRate) / (Number(ing.yieldPercent) / 100)) * qty)}</td>
                </tr>`;
            }).join("");

        // Build direction steps
        const steps = (instructions || "").split("\n").map(l => l.trim()).filter(Boolean);
        const dirRows = steps.length
            ? steps.map((l, i) => `<div class="step"><span class="step-num">${i + 1}</span><span class="step-text">${l}</span></div>`).join("")
            : `<div class="step"><span class="step-text" style="color:#999;font-style:italic">No instructions provided.</span></div>`;

        // Pricing + FC rows
        const dp = parseFloat(diningPrice);
        const dlp = parseFloat(deliveryPrice);
        const diningFCHtml  = dp  > 0 && ingCostPerYieldDisplay > 0 ? `<span class="pill pill-fc">Dining FC <b>${((ingCostPerYieldDisplay / dp)  * 100).toFixed(1)}%</b></span>` : "";
        const delivFCHtml   = dlp > 0 && ingCostPerYieldDisplay > 0 ? `<span class="pill pill-fc">Delivery FC <b>${((ingCostPerYieldDisplay / dlp) * 100).toFixed(1)}%</b></span>` : "";
        const diningPrHtml  = dp  > 0 ? `<span class="pill">Dining <b>${show(dp)}</b></span>`  : "";
        const delivPrHtml   = dlp > 0 ? `<span class="pill">Delivery <b>${show(dlp)}</b></span>` : "";

        const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>S.O.P — ${recipeName || "Recipe"}</title>
<style>
/* ── Reset ── */
*{margin:0;padding:0;box-sizing:border-box}

/* ── Screen: outer wrapper ── */
body{
  font-family:Georgia,"Times New Roman",serif;
  background:#f0ede7;
  color:#1a1a1a;
  padding:32px 16px;
}
.page{
  background:#fff;
  max-width:1040px;
  margin:0 auto;
  border-radius:10px;
  overflow:hidden;
  box-shadow:0 8px 40px rgba(0,0,0,.18);
}

/* ── Hero image 992 × 650 ── */
.hero{
  width:100%;
  height:650px;
  background:#111;
  position:relative;
  overflow:hidden;
  display:flex;
  align-items:center;
  justify-content:center;
}
.hero img{
  width:992px;
  height:650px;
  max-width:100%;
  max-height:100%;
  object-fit:contain;   /* show whole dish */
  object-position:center;
  display:block;
}
.hero-no-img{
  width:100%;height:100%;
  background:linear-gradient(135deg,#2a2018 0%,#4a3828 100%);
  display:flex;align-items:center;justify-content:center;
  color:rgba(255,255,255,.3);font-size:1rem;font-family:Arial,sans-serif;
  letter-spacing:.1em;text-transform:uppercase;
}
.hero-overlay{
  position:absolute;
  bottom:0;left:0;right:0;
  padding:28px 36px 24px;
  background:linear-gradient(to top,rgba(0,0,0,.82) 0%,rgba(0,0,0,0) 100%);
}
.hero-title{
  font-size:2.6rem;font-weight:700;color:#fff;
  line-height:1.1;text-shadow:0 2px 12px rgba(0,0,0,.6);
}
.hero-meta{
  margin-top:5px;font-family:Arial,sans-serif;font-size:.88rem;
  color:rgba(255,255,255,.7);letter-spacing:.02em;
}

/* ── Stats bar ── */
.stats{
  display:grid;
  grid-template-columns:repeat(5,1fr);
  background:#1c1a16;
  color:#fff;
}
.stat{
  padding:11px 6px;text-align:center;
  border-right:1px solid rgba(255,255,255,.1);
}
.stat:last-child{border-right:none}
.stat-lbl{
  font-size:.58rem;text-transform:uppercase;letter-spacing:.09em;
  color:rgba(255,255,255,.5);font-family:Arial,sans-serif;
}
.stat-val{font-size:.95rem;font-weight:700;margin-top:3px}
.stat-val.gold{color:#e8b84b}

/* ── Body ── */
.body{
  display:grid;
  grid-template-columns:42% 1fr;
  gap:0;
}
.col{padding:22px 24px}
.col-left{border-right:1px solid #ede8e0}
.col-title{
  font-size:.6rem;font-weight:700;text-transform:uppercase;
  letter-spacing:.1em;color:#999;font-family:Arial,sans-serif;
  margin-bottom:10px;padding-bottom:6px;
  border-bottom:2px solid #ede8e0;
}

/* Ingredient table */
.ing-table{width:100%;border-collapse:collapse}
.ing-table tr{border-bottom:1px solid #f4f0ea}
.ing-table tr:last-child{border-bottom:none}
.ing-qty{
  font-size:.78rem;font-weight:700;color:#b87c28;
  font-family:Arial,sans-serif;padding:4px 8px 4px 0;
  white-space:nowrap;vertical-align:top;width:90px;
}
.ing-name{font-size:.82rem;padding:4px 0;vertical-align:top;line-height:1.3}
.ing-cost{
  font-size:.72rem;color:#999;font-family:Arial,sans-serif;
  text-align:right;padding:4px 0 4px 6px;vertical-align:top;
  white-space:nowrap;
}

/* Directions */
.step{display:flex;gap:9px;margin-bottom:7px;align-items:flex-start}
.step-num{
  background:#1c1a16;color:#fff;border-radius:50%;
  width:18px;height:18px;min-width:18px;
  display:flex;align-items:center;justify-content:center;
  font-size:.6rem;font-weight:700;font-family:Arial,sans-serif;
  margin-top:1px;
}
.step-text{font-size:.82rem;line-height:1.5;color:#333}

/* ── Footer ── */
.footer{
  background:#f8f5f0;
  border-top:1px solid #ede8e0;
  padding:10px 24px;
  display:flex;
  flex-wrap:wrap;
  align-items:center;
  justify-content:space-between;
  gap:8px;
}
.footer-brand{font-family:Arial,sans-serif;font-size:.65rem;color:#999}
.pills{display:flex;flex-wrap:wrap;gap:5px}
.pill{
  background:#fff;border:1px solid #ddd;border-radius:20px;
  padding:2px 9px;font-size:.65rem;font-family:Arial,sans-serif;color:#555;
}
.pill b{color:#1a1a1a}
.pill-fc b{color:#b87c28}

/* ── Print ── */
@media print{
  *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
  body{background:#fff;padding:0}
  .page{max-width:100%;border-radius:0;box-shadow:none}

  /* Image: scaled for A4, full dish visible */
  .hero{height:280px}
  .hero img{width:100%;height:280px}
  .hero-title{font-size:1.7rem}
  .hero-meta{font-size:.72rem}
  .hero-overlay{padding:16px 20px 14px}

  .stats .stat{padding:7px 4px}
  .stat-val{font-size:.78rem}
  .stat-lbl{font-size:.5rem}

  .body{grid-template-columns:40% 1fr}
  .col{padding:12px 14px}
  .col-title{font-size:.52rem;margin-bottom:7px;padding-bottom:4px}

  .ing-qty{font-size:.68rem;padding:3px 6px 3px 0;width:78px}
  .ing-name{font-size:.72rem;padding:3px 0}
  .ing-cost{font-size:.62rem;padding:3px 0 3px 4px}

  .step{margin-bottom:5px;gap:7px}
  .step-num{width:15px;height:15px;min-width:15px;font-size:.52rem}
  .step-text{font-size:.72rem;line-height:1.4}

  .footer{padding:7px 14px}
  .pill{font-size:.58rem;padding:1px 7px}

  @page{size:A4 portrait;margin:8mm 10mm}
}
</style>
</head>
<body>
<div class="page">

  <!-- Hero -->
  <div class="hero">
    ${imageUrl
        ? `<img src="${imageUrl}" alt="${recipeName}" onerror="this.outerHTML='<div class=hero-no-img>No Image Available</div>'" />`
        : `<div class="hero-no-img">No Image Available</div>`}
    <div class="hero-overlay">
      <div class="hero-title">${recipeName || "Untitled Recipe"}</div>
      <div class="hero-meta">${category}&ensp;·&ensp;${docCode}</div>
    </div>
  </div>

  <!-- Stats bar -->
  <div class="stats">
    <div class="stat">
      <div class="stat-lbl">Prep</div>
      <div class="stat-val">${prep} min</div>
    </div>
    <div class="stat">
      <div class="stat-lbl">Cook</div>
      <div class="stat-val">${cook} min</div>
    </div>
    <div class="stat">
      <div class="stat-lbl">Ready In</div>
      <div class="stat-val">${ready} min</div>
    </div>
    <div class="stat">
      <div class="stat-lbl">Yield</div>
      <div class="stat-val">${yieldAmount} ${yieldUnit}</div>
    </div>
    <div class="stat">
      <div class="stat-lbl">Ingredient Cost / ${yieldUnit}</div>
      <div class="stat-val gold">${format(ingCostPerYield)}</div>
    </div>
  </div>

  <!-- Body: 2 columns -->
  <div class="body">
    <div class="col col-left">
      <div class="col-title">Ingredients</div>
      <table class="ing-table">
        ${ingRows || `<tr><td class="ing-name" colspan="3" style="color:#999;font-style:italic">No ingredients added.</td></tr>`}
      </table>
    </div>
    <div class="col col-right">
      <div class="col-title">Preparation Steps</div>
      ${dirRows}
    </div>
  </div>

  <!-- Footer -->
  <div class="footer">
    <span class="footer-brand">Chiang Mai BOH &copy; ${new Date().getFullYear()}</span>
    <div class="pills">
      <span class="pill">Ingredients <b>${format(totalIngredientCost)}</b></span>
      <span class="pill">Labor <b>${format(totalLaborCost)}</b></span>
      <span class="pill">Total <b>${format(totalCost)}</b></span>
      ${diningPrHtml}${delivPrHtml}${diningFCHtml}${delivFCHtml}
    </div>
    <span class="footer-brand">${docCode}</span>
  </div>

</div>
<script>window.onload=function(){window.print();};<\/script>
</body>
</html>`;

        const win = window.open("", "_blank");
        if (win) { win.document.write(html); win.document.close(); }
    };

    if (loadingData) return (
        <div className="flex justify-center items-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
    );

    // ─── Cost sidebar (extracted for reuse) ───────────────────────────────────
    const CostSidebar = () => (
        <Card className="border-primary/20 shadow-md">
            <CardHeader className="bg-primary/5 rounded-t-lg pb-3">
                <CardTitle className="text-base">Cost Breakdown</CardTitle>
                <CardDescription className="text-xs">Real-time calculation</CardDescription>
            </CardHeader>
            <CardContent className="pt-4 space-y-3">
                {/* Ingredient / Labor / Energy lines */}
                <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-chart-1 inline-block" />Ingredients
                        </span>
                        <span className="font-medium tabular-nums">{format(totalIngredientCost)}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-chart-2 inline-block" />
                            Labor ({(parseFloat(prepMinutes) || 0) + (parseFloat(cookMinutes) || 0)}m)
                        </span>
                        <span className="font-medium tabular-nums">{format(totalLaborCost)}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-chart-3 inline-block" />Energy
                        </span>
                        <span className="font-medium tabular-nums">{format(totalEnergyCost)}</span>
                    </div>
                </div>

                {/* Stacked bar */}
                <div className="h-2 rounded-full overflow-hidden flex bg-muted">
                    <div className="bg-chart-1 transition-all duration-300" style={{ width: `${ingPct}%` }} />
                    <div className="bg-chart-2 transition-all duration-300" style={{ width: `${labPct}%` }} />
                    <div className="bg-chart-3 transition-all duration-300" style={{ width: `${engPct}%` }} />
                </div>

                <div className="flex justify-between items-center pt-1 border-t">
                    <span className="font-semibold text-sm">Total Batch Cost</span>
                    <span className="font-bold tabular-nums">{format(totalCost)}</span>
                </div>

                {/* Per yield hero */}
                <div className="p-3 bg-primary text-primary-foreground rounded-xl text-center">
                    <div className="text-xs opacity-75 mb-0.5">Ingredient cost / {yieldUnit || "yield"}</div>
                    <div className="text-2xl font-bold font-playfair tabular-nums">{format(ingCostPerYield)}</div>
                    <div className="text-xs opacity-60 mt-0.5">Total: {format(totalCostPerYield)} (incl. labor)</div>
                </div>

                {/* ─── Protein / category breakdown ─────────────────────────── */}
                {Object.keys(proteinBreakdown).length > 0 && (
                    <div className="rounded-lg border p-3 space-y-1.5">
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Ingredient Breakdown</p>
                        {Object.entries(proteinBreakdown)
                            .sort((a, b) => b[1] - a[1])
                            .map(([key, cost]) => {
                                const label = CATEGORY_LABELS[key] ?? key;
                                const pct = totalIngredientCost > 0 ? (cost / totalIngredientCost) * 100 : 0;
                                return (
                                    <div key={key} className="flex items-center justify-between text-xs gap-2">
                                        <span className="text-muted-foreground truncate">{label}</span>
                                        <span className="flex items-center gap-1.5 shrink-0">
                                            <span className="tabular-nums font-medium">{format(cost / yieldQty)}</span>
                                            <span className="text-muted-foreground tabular-nums">({pct.toFixed(0)}%)</span>
                                        </span>
                                    </div>
                                );
                            })}
                    </div>
                )}

                {/* ─── Dining & Delivery selling prices ────────────────────── */}
                <div className="rounded-lg border p-3 space-y-3">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Selling Price & Food Cost %</p>

                    {/* Dining */}
                    <div className="space-y-1">
                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <UtensilsCrossed className="h-3 w-3" /> Dining Price ({symbol})
                        </label>
                        <Input
                            type="number" min="0" step="0.5"
                            placeholder="0"
                            value={diningPrice}
                            onChange={e => setDiningPrice(e.target.value)}
                            className="h-8 text-sm"
                        />
                        {(() => {
                            const sp = parseFloat(diningPrice);
                            if (!sp || sp <= 0 || ingCostPerYieldDisplay <= 0) return null;
                            const pct = (ingCostPerYieldDisplay / sp) * 100;
                            return (
                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-muted-foreground">Food Cost %</span>
                                    <span className={`text-sm font-bold tabular-nums ${fcPctColor(pct)}`}>
                                        {pct.toFixed(1)}% <span className="text-xs font-normal">({fcLabel(pct)})</span>
                                    </span>
                                </div>
                            );
                        })()}
                    </div>

                    {/* Delivery */}
                    <div className="space-y-1">
                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Bike className="h-3 w-3" /> Delivery Price ({symbol})
                        </label>
                        <Input
                            type="number" min="0" step="0.5"
                            placeholder="0"
                            value={deliveryPrice}
                            onChange={e => setDeliveryPrice(e.target.value)}
                            className="h-8 text-sm"
                        />
                        {(() => {
                            const sp = parseFloat(deliveryPrice);
                            if (!sp || sp <= 0 || ingCostPerYieldDisplay <= 0) return null;
                            const pct = (ingCostPerYieldDisplay / sp) * 100;
                            return (
                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-muted-foreground">Food Cost %</span>
                                    <span className={`text-sm font-bold tabular-nums ${fcPctColor(pct)}`}>
                                        {pct.toFixed(1)}% <span className="text-xs font-normal">({fcLabel(pct)})</span>
                                    </span>
                                </div>
                            );
                        })()}
                    </div>
                </div>

                {/* Suggested price */}
                {ingCostPerYield > 0 && (
                    <div className="rounded-lg border border-dashed p-3 space-y-1">
                        <p className="text-xs text-muted-foreground font-medium">Suggested selling price</p>
                        <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">30% food cost</span>
                            <span className="font-semibold tabular-nums">{format(ingCostPerYield / 0.3, 0)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">35% food cost</span>
                            <span className="font-semibold tabular-nums">{format(ingCostPerYield / 0.35, 0)}</span>
                        </div>
                    </div>
                )}

                {/* ── Sub Recipe toggle ─────────────────────────────────────── */}
                <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setIsSubRecipe(v => !v)}
                    onKeyDown={e => (e.key === "Enter" || e.key === " ") && setIsSubRecipe(v => !v)}
                    className={[
                        "rounded-lg border p-3 cursor-pointer transition-colors select-none",
                        isSubRecipe
                            ? "border-primary/40 bg-primary/5"
                            : "border-dashed hover:border-primary/30 hover:bg-muted/40",
                    ].join(" ")}
                >
                    <div className="flex items-start gap-2.5">
                        <Checkbox
                            id="isSubRecipe"
                            checked={isSubRecipe}
                            onCheckedChange={v => setIsSubRecipe(!!v)}
                            onClick={e => e.stopPropagation()}
                            className="mt-0.5 shrink-0"
                        />
                        <div>
                            <p className="text-sm font-medium leading-none">Sub Recipe</p>
                            <p className="text-xs text-muted-foreground mt-1 leading-snug">
                                Adds this recipe to the Ingredients list as a prepared component
                                (supplier: <em>Chiang Mai Sub Recipe</em>). Cost includes labor &amp; energy.
                                Use it inside other recipes to accurately nest costs.
                            </p>
                            {isSubRecipe && (
                                <p className="text-xs text-primary font-medium mt-1.5">
                                    ✓ Will sync as: <span className="font-semibold">{recipeName || "this recipe"}</span>
                                    {" "}@ {format(totalCostPerYield, 4)} / {yieldUnit || "unit"}
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );

    return (
        <div className="space-y-4 max-w-5xl mx-auto animate-in fade-in duration-500 pb-16">
            {/* ── Header bar (mobile-friendly) ─────────────────────────────── */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Button variant="ghost" size="icon" className="shrink-0" onClick={() => router.push("/recipes")}>
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div className="min-w-0">
                        <h2 className="text-2xl font-bold font-playfair tracking-tight text-primary truncate">
                            {editId ? (recipeName || "Edit Recipe") : (recipeName || "New Recipe")}
                        </h2>
                        <p className="text-muted-foreground text-xs hidden sm:block">
                            {editId ? "Editing recipe" : "Recipe Builder & Cost Calculator"}
                        </p>
                    </div>
                </div>
                <div className="flex flex-col gap-1.5 sm:items-end">
                    {saveError && <p className="text-xs text-destructive font-medium">{saveError}</p>}
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={handleExportSOP} disabled={!recipeName.trim()}>
                            <FileText className="mr-1.5 h-4 w-4" /> S.O.P
                        </Button>
                        <Button
                            size="sm"
                            disabled={!recipeName.trim() || saving}
                            onClick={handleSave}
                            className={savedFlash ? "bg-green-600 hover:bg-green-600 text-white" : ""}
                        >
                            {saving
                                ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                                : <Save className="mr-1.5 h-4 w-4" />}
                            {savedFlash ? "Saved ✓" : editId ? "Update" : "Save"}
                        </Button>
                    </div>
                </div>
            </div>

            {/* ── Mobile cost toggle ───────────────────────────────────────── */}
            <div className="lg:hidden">
                <Button
                    variant="outline"
                    className="w-full justify-between"
                    onClick={() => setShowCostBreakdown(v => !v)}
                >
                    <span className="flex items-center gap-2 text-sm">
                        Cost: <span className="font-bold text-primary">{format(ingCostPerYield)}/{yieldUnit || "yield"}</span>
                        {diningPrice && (
                            <span className="text-muted-foreground">· Dining {show(parseFloat(diningPrice))}</span>
                        )}
                    </span>
                    <ChevronDown className={`h-4 w-4 transition-transform ${showCostBreakdown ? "rotate-180" : ""}`} />
                </Button>
                {showCostBreakdown && (
                    <div className="mt-2">
                        <CostSidebar />
                    </div>
                )}
            </div>

            {/* ── Two-column layout (desktop) ──────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Left: Tabs */}
                <div className="lg:col-span-2 space-y-5">
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                        <TabsList className="grid w-full grid-cols-3 mb-4">
                            <TabsTrigger value="info" className="text-xs sm:text-sm">Info & Ingredients</TabsTrigger>
                            <TabsTrigger value="process" className="text-xs sm:text-sm">Equipment & Labor</TabsTrigger>
                            <TabsTrigger value="instructions" className="text-xs sm:text-sm">Instructions</TabsTrigger>
                        </TabsList>

                        {/* TAB 1: Info & Ingredients */}
                        <TabsContent value="info" className="space-y-4">
                            <Card>
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-base">Recipe Information</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="space-y-2 sm:col-span-2">
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
                                    {/* ── Image uploader ── */}
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <Label className="flex items-center gap-1.5">
                                                <ImageIcon className="h-3.5 w-3.5" /> Recipe Image
                                            </Label>
                                            <div className="flex gap-1">
                                                <Button
                                                    type="button" variant={imageInputMode === "upload" ? "default" : "ghost"}
                                                    size="sm" className="h-6 px-2 text-xs"
                                                    onClick={() => setImageInputMode("upload")}
                                                >
                                                    <Upload className="h-3 w-3 mr-1" /> Upload
                                                </Button>
                                                <Button
                                                    type="button" variant={imageInputMode === "url" ? "default" : "ghost"}
                                                    size="sm" className="h-6 px-2 text-xs"
                                                    onClick={() => setImageInputMode("url")}
                                                >
                                                    <Link className="h-3 w-3 mr-1" /> URL
                                                </Button>
                                            </div>
                                        </div>

                                        {imageInputMode === "upload" ? (
                                            <div>
                                                {/* Drag-and-drop zone */}
                                                <label
                                                    className={`flex flex-col items-center justify-center w-full rounded-lg border-2 border-dashed cursor-pointer transition-colors
                                                        ${dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/40"}
                                                        ${uploading ? "pointer-events-none opacity-60" : ""}`}
                                                    onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                                                    onDragLeave={() => setDragOver(false)}
                                                    onDrop={handleDrop}
                                                >
                                                    <input
                                                        type="file"
                                                        accept="image/*"
                                                        className="hidden"
                                                        onChange={handleFilePick}
                                                        disabled={uploading}
                                                    />
                                                    {imageUrl ? (
                                                        <div className="relative w-full">
                                                            <img
                                                                src={imageUrl}
                                                                alt="Recipe"
                                                                className="w-full h-44 object-contain rounded-lg bg-muted"
                                                                onError={e => { (e.target as HTMLImageElement).src = ""; }}
                                                            />
                                                            <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-black/40 rounded-lg">
                                                                <span className="text-white text-xs font-medium">Click or drop to replace</span>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                                                            {uploading ? (
                                                                <>
                                                                    <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
                                                                    <p className="text-sm text-muted-foreground">Uploading…</p>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <Upload className="h-8 w-8 text-muted-foreground/50 mb-2" />
                                                                    <p className="text-sm font-medium">Drop image here or click to browse</p>
                                                                    <p className="text-xs text-muted-foreground mt-1">JPG, PNG, WebP · max 4 MB</p>
                                                                </>
                                                            )}
                                                        </div>
                                                    )}
                                                </label>

                                                {imageUrl && (
                                                    <Button
                                                        type="button" variant="ghost" size="sm"
                                                        className="mt-1 h-6 px-2 text-xs text-destructive hover:text-destructive"
                                                        onClick={() => setImageUrl("")}
                                                    >
                                                        <X className="h-3 w-3 mr-1" /> Remove image
                                                    </Button>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="space-y-2">
                                                <Input
                                                    value={imageUrl}
                                                    onChange={e => setImageUrl(e.target.value)}
                                                    placeholder="https://example.com/photo.jpg"
                                                />
                                                {imageUrl && (
                                                    <div className="h-44 w-full rounded-lg border overflow-hidden bg-muted flex items-center justify-center">
                                                        <img
                                                            src={imageUrl}
                                                            alt="Recipe preview"
                                                            className="max-w-full max-h-full object-contain"
                                                            onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {uploadError && (
                                            <p className="text-xs text-destructive">{uploadError}</p>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Ingredients table */}
                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between pb-3">
                                    <div>
                                        <CardTitle className="text-base">Ingredients</CardTitle>
                                        <CardDescription className="text-xs">Real-time cost calculation</CardDescription>
                                    </div>
                                    <Button variant="outline" size="sm" onClick={addIngredientRow}>
                                        <Plus className="mr-1.5 h-3.5 w-3.5" /> Add
                                    </Button>
                                </CardHeader>
                                <CardContent className="space-y-2">
                                    {/* Desktop column headers (hidden on mobile) */}
                                    <div className="hidden sm:grid grid-cols-[1fr_80px_60px_70px_32px] gap-1.5 px-1">
                                        <span className="text-xs text-muted-foreground font-medium">Ingredient</span>
                                        <span className="text-xs text-muted-foreground font-medium">Qty</span>
                                        <span className="text-xs text-muted-foreground font-medium">Unit</span>
                                        <span className="text-xs text-muted-foreground font-medium text-right">Cost</span>
                                        <span />
                                    </div>

                                    {ingredientRows.map((row) => {
                                        const ing = ingredients.find(i => i.id === row.ingredientId);
                                        const qty = parseFloat(row.quantity);
                                        const costPerUnit = ing ? Number(ing.purchasePrice) / Number(ing.conversionRate) / (Number(ing.yieldPercent) / 100) : 0;
                                        const lineCost = ing && qty ? costPerUnit * qty : 0;
                                        const proteinType = ing ? detectProteinType(ing.name) : null;

                                        const ingredientSelect = (
                                            <IngredientPicker
                                                ingredients={ingredients}
                                                value={row.ingredientId}
                                                onChange={v => updateRow(row.id, "ingredientId", v)}
                                            />
                                        );

                                        return (
                                            <div key={row.id}>
                                                {/* ── Mobile card layout ── */}
                                                <div className="sm:hidden rounded-xl border bg-muted/20 p-2.5 space-y-2">
                                                    {/* Row 1: ingredient selector + delete */}
                                                    <div className="flex items-center gap-2">
                                                        <div className="flex-1 min-w-0">{ingredientSelect}</div>
                                                        <Button variant="ghost" size="icon"
                                                            className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                                                            onClick={() => removeRow(row.id)}>
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        </Button>
                                                    </div>
                                                    {/* Row 2: qty · unit · cost */}
                                                    <div className="flex items-center gap-2">
                                                        <div className="flex items-center gap-1.5 flex-1">
                                                            <span className="text-[11px] text-muted-foreground whitespace-nowrap">Qty</span>
                                                            <Input
                                                                className="h-8 text-xs w-20"
                                                                type="number" min={0} step={0.1} placeholder="0"
                                                                value={row.quantity}
                                                                onChange={e => updateRow(row.id, "quantity", e.target.value)}
                                                            />
                                                            <span className="text-xs text-muted-foreground bg-muted/60 border rounded px-2 py-1 whitespace-nowrap">
                                                                {ing?.recipeUnit ?? "—"}
                                                            </span>
                                                        </div>
                                                        <div className="text-sm font-semibold text-primary tabular-nums shrink-0">
                                                            {format(lineCost)}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* ── Desktop grid layout ── */}
                                                <div className="hidden sm:grid grid-cols-[1fr_80px_60px_70px_32px] gap-1.5 items-center">
                                                    {ingredientSelect}
                                                    <Input
                                                        className="h-9 text-xs"
                                                        type="number" min={0} step={0.1} placeholder="0"
                                                        value={row.quantity}
                                                        onChange={e => updateRow(row.id, "quantity", e.target.value)}
                                                    />
                                                    <div className="h-9 flex items-center text-xs text-muted-foreground px-2 border rounded-md bg-muted/50 truncate">
                                                        {ing?.recipeUnit ?? "—"}
                                                    </div>
                                                    <div className="h-9 flex items-center justify-end text-xs font-medium px-2 border rounded-md bg-muted/50 tabular-nums">
                                                        {format(lineCost)}
                                                    </div>
                                                    <Button variant="ghost" size="icon" className="h-9 w-8 text-destructive" onClick={() => removeRow(row.id)}>
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </Button>
                                                </div>
                                            </div>
                                        );
                                    })}

                                    <div className="flex justify-end pt-2 border-t">
                                        <span className="text-sm text-muted-foreground mr-4">Subtotal</span>
                                        <span className="text-sm font-bold text-primary tabular-nums">{format(totalIngredientCost)}</span>
                                    </div>
                                    {category === "Sauce Base" && (
                                        <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-md text-xs text-yellow-800 dark:text-yellow-400">
                                            <strong>Main Sauce mode:</strong> This recipe will be available as an ingredient in other recipes.
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {/* TAB 2: Equipment & Labor */}
                        <TabsContent value="process" className="space-y-4">
                            <Card>
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-base">Labor & Energy Costs</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label className="text-sm">Prep Time (min)</Label>
                                            <Input type="number" min={0} value={prepMinutes} onChange={e => setPrepMinutes(e.target.value)} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-sm">Cook Time (min)</Label>
                                            <Input type="number" min={0} value={cookMinutes} onChange={e => setCookMinutes(e.target.value)} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-sm">Labor ({symbol}/hr)</Label>
                                            <Input type="number" min={0} value={laborCostPerHour} onChange={e => setLaborCostPerHour(e.target.value)} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-sm">Energy ({symbol}/batch)</Label>
                                            <Input type="number" min={0} step={0.5} value={energyCost} onChange={e => setEnergyCost(e.target.value)} />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-3 gap-3 pt-1 border-t">
                                        <div className="rounded-lg bg-muted/50 p-3 text-center">
                                            <p className="text-xs text-muted-foreground mb-1">Total time</p>
                                            <p className="font-bold text-sm">{(parseFloat(prepMinutes) || 0) + (parseFloat(cookMinutes) || 0)} min</p>
                                        </div>
                                        <div className="rounded-lg bg-muted/50 p-3 text-center">
                                            <p className="text-xs text-muted-foreground mb-1">Labor cost</p>
                                            <p className="font-bold text-sm text-primary tabular-nums">{format(totalLaborCost)}</p>
                                        </div>
                                        <div className="rounded-lg bg-muted/50 p-3 text-center">
                                            <p className="text-xs text-muted-foreground mb-1">Energy cost</p>
                                            <p className="font-bold text-sm text-primary tabular-nums">{format(totalEnergyCost)}</p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-base">Equipment Required</CardTitle>
                                    <CardDescription className="text-xs">{selectedEquipment.size} item{selectedEquipment.size !== 1 ? "s" : ""} selected</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {equipment.filter(e => e.status !== "Retired").map(eq => (
                                            <label key={eq.id} className="flex items-center gap-3 p-2.5 border rounded-lg hover:bg-accent cursor-pointer transition-colors">
                                                <Checkbox checked={selectedEquipment.has(eq.id)} onCheckedChange={() => toggleEquipment(eq.id)} />
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
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-base">Preparation Instructions</CardTitle>
                                    <CardDescription className="text-xs">Step-by-step Standard Operating Procedure</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <Textarea
                                        className="min-h-[280px] font-mono text-sm"
                                        placeholder={"1. Prepare all ingredients...\n2. Heat the wok to high...\n3. Add oil and..."}
                                        value={instructions}
                                        onChange={e => setInstructions(e.target.value)}
                                    />
                                    <p className="text-xs text-muted-foreground mt-2">
                                        {instructions.split("\n").filter(Boolean).length} steps written
                                    </p>
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>
                </div>

                {/* Right: Cost Sidebar (desktop only) */}
                <div className="hidden lg:block">
                    <div className="sticky top-6">
                        <CostSidebar />
                    </div>
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
