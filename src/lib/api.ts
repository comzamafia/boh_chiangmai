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
        const e   = err as { error?: string; details?: string; stage?: string };
        // Prefer details if present (richer diagnostic from notifications/test)
        const msg = e.details ?? e.error ?? `API error ${res.status}`;
        const stage = e.stage ? ` [stage: ${e.stage}]` : "";
        throw new Error(`${msg}${stage}`);
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
    update:  (id: string, data: Partial<Pick<InventoryItem, "parMin" | "parMax" | "reorderPoint" | "leadTimeDays" | "holdingDays" | "currentStock" | "packUnit" | "packSize">>) =>
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

    ingredientTrend: (days = 7, types = "Out,Waste", top = 30) =>
        apiFetch<IngredientTrendResult>(
            `/inventory/ingredient-trend?days=${days}&types=${encodeURIComponent(types)}&top=${top}`,
            { cache: "no-store" },
        ),
};

// ─── Purchase Orders ──────────────────────────────────────────────────────────
export type POStatus = "Draft" | "Sent" | "Received" | "Cancelled";

export interface PurchaseOrderItemDTO {
    id?:             string;
    ingredientId?:   string | null;
    ingredientName:  string;
    qty:             number;
    unit:            string;
    unitPrice:       number;
    total:           number;
    receivedQty?:    number | null;   // actual qty received (null = not yet received)
}

export interface PoReceiveResult {
    ingredientName: string;
    orderedQty:     number;
    receivedQty:    number;
    variance:       number;
    stockAdded:     number | null;
    priceAlert:     boolean;
}

export interface PurchaseOrder {
    id:           string;
    poNumber:     string;
    supplierId:   string;
    supplierName: string;
    status:       POStatus;
    orderDate:    string;
    deliveryDate: string | null;
    notes:        string | null;
    grandTotal:   number;
    createdById?: string | null;
    createdAt:    string;
    updatedAt:    string;
    items:        PurchaseOrderItemDTO[];
}

export interface PurchaseOrderInput {
    supplierId:   string;
    supplierName: string;
    status?:      POStatus;
    orderDate:    string;
    deliveryDate?: string | null;
    notes?:       string | null;
    items:        Omit<PurchaseOrderItemDTO, "id" | "total">[];
}

export const purchaseOrdersApi = {
    list:   () => apiFetch<PurchaseOrder[]>("/purchase-orders"),
    get:    (id: string) => apiFetch<PurchaseOrder>(`/purchase-orders/${id}`),
    create: (data: PurchaseOrderInput) =>
        apiFetch<PurchaseOrder>("/purchase-orders", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<{ status: POStatus; deliveryDate: string | null; notes: string | null; orderDate: string; items: Omit<PurchaseOrderItemDTO, "id" | "total">[] }>) =>
        apiFetch<PurchaseOrder>(`/purchase-orders/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: string) => apiFetch<void>(`/purchase-orders/${id}`, { method: "DELETE" }),
    receive: (id: string, payload: { date: string; lines: { itemId: string; receivedQty: number; unitPrice?: number }[] }) =>
        apiFetch<{
            purchaseOrder: PurchaseOrder;
            results: PoReceiveResult[];
            receivedLines: number;
            anyPriceAlert: boolean;
        }>(`/purchase-orders/${id}/receive`, { method: "POST", body: JSON.stringify(payload) }),
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
    update: (id: string, data: Partial<Pick<StorageArea,
        "name" | "temperature" | "isActive" | "sortOrder" |
        "notifyEnabled" | "alertThreshold" | "digestSchedule" | "digestHourLocal" | "digestDayOfWeek"
    >>) =>
        apiFetch<StorageArea>(`/storage-areas/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: string) => apiFetch<void>(`/storage-areas/${id}`, { method: "DELETE" }),

    // Watchers
    listWatchers: (id: string) =>
        apiFetch<StorageAreaWatcher[]>(`/storage-areas/${id}/watchers`),
    addWatcher: (id: string, data: { userId: string; role?: "owner" | "watcher"; ccOnly?: boolean; alertThreshold?: string; digestSchedule?: string }) =>
        apiFetch<StorageAreaWatcher>(`/storage-areas/${id}/watchers`, { method: "POST", body: JSON.stringify(data) }),
    removeWatcher: (id: string, userId: string) =>
        apiFetch<void>(`/storage-areas/${id}/watchers?userId=${encodeURIComponent(userId)}`, { method: "DELETE" }),
};

// ─── Users (lite — for watcher pickers) ──────────────────────────────────────
export interface User {
    id:          string;
    name:        string;
    email:       string;
    role:        string;
    department?: string | null;
    isActive:    boolean;
    permissions?: string[];
    createdAt?:  string;
}

export const usersApi = {
    list: () => apiFetch<User[]>("/users"),
};

// ─── Notifications ───────────────────────────────────────────────────────────
export const notificationsApi = {
    list: (params?: { type?: string; storageAreaId?: string; status?: string; limit?: number }) => {
        const q = new URLSearchParams();
        if (params?.type)          q.set("type",          params.type);
        if (params?.storageAreaId) q.set("storageAreaId", params.storageAreaId);
        if (params?.status)        q.set("status",        params.status);
        if (params?.limit)         q.set("limit",         String(params.limit));
        const qs = q.toString();
        return apiFetch<NotificationLogEntry[]>(`/notifications${qs ? `?${qs}` : ""}`);
    },
    sendTest: (data: { storageAreaId: string; type: "digest" | "critical" }) =>
        apiFetch<{ ok: boolean; message: string }>("/notifications/test", { method: "POST", body: JSON.stringify(data) }),
    runDigestNow: (cadence: "daily" | "weekly" = "daily") =>
        apiFetch<{ areasChecked: number; areasSent: number; totalItems: number; sent: number; skipped: number; failed: number }>(`/notifications/run-digest?cadence=${cadence}`, { method: "POST" }),
    runOrderReminders: (hours = 14) =>
        apiFetch<{ suppliersChecked: number; suppliersDue: number; suppliersNotified: number; totalItems: number; sent: number; skipped: number; failed: number }>(`/notifications/run-order-reminders?hours=${hours}`, { method: "POST" }),
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
    import: (rows: { ingredient: string; itemName: string; type?: string; portionSize: number | string; portionUnit: string; notes?: string }[]) =>
        apiFetch<{ created: number; updated: number; errors: { row: number; reason: string }[] }>(
            "/portion-standards/import", { method: "POST", body: JSON.stringify({ rows }) }),
};

// ─── PMIX Item Rules ──────────────────────────────────────────────────────────
export interface PmixItemRule {
    id:        string;
    pattern:   string;
    matchType: string;
    category:  string;
    label:     string | null;
    priority:  number;
    isActive:  boolean;
    notes:     string | null;
    createdAt: string;
    updatedAt: string;
}

export const itemRulesApi = {
    list: () => apiFetch<PmixItemRule[]>("/pmix/item-rules"),
    create: (data: Partial<PmixItemRule>) =>
        apiFetch<PmixItemRule>("/pmix/item-rules", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<PmixItemRule>) =>
        apiFetch<PmixItemRule>(`/pmix/item-rules/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    remove: (id: string) => apiFetch<{ ok: boolean }>(`/pmix/item-rules/${id}`, { method: "DELETE" }),
};

// ─── PMIX ─────────────────────────────────────────────────────────────────────
export const pmixApi = {
    listUploads: () => apiFetch<PmixUpload[]>("/pmix/uploads"),
    deleteUpload: (id: string) => apiFetch<void>(`/pmix/uploads?id=${id}`, { method: "DELETE" }),
    updateUpload: (id: string, data: { businessDate?: string | null; periodLabel?: string | null }) =>
        apiFetch<PmixUpload>(`/pmix/uploads/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    analytics: (uploadId: string) => apiFetch<PmixAnalytics>(`/pmix/analytics?uploadId=${uploadId}`),
    syncSales: (uploadId: string, date: string, replace: boolean) =>
        apiFetch<{ synced: number; skipped: number; date: string; uploadId: string }>(
            "/pmix/sync-sales", { method: "POST", body: JSON.stringify({ uploadId, date, replace }) }
        ),
    syncStatus: (uploadId: string) =>
        apiFetch<{ uploadId: string; syncedDates: string[]; totalEntries: number }>(
            `/pmix/sync-sales?uploadId=${uploadId}`
        ),
    /** Deduct ingredients from inventory based on recipe BOM (idempotent). */
    depleteInventory: (uploadId: string, date: string) =>
        apiFetch<{
            depleted: number;
            lines: { name: string; qty: number; unit: string }[];
            skippedNotTracked?: number;
            message?: string;
        }>("/pmix/deplete-inventory", { method: "POST", body: JSON.stringify({ uploadId, date }) }),
    dailySummary: (uploadId: string) =>
        apiFetch<PmixDailySummary>(`/pmix/daily-summary?uploadId=${uploadId}`),
    trend: (limit = 10) =>
        apiFetch<{ trend: PmixTrendPoint[] }>(`/pmix/trend?limit=${limit}`),
    parSuggestions: (days = 7) =>
        // Cache-bust so we always recompute against the latest PMIX + transactions
        apiFetch<ParSuggestionsResult>(`/inventory/par-suggestions?days=${days}&_t=${Date.now()}`, { cache: "no-store" }),
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

    // ── History / Calendar ───────────────────────────────────────────────────
    calendar: (month?: string) =>
        apiFetch<PmixCalendarDay[]>(`/pmix/uploads/calendar${month ? `?month=${month}` : ""}`),

    rangeAnalytics: (from: string, to: string) =>
        apiFetch<PmixRangeResult>(`/pmix/analytics/range?from=${from}&to=${to}`),

    proteinDaily: (protein: string, from: string, to: string) =>
        apiFetch<ProteinDailyResult>(
            `/pmix/analytics/protein-daily?protein=${encodeURIComponent(protein)}&from=${from}&to=${to}`
        ),

    dessertDaily: (item: string, from: string, to: string) =>
        apiFetch<DessertDailyResult>(
            `/pmix/analytics/dessert-daily?item=${encodeURIComponent(item)}&from=${from}&to=${to}`
        ),

    beverageDaily: (group: string, from: string, to: string) =>
        apiFetch<BeverageDailyResult>(
            `/pmix/analytics/beverage-daily?group=${encodeURIComponent(group)}&from=${from}&to=${to}`
        ),

    curryDaily: (group: string, from: string, to: string) =>
        apiFetch<CurryDailyResult>(
            `/pmix/analytics/curry-daily?group=${encodeURIComponent(group)}&from=${from}&to=${to}`
        ),

    dashboard: (uploadId: string) =>
        apiFetch<PmixDashboardResult>(
            `/pmix/dashboard?uploadId=${encodeURIComponent(uploadId)}`,
            { cache: "no-store" },
        ),

    dashboardRange: (from: string, to: string) =>
        apiFetch<PmixDashboardResult>(
            `/pmix/dashboard?from=${from}&to=${to}`,
            { cache: "no-store" },
        ),

    proteinHeatmap: (days = 7) =>
        apiFetch<ProteinHeatmapResult>(
            `/pmix/analytics/protein-heatmap?days=${days}`,
            { cache: "no-store" },
        ),

    dessertHeatmap: (days = 7) =>
        apiFetch<DessertHeatmapResult>(
            `/pmix/analytics/dessert-heatmap?days=${days}`,
            { cache: "no-store" },
        ),

    beverageHeatmap: (days = 7, top = 30) =>
        apiFetch<BeverageHeatmapResult>(
            `/pmix/analytics/beverage-heatmap?days=${days}&top=${top}`,
            { cache: "no-store" },
        ),

    curryHeatmap: (days = 7) =>
        apiFetch<CurryHeatmapResult>(
            `/pmix/analytics/curry-heatmap?days=${days}`,
            { cache: "no-store" },
        ),

    upload: (file: File, periodLabel?: string, businessDate?: string, replaceExisting?: boolean) => {
        const fd = new FormData();
        fd.append("file", file);
        if (periodLabel)     fd.append("periodLabel",  periodLabel);
        if (businessDate)    fd.append("businessDate", businessDate);
        if (replaceExisting) fd.append("replaceExisting", "true");
        return fetch("/api/pmix/upload", { method: "POST", body: fd })
            .then(async r => {
                const body = await r.json().catch(() => ({}));
                return { status: r.status, ...body } as {
                    status: number;
                    uploadId?: string;
                    totalItems?: number; totalQty?: number; totalSales?: number;
                    businessDate?: string | null;
                    replaced?: number;
                    duplicate?: boolean; existingCount?: number;
                    error?: string;
                };
            });
    },
};

// ─── Analysis ────────────────────────────────────────────────────────────────
export const analysisApi = {
    recipeCosts:  () => apiFetch<RecipeCostSummary[]>("/analysis/recipe-costs"),
    priceTrends:  (months = 6) => apiFetch<PriceTrendsResult>(`/analysis/price-trends?months=${months}`),
};

// ─── Food Cost Variance ───────────────────────────────────────────────────────
export interface FoodCostVarianceRow {
    ingredientId:  string;
    name:          string;
    category:      string;
    unit:          string;
    salesUsage:    number;   // sales-driven (autodeplete) usage
    manualOut:     number;   // manual Out
    wasteQty:      number;
    countVariance: number;   // signed (negative = shrinkage)
    received:      number;
    unitCost:      number;
    lossQty:       number;   // waste + shrinkage
    lossValue:     number;   // loss × unitCost
}
export interface FoodCostVarianceResult {
    from:   string;
    to:     string;
    items:  FoodCostVarianceRow[];
    totals: { wasteValue: number; shrinkageValue: number; lossValue: number; salesUsageValue: number };
}
export const reportsApi = {
    foodCostVariance: (from: string, to: string) =>
        apiFetch<FoodCostVarianceResult>(
            `/reports/food-cost-variance?from=${from}&to=${to}`,
            { cache: "no-store" },
        ),
};

// ─── Prep List ────────────────────────────────────────────────────────────────
export interface PrepStation {
    id:        string;
    name:      string;
    icon:      string;
    color:     string;
    sortOrder: number;
    memberIds?: string[];
}
export const prepStationsApi = {
    list:   () => apiFetch<PrepStation[]>("/prep-stations", { cache: "no-store" }),
    create: (data: { name: string; icon?: string; color?: string }) =>
        apiFetch<PrepStation>("/prep-stations", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<{ name: string; icon: string; color: string; sortOrder: number; memberIds: string[] }>) =>
        apiFetch<PrepStation>(`/prep-stations/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: string) =>
        fetch(`/api/prep-stations/${id}`, { method: "DELETE" })
            .then(async r => ({ status: r.status, ...(await r.json().catch(() => ({}))) } as { status: number; taskCount?: number; message?: string; error?: string })),
};

// ─── Loss Management (Admin) ────────────────────────────────────────────────
export interface LossDashboard {
    range: { from: string; to: string };
    kpis: {
        grossComplaintTotal: number; netComplaintTotal: number; undoTotal: number;
        complaintCount: number; undoCount: number; discountTotal: number;
        combinedNetLoss: number; highRiskCount: number; dataQualityIssues: number;
        genericCount: number; unassignedCount: number; uncategorizedCount: number; bulkCount: number;
    };
    byReason:  { category: string; count: number; net: number }[];
    topItems:  { item: string; count: number; net: number; isGeneric: boolean }[];
    byStaff:   { user: string; count: number; gross: number; net: number; undoCount: number; unassigned: boolean }[];
    byDevice:  { device: string; count: number; net: number }[];
    byZone:    { zone: string; count: number; net: number }[];
    undoPairs: { orderId: string; item: string; complaint: number; undo: number; net: number; reconciled: boolean; loop: boolean }[];
    orphanUndos: { orderId: string; item: string; complaint: number; undo: number; net: number; reconciled: boolean; loop: boolean }[];
    discountByCategory: { category: string; count: number; amount: number }[];
    discountByName: { name: string; category: string; count: number; amount: number }[];
    staffAuth: { authorizedBy: string; count: number; amount: number; types: string; riskCount: number; anon: boolean; mgr100: number }[];
    hourly: number[];
    highRisk: { time: string | null; displayId: string; name: string; amount: number; authorizedBy: string; reason: string }[];
    promotions: { name: string; count: number; amount: number }[];
    voids: { date: string; table: string; zone: string; orderId: string; item: string; action: string; gross: number; net: number; reason: string; reasonCategory: string; staff: string; device: string; reconciled: boolean }[];
    correlation: { orderId: string; date: string; table: string; zone: string; reasons: string; complaintAmount: number; discountTypes: string; discountAmount: number; sameStaff: boolean }[];
    daily: { date: string; netComplaint: number; discountTotal: number; combined: number; complaintCount: number; discountCount: number; highRisk: number; topReason: string; topStaff: string }[];
    periodAlignment: { complaintDays: number; discountDays: number; discMissingForComplaintDays: string[]; hasDiscountData: boolean; hasComplaintData: boolean };
    coverage: { date: string; hasComplaints: boolean; hasDiscounts: boolean; complaintCount: number; discountCount: number; uploadedAt: string }[];
}
export interface LossReasonRule { keyword: string; category: string }
export const lossApi = {
    upload: (filename: string, content: string) =>
        apiFetch<{ ok: boolean; type: string; date: string; imported: number; errors: string[] }>(
            "/loss/upload", { method: "POST", body: JSON.stringify({ filename, content }) }),
    dashboard: (from: string, to: string) =>
        apiFetch<LossDashboard>(`/loss/dashboard?from=${from}&to=${to}&_t=${Date.now()}`, { cache: "no-store" }),
    reasonMap: () => apiFetch<LossReasonRule[]>("/loss/reason-map", { cache: "no-store" }),
    uncategorized: () => apiFetch<{ reasonRaw: string; count: number; net: number }[]>("/loss/uncategorized", { cache: "no-store" }),
    saveReasonMap: (rows: LossReasonRule[]) =>
        apiFetch<{ ok: boolean; rules: number; reclassified: number }>("/loss/reason-map", { method: "PUT", body: JSON.stringify({ rows }) }),
    emailReport: (from: string, to: string) =>
        apiFetch<{ ok: boolean; sentTo: number }>("/loss/email-report", { method: "POST", body: JSON.stringify({ from, to }) }),
};

// ─── Server Performance (Admin) ─────────────────────────────────────────────
export interface ServerPerfRow {
    name: string; isStation: boolean; shifts: number; hours: number;
    netSales: number; grossSales: number; discount: number; discountPct: number;
    tips: number; tipPct: number; guests: number; orders: number;
    salesPerHour: number; avgPerGuest: number; avgPerOrder: number;
    foodSales: number; beverageSales: number; alcoholSales: number; dessertSales: number;
    foodCount: number; beverageCount: number; alcoholCount: number; dessertCount: number;
    drinkSales: number; foodPct: number; beveragePct: number; alcoholPct: number; dessertPct: number; drinkPct: number;
    dessertPer100: number; liquorPerGuest: number; score: number;
}
export interface ServerPerfResult {
    range: { from: string; to: string };
    servers: ServerPerfRow[];
    team: { servers: number; netSales: number; tips: number; guests: number; avgPerGuest: number; avgTipPct: number; avgDrinkPct: number; liquorPct: number; beveragePct: number; dessertPct: number };
    weights: Record<string, number>;
    coverage: { date: string; serverCount: number; uploadedAt: string }[];
}
export const serverPerfApi = {
    upload: (filename: string, content: string) =>
        apiFetch<{ ok: boolean; date: string; imported: number; servers: number }>(
            "/server-perf/upload", { method: "POST", body: JSON.stringify({ filename, content }) }),
    dashboard: (from: string, to: string) =>
        apiFetch<ServerPerfResult>(`/server-perf/dashboard?from=${from}&to=${to}&_t=${Date.now()}`, { cache: "no-store" }),
};

// ─── Usage Report (7-day, multi-unit) ───────────────────────────────────────
export interface UsageReportItem {
    label:        string;
    reportKey:    string;     // per-row chain key "<category>::<label>"
    byDow:        number[];   // Mon..Sun orders
    total:        number;
    ingredientId: string | null;
    portionSize:  number | null;
    portionUnit:  string | null;
    chain:        { base: string; relations: { from: string; qty: number; to: string }[] } | null;
}
export interface DessertDetailItem {
    itemName: string; byDow: number[]; total: number;
    flavours: { name: string; byDow: number[]; total: number }[];
    reportKey: string;
    chain: { base: string; relations: { from: string; qty: number; to: string }[] } | null;
}
export interface DessertSection {
    category: string;
    items: DessertDetailItem[];
}
export interface UsageReportResult {
    days: number;
    dowCounts: number[];
    protein:  UsageReportItem[];
    curry:    UsageReportItem[];
    beverage: UsageReportItem[];
    dessertSections: DessertSection[];
}
export interface ReportUnitChainRow {
    reportKey:    string;
    base:         string;
    relations:    { from: string; qty: number; to: string }[];
}
export const usageReportApi = {
    get: (days = 7) => apiFetch<UsageReportResult>(`/reports/usage?days=${days}&_t=${Date.now()}`, { cache: "no-store" }),
    chains: () => apiFetch<ReportUnitChainRow[]>("/report-unit-chains", { cache: "no-store" }),
    saveChain: (reportKey: string, base: string, relations: { from: string; qty: number; to: string }[]) =>
        apiFetch<{ ok: boolean }>("/report-unit-chains", { method: "PUT", body: JSON.stringify({ reportKey, base, relations }) }),
    ingredientUsage: (days = 7) =>
        apiFetch<IngredientUsageResult>(`/reports/ingredient-usage?days=${days}&_t=${Date.now()}`, { cache: "no-store" }),
    proteinUsage: (days = 7) =>
        apiFetch<ProteinReportResult>(`/reports/protein-usage?days=${days}&_t=${Date.now()}`, { cache: "no-store" }),
};

// ─── Protein display groups (Main Protein tab) ──────────────────────────────
export interface ProteinGroupMember { id?: string; ingredientId: string; ingredient?: { id: string; name: string; recipeUnit?: string } }
export interface ProteinGroup {
    id: string; name: string; sortOrder: number;
    members: ProteinGroupMember[];
}
export interface ProteinReportUnit { unit: string; byDow: number[]; total: number }
export interface ProteinReportMember {
    ingredientId: string; name: string;
    units: ProteinReportUnit[];
    sources: { label: string; via: string | null; unit: string; total: number }[];
}
export interface ProteinReportRow {
    id: string; name: string; grouped: boolean; sortOrder: number;
    units: ProteinReportUnit[];
    members: ProteinReportMember[];
    reportKey: string;
    chain: { base: string; relations: { from: string; qty: number; to: string }[] } | null;
}
export interface ProteinReportResult {
    days: number; dowCounts: number[];
    groups: ProteinReportRow[];
}
export interface ProteinQuickStartResult {
    groups: ProteinGroup[];
    assigned: { ingredient: string; group: string }[];
    unmatched: string[];
}
export const proteinGroupApi = {
    list: () => apiFetch<ProteinGroup[]>("/protein-groups", { cache: "no-store" }),
    create: (data: { name: string; sortOrder?: number; ingredientIds?: string[] }) =>
        apiFetch<ProteinGroup>("/protein-groups", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: { name?: string; sortOrder?: number; ingredientIds?: string[] }) =>
        apiFetch<ProteinGroup>(`/protein-groups/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: string) => apiFetch<void>(`/protein-groups/${id}`, { method: "DELETE" }),
    quickStart: (autoMap = true) =>
        apiFetch<ProteinQuickStartResult>("/protein-groups/quick-start", { method: "POST", body: JSON.stringify({ autoMap }) }),
};

// ─── Ingredient-level usage (aggregated across all dishes) ──────────────────
export interface IngredientUsageUnit { unit: string; byDow: number[]; total: number }
export interface IngredientUsageSource { label: string; via: string | null; unit: string; total: number }
export interface IngredientUsageRow {
    ingredientId: string;
    name: string;
    categoryName: string | null;
    isProtein: boolean;
    units: IngredientUsageUnit[];
    sources: IngredientUsageSource[];
    reportKey: string;
    chain: { base: string; relations: { from: string; qty: number; to: string }[] } | null;
}
export interface IngredientUsageResult {
    days: number;
    dowCounts: number[];
    ingredients: IngredientUsageRow[];
}

// ─── Composite sub-recipes + menu links (Usage Report calc settings) ────────
export interface CompositeComponent { id?: string; ingredientId: string; qty: number; unit: string; ingredient?: { id: string; name: string; recipeUnit?: string } }
export interface CompositeRecipe {
    id: string; name: string; yieldQty: number; yieldUnit: string; notes: string | null;
    components: CompositeComponent[];
}
export interface MenuCompositeLink {
    id: string; itemName: string; compositeId: string; qty: number; unit: string; notes: string | null;
    composite?: { id: string; name: string; yieldQty: number; yieldUnit: string };
}
export interface UsageAuditResult {
    havePmix: boolean;
    counts: { pmixItems: number; pmixModifiers: number };
    total: number;
    duplicates: { itemName: string; type: string; ingredientName: string; count: number }[];
    baseNameMismatch: { itemName: string; ingredientName: string }[];
    modifierNameMismatch: { itemName: string; ingredientName: string }[];
    linkNameMismatch: { itemName: string; compositeName: string }[];
}
export const usageSettingsApi = {
    audit: () => apiFetch<UsageAuditResult>(`/usage-settings/audit?_t=${Date.now()}`, { cache: "no-store" }),
};

export const compositeApi = {
    list:   () => apiFetch<CompositeRecipe[]>("/composites", { cache: "no-store" }),
    create: (body: Partial<CompositeRecipe>) => apiFetch<CompositeRecipe>("/composites", { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: Partial<CompositeRecipe>) => apiFetch<CompositeRecipe>(`/composites/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    remove: (id: string) => apiFetch<{ ok: boolean }>(`/composites/${id}`, { method: "DELETE" }),
    links:        () => apiFetch<MenuCompositeLink[]>("/menu-composite-links", { cache: "no-store" }),
    createLink:   (body: Partial<MenuCompositeLink>) => apiFetch<MenuCompositeLink>("/menu-composite-links", { method: "POST", body: JSON.stringify(body) }),
    updateLink:   (id: string, body: Partial<MenuCompositeLink>) => apiFetch<MenuCompositeLink>(`/menu-composite-links/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    removeLink:   (id: string) => apiFetch<{ ok: boolean }>(`/menu-composite-links/${id}`, { method: "DELETE" }),
};

// ─── Physical Stock Count (per storage area) ────────────────────────────────
export const stockCountApi = {
    areaCounts: (areaId: string) =>
        apiFetch<{ counts: Record<string, number>; lastCountedAt: string | null }>(`/stock-count?areaId=${encodeURIComponent(areaId)}`, { cache: "no-store" }),
    save: (areaId: string, counts: { ingredientId: string; recipeQty: number }[]) =>
        apiFetch<{ ok: boolean; updated: { ingredientId: string; currentStock: number }[] }>("/stock-count", { method: "POST", body: JSON.stringify({ areaId, counts }) }),
};

// ─── Station Prep Report ────────────────────────────────────────────────────
export interface ReportStation {
    id: string; name: string; icon: string; color: string; sortOrder: number;
    menus: string[];
}
export interface PmixMenuName {
    itemName: string; category: string; linked: boolean; totalQty: number;
}
export interface ReportIngredient {
    ingredientId: string; name: string;
    recipeUnit: string; groupId: string; conversionRate: number; purchaseUnit: string;
    reportUnit: string | null;  // saved preferred display unit
    byDate: number[];   // aligned to dates[]
    dowAvg: number[];   // Mon..Sun average per occurrence
    total: number;
    rop: number | null; // reorder point in recipe units
    menus: string[];
}
export interface StationReport {
    station: { id: string; name: string; icon: string; color: string };
    days: number;
    dates: string[];
    dowCounts: number[];
    ingredients: ReportIngredient[];
    unlinkedMenus: string[];
    assignedCount: number;
    linkedMenuCount: number;
}

export const reportStationsApi = {
    list:   () => apiFetch<ReportStation[]>("/report-stations", { cache: "no-store" }),
    create: (data: { name: string; icon?: string; color?: string }) =>
        apiFetch<ReportStation>("/report-stations", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<{ name: string; icon: string; color: string }>) =>
        apiFetch<ReportStation>(`/report-stations/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: string) =>
        fetch(`/api/report-stations/${id}`, { method: "DELETE" }).then(r => ({ ok: r.ok })),
    setMenus: (id: string, itemNames: string[]) =>
        apiFetch<{ ok: boolean; count: number; menus: string[] }>(`/report-stations/${id}/menus`, { method: "PUT", body: JSON.stringify({ itemNames }) }),
    report: (id: string, days: number) =>
        apiFetch<StationReport>(`/report-stations/${id}/report?days=${days}`, { cache: "no-store" }),
    menuNames: () => apiFetch<{ items: PmixMenuName[] }>("/pmix/menu-names", { cache: "no-store" }),
    setReportUnit: (ingredientId: string, unit: string | null) =>
        apiFetch<{ ok: boolean }>("/report-stations/report-unit", { method: "PUT", body: JSON.stringify({ ingredientId, unit }) }),
};

// ─── Prep Kanban board ──────────────────────────────────────────────────────
export interface PrepCard {
    id?:          string;   // board-task id (absent for Task List items)
    templateId:   string;
    name:         string;
    qty:          string | null;
    dueTime:      string | null;
    completedBy?: string | null;
    completedAt?: string | null;
}
export interface PrepBoardStation {
    id: string; name: string; icon: string; color: string;
    memberIds: string[];
    canManage: boolean;
    progress: number;
    taskList: PrepCard[];
    todo:     PrepCard[];
    complete: PrepCard[];
}
export interface PrepBoardResult {
    date: string;
    canPlan: boolean;
    stations: PrepBoardStation[];
}
export interface PrepStationFrequencyRow {
    station: string; task: string; daysScheduled: number; timesScheduled: number; timesCompleted: number;
}
export interface PrepStaffPerfRow {
    name: string; completed: number; daysActive: number; avgPerDay: number;
}
export interface PrepAnalyticsResult {
    from: string; to: string;
    stationFrequency: PrepStationFrequencyRow[];
    staffPerformance: PrepStaffPerfRow[];
}
export const prepApi = {
    board: (date: string) => apiFetch<PrepBoardResult>(`/prep/board?date=${date}`, { cache: "no-store" }),
    move:  (payload: { date: string; to: "todo" | "complete" | "tasklist"; templateId?: string; boardTaskId?: string }) =>
        apiFetch<{ ok: boolean; boardTaskId?: string }>("/prep/move", { method: "POST", body: JSON.stringify(payload) }),
    addTemplate: (data: { stationId: string; name: string; qty?: string; dueTime?: string }) =>
        apiFetch<{ id: string }>("/prep/templates", { method: "POST", body: JSON.stringify(data) }),
    bulkAddTemplates: (stationId: string, names: string[]) =>
        apiFetch<{ added: number; skipped: number }>("/prep/templates/bulk", { method: "POST", body: JSON.stringify({ stationId, names }) }),
    updateTemplate: (id: string, data: Partial<{ name: string; qty: string; dueTime: string; active: boolean }>) =>
        apiFetch<{ id: string }>(`/prep/templates/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    deleteTemplate: (id: string) => apiFetch<void>(`/prep/templates/${id}`, { method: "DELETE" }),
    reset: (date?: string) => apiFetch<{ ok: boolean; cleared: number }>("/prep/reset", { method: "POST", body: JSON.stringify({ date }) }),
    analytics: (from: string, to: string) => apiFetch<PrepAnalyticsResult>(`/prep/analytics?from=${from}&to=${to}`, { cache: "no-store" }),
};

export interface PrepTask {
    id:        string;
    date:      string;
    station:   string;
    name:      string;
    qty:       string | null;
    dueTime:   string | null;
    done:      boolean;
    doneBy:    string | null;
    doneAt:    string | null;
    sortOrder: number;
}
export const prepTasksApi = {
    list:   (date: string) => apiFetch<PrepTask[]>(`/prep-tasks?date=${date}`, { cache: "no-store" }),
    create: (data: { date: string; station: string; name: string; qty?: string; dueTime?: string }) =>
        apiFetch<PrepTask>("/prep-tasks", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<{ done: boolean; name: string; qty: string; dueTime: string; station: string }>) =>
        apiFetch<PrepTask>(`/prep-tasks/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: string) => apiFetch<void>(`/prep-tasks/${id}`, { method: "DELETE" }),
    copy:   (fromDate: string, toDate: string, overwrite = false) =>
        fetch("/api/prep-tasks/copy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fromDate, toDate, overwrite }) })
            .then(async r => ({ status: r.status, ...(await r.json().catch(() => ({}))) } as { status: number; copied?: number; toDate?: string; duplicate?: boolean; existingCount?: number; error?: string })),
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
    // Delivery schedule (drives lead-time calculation for PAR Min/ROP/Max)
    deliveryDays?:         number[];          // ISO weekdays 1..7
    orderCutoffTime?:      string | null;     // "HH:MM"
    orderCutoffDayOffset?: number;            // days before delivery
    deliveryTimeWindow?:   string | null;     // "08:00-10:00"
    minOrderValue?:        number | null;
    deliveryNotes?:        string | null;
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
    /** Pack / case counting layer — 1 pack = packSize purchaseUnits. */
    packUnit?: string | null;
    packSize?: number | null;
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

// ─── Ingredient 7-day usage trend ────────────────────────────────────────────
export interface IngredientTrendRow {
    ingredientId:   string;
    ingredientName: string;
    /** Display unit — purchaseUnit when it differs from recipeUnit, else recipeUnit */
    unit:           string;
    recipeUnit:     string;
    purchaseUnit:   string;
    conversionRate: number;
    category:       string;
    totalQty:       number;
    avgPerDay:      number;
    byDate:         number[];   // parallel to IngredientTrendResult.dates
    // Inventory fields for Flow + Action columns.
    // currentStock = 0 (not null) when no InventoryItem exists, so the UI
    // computes Bal = 0 − last-day sold and Order = +last-day sold.
    currentStock?:    number | null;
    parMin?:          number | null;
    /** True when there's an actual InventoryItem in the system. */
    inventoryTracked?: boolean;
}
export interface IngredientTrendResult {
    dates:  string[];           // YYYY-MM-DD, ascending
    items:  IngredientTrendRow[];
    days:   number;
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
    // Notification routing
    notifyEnabled?:   boolean;
    alertThreshold?:  "critical" | "reorder" | "any";
    digestSchedule?:  "off" | "realtime" | "daily" | "weekly";
    digestHourLocal?: number;
    digestDayOfWeek?: number | null;
    createdAt?:  string;
    updatedAt?:  string;
    _count?: { ingredients: number };
}

export interface StorageAreaWatcher {
    id:             string;
    storageAreaId:  string;
    userId:         string;
    user:           { id: string; name: string; email: string; role: string; department: string | null; isActive?: boolean };
    role:           "owner" | "watcher";
    alertThreshold: string | null;
    digestSchedule: string | null;
    ccOnly:         boolean;
    createdAt?:     string;
}

export interface NotificationLogEntry {
    id:             string;
    type:           string;
    storageAreaId:  string | null;
    ingredientId:   string | null;
    userId:         string | null;
    email:          string;
    subject:        string;
    status:         "queued" | "sent" | "failed" | "skipped";
    errorMsg:       string | null;
    dedupeKey:      string;
    sentAt:         string | null;
    createdAt:      string;
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
    id:           string;
    fileName:     string;
    periodLabel:  string | null;
    businessDate: string | null;  // "YYYY-MM-DD" or null for old records
    totalItems:   number;
    totalQty:     number;
    totalSales:   number;
    uploadedAt:   string;
}

export interface PmixCalendarDay {
    date:        string;   // "YYYY-MM-DD"
    uploadIds:   string[];
    count:       number;
    totalQty:    number;
    totalSales:  string;
    uploads:     { id: string; fileName: string; periodLabel: string | null; uploadedAt: string }[];
}

export interface PmixRangeTopItem {
    itemName:       string;
    category:       string;
    qtySold:        number;
    netSales:       string;
    grossSales:     string;
    refundQty:      number;
    refundAmount:   string;
    discountAmount: string;
    avgQtyPerDay:   number;
    avgSalesPerDay: number;
    /** Qty sold per day-of-week: index 0=Mon … 6=Sun */
    byDow?:         number[];
}

export interface PmixRangeDailyTrend {
    date:        string;
    netSales:    number;
    qtySold:     number;
    uploadCount: number;
}

export interface PmixRangeResult {
    uploadIds:         string[];
    dayCount:          number;
    uploadCount:       number;
    periodFrom:        string;
    periodTo:          string;
    totals: {
        qty:           number;
        grossSales:    string;
        netSales:      string;
        refundQty:     number;
        refundAmount:  string;
        avgSalesPerDay: number;
        avgQtyPerDay:  number;
    };
    topItems:          PmixRangeTopItem[];
    categoryBreakdown: { category: string; qtySold: number; netSales: string }[];
    dailyTrend:        PmixRangeDailyTrend[];
    proteinTotals: {
        proteinType:    string;
        qty:            number;
        avgQtyPerDay:   number;
        totalUsed:      number | null;
        portionSize:    number | null;
        portionUnit:    string | null;
        ingredientName: string | null;
        extraUsed?:     number;   // matching "Extra <Protein>" usage, folded in
    }[];
    ingredientSummary?: {
        mainProtein:  {
            byType: PmixRangeResult["proteinTotals"];
            byDish: { category: string; dish: string; proteinType: string; qty: number }[];
            total:  number;
            groupNames?: string[];
        };
        extraProtein: {
            byType: PmixRangeResult["proteinTotals"];
            byDish: { category: string; dish: string; proteinType: string; qty: number }[];
            total:  number;
            groupNames?: string[];
        };
        desserts?: {
            byItem: { itemName: string; qty: number; avgQtyPerDay?: number }[];
            total:  number;
        };
        beverages?: {
            byGroup: { group: string; qty: number; avgQtyPerDay?: number }[];
            total:   number;
        };
        curries?: {
            byGroup: { group: string; qty: number; avgQtyPerDay?: number }[];
            total:   number;
        };
        uncategorized?: { itemName: string; category: string; qty: number }[];
        hasProteinData: boolean;
    };
    lossItems?: { itemName: string; category: string; qtySold: number; refundQty: number; refundAmount: number; discountAmount: number }[];
    lossTotals?: { refundQty: number; refundAmount: number };
    modifierPrep?: { group: string; modifier: string; qty: number; avgQtyPerDay: number }[];
    bcg?: {
        items: { itemName: string; category: string; qtySold: number; netSales: number; unitPrice: number; quadrant: "Star" | "Plowhorse" | "Puzzle" | "Dog" }[];
        summary: { Star: number; Plowhorse: number; Puzzle: number; Dog: number; avgQty: number; avgPrice: number };
    };
    bom?: {
        consumption: { ingredientId: string; ingredientName: string; unit: string; totalQty: number; avgPerDay: number }[];
        linkedRecipes: number;
    };
    message?:          string;
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
    category:       string | null;  // ingredient food category (for grouping)
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
    /** Where the usage figure came from */
    usageSource?:     "transactions" | "pmix" | "none";
    currentParMin:    number;
    currentParMax:    number;
    currentROP:       number;
    leadTimeDays:     number;
    holdingDays:      number;
    currentStock:     number;
    suggestedParMin:  number | null;
    suggestedROP:     number | null;
    suggestedParMax:  number | null;
    // Purchase-unit conversion (1 purchaseUnit = conversionRate recipeUnits)
    purchaseUnit?:           string;
    conversionRate?:         number;
    aduPurchase?:            number | null;
    suggestedParMinPurchase?: number | null;
    suggestedROPPurchase?:    number | null;
    suggestedParMaxPurchase?: number | null;
    // Supplier-driven lead time
    supplierName?:           string | null;
    scheduleBasedLeadDays?:  number;
    scheduleEffectiveDays?:  number;
    scheduleFallback?:       boolean;
    nextDeliveryDate?:       string | null;
    nextOrderBy?:            string | null;
}

export interface ParSuggestionsResult {
    days:           number;
    cutoffDate:     string;
    suggestions:    ParSuggestion[];
    totalTracked:   number;
    withHistory:    number;
    pmixDataExists?: boolean;
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
    extraUsed?:     number;          // matching "Extra <Protein>" usage, folded in
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
    desserts: {
        byItem: { itemName: string; qty: number }[];
        total:  number;
    };
    beverages?: {
        byGroup: { group: string; qty: number }[];
        total:   number;
    };
    curries?: {
        byGroup: { group: string; qty: number }[];
        total:   number;
    };
    uncategorized: { itemName: string; category: string; qty: number }[];
    hasProteinData: boolean;
}

// ─── Protein daily calendar ───────────────────────────────────────────────────
export interface ProteinDailyDay {
    date:      string;         // YYYY-MM-DD
    qty:       number;         // total orders that day
    totalUsed: number | null;  // qty × portionSize (oz)
    lb:        number | null;  // totalUsed / 16
}
export interface ProteinDailyResult {
    protein:        string;
    portionSize:    number | null;
    portionUnit:    string | null;
    ingredientName: string | null;
    days:           ProteinDailyDay[];
}

// ─── Dessert daily calendar ───────────────────────────────────────────────────
export interface DessertDailyResult {
    item: string;
    days: { date: string; qty: number }[];
}

// ─── PMIX daily dashboard ────────────────────────────────────────────────────
export interface PmixDashboardResult {
    /** Set when this dashboard was loaded for a single upload. Null for range mode. */
    uploadId:      string | null;
    periodLabel:   string | null;
    /** ISO timestamp of the first business date in the window. */
    businessDate:  string;
    /** Date range params when in range mode (null for single-upload mode). */
    rangeFrom?:    string | null;
    rangeTo?:      string | null;
    /** Distinct calendar days that contributed data. */
    dayCount?:     number;
    uploadCount?:  number;
    totalSales:    number;
    totalQty:      number;
    macros: {
        FOOD:     { sales: number; qty: number; pct: number };
        LIQUOR:   { sales: number; qty: number; pct: number };
        BEVERAGE: { sales: number; qty: number; pct: number };
        DESSERT:  { sales: number; qty: number; pct: number };
    };
    /** Spotlight figure (not a KPI card) — subset of FOOD containing items
     *  whose POS category contains "Fried Rice". */
    friedRice?: { sales: number; qty: number; pct: number };
    topByCategory: {
        category: string;
        items:    { itemName: string; qty: number }[];
    }[];
    bar: {
        cocktails: { itemName: string; qty: number }[];
        mocktails: { itemName: string; qty: number }[];
        beer:      { itemName: string; qty: number }[];
        /** Non-alcoholic beverages that aren't already in Beer / Mocktails
         *  (sodas, juice, tea, coffee, water). */
        beverage:  { itemName: string; qty: number }[];
    };
    desserts: { itemName: string; qty: number }[];
    insights: string[];
    focus:    { title: string; emoji: string; body: string }[];
}

// ─── Protein usage heatmap (multi-protein, per-day) ──────────────────────────
export interface ProteinHeatmapRow {
    proteinType:     string;
    ingredientName:  string;
    unit:            string;
    totalOrders:     number;
    totalQty:        number;
    avgPerDay:       number;
    byDate:          number[];
    inventoryItemId: string | null;
    /** True when an InventoryItem exists for this protein. */
    inventoryTracked?: boolean;
    /** In display unit. 0 (not null) when no matching InventoryItem — the UI
     *  then shows Bal = 0 − sold and Order = +sold to flag the shortage. */
    currentStock:    number;
    parMin:          number;
}
export interface ProteinHeatmapResult {
    dates:  string[];
    items:  ProteinHeatmapRow[];
    days:   number;
    /** Most recent date that has any PMIX upload in the window, or null when
     *  the window is empty. Used by the UI as the "last-day sold" reference
     *  for the Bal column instead of just dates[dates.length-1]. */
    latestDataDate?: string | null;
}

// ─── Dessert / Beverage / Curry heatmap (parallel to ProteinHeatmap) ─────────
export interface DessertHeatmapRow {
    itemName:        string;
    unit:            string;
    totalOrders:     number;
    totalQty:        number;
    avgPerDay:       number;
    byDate:          number[];
    inventoryItemId: string | null;
    inventoryTracked?: boolean;
    currentStock:    number;   // 0 when not tracked
    parMin:          number;   // 0 when not tracked
}
export interface DessertHeatmapResult {
    dates: string[];
    items: DessertHeatmapRow[];
    days:  number;
    latestDataDate?: string | null;
}

export interface BeverageHeatmapRow extends DessertHeatmapRow {
    category: string;   // POS group ("Beer", "Red Wine", …)
}
export interface BeverageHeatmapResult {
    dates: string[];
    items: BeverageHeatmapRow[];
    days:  number;
    latestDataDate?: string | null;
}

export interface CurryHeatmapRow {
    group:           string;
    unit:            string;
    totalOrders:     number;
    totalQty:        number;
    avgPerDay:       number;
    byDate:          number[];
    inventoryItemId: string | null;
    inventoryTracked?: boolean;
    currentStock:    number;   // 0 when not tracked
    parMin:          number;   // 0 when not tracked
}
export interface CurryHeatmapResult {
    dates: string[];
    items: CurryHeatmapRow[];
    days:  number;
    latestDataDate?: string | null;
}

// ─── Beverage daily calendar ──────────────────────────────────────────────────
export interface BeverageDailyItem {
    itemName:  string;
    totalQty:  number;
    avgPerDay: number;
    days:      { date: string; qty: number }[];
}
export interface BeverageDailyResult {
    group:  string;
    days:   { date: string; qty: number }[];
    byItem: BeverageDailyItem[];
}

// ─── Curry daily calendar ─────────────────────────────────────────────────────
export type CurryDailyItem    = BeverageDailyItem;
export type CurryDailyResult  = BeverageDailyResult;
