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
    duplicate: (id: string) => apiFetch<RecipeWithIngredients>(`/recipes/${id}/duplicate`, { method: "POST" }),
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

// ─── Inventory ────────────────────────────────────────────────────────────────
export const inventoryApi = {
    list:    ()  => apiFetch<InventoryItem[]>("/inventory"),
    get:     (id: string) => apiFetch<InventoryItem>(`/inventory/${id}`),
    create:  (data: { ingredientId: string; currentStock?: number; parMin?: number; parMax?: number; reorderPoint?: number; leadTimeDays?: number }) =>
        apiFetch<InventoryItem>("/inventory", { method: "POST", body: JSON.stringify(data) }),
    update:  (id: string, data: Partial<Pick<InventoryItem, "parMin" | "parMax" | "reorderPoint" | "leadTimeDays" | "holdingDays" | "currentStock">>) =>
        apiFetch<InventoryItem>(`/inventory/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete:  (id: string) => apiFetch<void>(`/inventory/${id}`, { method: "DELETE" }),

    transactions: (params?: { type?: string; ingredientId?: string; from?: string; to?: string; limit?: number }) => {
        const q = new URLSearchParams();
        if (params?.type)         q.set("type",         params.type);
        if (params?.ingredientId) q.set("ingredientId", params.ingredientId);
        if (params?.from)         q.set("from",         params.from);
        if (params?.to)           q.set("to",           params.to);
        if (params?.limit)        q.set("limit",        String(params.limit));
        const qs = q.toString();
        return apiFetch<InventoryTransaction[]>(`/inventory/transactions${qs ? `?${qs}` : ""}`);
    },
    logTransaction: (data: {
        inventoryItemId: string; ingredientId: string; type: string;
        qty: number; unit: string; costPerUnit?: number; reason?: string;
        note?: string; date: string; recipeId?: string;
    }) => apiFetch<InventoryTransaction>("/inventory/transactions", { method: "POST", body: JSON.stringify(data) }),

    receive: (data: {
        ingredientId: string; purchaseQty: number; purchasePrice: number;
        date: string; note?: string; supplierId?: string;
        ingredientSupplierId?: string; // V3: select from linked suppliers
    }) => apiFetch<ReceiveGoodsResult>("/inventory/receive", { method: "POST", body: JSON.stringify(data) }),

    alerts: () => apiFetch<InventoryAlert[]>("/inventory/alerts"),
};

// ─── Ingredient Categories ────────────────────────────────────────────────────
export const ingredientCategoriesApi = {
    list: () => apiFetch<IngredientCategory[]>("/ingredient-categories"),
    create: (data: { name: string; description?: string; sortOrder?: number }) =>
        apiFetch<IngredientCategory>("/ingredient-categories", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Pick<IngredientCategory, "name" | "description" | "sortOrder">>) =>
        apiFetch<IngredientCategory>(`/ingredient-categories/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: string) => apiFetch<void>(`/ingredient-categories/${id}`, { method: "DELETE" }),
};

// ─── Category Permissions ─────────────────────────────────────────────────────
export const categoryPermissionsApi = {
    listForUser: (userId: string) =>
        apiFetch<UserCategoryPermission[]>(`/users/${userId}/category-permissions`),
    setForUser: (userId: string, permissions: { categoryId: string; canEdit: boolean }[]) =>
        apiFetch<UserCategoryPermission[]>(`/users/${userId}/category-permissions`, {
            method: "PUT",
            body: JSON.stringify({ permissions }),
        }),
};

// ─── Recipe Category Permissions ─────────────────────────────────────────────
export const recipeCategoryPermissionsApi = {
    listForUser: (userId: string) =>
        apiFetch<UserRecipeCategoryPermission[]>(`/users/${userId}/recipe-category-permissions`),
    setForUser: (userId: string, categoryIds: string[]) =>
        apiFetch<UserRecipeCategoryPermission[]>(`/users/${userId}/recipe-category-permissions`, {
            method: "PUT",
            body: JSON.stringify({ categoryIds }),
        }),
};

// ─── Storage Areas ───────────────────────────────────────────────────────────
export const storageAreasApi = {
    list: () => apiFetch<StorageArea[]>("/storage-areas"),
    create: (data: { name: string; temperature?: string; isActive?: boolean; sortOrder?: number }) =>
        apiFetch<StorageArea>("/storage-areas", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Pick<StorageArea, "name" | "temperature" | "isActive" | "sortOrder">>) =>
        apiFetch<StorageArea>(`/storage-areas/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: string) => apiFetch<void>(`/storage-areas/${id}`, { method: "DELETE" }),
};

// ─── Ingredient Suppliers ─────────────────────────────────────────────────────
export const ingredientSuppliersApi = {
    listForIngredient: (ingredientId: string) =>
        apiFetch<IngredientSupplier[]>(`/ingredient-suppliers?ingredientId=${ingredientId}`),
    create: (data: {
        ingredientId: string;
        supplierId: string;
        purchasePrice: number;
        purchaseUnit: string;
        conversionRate: number;
        isPreferred?: boolean;
        notes?: string;
    }) => apiFetch<IngredientSupplier>("/ingredient-suppliers", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Pick<IngredientSupplier, "purchasePrice" | "purchaseUnit" | "conversionRate" | "isPreferred" | "notes">>) =>
        apiFetch<IngredientSupplier>(`/ingredient-suppliers/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: string) => apiFetch<void>(`/ingredient-suppliers/${id}`, { method: "DELETE" }),
};

// ─── Audit Logs ───────────────────────────────────────────────────────────────
export const auditApi = {
    list: (params?: {
        userId?: string;
        action?: string;
        targetTable?: string;
        from?: string;
        to?: string;
        limit?: number;
    }) => {
        const q = new URLSearchParams();
        if (params?.userId)      q.set("userId",      params.userId);
        if (params?.action)      q.set("action",      params.action);
        if (params?.targetTable) q.set("targetTable", params.targetTable);
        if (params?.from)        q.set("from",        params.from);
        if (params?.to)          q.set("to",          params.to);
        if (params?.limit)       q.set("limit",       String(params.limit));
        const qs = q.toString();
        return apiFetch<AuditLog[]>(`/audit-logs${qs ? `?${qs}` : ""}`);
    },
};

// ─── Portion Standards ────────────────────────────────────────────────────────
export const portionStandardsApi = {
    list: () => apiFetch<PortionStandard[]>("/portion-standards"),
    create: (data: {
        ingredientId: string;
        itemName:     string;
        type?:        string;
        portionSize:  number;
        portionUnit:  string;
        notes?:       string;
    }) => apiFetch<PortionStandard>("/portion-standards", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Omit<PortionStandard, "id" | "ingredient" | "createdAt" | "updatedAt">>) =>
        apiFetch<PortionStandard>(`/portion-standards/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: string) => apiFetch<void>(`/portion-standards/${id}`, { method: "DELETE" }),
};

// ─── PMIX ─────────────────────────────────────────────────────────────────────
export const pmixApi = {
    listUploads: () => apiFetch<PmixUpload[]>("/pmix/uploads"),
    deleteUpload: (id: string) => apiFetch<void>(`/pmix/uploads?id=${id}`, { method: "DELETE" }),
    upload: (file: File, periodLabel?: string) => {
        const fd = new FormData();
        fd.append("file", file);
        if (periodLabel) fd.append("periodLabel", periodLabel);
        return fetch("/api/pmix/upload", { method: "POST", body: fd })
            .then(r => r.json()) as Promise<{ uploadId: string; totalItems: number; totalQty: number; totalSales: number }>;
    },
    analytics: (uploadId: string) => apiFetch<PmixAnalytics>(`/pmix/analytics?uploadId=${uploadId}`),
    syncSales: (uploadId: string, date: string, replace: boolean) =>
        apiFetch<{ synced: number; skipped: number; date: string; uploadId: string }>(
            "/pmix/sync-sales", { method: "POST", body: JSON.stringify({ uploadId, date, replace }) }
        ),
    syncStatus: (uploadId: string) =>
        apiFetch<{ uploadId: string; syncedDates: string[]; totalEntries: number }>(
            `/pmix/sync-sales?uploadId=${uploadId}`
        ),
    dailySummary: (uploadId: string) =>
        apiFetch<PmixDailySummary>(`/pmix/daily-summary?uploadId=${uploadId}`),
    trend: (limit = 10) =>
        apiFetch<{ trend: PmixTrendPoint[] }>(`/pmix/trend?limit=${limit}`),
    parSuggestions: (days = 30) =>
        apiFetch<ParSuggestionsResult>(`/inventory/par-suggestions?days=${days}`),
    applyParSuggestions: (items: { inventoryItemId: string; parMin: number; parMax: number; reorderPoint: number }[]) =>
        apiFetch<{ applied: number }>("/inventory/par-suggestions", { method: "POST", body: JSON.stringify({ items }) }),
    portionCalc: (uploadId: string) =>
        apiFetch<PortionCalcResult>(`/pmix/portion-calc?uploadId=${uploadId}`),
    ingredientSummary: (uploadId: string) =>
        apiFetch<IngredientSummaryResult>(`/pmix/ingredient-summary?uploadId=${uploadId}`),
    autoFillPortions: (data: {
        uploadId:    string;
        portionSize: number;
        portionUnit: string;
        scope:       "main" | "extra" | "both";
        createMissingIngredients?: boolean;
    }) => apiFetch<{
        created:             number;
        createdDetails:      { ingredientName: string; itemName: string }[];
        ingredientsCreated?: string[];
        skippedExisting:     number;
        skippedDetails:      string[];
        missingIngredients:  string[];
        portionSize:         number;
        portionUnit:         string;
        message?:            string;
    }>("/pmix/auto-fill-portions", { method: "POST", body: JSON.stringify(data) }),
};

// ─── Analysis ────────────────────────────────────────────────────────────────
export const analysisApi = {
    recipeCosts:  () => apiFetch<RecipeCostSummary[]>("/analysis/recipe-costs"),
    priceTrends:  (months = 6) => apiFetch<PriceTrendsResult>(`/analysis/price-trends?months=${months}`),
};

// ─── Sales ───────────────────────────────────────────────────────────────────
export const salesApi = {
    list: (date?: string) => apiFetch<SalesEntry[]>(`/sales${date ? `?date=${date}` : ""}`),
    create: (data: Omit<SalesEntry, "id" | "revenue" | "createdAt" | "updatedAt">) =>
        apiFetch<SalesEntry>("/sales", { method: "POST", body: JSON.stringify(data) }),
    delete: (id: string) => apiFetch<void>(`/sales/${id}`, { method: "DELETE" }),
    summary: (date?: string) => apiFetch<SalesSummary>(`/sales/summary${date ? `?date=${date}` : ""}`),
    trend: (days = 7, endDate?: string) =>
        apiFetch<{ trend: SalesTrend[]; latestDate: string | null }>(
            `/sales/trend?days=${days}${endDate ? `&endDate=${endDate}` : ""}`
        ),
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
    sku?: string | null;
    supplierId: string;
    supplier?: { id: string; name: string };
    purchaseUnit: string;
    purchasePrice: number;
    recipeUnit: string;
    yieldPercent: number;
    conversionRate: number;
    groupId: "Weight" | "Volume" | "Count";
    categoryId?: string | null;
    category?: IngredientCategory | null;
    storageAreaId?: string | null;
    storageArea?: StorageArea | null;
    averageCostPerBaseUnit?: number | null;
    ingredientSuppliers?: IngredientSupplier[];
    inventoryItem?: { currentStock: number; parMin: number } | null;
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
    deliveryPrice?: number | null;
    imageUrl?: string;
    isMainSauce: boolean;
    isSubRecipe?: boolean;   // default false on server
    linkedIngredientId?: string | null;
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

export interface InventoryItem {
    id: string;
    ingredientId: string;
    ingredient: Ingredient;
    currentStock: number;
    parMin: number;
    parMax: number;
    reorderPoint: number;
    leadTimeDays: number;
    holdingDays: number;       // CR: days of stock to hold (PAR Max calculation)
    lastCountDate?: string | null;
    createdAt?: string;
    updatedAt?: string;
}

export interface InventoryTransaction {
    id: string;
    inventoryItemId: string;
    ingredientId: string;
    ingredient?: { id: string; name: string; recipeUnit: string };
    type: "In" | "Out" | "Waste" | "Adjust" | "Stocktake";
    qty: number;
    unit: string;
    costPerUnit?: number | null;
    reason?: string | null;
    note?: string | null;
    date: string;
    recipeId?: string | null;
    createdAt?: string;
}

export interface InventoryAlert extends InventoryItem {
    status: "critical" | "low";
    qtyToOrder: number;
    suggestedSupplierId: string;
    suggestedSupplierName: string;
}

export interface ReceiveGoodsResult {
    inventoryItem: InventoryItem;
    stockAdded: number;
    priceAlert: boolean;
    priceChangePct: number;
}

export interface PriceTrendsResult {
    monthlyTrend:    Record<string, string | number>[];
    alerts:          PriceVarianceAlert[];
    ingredientNames: string[];
}

export interface PriceVarianceAlert {
    ingredient:   string;
    supplierId:   string;
    supplierName: string;
    prevPrice:    number;
    newPrice:     number;
    changePct:    number;
    date:         string;
}

export interface IngredientCategory {
    id:           string;
    name:         string;
    description?: string | null;
    sortOrder:    number;
    createdAt?:   string;
    updatedAt?:   string;
    _count?: { ingredients: number };
}

export interface UserCategoryPermission {
    id:         string;
    userId:     string;
    categoryId: string;
    category:   IngredientCategory;
    canEdit:    boolean;
    assignedAt: string;
}

export interface RecipeCategory {
    id:        string;
    name:      string;
    sortOrder: number;
}

export interface UserRecipeCategoryPermission {
    id:         string;
    userId:     string;
    categoryId: string;
    category:   RecipeCategory;
    assignedAt: string;
}

export interface AuditLog {
    id:          string;
    userId?:     string | null;
    userName?:   string | null;
    userEmail?:  string | null;
    userRole?:   string | null;
    action:      string;
    targetTable: string;
    targetId:    string;
    targetName?: string | null;
    oldValues?:  Record<string, unknown> | null;
    newValues?:  Record<string, unknown> | null;
    ipAddress?:  string | null;
    createdAt:   string;
}

export interface StorageArea {
    id:          string;
    name:        string;
    temperature?: string | null;
    isActive:    boolean;
    sortOrder:   number;
    createdAt?:  string;
    updatedAt?:  string;
    _count?: { ingredients: number };
}

export interface IngredientSupplier {
    id:             string;
    ingredientId:   string;
    supplierId:     string;
    supplier?:      { id: string; name: string };
    purchasePrice:  number;
    purchaseUnit:   string;
    conversionRate: number;
    isPreferred:    boolean;
    notes?:         string | null;
    createdAt?:     string;
    updatedAt?:     string;
}

// ─── PMIX Types ───────────────────────────────────────────────────────────────
export interface PmixUpload {
    id:          string;
    fileName:    string;
    periodLabel: string | null;
    totalItems:  number;
    totalQty:    number;
    totalSales:  number;
    uploadedAt:  string;
}

export type BcgQuadrant = "Star" | "Plowhorse" | "Puzzle" | "Dog";

export interface PmixBcgItem {
    id:        string;
    itemName:  string;
    category:  string;
    qtySold:   number;
    netSales:  number;
    unitPrice: number;
    quadrant:  BcgQuadrant;
    station:   string;
}

export interface PmixStationData {
    station:  string;
    totalQty: number;
    items: {
        name: string;
        qty:  number;
        modifiers: { group: string; modifier: string; qty: number }[];
    }[];
}

export interface PmixPrepItem {
    group:    string;
    modifier: string;
    qty:      number;
    items:    string[];
}

export interface PmixQcItem {
    id:             string;
    itemName:       string;
    category:       string;
    qtySold:        number;
    refundQty:      number;
    refundAmount:   number;
    discountAmount: number;
    totalLoss:      number;
    refundRate:     number;
    alert:          boolean;
}

export interface PmixConsumptionItem {
    ingredientId:   string;
    ingredientName: string;
    unit:           string;
    totalQty:       number;
    groupId:        string;
}

export interface PmixAnalytics {
    uploadId:   string;
    totalItems: number;
    totalQty:   number;
    totalSales: number;
    axis1: {
        items:   PmixBcgItem[];
        summary: {
            Star: number; Plowhorse: number; Puzzle: number; Dog: number;
            avgQty: number; avgPrice: number;
        };
    };
    axis2: {
        stations: PmixStationData[];
        prepList: PmixPrepItem[];
    };
    axis3: {
        items:          PmixQcItem[];
        donutData:      { name: string; value: number }[];
        totalRefunds:   number;
        totalDiscounts: number;
        totalLoss:      number;
        alerts:         PmixQcItem[];
        top5Refunded:   PmixQcItem[];
    };
    axis4: {
        consumption:   PmixConsumptionItem[];
        linkedItems:   { itemName: string; category: string; qtySold: number; recipeId: string }[];
        linkedCount:   number;
        unlinkedCount: number;
    };
}

// ─── CR: Daily Summary Types ──────────────────────────────────────────────────
export interface PmixDailySummaryIngredient {
    ingredientId:      string;
    ingredientName:    string;
    sku:               string | null;
    unit:              string;
    groupId:           string;
    categoryId:        string | null;
    categoryName:      string;
    totalRequiredQty:  number;
    topConsumingMenu:  { name: string; qty: number } | null;
    currentStock:      number | null;
    parMin:            number | null;
    parMax:            number | null;
    reorderPoint:      number | null;
    leadTimeDays:      number | null;
    holdingDays:       number | null;
    menuBreakdown:     { menuName: string; qtySold: number; ingredientQty: number }[];
    isBelowPar:        boolean;
}

export interface PmixDailySummaryCategory {
    categoryId:   string | null;
    categoryName: string;
    sortOrder:    number;
    ingredients:  PmixDailySummaryIngredient[];
}

export interface PmixDailySummary {
    uploadId:        string;
    periodLabel:     string | null;
    uploadedAt:      string;
    categories:      PmixDailySummaryCategory[];
    linkedCount:     number;
    unlinkedCount:   number;
    totalIngredients: number;
}

export interface PmixTrendPoint {
    uploadId:        string;
    label:           string;
    uploadedAt:      string;
    totalIngQty:     number;
    totalMenuQty:    number;
    linkedMenuItems: number;
}

// ─── CR: PAR Suggestion Types ─────────────────────────────────────────────────
export interface ParSuggestion {
    inventoryItemId:  string;
    ingredientId:     string;
    ingredientName:   string;
    sku:              string | null;
    unit:             string;
    groupId:          string;
    categoryId:       string | null;
    categoryName:     string;
    daysAnalyzed:     number;
    totalOutQty:      number;
    adu:              number;
    hasHistory:       boolean;
    currentParMin:    number;
    currentParMax:    number;
    currentROP:       number;
    leadTimeDays:     number;
    holdingDays:      number;
    currentStock:     number;
    suggestedParMin:  number | null;
    suggestedROP:     number | null;
    suggestedParMax:  number | null;
}

export interface ParSuggestionsResult {
    days:         number;
    cutoffDate:   string;
    suggestions:  ParSuggestion[];
    totalTracked: number;
    withHistory:  number;
}

// ─── Portion Standards Types ──────────────────────────────────────────────────
export interface PortionStandard {
    id:           string;
    ingredientId: string;
    ingredient?:  {
        id: string; name: string; sku?: string | null; recipeUnit: string; groupId: string;
        categoryId?: string | null;
        category?: { id: string; name: string; sortOrder: number } | null;
    };
    itemName:     string;
    type:         "base" | "modifier";
    portionSize:  number;
    portionUnit:  string;
    notes?:       string | null;
    createdAt?:   string;
    updatedAt?:   string;
}

export interface PortionCalcIngredient {
    ingredientId:      string;
    ingredientName:    string;
    sku:               string | null;
    unit:              string;
    groupId:           string;
    categoryId:        string | null;
    categoryName:      string;
    categorySortOrder: number;
    currentStock:      number | null;
    parMin:            number | null;
    totalQty:          number;
    contributions: {
        source:      string;
        sourceType:  "base" | "modifier";
        qtySold:     number;
        portionSize: number;
        portionUnit: string;
        totalQty:    number;
    }[];
}

export interface PortionCalcCategory {
    categoryId:   string | null;
    categoryName: string;
    sortOrder:    number;
    ingredients:  PortionCalcIngredient[];
}

export interface PortionCalcResult {
    uploadId:       string;
    periodLabel:    string | null;
    uploadedAt:     string;
    categories:     PortionCalcCategory[];
    ingredients:    PortionCalcIngredient[];
    coverage: {
        matched:    number;
        unmatched:  string[];
        totalItems: number;
    };
    hasStandards:   boolean;
    totalStandards: number;
}

// ─── Ingredient Use Summary Types ─────────────────────────────────────────────
export interface IngredientSummaryProteinByType {
    proteinType:    string;
    qty:            number;
    totalUsed:      number | null;   // qty × portionSize from PortionStandard (null if no standard)
    portionSize:    number | null;
    portionUnit:    string | null;
    ingredientName: string | null;
}

export interface IngredientSummaryProteinByDish {
    category:    string;
    dish:        string;
    proteinType: string;
    qty:         number;
}

export interface IngredientSummaryResult {
    uploadId:     string;
    periodLabel:  string | null;
    uploadedAt:   string;
    mainProtein: {
        byType:     IngredientSummaryProteinByType[];
        byDish:     IngredientSummaryProteinByDish[];
        total:      number;
        groupNames: string[];
    };
    extraProtein: {
        byType:     IngredientSummaryProteinByType[];
        byDish:     IngredientSummaryProteinByDish[];
        total:      number;
        groupNames: string[];
    };
    hasProteinData: boolean;
}
