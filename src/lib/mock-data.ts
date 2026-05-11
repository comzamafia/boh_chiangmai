export interface Supplier {
    id: string;
    name: string;
    contact: string;
    email: string;
    phone: string;
    address: string;
    status: "Active" | "Inactive";
    isSpecial?: boolean;
}

export interface Ingredient {
    id: string;
    name: string;
    supplierId: string;
    purchaseUnit: string;
    purchasePrice: number;
    recipeUnit: string;
    yieldPercent: number;
    conversionRate: number; // How many recipe units in one purchase unit
    groupId: "Weight" | "Volume" | "Count";
}

export interface Equipment {
    id: string;
    name: string;
    type: string;
    status: "Available" | "Maintenance" | "Retired";
}

export interface Recipe {
    id: string;
    name: string;
    category: string;
    yieldAmount: number;
    yieldUnit: string;
    prepTime: number; // minutes
    cookTime: number; // minutes
    laborCostPerHour: number;
    energyCostPerBatch: number;
    imageUrl?: string;
    isMainSauce?: boolean;
    instructions?: string;
}

export interface RecipeIngredient {
    ingredientId: string;
    quantity: number;    // in recipeUnit
}

export const mockSuppliers: Supplier[] = [
    { id: "S001", name: "Fresh Produce Co.", contact: "Somchai Jaidee", email: "somchai@freshproduce.th", phone: "02-111-2233", address: "12/34 Talat Thai, Pathum Thani", status: "Active" },
    { id: "S002", name: "Meat Select Providers", contact: "Wanchai Butthong", email: "wanchai@meatselect.th", phone: "02-555-9988", address: "7 Srinakarin Road, Bangkok", status: "Active" },
    { id: "S003", name: "Owner Sauce", contact: "Internal", email: "internal@chiangmai.ca", phone: "-", address: "Central Kitchen, Silom", status: "Active", isSpecial: true },
    { id: "S004", name: "Seafood Direct Co.", contact: "Nittaya Prayong", email: "nittaya@seafooddirect.th", phone: "038-412-876", address: "Mahachai Pier, Samut Sakhon", status: "Active" },
    { id: "S005", name: "Golden Dry Goods", contact: "Preecha Lamduan", email: "preecha@goldendry.th", phone: "02-899-0011", address: "Bang Na Industrial Estate", status: "Active" },
    { id: "S006", name: "Heritage Spice House", contact: "Malee Thongdam", email: "malee@heritagespice.th", phone: "053-221-445", address: "Night Bazaar, Chiang Mai", status: "Inactive" },
];

export const mockIngredients: Ingredient[] = [
    // Weight group
    { id: "I001", name: "Pad Thai Noodles (Sen Lek)", supplierId: "S005", purchaseUnit: "kg", purchasePrice: 45, recipeUnit: "g", yieldPercent: 100, conversionRate: 1000, groupId: "Weight" },
    { id: "I002", name: "Tiger Shrimp", supplierId: "S004", purchaseUnit: "kg", purchasePrice: 420, recipeUnit: "g", yieldPercent: 80, conversionRate: 1000, groupId: "Weight" },
    { id: "I003", name: "Tofu (Firm)", supplierId: "S001", purchaseUnit: "piece", purchasePrice: 18, recipeUnit: "g", yieldPercent: 100, conversionRate: 200, groupId: "Weight" },
    { id: "I004", name: "Chicken Breast", supplierId: "S002", purchaseUnit: "kg", purchasePrice: 110, recipeUnit: "g", yieldPercent: 90, conversionRate: 1000, groupId: "Weight" },
    { id: "I005", name: "Bean Sprouts", supplierId: "S001", purchaseUnit: "kg", purchasePrice: 22, recipeUnit: "g", yieldPercent: 95, conversionRate: 1000, groupId: "Weight" },
    { id: "I006", name: "Dried Shrimp", supplierId: "S005", purchaseUnit: "kg", purchasePrice: 280, recipeUnit: "g", yieldPercent: 100, conversionRate: 1000, groupId: "Weight" },
    { id: "I007", name: "Peanuts (Raw)", supplierId: "S005", purchaseUnit: "kg", purchasePrice: 80, recipeUnit: "g", yieldPercent: 100, conversionRate: 1000, groupId: "Weight" },
    { id: "I008", name: "Tamarind Paste", supplierId: "S005", purchaseUnit: "kg", purchasePrice: 65, recipeUnit: "g", yieldPercent: 100, conversionRate: 1000, groupId: "Weight" },
    { id: "I009", name: "Palm Sugar", supplierId: "S005", purchaseUnit: "kg", purchasePrice: 55, recipeUnit: "g", yieldPercent: 100, conversionRate: 1000, groupId: "Weight" },
    { id: "I010", name: "Chili Flakes", supplierId: "S006", purchaseUnit: "kg", purchasePrice: 150, recipeUnit: "g", yieldPercent: 100, conversionRate: 1000, groupId: "Weight" },
    { id: "I011", name: "Spring Onion", supplierId: "S001", purchaseUnit: "kg", purchasePrice: 35, recipeUnit: "g", yieldPercent: 90, conversionRate: 1000, groupId: "Weight" },
    { id: "I012", name: "Egg (Chicken)", supplierId: "S001", purchaseUnit: "dozen", purchasePrice: 72, recipeUnit: "piece", yieldPercent: 100, conversionRate: 12, groupId: "Count" },
    // Volume group
    { id: "I013", name: "Pad Thai Sauce Base", supplierId: "S003", purchaseUnit: "L", purchasePrice: 120, recipeUnit: "ml", yieldPercent: 100, conversionRate: 1000, groupId: "Volume" },
    { id: "I014", name: "Fish Sauce (Nam Pla)", supplierId: "S005", purchaseUnit: "L", purchasePrice: 55, recipeUnit: "ml", yieldPercent: 100, conversionRate: 1000, groupId: "Volume" },
    { id: "I015", name: "Oyster Sauce", supplierId: "S005", purchaseUnit: "L", purchasePrice: 90, recipeUnit: "ml", yieldPercent: 100, conversionRate: 1000, groupId: "Volume" },
    { id: "I016", name: "Soy Sauce (Light)", supplierId: "S005", purchaseUnit: "L", purchasePrice: 45, recipeUnit: "ml", yieldPercent: 100, conversionRate: 1000, groupId: "Volume" },
    { id: "I017", name: "Sesame Oil", supplierId: "S005", purchaseUnit: "L", purchasePrice: 180, recipeUnit: "ml", yieldPercent: 100, conversionRate: 1000, groupId: "Volume" },
    { id: "I018", name: "Vegetable Oil", supplierId: "S005", purchaseUnit: "L", purchasePrice: 40, recipeUnit: "ml", yieldPercent: 100, conversionRate: 1000, groupId: "Volume" },
];

export const mockEquipment: Equipment[] = [
    { id: "E001", name: "Wok Pan 14 inch", type: "Pan", status: "Available" },
    { id: "E002", name: "Wok Pan 18 inch (Heavy)", type: "Pan", status: "Available" },
    { id: "E003", name: "Gas Wok Burner (High BTU)", type: "Stove", status: "Available" },
    { id: "E004", name: "Electric Induction Stove", type: "Stove", status: "Maintenance" },
    { id: "E005", name: "Prep Table (Stainless Steel)", type: "Table", status: "Available" },
    { id: "E006", name: "Commercial Rice Cooker 20L", type: "Cooker", status: "Available" },
    { id: "E007", name: "Vacuum Sealer Machine", type: "Packaging", status: "Available" },
    { id: "E008", name: "Digital Kitchen Scale", type: "Scale", status: "Available" },
    { id: "E009", name: "Chef Knife Set", type: "Blade", status: "Available" },
    { id: "E010", name: "Food Processor (8L)", type: "Processor", status: "Retired" },
    { id: "E011", name: "Bamboo Steamer Set", type: "Steamer", status: "Available" },
    { id: "E012", name: "Stockpot 40L (Heavy Duty)", type: "Pot", status: "Available" },
];

export const mockRecipes: Recipe[] = [
    {
        id: "R001", name: "Classic Pad Thai", category: "Noodles",
        yieldAmount: 1, yieldUnit: "serving", prepTime: 5, cookTime: 5,
        laborCostPerHour: 50, energyCostPerBatch: 2,
        instructions: "1. Soak noodles in cold water for 30 min.\n2. Heat wok until smoking.\n3. Add oil and stir-fry tofu until golden.\n4. Push to side, crack egg into wok.\n5. Add noodles, sauce. Toss on high heat 2 min.\n6. Add bean sprouts and spring onion. Toss briefly.\n7. Serve with peanuts and lime."
    },
    {
        id: "R002", name: "Shrimp Pad Thai", category: "Noodles",
        yieldAmount: 1, yieldUnit: "serving", prepTime: 5, cookTime: 7,
        laborCostPerHour: 50, energyCostPerBatch: 2.5,
        instructions: "1. Soak noodles 30 min.\n2. Stir-fry shrimp with garlic until pink.\n3. Add noodles and sauce.\n4. Fold in egg, bean sprouts.\n5. Garnish with dried shrimp, peanuts, spring onion."
    },
    {
        id: "R003", name: "Pad Thai Sauce Base", category: "Main Sauce",
        yieldAmount: 10, yieldUnit: "L", prepTime: 15, cookTime: 60,
        laborCostPerHour: 50, energyCostPerBatch: 15, isMainSauce: true,
        instructions: "1. Soak tamarind in warm water. Strain through sieve.\n2. Combine tamarind water, palm sugar, fish sauce in heavy stockpot.\n3. Simmer on medium-low heat, stirring constantly until sugar dissolves.\n4. Reduce 20% until slightly thickened. Taste and balance.\n5. Cool completely. Store refrigerated up to 14 days."
    },
    {
        id: "R004", name: "Chicken Pad Thai", category: "Noodles",
        yieldAmount: 1, yieldUnit: "serving", prepTime: 8, cookTime: 7,
        laborCostPerHour: 50, energyCostPerBatch: 2,
        instructions: "1. Marinate chicken in light soy sauce.\n2. Soak noodles.\n3. Cook chicken through.\n4. Add noodles, sauce and egg.\n5. Fold in vegetables and serve."
    },
    {
        id: "R005", name: "Chili Oil (Nam Prik Pao)", category: "Main Sauce",
        yieldAmount: 5, yieldUnit: "L", prepTime: 30, cookTime: 45,
        laborCostPerHour: 50, energyCostPerBatch: 12, isMainSauce: true,
        instructions: "1. Toast dried chilies and garlic separately.\n2. Blend coarsely.\n3. Fry in vegetable oil on medium heat.\n4. Add dried shrimp, palm sugar, fish sauce.\n5. Simmer 20 min. Cool and store."
    },
    {
        id: "R006", name: "Fresh Spring Rolls", category: "Appetizers",
        yieldAmount: 4, yieldUnit: "piece", prepTime: 20, cookTime: 0,
        laborCostPerHour: 50, energyCostPerBatch: 0.5,
    },
    {
        id: "R007", name: "Tom Yum Broth Base", category: "Main Sauce",
        yieldAmount: 8, yieldUnit: "L", prepTime: 10, cookTime: 40,
        laborCostPerHour: 50, energyCostPerBatch: 10, isMainSauce: true,
    },
    {
        id: "R008", name: "Pad See Ew", category: "Noodles",
        yieldAmount: 1, yieldUnit: "serving", prepTime: 5, cookTime: 5,
        laborCostPerHour: 50, energyCostPerBatch: 2,
    },
];

// Links recipes to ingredients with quantities (in recipe unit)
export const mockRecipeIngredients: Record<string, RecipeIngredient[]> = {
    "R001": [
        { ingredientId: "I001", quantity: 150 },  // 150g noodles
        { ingredientId: "I003", quantity: 60 },   // 60g tofu
        { ingredientId: "I012", quantity: 1 },    // 1 egg
        { ingredientId: "I013", quantity: 80 },   // 80ml sauce
        { ingredientId: "I005", quantity: 40 },   // 40g sprouts
        { ingredientId: "I007", quantity: 15 },   // 15g peanuts
        { ingredientId: "I011", quantity: 10 },   // 10g spring onion
        { ingredientId: "I018", quantity: 20 },   // 20ml veg oil
    ],
    "R002": [
        { ingredientId: "I001", quantity: 150 },
        { ingredientId: "I002", quantity: 120 }, // 120g shrimp
        { ingredientId: "I012", quantity: 1 },
        { ingredientId: "I013", quantity: 80 },
        { ingredientId: "I005", quantity: 40 },
        { ingredientId: "I006", quantity: 8 },   // 8g dried shrimp
        { ingredientId: "I007", quantity: 15 },
        { ingredientId: "I018", quantity: 20 },
    ],
    "R003": [
        { ingredientId: "I008", quantity: 2000 }, // 2kg tamarind
        { ingredientId: "I009", quantity: 1500 }, // 1.5kg palm sugar
        { ingredientId: "I014", quantity: 1500 }, // 1.5L fish sauce
    ],
    "R004": [
        { ingredientId: "I001", quantity: 150 },
        { ingredientId: "I004", quantity: 100 }, // 100g chicken
        { ingredientId: "I012", quantity: 1 },
        { ingredientId: "I013", quantity: 80 },
        { ingredientId: "I005", quantity: 40 },
        { ingredientId: "I016", quantity: 15 }, // 15ml soy sauce
        { ingredientId: "I018", quantity: 20 },
    ],
    "R005": [
        { ingredientId: "I010", quantity: 500 }, // 500g chili flakes
        { ingredientId: "I006", quantity: 200 }, // 200g dried shrimp
        { ingredientId: "I009", quantity: 300 },
        { ingredientId: "I014", quantity: 200 },
        { ingredientId: "I018", quantity: 2000 },
    ],
};

// Helper: calculate ingredient cost per recipe unit
export function calcCostPerRecipeUnit(ing: Ingredient): number {
    // (purchasePrice / conversionRate) / (yieldPercent/100)
    return (ing.purchasePrice / ing.conversionRate) / (ing.yieldPercent / 100);
}

// Helper: calculate total ingredient cost for a recipe
export function calcRecipeIngredientCost(recipeId: string): number {
    const ings = mockRecipeIngredients[recipeId] || [];
    return ings.reduce((sum, ri) => {
        const ing = mockIngredients.find(i => i.id === ri.ingredientId);
        if (!ing) return sum;
        return sum + calcCostPerRecipeUnit(ing) * ri.quantity;
    }, 0);
}

// Helper: calculate total recipe cost (ingredients + labor + energy)
export function calcTotalRecipeCost(recipe: Recipe): number {
    const ingCost = calcRecipeIngredientCost(recipe.id);
    const laborCost = recipe.laborCostPerHour * ((recipe.prepTime + recipe.cookTime) / 60);
    return ingCost + laborCost + recipe.energyCostPerBatch;
}

export const mockPurchaseHistory = [
    { id: "PO-001", date: "2026-02-18", supplierId: "S001", ingredient: "Pad Thai Noodles (Sen Lek)", qty: 50, unit: "kg", unitPrice: 45, total: 2250 },
    { id: "PO-002", date: "2026-02-18", supplierId: "S004", ingredient: "Tiger Shrimp", qty: 20, unit: "kg", unitPrice: 420, total: 8400 },
    { id: "PO-003", date: "2026-02-15", supplierId: "S001", ingredient: "Tofu (Firm)", qty: 80, unit: "piece", unitPrice: 18, total: 1440 },
    { id: "PO-004", date: "2026-02-15", supplierId: "S001", ingredient: "Bean Sprouts", qty: 30, unit: "kg", unitPrice: 22, total: 660 },
    { id: "PO-005", date: "2026-02-12", supplierId: "S002", ingredient: "Chicken Breast", qty: 15, unit: "kg", unitPrice: 110, total: 1650 },
    { id: "PO-006", date: "2026-02-12", supplierId: "S003", ingredient: "Pad Thai Sauce Base", qty: 20, unit: "L", unitPrice: 120, total: 2400 },
    { id: "PO-007", date: "2026-02-08", supplierId: "S005", ingredient: "Peanuts (Raw)", qty: 10, unit: "kg", unitPrice: 80, total: 800 },
    { id: "PO-008", date: "2026-02-08", supplierId: "S005", ingredient: "Fish Sauce (Nam Pla)", qty: 50, unit: "L", unitPrice: 55, total: 2750 },
    { id: "PO-009", date: "2026-02-05", supplierId: "S005", ingredient: "Tamarind Paste", qty: 20, unit: "kg", unitPrice: 65, total: 1300 },
    { id: "PO-010", date: "2026-02-05", supplierId: "S005", ingredient: "Palm Sugar", qty: 25, unit: "kg", unitPrice: 55, total: 1375 },
    { id: "PO-011", date: "2026-01-28", supplierId: "S001", ingredient: "Egg (Chicken)", qty: 20, unit: "dozen", unitPrice: 72, total: 1440 },
    { id: "PO-012", date: "2026-01-25", supplierId: "S005", ingredient: "Sesame Oil", qty: 10, unit: "L", unitPrice: 180, total: 1800 },
    { id: "PO-013", date: "2026-01-22", supplierId: "S006", ingredient: "Chili Flakes", qty: 5, unit: "kg", unitPrice: 150, total: 750 },
    { id: "PO-014", date: "2026-01-20", supplierId: "S004", ingredient: "Tiger Shrimp", qty: 25, unit: "kg", unitPrice: 400, total: 10000 },
    { id: "PO-015", date: "2026-01-15", supplierId: "S001", ingredient: "Pad Thai Noodles (Sen Lek)", qty: 50, unit: "kg", unitPrice: 44, total: 2200 },
];

export const mockMonthlyTrend = [
    { month: "Sep", noodles: 43, shrimp: 390, chicken: 105 },
    { month: "Oct", noodles: 44, shrimp: 405, chicken: 108 },
    { month: "Nov", noodles: 44, shrimp: 400, chicken: 110 },
    { month: "Dec", noodles: 46, shrimp: 415, chicken: 115 },
    { month: "Jan", noodles: 44, shrimp: 410, chicken: 112 },
    { month: "Feb", noodles: 45, shrimp: 420, chicken: 110 },
];

export const categories = ["Noodles", "Main Sauce", "Appetizers", "Drinks", "Desserts"];

export const equipmentTypes = ["Pan", "Stove", "Table", "Cooker", "Packaging", "Scale", "Blade", "Processor", "Steamer", "Pot"];

export const units = {
    Weight: ["g", "kg", "oz", "lb"],
    Volume: ["ml", "L", "tsp", "tbsp", "cup", "fl oz"],
    Count: ["piece", "dozen", "pack"],
};
