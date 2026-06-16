/**
 * POST /api/loss/email-report  (Admin only)
 *   body: { from, to }  — emails the Loss Management summary for the range to all
 *   active admins via Resend.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { sendEmail } from "@/lib/notifications/email";
import { STORE_NAME } from "@/lib/branding";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;
const r2 = (n: number) => Math.round(n * 100) / 100;
const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { from, to } = await req.json();
    if (!from || !to) return NextResponse.json({ error: "from and to are required" }, { status: 400 });
    const fromD = new Date(from + "T00:00:00.000Z"), toD = new Date(to + "T23:59:59.999Z");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [complaints, discounts, admins]: [any[], any[], { email: string }[]] = await Promise.all([
        db.lossComplaint.findMany({ where: { businessDate: { gte: fromD, lte: toD }, actionType: "Complaint" } }),
        db.lossDiscount.findMany({ where: { businessDate: { gte: fromD, lte: toD } } }),
        db.user.findMany({ where: { role: "admin", isActive: true }, select: { email: true } }),
    ]);
    const recipients = admins.map(a => a.email).filter(Boolean);
    if (recipients.length === 0) return NextResponse.json({ error: "No active admin email addresses found." }, { status: 400 });

    const netComplaint = r2(complaints.reduce((s, c) => s + Number(c.netAmount), 0));
    const discountTotal = r2(discounts.reduce((s, d) => s + Number(d.discountAmount), 0));
    const combined = r2(netComplaint + discountTotal);
    const highRisk = discounts.filter(d => d.riskLevel === "HIGH").length;

    const reasonM = new Map<string, number>();
    for (const c of complaints) reasonM.set(c.reasonCategory, (reasonM.get(c.reasonCategory) ?? 0) + Number(c.netAmount));
    const topReasons = [...reasonM.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);

    const subject = `Loss Management — ${from === to ? from : `${from} → ${to}`} · Net ${money(combined)}`;
    const rows = topReasons.map(([r, v]) => `<tr><td style="padding:4px 8px">${r}</td><td style="padding:4px 8px;text-align:right">${money(r2(v))}</td></tr>`).join("");
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px">
        <h2 style="color:#1e293b">Loss Management Summary</h2>
        <p style="color:#64748b">${from} → ${to}</p>
        <table style="border-collapse:collapse;width:100%;margin:12px 0">
          <tr><td style="padding:6px 8px;font-weight:bold">Combined Net Loss</td><td style="padding:6px 8px;text-align:right;color:#e11d48;font-weight:bold">${money(combined)}</td></tr>
          <tr><td style="padding:6px 8px">Net Complaints</td><td style="padding:6px 8px;text-align:right">${money(netComplaint)}</td></tr>
          <tr><td style="padding:6px 8px">Discounts</td><td style="padding:6px 8px;text-align:right">${money(discountTotal)}</td></tr>
          <tr><td style="padding:6px 8px">High-risk discount flags</td><td style="padding:6px 8px;text-align:right">${highRisk}</td></tr>
        </table>
        <h3 style="color:#1e293b;font-size:14px">Top reasons</h3>
        <table style="border-collapse:collapse;width:100%">${rows || '<tr><td style="padding:4px 8px;color:#94a3b8">No complaints</td></tr>'}</table>
        <p style="color:#94a3b8;font-size:12px;margin-top:16px">Generated from Loss Management · ${STORE_NAME}</p>
      </div>`;
    const text = `Loss Management ${from} → ${to}\nCombined Net Loss: ${money(combined)}\nNet Complaints: ${money(netComplaint)}\nDiscounts: ${money(discountTotal)}\nHigh-risk flags: ${highRisk}\nTop reasons: ${topReasons.map(([r, v]) => `${r} ${money(r2(v))}`).join(", ")}`;

    const res = await sendEmail({ to: recipients, subject, html, text });
    if (!res.ok) return NextResponse.json({ error: res.error ?? "Email failed", skipped: res.skipped }, { status: res.skipped ? 400 : 500 });
    return NextResponse.json({ ok: true, sentTo: recipients.length });
}
