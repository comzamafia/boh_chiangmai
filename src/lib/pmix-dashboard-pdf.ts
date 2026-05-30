/**
 * Single-page PMIX Daily Dashboard PDF export.
 *
 * Design principles:
 *   - No emojis (jsPDF default fonts can't render them — they appear as boxes).
 *     Visual interest comes from colour, shapes, and typography.
 *   - Strict margin discipline: every drawn element fits inside the printable area.
 *   - Long item names are truncated with an ellipsis to keep columns aligned.
 *   - Cards have left colour stripes to distinguish categories at a glance.
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { PmixDashboardResult } from "@/lib/api";

// ─── Layout constants ────────────────────────────────────────────────────────
const M           = 32;            // outer margin (pt)
const GAP         = 8;             // gap between columns
const SECTION_GAP = 14;            // vertical gap before a new section
const ROW_H       = 14;            // row height inside columns
const KPI_H       = 78;            // KPI card height

// ─── Palette (matches on-screen) ─────────────────────────────────────────────
type RGB = [number, number, number];
const C: Record<string, RGB> = {
    rose:    [225,  29,  72],
    emerald: [16,  185, 129],
    blue:    [37,   99, 235],
    orange: [234,   88,  12],
    purple: [109,  40, 217],
    teal:   [13,  148, 136],
    grey:   [55,   65,  81],
    soft:   [248, 250, 252],
    border: [228, 231, 235],
    muted:  [148, 163, 184],
    text:   [30,   41,  59],
};

const fmtMoney = (n: number) =>
    "$" + n.toLocaleString("en-CA", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

// ─── Main export ─────────────────────────────────────────────────────────────
export function exportPmixDashboardToPDF(data: PmixDashboardResult, locationLabel: string) {
    const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.width;
    const pageH = doc.internal.pageSize.height;
    const contentW = pageW - M * 2;

    let y = M + 6;

    // ── HEADER: title left + date badge right ────────────────────────────────
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(...C.purple);

    // Title: single-day shows "MAY 29", range shows "MAY 22 — MAY 29"
    const isRange = !!(data.rangeFrom && data.rangeTo);
    const dateLabel = isRange
        ? `${formatDateMonDay(data.rangeFrom!)} – ${formatDateMonDay(data.rangeTo!)}`
        : formatDateMonDay(isoDateOnly(data.businessDate));
    const titleMain = `${locationLabel.toUpperCase()} · ${dateLabel}`;
    doc.text(titleMain, M, y + 4);

    // Subtitle: when range, show "PRODUCT MIX DASHBOARD · N-day aggregate (M uploads)"
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...C.muted);
    const subParts: string[] = ["PRODUCT MIX DASHBOARD"];
    if (isRange && data.dayCount != null) {
        const dc = data.dayCount;
        const uc = data.uploadCount ?? 0;
        subParts.push(`${dc}-day aggregate · ${uc} upload${uc === 1 ? "" : "s"}`);
    }
    doc.text(subParts.join("  ·  "), M, y + 20);

    // Date badge (right)
    const badgeText = isRange
        ? `${data.rangeFrom} → ${data.rangeTo}`
        : formatLongDate(isoDateOnly(data.businessDate));
    const badgeW = isRange ? 170 : 110;
    const badgeH = 26;
    const badgeX = pageW - M - badgeW;
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.8);
    doc.roundedRect(badgeX, y - 6, badgeW, badgeH, 5, 5, "S");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(isRange ? 8.5 : 9);
    doc.setTextColor(...C.text);
    doc.text(badgeText, badgeX + badgeW / 2, y + 10, { align: "center" });

    y += 38;

    // ── KPI ROW (4 cards with coloured side stripe) ──────────────────────────
    const kpis: { label: string; pct: number; sales: number; colour: RGB }[] = [
        { label: "FOOD",     pct: data.macros.FOOD.pct,     sales: data.macros.FOOD.sales,     colour: C.rose },
        { label: "LIQUOR",   pct: data.macros.LIQUOR.pct,   sales: data.macros.LIQUOR.sales,   colour: C.emerald },
        { label: "BEVERAGE", pct: data.macros.BEVERAGE.pct, sales: data.macros.BEVERAGE.sales, colour: C.blue },
        { label: "DESSERT",  pct: data.macros.DESSERT.pct,  sales: data.macros.DESSERT.sales,  colour: C.orange },
    ];
    const kpiCount = kpis.length;
    const kpiW = (contentW - GAP * (kpiCount - 1)) / kpiCount;

    kpis.forEach((k, i) => {
        const x = M + i * (kpiW + GAP);

        // Card body
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(...C.border);
        doc.setLineWidth(0.8);
        doc.roundedRect(x, y, kpiW, KPI_H, 6, 6, "FD");

        // Left coloured stripe
        doc.setFillColor(...k.colour);
        doc.roundedRect(x, y, 5, KPI_H, 2.5, 2.5, "F");
        // (square off the right edge of the stripe by drawing over it)
        doc.rect(x + 2.5, y, 2.5, KPI_H, "F");

        const px = x + 14;

        // Label
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(...k.colour);
        doc.text(k.label, px, y + 16);

        // Big %
        doc.setFontSize(26);
        doc.setTextColor(...C.text);
        const pctText = String(k.pct);
        doc.text(pctText, px, y + 44);
        const pctW = doc.getTextWidth(pctText);
        doc.setFontSize(13);
        doc.setTextColor(...C.muted);
        doc.text("%", px + pctW + 2, y + 44);

        // Sales
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(...C.text);
        doc.text(fmtMoney(k.sales), px, y + 62);

        // Sub-label
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(...C.muted);
        doc.text("of Total Sales", px, y + 72);
    });

    y += KPI_H + SECTION_GAP;

    // ── SECTION: Top Selling Items by Category ───────────────────────────────
    drawSectionBar(doc, "TOP SELLING ITEMS BY CATEGORY", M, y, contentW);
    y += 22 + 4;

    if (data.topByCategory.length > 0) {
        const cats = data.topByCategory.slice(0, 4);
        const colCount = cats.length;
        const colW     = (contentW - GAP * (colCount - 1)) / colCount;

        const maxItems  = Math.max(...cats.map(c => c.items.length), 0);
        const colHeight = 30 + maxItems * ROW_H + 8;

        cats.forEach((cat, i) => {
            const cx = M + i * (colW + GAP);
            drawItemColumn(doc, cx, y, colW, colHeight, cat.category, cat.items, C.rose);
        });
        y += colHeight + SECTION_GAP;
    }

    // ── SECTION: Bar Performance + Dessert Performance ───────────────────────
    drawSectionBar(doc, "BAR PERFORMANCE  ·  DESSERT PERFORMANCE", M, y, contentW);
    y += 22 + 4;

    const barCols: { label: string; items: { itemName: string; qty: number }[]; colour: RGB }[] = [
        { label: "COCKTAILS", items: data.bar.cocktails, colour: C.rose },
        { label: "MOCKTAILS", items: data.bar.mocktails, colour: C.rose },
        { label: "BEER",      items: data.bar.beer,      colour: C.blue },
        { label: "DESSERTS",  items: data.desserts,      colour: C.orange },
    ];
    const bw = (contentW - GAP * (barCols.length - 1)) / barCols.length;
    const maxBarItems  = Math.max(...barCols.map(b => b.items.length), 1);
    const barHeight    = 30 + maxBarItems * ROW_H + 8;
    barCols.forEach((bc, i) => {
        const cx = M + i * (bw + GAP);
        drawItemColumn(doc, cx, y, bw, barHeight, bc.label, bc.items, bc.colour);
    });
    y += barHeight + SECTION_GAP;

    // Page-break check before insights
    if (y > pageH - 220) {
        doc.addPage();
        y = M + 6;
    }

    // ── SECTION: Key Insights ────────────────────────────────────────────────
    drawSectionBar(doc, "KEY INSIGHTS", M, y, contentW);
    y += 22 + 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    const insightWrapW = contentW - 22;
    data.insights.forEach((line) => {
        // Wrap long lines so they never overflow
        const wrapped = doc.splitTextToSize(line, insightWrapW) as string[];
        // Bullet
        doc.setFillColor(...C.emerald);
        doc.circle(M + 6, y + 4, 2.6, "F");
        doc.setTextColor(...C.text);
        doc.text(wrapped, M + 16, y + 7);
        y += wrapped.length * 12 + 4;
    });

    y += 8;

    // Page-break check before focus
    if (y > pageH - 160) {
        doc.addPage();
        y = M + 6;
    }

    // ── SECTION: Management Focus ────────────────────────────────────────────
    drawSectionBar(doc, "MANAGEMENT FOCUS", M, y, contentW);
    y += 22 + 4;

    // Use autoTable so wrapping + column widths are handled cleanly
    const focusItems = data.focus.slice(0, 5);
    const cellWidth  = (contentW - GAP * (focusItems.length - 1)) / focusItems.length;
    autoTable(doc, {
        startY: y,
        head: [focusItems.map(f => f.title)],
        body: [focusItems.map(f => f.body)],
        margin: { left: M, right: M },
        tableWidth: contentW,
        theme: "plain",
        styles: {
            fontSize: 8.5,
            cellPadding: { top: 8, bottom: 8, left: 9, right: 9 },
            valign: "top",
            lineColor: C.border,
            lineWidth: 0.6,
            textColor: C.text,
        },
        headStyles: {
            fillColor: C.soft,
            textColor: C.purple,
            fontStyle: "bold",
            halign: "left",
            fontSize: 8.5,
        },
        columnStyles: focusItems.reduce<Record<number, { cellWidth: number }>>((m, _f, i) => {
            m[i] = { cellWidth };
            return m;
        }, {}),
    });

    // ── FOOTER (every page) ──────────────────────────────────────────────────
    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        doc.setDrawColor(...C.border);
        doc.setLineWidth(0.5);
        doc.line(M, pageH - 32, pageW - M, pageH - 32);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(...C.muted);
        doc.text(`Total Sales ${fmtMoney(data.totalSales)} · Total Qty ${data.totalQty.toLocaleString()}`, M, pageH - 18);
        doc.text(`Page ${p}/${totalPages} · BOH Chiang Mai`, pageW - M, pageH - 18, { align: "right" });
    }

    const fileLabel = data.rangeFrom && data.rangeTo
        ? `${data.rangeFrom}_to_${data.rangeTo}`
        : isoDateOnly(data.businessDate);
    doc.save(`PMIX_Dashboard_${fileLabel}.pdf`);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function drawSectionBar(doc: jsPDF, label: string, x: number, y: number, width: number) {
    doc.setFillColor(...C.purple);
    doc.roundedRect(x, y, width, 22, 4, 4, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(255);
    doc.text(label, x + 12, y + 14);
}

function drawItemColumn(
    doc:    jsPDF,
    x:      number,
    y:      number,
    w:      number,
    h:      number,
    title:  string,
    items:  { itemName: string; qty: number }[],
    colour: RGB,
) {
    // Card
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.6);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, y, w, h, 5, 5, "FD");

    // Title (colour)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...colour);
    const titleText = title.toUpperCase();
    const titleY    = y + 14;
    doc.text(truncate(doc, titleText, w - 16), x + 10, titleY);

    // Sub-header row
    doc.setFontSize(6.5);
    doc.setTextColor(...C.muted);
    doc.text("ITEM",  x + 10,     y + 26);
    doc.text("SOLD",  x + w - 10, y + 26, { align: "right" });

    // Separator
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.4);
    doc.line(x + 8, y + 30, x + w - 8, y + 30);

    if (items.length === 0) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(7.5);
        doc.setTextColor(...C.muted);
        doc.text("No data", x + 10, y + 44);
        return;
    }

    // Rows
    items.forEach((it, idx) => {
        const ry = y + 30 + (idx + 1) * ROW_H;

        // Rank dot
        const dotX = x + 14;
        const dotY = ry - 4;
        doc.setFillColor(...colour);
        doc.circle(dotX, dotY, 5.2, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor(255);
        doc.text(String(idx + 1), dotX, dotY + 2.4, { align: "center" });

        // Item name (truncated)
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...C.text);
        const nameMaxW = w - 56;   // reserve space for rank + qty
        doc.text(truncate(doc, it.itemName, nameMaxW), x + 24, ry);

        // Qty (right-aligned, bold)
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.setTextColor(...C.text);
        doc.text(String(it.qty), x + w - 10, ry, { align: "right" });
    });
}

function truncate(doc: jsPDF, text: string, maxWidth: number): string {
    if (doc.getTextWidth(text) <= maxWidth) return text;
    let s = text;
    while (s.length > 1 && doc.getTextWidth(s + "…") > maxWidth) s = s.slice(0, -1);
    return s + "…";
}

function isoDateOnly(iso: string): string {
    return /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : iso;
}

function formatDateMonDay(iso: string): string {
    const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
    if (isNaN(d.getTime())) return iso;
    const months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
    return `${months[d.getMonth()]} ${d.getDate()}`;
}

function formatLongDate(iso: string): string {
    const dateOnly = isoDateOnly(iso);
    const d = new Date(dateOnly + "T00:00:00");
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" });
}
