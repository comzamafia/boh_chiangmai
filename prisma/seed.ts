import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import bcrypt from "bcryptjs";

const pool = new Pool({
    connectionString: process.env.DATABASE_URL ?? "postgresql://padthai:padthai_secret@localhost:5432/padthai_chaiyo_boh",
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
    console.log("🌱 Seeding database...");

    // ── Suppliers ──────────────────────────────────────────────────────────────
    const suppliers = await Promise.all([
        prisma.supplier.upsert({ where: { id: "S001" }, update: {}, create: { id: "S001", name: "Fresh Produce Co.", contact: "Somchai Jaidee", email: "somchai@freshproduce.th", phone: "02-111-2233", address: "12/34 Talat Thai, Pathum Thani", status: "Active" } }),
        prisma.supplier.upsert({ where: { id: "S002" }, update: {}, create: { id: "S002", name: "Meat Select Providers", contact: "Wanchai Butthong", email: "wanchai@meatselect.th", phone: "02-555-9988", address: "7 Srinakarin Road, Bangkok", status: "Active" } }),
        prisma.supplier.upsert({ where: { id: "S003" }, update: {}, create: { id: "S003", name: "Owner Sauce", contact: "Internal", email: "internal@padthaichaiyo.com", phone: "-", address: "Central Kitchen, Silom", status: "Active", isSpecial: true } }),
        prisma.supplier.upsert({ where: { id: "S004" }, update: {}, create: { id: "S004", name: "Seafood Direct Co.", contact: "Nittaya Prayong", email: "nittaya@seafooddirect.th", phone: "038-412-876", address: "Mahachai Pier, Samut Sakhon", status: "Active" } }),
        prisma.supplier.upsert({ where: { id: "S005" }, update: {}, create: { id: "S005", name: "Golden Dry Goods", contact: "Preecha Lamduan", email: "preecha@goldendry.th", phone: "02-899-0011", address: "Bang Na Industrial Estate", status: "Active" } }),
        prisma.supplier.upsert({ where: { id: "S006" }, update: {}, create: { id: "S006", name: "Heritage Spice House", contact: "Malee Thongdam", email: "malee@heritagespice.th", phone: "053-221-445", address: "Night Bazaar, Chiang Mai", status: "Inactive" } }),
    ]);
    console.log(`✅ ${suppliers.length} suppliers`);

    // ── Recipe Categories ──────────────────────────────────────────────────────
    const defaultCategories = ["Pad Thai", "Noodles", "Rice", "Sauce Base", "Side Dish", "Soup", "Drink"];
    for (let i = 0; i < defaultCategories.length; i++) {
        await prisma.recipeCategory.upsert({
            where: { name: defaultCategories[i] },
            update: { sortOrder: i },
            create: { name: defaultCategories[i], sortOrder: i },
        });
    }
    console.log(`✅ ${defaultCategories.length} recipe categories`);

    // ── Ingredients ────────────────────────────────────────────────────────────
    const ingredients = await Promise.all([
        prisma.ingredient.upsert({ where: { id: "I001" }, update: {}, create: { id: "I001", name: "Pad Thai Noodles (Sen Lek)", supplierId: "S005", purchaseUnit: "kg", purchasePrice: 45, recipeUnit: "g", yieldPercent: 100, conversionRate: 1000, groupId: "Weight" } }),
        prisma.ingredient.upsert({ where: { id: "I002" }, update: {}, create: { id: "I002", name: "Tiger Shrimp", supplierId: "S004", purchaseUnit: "kg", purchasePrice: 420, recipeUnit: "g", yieldPercent: 80, conversionRate: 1000, groupId: "Weight" } }),
        prisma.ingredient.upsert({ where: { id: "I003" }, update: {}, create: { id: "I003", name: "Tofu (Firm)", supplierId: "S001", purchaseUnit: "piece", purchasePrice: 18, recipeUnit: "g", yieldPercent: 100, conversionRate: 200, groupId: "Weight" } }),
        prisma.ingredient.upsert({ where: { id: "I004" }, update: {}, create: { id: "I004", name: "Chicken Breast", supplierId: "S002", purchaseUnit: "kg", purchasePrice: 110, recipeUnit: "g", yieldPercent: 90, conversionRate: 1000, groupId: "Weight" } }),
        prisma.ingredient.upsert({ where: { id: "I005" }, update: {}, create: { id: "I005", name: "Bean Sprouts", supplierId: "S001", purchaseUnit: "kg", purchasePrice: 22, recipeUnit: "g", yieldPercent: 95, conversionRate: 1000, groupId: "Weight" } }),
        prisma.ingredient.upsert({ where: { id: "I006" }, update: {}, create: { id: "I006", name: "Dried Shrimp", supplierId: "S005", purchaseUnit: "kg", purchasePrice: 280, recipeUnit: "g", yieldPercent: 100, conversionRate: 1000, groupId: "Weight" } }),
        prisma.ingredient.upsert({ where: { id: "I007" }, update: {}, create: { id: "I007", name: "Peanuts (Raw)", supplierId: "S005", purchaseUnit: "kg", purchasePrice: 80, recipeUnit: "g", yieldPercent: 100, conversionRate: 1000, groupId: "Weight" } }),
        prisma.ingredient.upsert({ where: { id: "I008" }, update: {}, create: { id: "I008", name: "Tamarind Paste", supplierId: "S005", purchaseUnit: "kg", purchasePrice: 65, recipeUnit: "g", yieldPercent: 100, conversionRate: 1000, groupId: "Weight" } }),
        prisma.ingredient.upsert({ where: { id: "I009" }, update: {}, create: { id: "I009", name: "Palm Sugar", supplierId: "S005", purchaseUnit: "kg", purchasePrice: 55, recipeUnit: "g", yieldPercent: 100, conversionRate: 1000, groupId: "Weight" } }),
        prisma.ingredient.upsert({ where: { id: "I010" }, update: {}, create: { id: "I010", name: "Chili Flakes", supplierId: "S006", purchaseUnit: "kg", purchasePrice: 150, recipeUnit: "g", yieldPercent: 100, conversionRate: 1000, groupId: "Weight" } }),
        prisma.ingredient.upsert({ where: { id: "I011" }, update: {}, create: { id: "I011", name: "Spring Onion", supplierId: "S001", purchaseUnit: "kg", purchasePrice: 35, recipeUnit: "g", yieldPercent: 90, conversionRate: 1000, groupId: "Weight" } }),
        prisma.ingredient.upsert({ where: { id: "I012" }, update: {}, create: { id: "I012", name: "Egg (Chicken)", supplierId: "S001", purchaseUnit: "dozen", purchasePrice: 72, recipeUnit: "piece", yieldPercent: 100, conversionRate: 12, groupId: "Count" } }),
        prisma.ingredient.upsert({ where: { id: "I013" }, update: {}, create: { id: "I013", name: "Pad Thai Sauce Base", supplierId: "S003", purchaseUnit: "L", purchasePrice: 120, recipeUnit: "ml", yieldPercent: 100, conversionRate: 1000, groupId: "Volume" } }),
        prisma.ingredient.upsert({ where: { id: "I014" }, update: {}, create: { id: "I014", name: "Fish Sauce (Nam Pla)", supplierId: "S005", purchaseUnit: "L", purchasePrice: 55, recipeUnit: "ml", yieldPercent: 100, conversionRate: 1000, groupId: "Volume" } }),
        prisma.ingredient.upsert({ where: { id: "I015" }, update: {}, create: { id: "I015", name: "Oyster Sauce", supplierId: "S005", purchaseUnit: "L", purchasePrice: 90, recipeUnit: "ml", yieldPercent: 100, conversionRate: 1000, groupId: "Volume" } }),
        prisma.ingredient.upsert({ where: { id: "I016" }, update: {}, create: { id: "I016", name: "Soy Sauce (Light)", supplierId: "S005", purchaseUnit: "L", purchasePrice: 45, recipeUnit: "ml", yieldPercent: 100, conversionRate: 1000, groupId: "Volume" } }),
        prisma.ingredient.upsert({ where: { id: "I017" }, update: {}, create: { id: "I017", name: "Sesame Oil", supplierId: "S005", purchaseUnit: "L", purchasePrice: 180, recipeUnit: "ml", yieldPercent: 100, conversionRate: 1000, groupId: "Volume" } }),
        prisma.ingredient.upsert({ where: { id: "I018" }, update: {}, create: { id: "I018", name: "Vegetable Oil", supplierId: "S005", purchaseUnit: "L", purchasePrice: 40, recipeUnit: "ml", yieldPercent: 100, conversionRate: 1000, groupId: "Volume" } }),
    ]);
    console.log(`✅ ${ingredients.length} ingredients`);

    // ── Equipment ──────────────────────────────────────────────────────────────
    const equipment = await Promise.all([
        prisma.equipment.upsert({ where: { id: "E001" }, update: {}, create: { id: "E001", name: "Wok Pan 14 inch", type: "Pan", status: "Available" } }),
        prisma.equipment.upsert({ where: { id: "E002" }, update: {}, create: { id: "E002", name: "Wok Pan 18 inch (Heavy)", type: "Pan", status: "Available" } }),
        prisma.equipment.upsert({ where: { id: "E003" }, update: {}, create: { id: "E003", name: "Gas Wok Burner (High BTU)", type: "Stove", status: "Available" } }),
        prisma.equipment.upsert({ where: { id: "E004" }, update: {}, create: { id: "E004", name: "Electric Induction Stove", type: "Stove", status: "Maintenance" } }),
        prisma.equipment.upsert({ where: { id: "E005" }, update: {}, create: { id: "E005", name: "Prep Table (Stainless Steel)", type: "Table", status: "Available" } }),
        prisma.equipment.upsert({ where: { id: "E006" }, update: {}, create: { id: "E006", name: "Commercial Rice Cooker 20L", type: "Cooker", status: "Available" } }),
        prisma.equipment.upsert({ where: { id: "E007" }, update: {}, create: { id: "E007", name: "Vacuum Sealer Machine", type: "Packaging", status: "Available" } }),
        prisma.equipment.upsert({ where: { id: "E008" }, update: {}, create: { id: "E008", name: "Digital Kitchen Scale", type: "Scale", status: "Available" } }),
        prisma.equipment.upsert({ where: { id: "E009" }, update: {}, create: { id: "E009", name: "Chef Knife Set", type: "Blade", status: "Available" } }),
        prisma.equipment.upsert({ where: { id: "E010" }, update: {}, create: { id: "E010", name: "Food Processor (8L)", type: "Processor", status: "Retired" } }),
        prisma.equipment.upsert({ where: { id: "E011" }, update: {}, create: { id: "E011", name: "Bamboo Steamer Set", type: "Steamer", status: "Available" } }),
        prisma.equipment.upsert({ where: { id: "E012" }, update: {}, create: { id: "E012", name: "Stockpot 40L (Heavy Duty)", type: "Pot", status: "Available" } }),
    ]);
    console.log(`✅ ${equipment.length} equipment`);

    // ── Recipes ────────────────────────────────────────────────────────────────
    const recipes = await Promise.all([
        prisma.recipe.upsert({ where: { id: "R001" }, update: {}, create: { id: "R001", name: "Classic Pad Thai", category: "Noodles", yieldAmount: 1, yieldUnit: "serving", prepTime: 5, cookTime: 5, laborCostPerHour: 50, energyCostPerBatch: 2, instructions: "1. Soak noodles in cold water for 30 min.\n2. Heat wok until smoking.\n3. Add oil and stir-fry tofu until golden.\n4. Push to side, crack egg into wok.\n5. Add noodles, sauce. Toss on high heat 2 min.\n6. Add bean sprouts and spring onion. Toss briefly.\n7. Serve with peanuts and lime." } }),
        prisma.recipe.upsert({ where: { id: "R002" }, update: {}, create: { id: "R002", name: "Shrimp Pad Thai", category: "Noodles", yieldAmount: 1, yieldUnit: "serving", prepTime: 5, cookTime: 7, laborCostPerHour: 50, energyCostPerBatch: 2.5, instructions: "1. Soak noodles 30 min.\n2. Stir-fry shrimp with garlic until pink.\n3. Add noodles and sauce.\n4. Fold in egg, bean sprouts.\n5. Garnish with dried shrimp, peanuts, spring onion." } }),
        prisma.recipe.upsert({ where: { id: "R003" }, update: {}, create: { id: "R003", name: "Pad Thai Sauce Base", category: "Main Sauce", yieldAmount: 10, yieldUnit: "L", prepTime: 15, cookTime: 60, laborCostPerHour: 50, energyCostPerBatch: 15, isMainSauce: true, instructions: "1. Soak tamarind in warm water. Strain through sieve.\n2. Combine tamarind water, palm sugar, fish sauce in heavy stockpot.\n3. Simmer on medium-low heat, stirring constantly until sugar dissolves.\n4. Reduce 20% until slightly thickened. Taste and balance.\n5. Cool completely. Store refrigerated up to 14 days." } }),
        prisma.recipe.upsert({ where: { id: "R004" }, update: {}, create: { id: "R004", name: "Chicken Pad Thai", category: "Noodles", yieldAmount: 1, yieldUnit: "serving", prepTime: 8, cookTime: 7, laborCostPerHour: 50, energyCostPerBatch: 2, instructions: "1. Marinate chicken in light soy sauce.\n2. Soak noodles.\n3. Cook chicken through.\n4. Add noodles, sauce and egg.\n5. Fold in vegetables and serve." } }),
        prisma.recipe.upsert({ where: { id: "R005" }, update: {}, create: { id: "R005", name: "Chili Oil (Nam Prik Pao)", category: "Main Sauce", yieldAmount: 5, yieldUnit: "L", prepTime: 30, cookTime: 45, laborCostPerHour: 50, energyCostPerBatch: 12, isMainSauce: true, instructions: "1. Toast dried chilies and garlic separately.\n2. Blend coarsely.\n3. Fry in vegetable oil on medium heat.\n4. Add dried shrimp, palm sugar, fish sauce.\n5. Simmer 20 min. Cool and store." } }),
        prisma.recipe.upsert({ where: { id: "R006" }, update: {}, create: { id: "R006", name: "Fresh Spring Rolls", category: "Appetizers", yieldAmount: 4, yieldUnit: "piece", prepTime: 20, cookTime: 0, laborCostPerHour: 50, energyCostPerBatch: 0.5 } }),
        prisma.recipe.upsert({ where: { id: "R007" }, update: {}, create: { id: "R007", name: "Tom Yum Broth Base", category: "Main Sauce", yieldAmount: 8, yieldUnit: "L", prepTime: 10, cookTime: 40, laborCostPerHour: 50, energyCostPerBatch: 10, isMainSauce: true } }),
        prisma.recipe.upsert({ where: { id: "R008" }, update: {}, create: { id: "R008", name: "Pad See Ew", category: "Noodles", yieldAmount: 1, yieldUnit: "serving", prepTime: 5, cookTime: 5, laborCostPerHour: 50, energyCostPerBatch: 2 } }),
    ]);
    console.log(`✅ ${recipes.length} recipes`);

    // ── Recipe Ingredients ─────────────────────────────────────────────────────
    const recipeIngredientData = [
        // R001 – Classic Pad Thai
        { recipeId: "R001", ingredientId: "I001", quantity: 150 },
        { recipeId: "R001", ingredientId: "I003", quantity: 60 },
        { recipeId: "R001", ingredientId: "I012", quantity: 1 },
        { recipeId: "R001", ingredientId: "I013", quantity: 80 },
        { recipeId: "R001", ingredientId: "I005", quantity: 40 },
        { recipeId: "R001", ingredientId: "I007", quantity: 15 },
        { recipeId: "R001", ingredientId: "I011", quantity: 10 },
        { recipeId: "R001", ingredientId: "I018", quantity: 20 },
        // R002 – Shrimp Pad Thai
        { recipeId: "R002", ingredientId: "I001", quantity: 150 },
        { recipeId: "R002", ingredientId: "I002", quantity: 120 },
        { recipeId: "R002", ingredientId: "I012", quantity: 1 },
        { recipeId: "R002", ingredientId: "I013", quantity: 80 },
        { recipeId: "R002", ingredientId: "I005", quantity: 40 },
        { recipeId: "R002", ingredientId: "I006", quantity: 8 },
        { recipeId: "R002", ingredientId: "I007", quantity: 15 },
        { recipeId: "R002", ingredientId: "I018", quantity: 20 },
        // R003 – Pad Thai Sauce Base
        { recipeId: "R003", ingredientId: "I008", quantity: 2000 },
        { recipeId: "R003", ingredientId: "I009", quantity: 1500 },
        { recipeId: "R003", ingredientId: "I014", quantity: 1500 },
        // R004 – Chicken Pad Thai
        { recipeId: "R004", ingredientId: "I001", quantity: 150 },
        { recipeId: "R004", ingredientId: "I004", quantity: 100 },
        { recipeId: "R004", ingredientId: "I012", quantity: 1 },
        { recipeId: "R004", ingredientId: "I013", quantity: 80 },
        { recipeId: "R004", ingredientId: "I005", quantity: 40 },
        { recipeId: "R004", ingredientId: "I016", quantity: 15 },
        { recipeId: "R004", ingredientId: "I018", quantity: 20 },
        // R005 – Chili Oil
        { recipeId: "R005", ingredientId: "I010", quantity: 500 },
        { recipeId: "R005", ingredientId: "I006", quantity: 200 },
        { recipeId: "R005", ingredientId: "I009", quantity: 300 },
        { recipeId: "R005", ingredientId: "I014", quantity: 200 },
        { recipeId: "R005", ingredientId: "I018", quantity: 2000 },
    ];

    for (const ri of recipeIngredientData) {
        await prisma.recipeIngredient.upsert({
            where: { recipeId_ingredientId: { recipeId: ri.recipeId, ingredientId: ri.ingredientId } },
            update: {},
            create: ri,
        });
    }
    console.log(`✅ ${recipeIngredientData.length} recipe ingredient links`);

    // ── Purchase History ───────────────────────────────────────────────────────
    const purchaseData = [
        { id: "PO-001", date: new Date("2026-02-18"), supplierId: "S001", ingredient: "Pad Thai Noodles (Sen Lek)", qty: 50, unit: "kg", unitPrice: 45, total: 2250 },
        { id: "PO-002", date: new Date("2026-02-18"), supplierId: "S004", ingredient: "Tiger Shrimp", qty: 20, unit: "kg", unitPrice: 420, total: 8400 },
        { id: "PO-003", date: new Date("2026-02-15"), supplierId: "S001", ingredient: "Tofu (Firm)", qty: 80, unit: "piece", unitPrice: 18, total: 1440 },
        { id: "PO-004", date: new Date("2026-02-15"), supplierId: "S001", ingredient: "Bean Sprouts", qty: 30, unit: "kg", unitPrice: 22, total: 660 },
        { id: "PO-005", date: new Date("2026-02-12"), supplierId: "S002", ingredient: "Chicken Breast", qty: 15, unit: "kg", unitPrice: 110, total: 1650 },
        { id: "PO-006", date: new Date("2026-02-12"), supplierId: "S003", ingredient: "Pad Thai Sauce Base", qty: 20, unit: "L", unitPrice: 120, total: 2400 },
        { id: "PO-007", date: new Date("2026-02-08"), supplierId: "S005", ingredient: "Peanuts (Raw)", qty: 10, unit: "kg", unitPrice: 80, total: 800 },
        { id: "PO-008", date: new Date("2026-02-08"), supplierId: "S005", ingredient: "Fish Sauce (Nam Pla)", qty: 50, unit: "L", unitPrice: 55, total: 2750 },
        { id: "PO-009", date: new Date("2026-02-05"), supplierId: "S005", ingredient: "Tamarind Paste", qty: 20, unit: "kg", unitPrice: 65, total: 1300 },
        { id: "PO-010", date: new Date("2026-02-05"), supplierId: "S005", ingredient: "Palm Sugar", qty: 25, unit: "kg", unitPrice: 55, total: 1375 },
        { id: "PO-011", date: new Date("2026-01-28"), supplierId: "S001", ingredient: "Egg (Chicken)", qty: 20, unit: "dozen", unitPrice: 72, total: 1440 },
        { id: "PO-012", date: new Date("2026-01-25"), supplierId: "S005", ingredient: "Sesame Oil", qty: 10, unit: "L", unitPrice: 180, total: 1800 },
        { id: "PO-013", date: new Date("2026-01-22"), supplierId: "S006", ingredient: "Chili Flakes", qty: 5, unit: "kg", unitPrice: 150, total: 750 },
        { id: "PO-014", date: new Date("2026-01-20"), supplierId: "S004", ingredient: "Tiger Shrimp", qty: 25, unit: "kg", unitPrice: 400, total: 10000 },
        { id: "PO-015", date: new Date("2026-01-15"), supplierId: "S001", ingredient: "Pad Thai Noodles (Sen Lek)", qty: 50, unit: "kg", unitPrice: 44, total: 2200 },
    ];

    for (const p of purchaseData) {
        await prisma.purchaseHistory.upsert({
            where: { id: p.id },
            update: {},
            create: p,
        });
    }
    console.log(`✅ ${purchaseData.length} purchase history records`);

    // ── Admin User ─────────────────────────────────────────────────────────────
    const adminPassword = await bcrypt.hash("Admin@1234", 12);
    await prisma.user.upsert({
        where: { email: "admin@padthaichaiyo.com" },
        update: {},
        create: {
            id: "U001",
            name: "Admin",
            email: "admin@padthaichaiyo.com",
            password: adminPassword,
            role: "admin",
            permissions: [],
            isActive: true,
        },
    });
    console.log("✅ Admin user (admin@padthaichaiyo.com / Admin@1234)");

    console.log("\n🎉 Seed complete!");
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); });
