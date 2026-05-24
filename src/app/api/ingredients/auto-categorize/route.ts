import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { NextResponse } from "next/server";

// ─── Keyword → category name mapping ─────────────────────────────────────────
// Keys are lowercase keyword fragments; value is the target category name.
// Rules are checked IN ORDER — first match wins.
const KEYWORD_RULES: Array<{ keywords: string[]; category: string }> = [
    // ── Proteins (meat, poultry, seafood, eggs) ──
    {
        keywords: [
            "chicken", "pork", "beef", "lamb", "duck", "goose", "turkey",
            "shrimp", "prawn", "squid", "crab", "lobster", "crayfish",
            "clam", "mussel", "oyster", "scallop", "abalone",
            "fish", "salmon", "tuna", "tilapia", "sea bass", "snapper",
            "catfish", "barramundi", "mackerel", "sardine", "anchovy",
            "mahi", "grouper", "sole", "cod", "trout",
            "tofu", "tempeh", "seitan",
            "egg", "ไข่", "หมู", "ไก่", "เนื้อ", "กุ้ง", "ปลา", "ปู", "หอย", "ปลาหมึก",
        ],
        category: "Proteins",
    },
    // ── Dairy & Eggs (before vegetables so "egg" hits Proteins first) ──
    {
        keywords: [
            "milk", "cream", "cheese", "butter", "yogurt", "yoghurt",
            "evaporated", "condensed", "whipping cream", "heavy cream",
            "sour cream", "creme fraiche", "ghee",
            "นม", "ครีม", "เนย",
        ],
        category: "Dairy & Eggs",
    },
    // ── Herbs & Spices ──
    {
        keywords: [
            "basil", "cilantro", "coriander", "mint", "lemongrass",
            "galangal", "ginger", "turmeric", "kaffir", "bay leaf",
            "thyme", "rosemary", "oregano", "sage", "parsley",
            "paprika", "cumin", "anise", "star anise", "cinnamon",
            "cardamom", "clove", "nutmeg", "mace", "fenugreek",
            "pepper", "chili", "chilli", "chile", "cayenne",
            "saffron", "vanilla", "dill", "fennel",
            "makrut", "pandan", "pandanus",
            "ตะไคร้", "ขิง", "ข่า", "ใบมะกรูด", "พริก", "กระชาย",
            "ผักชี", "โหระพา", "กะเพรา", "สะระแหน่", "ขมิ้น",
        ],
        category: "Herbs & Spices",
    },
    // ── Seasoning & Sauces ──
    {
        keywords: [
            "sauce", "soy sauce", "fish sauce", "oyster sauce",
            "hoisin", "sriracha", "chili sauce", "hot sauce",
            "tamarind", "tamarind paste",
            "vinegar", "mirin", "sake", "rice wine",
            "sugar", "palm sugar", "brown sugar", "honey",
            "salt", "msg", "seasoning", "bouillon",
            "curry paste", "red curry", "green curry", "yellow curry",
            "massaman", "panang", "tom yum paste", "nam prik",
            "shrimp paste", "belacan", "fermented", "miso",
            "ketchup", "mayo", "mayonnaise", "mustard", "relish",
            "worcestershire", "maggi", "knorr",
            "น้ำปลา", "ซีอิ๊ว", "น้ำตาล", "เกลือ", "น้ำมันหอย",
            "พริกแกง", "เต้าเจี้ยว", "กะปิ",
        ],
        category: "Seasoning & Sauces",
    },
    // ── Oils & Fats ──
    {
        keywords: [
            "oil", "vegetable oil", "coconut oil", "palm oil",
            "sesame oil", "olive oil", "sunflower oil", "canola",
            "lard", "shortening", "margarine",
            "น้ำมัน", "กะทิ",
        ],
        category: "Oils & Fats",
    },
    // ── Dry Goods (grains, noodles, flour, starches) ──
    {
        keywords: [
            "rice", "jasmine rice", "sticky rice", "glutinous",
            "noodle", "pasta", "vermicelli", "glass noodle",
            "egg noodle", "udon", "soba", "ramen",
            "sen lek", "sen yai", "sen mee", "pad thai noodle",
            "flour", "bread crumb", "panko", "starch", "cornstarch",
            "corn starch", "tapioca", "arrowroot",
            "oat", "barley", "wheat", "semolina",
            "bread", "bun", "wrap", "tortilla",
            "bean", "lentil", "chickpea", "soybean", "mung bean",
            "dried", "dry", "powder",
            "ข้าว", "เส้น", "แป้ง", "ถั่ว",
        ],
        category: "Dry Goods",
    },
    // ── Fruits ──
    {
        keywords: [
            "lime", "lemon", "orange", "grapefruit", "pomelo",
            "mango", "papaya", "pineapple", "banana", "plantain",
            "coconut", "watermelon", "melon", "jackfruit",
            "longan", "lychee", "rambutan", "mangosteen",
            "dragon fruit", "durian", "passion fruit",
            "guava", "starfruit", "sapodilla",
            "apple", "pear", "grape", "strawberry", "blueberry",
            "raspberry", "cherry", "peach", "plum", "apricot",
            "มะนาว", "มะม่วง", "มะละกอ", "สับปะรด", "มะพร้าว",
        ],
        category: "Fruits",
    },
    // ── Vegetables ──
    {
        keywords: [
            "carrot", "broccoli", "cauliflower", "spinach", "kale",
            "cabbage", "lettuce", "tomato", "cucumber", "zucchini",
            "eggplant", "aubergine", "mushroom", "bamboo shoot",
            "bean sprout", "bok choy", "pak choi", "morning glory",
            "water spinach", "baby corn", "snow pea", "green bean",
            "asparagus", "celery", "onion", "shallot", "garlic",
            "leek", "spring onion", "scallion", "chive",
            "bell pepper", "capsicum", "sweet potato", "potato",
            "taro", "yam", "pumpkin", "squash", "corn",
            "lotus", "water chestnut", "daikon", "radish",
            "beansprout", "sprout",
            "ผัก", "หัวหอม", "กระเทียม", "มะเขือ", "ฟักทอง",
            "เห็ด", "หน่อไม้", "ถั่วงอก",
        ],
        category: "Vegetables",
    },
    // ── Beverages ──
    {
        keywords: [
            "water", "stock", "broth", "juice", "soda", "beer",
            "wine", "spirit", "liquor", "whisky", "rum", "vodka",
            "syrup", "tea", "coffee", "coconut water", "coconut milk drink",
            "น้ำ", "น้ำซุป",
        ],
        category: "Beverages",
    },
    // ── Packaging ──
    {
        keywords: [
            "bag", "box", "container", "wrap", "foil", "cling wrap",
            "packaging", "takeaway", "to-go", "plastic",
        ],
        category: "Packaging",
    },
];

/**
 * Match an ingredient name to a category name.
 * Returns null if no rule matches.
 */
function matchCategory(name: string): string | null {
    const lower = name.toLowerCase();
    for (const rule of KEYWORD_RULES) {
        if (rule.keywords.some(kw => lower.includes(kw.toLowerCase()))) {
            return rule.category;
        }
    }
    return null;
}

// ─── POST /api/ingredients/auto-categorize ────────────────────────────────────
// Body: { overwrite?: boolean }  — if true, re-assign even already-categorised items
export async function POST(request: Request) {
    try {
        const session = await getSession();
        if (!session || !["admin", "manager"].includes(session.role)) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const body = await request.json().catch(() => ({}));
        const overwrite: boolean = body.overwrite === true;

        // 1. Fetch all categories (by name → id map)
        const cats = await prisma.ingredientCategory.findMany({ select: { id: true, name: true } });
        const catMap = new Map(cats.map(c => [c.name, c.id]));

        if (cats.length === 0) {
            return NextResponse.json({ error: "No categories found. Create categories first." }, { status: 400 });
        }

        // 2. Fetch ingredients (only uncategorised unless overwrite=true)
        const where = overwrite ? {} : { categoryId: null };
        const ingredients = await prisma.ingredient.findMany({
            where,
            select: { id: true, name: true, categoryId: true },
        });

        // 3. Match and update
        const assigned: string[] = [];
        const skipped:  string[] = [];

        for (const ing of ingredients) {
            const catName = matchCategory(ing.name);
            if (!catName) { skipped.push(ing.name); continue; }

            const catId = catMap.get(catName);
            if (!catId) { skipped.push(ing.name); continue; } // category doesn't exist in DB

            await prisma.ingredient.update({
                where: { id: ing.id },
                data:  { categoryId: catId },
            });
            assigned.push(`${ing.name} → ${catName}`);
        }

        logAudit({
            session,
            action: "UPDATE",
            targetTable: "Ingredient",
            targetId: "bulk",
            targetName: `auto-categorize (${assigned.length} assigned)`,
            newValues: { assigned: assigned.length, skipped: skipped.length, overwrite },
            request,
        });

        return NextResponse.json({
            assigned: assigned.length,
            skipped:  skipped.length,
            details:  assigned,
            unmatched: skipped,
        });
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: "Auto-categorize failed" }, { status: 500 });
    }
}
