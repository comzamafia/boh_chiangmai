/**
 * GET /api/loss/dashboard?from=YYYY-MM-DD&to=YYYY-MM-DD  (Admin only)
 * Aggregates complaints + discounts for the range into the dashboard payload.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;
const r2 = (n: number) => Math.round(n * 100) / 100;
const day = (d: Date) => d.toISOString().slice(0, 10);

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const sp = new URL(req.url).searchParams;
    const toStr = sp.get("to") ?? new Date().toISOString().slice(0, 10);
    const fromStr = sp.get("from") ?? new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    const from = new Date(fromStr + "T00:00:00.000Z"), to = new Date(toStr + "T23:59:59.999Z");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [complaints, discounts]: [any[], any[]] = await Promise.all([
        db.lossComplaint.findMany({ where: { businessDate: { gte: from, lte: to } } }),
        db.lossDiscount.findMany({ where: { businessDate: { gte: from, lte: to } } }),
    ]);

    const comp = complaints.filter(c => c.actionType === "Complaint");
    const undo = complaints.filter(c => c.actionType === "Undo");
    const num = (x: unknown) => Number(x);

    // ── KPIs ──
    const grossComplaintTotal = r2(comp.reduce((s, c) => s + num(c.grossAmount), 0));
    const netComplaintTotal   = r2(comp.reduce((s, c) => s + num(c.netAmount), 0));
    const undoTotal           = r2(undo.reduce((s, c) => s + num(c.grossAmount), 0));
    const discountTotal       = r2(discounts.reduce((s, d) => s + num(d.discountAmount), 0));
    const highRiskCount       = discounts.filter(d => d.riskLevel === "HIGH").length;
    const genericCount        = comp.filter(c => c.isGenericItem).length;
    const unassignedCount     = comp.filter(c => c.isUnassignedUser).length;
    const uncategorizedCount  = comp.filter(c => c.reasonCategory === "Uncategorized").length;

    // ── helper group ──
    function group<T>(arr: T[], keyFn: (x: T) => string, val: (acc: { count: number; gross: number; net: number }, x: T) => void) {
        const m = new Map<string, { key: string; count: number; gross: number; net: number }>();
        for (const x of arr) {
            const k = keyFn(x);
            const a = m.get(k) ?? { key: k, count: 0, gross: 0, net: 0 };
            a.count++; val(a, x); m.set(k, a);
        }
        return [...m.values()];
    }

    const byReason = group(comp, c => c.reasonCategory, (a, c) => { a.net += num(c.netAmount); a.gross += num(c.grossAmount); })
        .map(g => ({ category: g.key, count: g.count, net: r2(g.net) })).sort((a, b) => b.net - a.net);

    const topItems = group(comp, c => c.itemDetail, (a, c) => { a.net += num(c.netAmount); })
        .map(g => ({ item: g.key, count: g.count, net: r2(g.net), isGeneric: comp.find(c => c.itemDetail === g.key)?.isGenericItem ?? false }))
        .sort((a, b) => b.net - a.net).slice(0, 15);

    const undoByUser = new Map<string, number>();
    for (const u of undo) undoByUser.set(u.userName, (undoByUser.get(u.userName) ?? 0) + 1);
    const byStaff = group(comp, c => c.userName, (a, c) => { a.gross += num(c.grossAmount); a.net += num(c.netAmount); })
        .map(g => ({ user: g.key, count: g.count, gross: r2(g.gross), net: r2(g.net), undoCount: undoByUser.get(g.key) ?? 0,
            unassigned: comp.find(c => c.userName === g.key)?.isUnassignedUser ?? false }))
        .sort((a, b) => b.net - a.net);

    const byDevice = group(comp, c => c.device, (a, c) => { a.net += num(c.netAmount); })
        .map(g => ({ device: g.key, count: g.count, net: r2(g.net) })).sort((a, b) => b.net - a.net);
    const byZone = group(comp, c => c.zone, (a, c) => { a.net += num(c.netAmount); })
        .map(g => ({ zone: g.key, count: g.count, net: r2(g.net) })).sort((a, b) => b.net - a.net);

    // ── Undo reconciliation pairs ──
    const loopOrders = new Set<string>();
    const compByOrder = new Map<string, number>();
    for (const c of comp) compByOrder.set(c.orderId, (compByOrder.get(c.orderId) ?? 0) + 1);
    for (const [oid, n] of compByOrder) if (n > 2) loopOrders.add(oid);

    const pairKey = (c: { orderId: string; itemDetail: string }) => `${c.orderId}|||${c.itemDetail}`;
    const pm = new Map<string, { orderId: string; item: string; complaint: number; undo: number; cCount: number; uCount: number }>();
    for (const c of comp) { const k = pairKey(c); const a = pm.get(k) ?? { orderId: c.orderId, item: c.itemDetail, complaint: 0, undo: 0, cCount: 0, uCount: 0 }; a.complaint += num(c.grossAmount); a.cCount++; pm.set(k, a); }
    for (const u of undo) { const k = pairKey(u); const a = pm.get(k) ?? { orderId: u.orderId, item: u.itemDetail, complaint: 0, undo: 0, cCount: 0, uCount: 0 }; a.undo += num(u.grossAmount); a.uCount++; pm.set(k, a); }
    const undoPairs = [...pm.values()].filter(p => p.uCount > 0).map(p => ({
        orderId: p.orderId, item: p.item, complaint: r2(p.complaint), undo: r2(p.undo),
        net: r2(p.complaint - p.undo), reconciled: p.cCount > 0, loop: loopOrders.has(p.orderId),
    })).sort((a, b) => b.undo - a.undo);
    const orphanUndos = undoPairs.filter(p => !p.reconciled);

    // ── Discounts ──
    const dByCat = new Map<string, { count: number; amount: number }>();
    for (const d of discounts) { const a = dByCat.get(d.discountCategory) ?? { count: 0, amount: 0 }; a.count++; a.amount += num(d.discountAmount); dByCat.set(d.discountCategory, a); }
    const discountByCategory = [...dByCat.entries()].map(([category, v]) => ({ category, count: v.count, amount: r2(v.amount) }));

    const dByName = new Map<string, { category: string; count: number; amount: number }>();
    for (const d of discounts) { const a = dByName.get(d.discountName) ?? { category: d.discountCategory, count: 0, amount: 0 }; a.count++; a.amount += num(d.discountAmount); dByName.set(d.discountName, a); }
    const discountByName = [...dByName.entries()].map(([name, v]) => ({ name, category: v.category, count: v.count, amount: r2(v.amount) })).sort((a, b) => b.amount - a.amount);

    const authM = new Map<string, { count: number; amount: number; types: Set<string>; risk: number; anon: boolean; mgr100: number }>();
    for (const d of discounts) {
        const a = authM.get(d.authorizedBy) ?? { count: 0, amount: 0, types: new Set<string>(), risk: 0, anon: d.isAnonymousAuth, mgr100: 0 };
        a.count++; a.amount += num(d.discountAmount); a.types.add(d.discountCategory);
        if (d.riskLevel === "HIGH") a.risk++;
        if (/manager\s*100%/i.test(d.discountName)) a.mgr100++;
        authM.set(d.authorizedBy, a);
    }
    const staffAuth = [...authM.entries()].map(([by, v]) => ({ authorizedBy: by, count: v.count, amount: r2(v.amount), types: [...v.types].join(", "), riskCount: v.risk, anon: v.anon, mgr100: v.mgr100 })).sort((a, b) => b.amount - a.amount);

    const hourly = Array.from({ length: 24 }, () => 0);
    for (const d of discounts) if (d.createTime) hourly[new Date(d.createTime).getHours()] += num(d.discountAmount);

    const highRisk = discounts.filter(d => d.riskLevel === "HIGH").map(d => ({
        time: d.createTime ? new Date(d.createTime).toISOString() : null, displayId: d.displayId,
        name: d.discountName, amount: r2(num(d.discountAmount)), authorizedBy: d.authorizedBy,
        reason: [/manager\s*100%/i.test(d.discountName) && d.isAnonymousAuth ? "MANAGER 100% by Host" : null,
                 /custom discount/i.test(d.discountName) && d.isAnonymousAuth ? "Custom, no named approver" : null,
                 num(d.discountAmount) >= 50 ? "≥ $50" : null,
                 d.createTime && new Date(d.createTime).getHours() >= 22 ? "After 22:00" : null].filter(Boolean).join(" · "),
    })).sort((a, b) => b.amount - a.amount);

    const promotions = discounts.filter(d => d.discountCategory === "Promotion")
        .reduce((m: Map<string, { count: number; amount: number }>, d) => { const a = m.get(d.discountName) ?? { count: 0, amount: 0 }; a.count++; a.amount += num(d.discountAmount); return m.set(d.discountName, a); }, new Map())
        ;
    const promoList = [...promotions.entries()].map(([name, v]) => ({ name, count: v.count, amount: r2(v.amount) })).sort((a, b) => b.amount - a.amount);

    const bulkCount = discounts.filter(d => d.isBulkDiscount).length;

    // ── period alignment ──
    const compDates = new Set(comp.map(c => day(new Date(c.businessDate))));
    const discDates = new Set(discounts.map(d => day(new Date(d.businessDate))));
    const discMissingForComplaintDays = [...compDates].filter(d => !discDates.has(d)).sort();

    return NextResponse.json({
        range: { from: fromStr, to: toStr },
        kpis: {
            grossComplaintTotal, netComplaintTotal, undoTotal, complaintCount: comp.length, undoCount: undo.length,
            discountTotal, combinedNetLoss: r2(netComplaintTotal + discountTotal), highRiskCount,
            dataQualityIssues: genericCount + unassignedCount + uncategorizedCount,
            genericCount, unassignedCount, uncategorizedCount, bulkCount,
        },
        byReason, topItems, byStaff, byDevice, byZone, undoPairs, orphanUndos,
        discountByCategory, discountByName, staffAuth, hourly, highRisk, promotions: promoList,
        periodAlignment: {
            complaintDays: compDates.size, discountDays: discDates.size,
            discMissingForComplaintDays, hasDiscountData: discounts.length > 0, hasComplaintData: comp.length > 0,
        },
    });
}
