/**
 * Type-safe API client for the Chiang Mai BOH backend.
 * Use these functions in client components instead of importing mock-data.
 */

const base = "/api";

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${base}${path}`, {
        headers: { "Content-Type": "application/json" },
        ...options,
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? `API error ${res.status}`);
    }
    if (res.status === 204) return undefined as unknown as T;
    return res.json();
}

// ─── Suppliers ───────────────────────────────────────────────────────────────
export const suppliersApi = {
    list: () => apiFetch<Supplier[]>("/suppliers"),
    get: (id: string) => apiFetch<Supplier>(`/suppliers/${id}`),
    create: (data: Omit<Supplier, "id" | "createdAt" | "updatedAt">) =>
        apiFetch<Supplier>("/suppliers", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Supplier>) =>
        apiFetch<Supplier>(`/suppliers/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: string) => apiFetch<void>(`/suppliers/${id}`, { method: "DELETE" }),
};

// ─── Ingredients ─────────────────────────────────────────────────────────────
export const ingredientsApi = {
    list: (group?: string) => apiFetch<Ingredient[]>(`/ingredients${group ? `?group=${group}` : ""}`),
    get: (id: string) => apiFetch<Ingredient>(`/ingredients/${id}`),
    create: (data: Omit<Ingredient, "id" | "createdAt" | "updatedAt">) =>
        apiFetch<Ingredient>("/ingredients", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Ingredient>) =>
        apiFetch<Ingredient>(`/ingredients/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: string) => apiFetch<void>(`/ingredients/${id}`, { method: "DELETE" }),
};

// ─── Equipment ───────────────────────────────────────────────────────────────
export const equipmentApi = {
    list: () => apiFetch<Equipment[]>("/equipment"),
    get: (id: string) => apiFetch<Equipment>(`/equipment/${id}`),
    create: (data: Omit<Equipment, "id" | "createdAt" | "updatedAt">) =>
        apiFetch<Equipment>("/equipment", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Equipment>) =>
        apiFetch<Equipment>(`/equipment/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: string) => apiFetch<void>(`/equipment/${id}`, { method: "DELETE" }),
};

// ─── Recipes ─────────────────────────────────────────────────────────────────
export const recipesApi = {
    list: (category?: string) => apiFetch<RecipeWithIngredients[]>(`/recipes${category ? `?category=${category}` : ""}`),
    get: (id: string) => apiFetch<RecipeWithIngredients>(`/recipes/${id}`),
    create: (data: Omit<Recipe, "id" | "createdAt" | "updatedAt"> & { ingredients?: { ingredientId: string; quantity: number }[] }) =>
        apiFetch<RecipeWithIngredients>("/recipes", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Recipe>) =>
        apiFetch<RecipeWithIngredients>(`/recipes/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: string) => apiFetch<void>(`/recipes/${id}`, { method: "DELETE" }),
    getIngredients: (id: string) => apiFetch<RecipeIngredientRow[]>(`/recipes/${id}/ingredients`),
    setIngredients: (id: string, rows: { ingredientId: string; quantity: number }[]) =>
        apiFetch<RecipeIngredientRow[]>(`/recipes/${id}/ingredients`, { method: "PUT", body: JSON.stringify(rows) }),
};

// ─── Purchase History ─────────────────────────────────────────────────────────
export const purchaseApi = {
    list: (supplierId?: string) => apiFetch<PurchaseRecord[]>(`/purchase-history${supplierId ? `?supplierId=${supplierId}` : ""}`),
    get: (id: string) => apiFetch<PurchaseRecord>(`/purchase-history/${id}`),
    create: (data: Omit<PurchaseRecord, "id" | "createdAt" | "updatedAt" | "supplier">) =>
        apiFetch<PurchaseRecord>("/purchase-history", { method: "POST", body: JSON.stringify(data) }),
    delete: (id: string) => apiFetch<void>(`/purchase-history/${id}`, { method: "DELETE" }),
};

// ─── Analysis ────────────────────────────────────────────────────────────────
export const analysisApi = {
    recipeCosts: () => apiFetch<RecipeCostSummary[]>("/analysis/recipe-costs"),
};

// ─── Sales ───────────────────────────────────────────────────────────────────
export const salesApi = {
    list: (date?: string) => apiFetch<SalesEntry[]>(`/sales${date ? `?date=${date}` : ""}`),
    create: (data: Omit<SalesEntry, "id" | "revenue" | "createdAt" | "updatedAt">) =>
        apiFetch<SalesEntry>("/sales", { method: "POST", body: JSON.stringify(data) }),
    delete: (id: string) => apiFetch<void>(`/sales/${id}`, { method: "DELETE" }),
    summary: (date?: string) => apiFetch<SalesSummary>(`/sales/summary${date ? `?date=${date}` : ""}`),
    trend: (days = 7) => apiFetch<SalesTrend[]>(`/sales/trend?days=${days}`),
};

// ─── Shared Types (match Prisma output) ─────────────────────────────────────
export interface Supplier {
    id: string;
    name: string;
    contact: string;
    email: string;
    phone: string;
    address: string;
    status: "Active" | "Inactive";
    isSpecial: boolean;
    createdAt?: string;
    updatedAt?: string;
}

export interface Ingredient {
    id: string;
    name: string;
    supplierId: string;
    supplier?: { id: string; name: string };
    purchaseUnit: string;
    purchasePrice: number;
    recipeUnit: string;
    yieldPercent: number;
    conversionRate: number;
    groupId: "Weight" | "Volume" | "Count";
    imageUrl?: string | null;
    createdAt?: string;
    updatedAt?: string;
}

export interface Equipment {
    id: string;
    name: string;
    type: string;
    status: "Available" | "Maintenance" | "Retired";
    createdAt?: string;
    updatedAt?: string;
}

export interface Recipe {
    id: string;
    name: string;
    category: string;
    yieldAmount: number;
    yieldUnit: string;
    prepTime: number;
    cookTime: number;
    laborCostPerHour: number;
    energyCostPerBatch: number;
    sellingPrice?: number | null;
    imageUrl?: string;
    isMainSauce: boolean;
    instructions?: string;
    createdAt?: string;
    updatedAt?: string;
}

export interface RecipeIngredientRow {
    id: string;
    recipeId: string;
    ingredientId: string;
    ingredient: Ingredient;
    quantity: number;
}

export interface RecipeWithIngredients extends Recipe {
    ingredients: RecipeIngredientRow[];
}

export interface PurchaseRecord {
    id: string;
    date: string;
    supplierId: string;
    supplier?: { id: string; name: string };
    ingredient: string;
    qty: number;
    unit: string;
    unitPrice: number;
    total: number;
    createdAt?: string;
    updatedAt?: string;
}

export interface SalesEntry {
    id: string;
    date: string;
    recipeId?: string | null;
    recipeName: string;
    qty: number;
    unitPrice: number;
    revenue: number;
    unitCost?: number | null;
    notes?: string | null;
    createdAt?: string;
    updatedAt?: string;
}

export interface SalesSummary {
    date: string;
    totalRevenue: number;
    totalCost: number;
    grossProfit: number;
    foodCostPct: number;
    grossProfitPct: number;
    itemsSold: number;
    topMenus: { recipeName: string; qty: number; revenue: number }[];
}

export interface SalesTrend {
    date: string;
    revenue: number;
    cost: number;
    profit: number;
}

export interface RecipeCostSummary {
    id: string;
    name: string;
    category: string;
    totalCost: number;
    ingredientCost: number;
    laborCost: number;
    energyCost: number;
    costPerYield: number;
}
