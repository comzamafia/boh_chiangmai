/**
 * GET /api/usage-settings/audit   (admin / manager / chef)
 *
 * Self-serve data-quality check for Usage-Report calc settings. Surfaces:
 *   - duplicates        : same itemName+type+ingredient defined more than once
 *                         (double counts in the Ingredients tab).
 *   - baseNameMismatch  : base portion standards whose itemName matches no real
 *                         PMIX item (typo / trailing dot / renamed dish).
 *   - modifierNameMismatch : modifier portion standards whose itemName matches
 *                         no real PMIX modifier (e.g. a protein row stored under
 *                         a dish name — these never fire and usually signal the
 *                         old cross-contamination mistake).
 *   - linkNameMismatch  : composite menu links whose itemName matches no PMIX item.
 *
 * Names are compared case-insensitively against PMIX data from the last 365 days.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;
const EDIT_ROLES = ["admin", "manager", "chef"];
const norm = (s: string) => String(s ?? "").toLowerCase().trim();

export async function GET() {
    const session = await getSession();
    if (!session || !EDIT_ROLES.includes(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const from = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const uploads = await db.pmixUpload.findMany({
        where: { OR: [{ businessDate: { gte: from } }, { businessDate: null, uploadedAt: { gte: from } }] },
        select: { id: true },
    });
    const uploadIds = uploads.map((u: { id: string }) => u.id);

    const [items, standards, links] = await Promise.all([
        uploadIds.length
            ? db.pmixItem.findMany({ where: { uploadId: { in: uploadIds } }, select: { itemName: true, modifiers: { select: { modifier: true } } } })
            : Promise.resolve([]),
        db.portionStandard.findMany({ include: { ingredient: { select: { name: true } } } }),
        db.menuCompositeLink.findMany({ include: { composite: { select: { name: true } } } }),
    ]);

    // Known PMIX names
    const pmixItems = new Set<string>();
    const pmixMods  = new Set<string>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const it of items as any[]) {
        pmixItems.add(norm(it.itemName));
        for (const m of it.modifiers ?? []) pmixMods.add(norm(m.modifier));
    }
    const havePmix = pmixItems.size > 0;

    // ── Duplicates (same itemName + type + ingredient) ──
    const seen = new Map<string, { itemName: string; type: string; ingredientName: string; count: number }>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const s of standards as any[]) {
        if (!s.ingredient) continue;
        const key = `${norm(s.itemName)}||${s.type}||${s.ingredientId}`;
        const e = seen.get(key);
        if (e) e.count++;
        else seen.set(key, { itemName: s.itemName, type: s.type, ingredientName: s.ingredient.name, count: 1 });
    }
    const duplicates = [...seen.values()].filter(x => x.count > 1).sort((a, b) => b.count - a.count);

    // ── Name mismatches (only when we have PMIX data to compare against) ──
    const baseNameMismatch: { itemName: string; ingredientName: string }[] = [];
    const modifierNameMismatch: { itemName: string; ingredientName: string }[] = [];
    if (havePmix) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const s of standards as any[]) {
            if (!s.ingredient) continue;
            if (s.type === "modifier") {
                if (!pmixMods.has(norm(s.itemName))) modifierNameMismatch.push({ itemName: s.itemName, ingredientName: s.ingredient.name });
            } else {
                if (!pmixItems.has(norm(s.itemName))) baseNameMismatch.push({ itemName: s.itemName, ingredientName: s.ingredient.name });
            }
        }
    }
    const linkNameMismatch: { itemName: string; compositeName: string }[] = [];
    if (havePmix) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const l of links as any[]) {
            if (!pmixItems.has(norm(l.itemName))) linkNameMismatch.push({ itemName: l.itemName, compositeName: l.composite?.name ?? "?" });
        }
    }

    const total = duplicates.length + baseNameMismatch.length + modifierNameMismatch.length + linkNameMismatch.length;
    return NextResponse.json({
        havePmix,
        counts: { pmixItems: pmixItems.size, pmixModifiers: pmixMods.size },
        total,
        duplicates,
        baseNameMismatch,
        modifierNameMismatch,
        linkNameMismatch,
    });
}
