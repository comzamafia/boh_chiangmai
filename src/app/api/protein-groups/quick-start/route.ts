/**
 * POST /api/protein-groups/quick-start   { autoMap?: boolean }
 *
 * One-click setup for the Main Protein tab:
 *   1. Ensures the 16 default protein groups exist, in the kitchen's tracking
 *      order (Chicken, Beef, Shrimp, …). Existing groups (by name) are kept and
 *      only re-ordered.
 *   2. When autoMap is true, assigns each currently-unassigned protein-ish
 *      ingredient to its best-matching group by keyword. Existing memberships
 *      are never touched; ambiguous matches can be fixed in the manager.
 *
 * Returns { groups, assigned:[{ingredient,group}], unmatched:[ingredientName] }.
 * Admin / manager / chef only.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireBranch, isBranchContext } from "@/lib/branch";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;
const EDIT_ROLES = ["admin", "manager", "chef"];
const INCLUDE = { members: { include: { ingredient: { select: { id: true, name: true, recipeUnit: true } } } } };

// Default groups in display order.
export const DEFAULT_PROTEIN_GROUPS = [
    "Chicken", "Beef", "Shrimp", "Lobster", "Squid", "Soft Shell Crab",
    "Crying Tiger Steak", "Duck", "CM Wings", "Gai Yaang.",
    "KFC ( Korean Fried Cauliflower)", "Wagyu Khao Soi Dumplings",
    "Lemongrass Chicken Dumplings", "Crispy Fish", "Salmon Crudo", "Thai Tuna Ceviche",
];

// Keyword → group, most specific first. Returns the group name or null.
// Order matters: e.g. "Beef NY steak" must hit Crying Tiger before the Beef rule,
// and "Chicken - Boneless Thigh" must hit Gai Yaang before the Chicken rule.
const NON_PROTEIN = /\b(sauce|powder|paste|oil|stock|broth|seasoning|marinade|glaze|dressing)\b/i;
function matchGroup(rawName: string): string | null {
    const n = rawName.toLowerCase();
    if (NON_PROTEIN.test(n)) return null;
    if (/crying\s*tiger|ny\s*steak/.test(n)) return "Crying Tiger Steak";
    if (/wagyu|gyoza/.test(n) || (/dumpling/.test(n) && /beef/.test(n))) return "Wagyu Khao Soi Dumplings";
    if (/dumpling/.test(n) && (/lemongrass|leamon\s*grass|lemon\s*grass/.test(n) || /chicken/.test(n))) return "Lemongrass Chicken Dumplings";
    if (/cauliflower/.test(n)) return "KFC ( Korean Fried Cauliflower)";
    if (/soft\s*shell\s*crab/.test(n)) return "Soft Shell Crab";
    if (/lobster/.test(n)) return "Lobster";
    if (/squid|calamari/.test(n)) return "Squid";
    if (/shrimp|prawn/.test(n)) return "Shrimp";
    if (/salmon/.test(n)) return "Salmon Crudo";
    if (/tuna/.test(n)) return "Thai Tuna Ceviche";
    if (/basa|tilapia|\bcod\b|crispy\s*fish|\bfish\b/.test(n)) return "Crispy Fish";
    if (/gai\s*ya?ang|boneless\s*thigh/.test(n)) return "Gai Yaang.";
    if (/duck/.test(n)) return "Duck";
    if (/\bwing/.test(n)) return "CM Wings";
    if (/beef|brasied|braised/.test(n)) return "Beef";
    if (/chicken/.test(n)) return "Chicken";
    return null;
}

export async function POST(req: NextRequest) {
    const ctx = await requireBranch();
    if (!isBranchContext(ctx)) return ctx;
    const { session, branchId } = ctx;
    if (!EDIT_ROLES.includes(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const autoMap = await req.json().then(b => b?.autoMap !== false).catch(() => true);

    // 1. Ensure the 16 default groups exist, in order.
    for (let i = 0; i < DEFAULT_PROTEIN_GROUPS.length; i++) {
        const name = DEFAULT_PROTEIN_GROUPS[i];
        await db.proteinGroup.upsert({
            where: { name_branchId: { name, branchId } },
            update: { sortOrder: i },
            create: { name, sortOrder: i, branchId },
        });
    }

    const assigned: { ingredient: string; group: string }[] = [];
    const unmatched: string[] = [];

    if (autoMap) {
        const groups = await db.proteinGroup.findMany({ where: { branchId }, include: { members: true } });
        const groupByName = new Map<string, { id: string }>();
        const alreadyMember = new Set<string>();
        for (const g of groups as { id: string; name: string; members: { ingredientId: string }[] }[]) {
            groupByName.set(g.name, { id: g.id });
            for (const m of g.members) alreadyMember.add(m.ingredientId);
        }

        const ingredients = await db.ingredient.findMany({ where: { branchId }, select: { id: true, name: true, category: { select: { name: true } } } });
        for (const ig of ingredients as { id: string; name: string; category: { name: string } | null }[]) {
            if (alreadyMember.has(ig.id)) continue;
            const target = matchGroup(ig.name);
            if (!target) {
                // surface only likely-protein leftovers (tagged Proteins) as unmatched
                if (/protein/i.test(ig.category?.name ?? "")) unmatched.push(ig.name);
                continue;
            }
            const g = groupByName.get(target);
            if (!g) continue;
            try {
                await db.proteinGroupMember.create({ data: { groupId: g.id, ingredientId: ig.id, branchId } });
                assigned.push({ ingredient: ig.name, group: target });
            } catch { /* unique clash — already a member, ignore */ }
        }
    }

    const result = await db.proteinGroup.findMany({ where: { branchId }, include: INCLUDE, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
    return NextResponse.json({ groups: result, assigned, unmatched });
}
