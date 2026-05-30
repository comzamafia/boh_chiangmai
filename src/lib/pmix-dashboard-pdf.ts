/**
 * PMIX Daily Dashboard PDF — single page A4 portrait.
 *
 * Compact layout that fits everything on ONE page:
 *   Header  (20pt)                       title + subtitle
 *   KPI strip (70pt)                     FOOD · LIQUOR · BEVERAGE · DESSERT
 *   Top Selling Items by Category        4 cols × 5 items
 *   Bar Performance · Dessert            5 cols (Cocktails / Mocktails /
 *                                        Beer / Beverage / Desserts)
 *   Key Insights + Management Focus      side-by-side, 50/50
 *   Footer                               page number + totals
 *
 * No emojis (jsPDF default fonts render them as squares). Visual interest
 * comes from colour stripes, coloured rank dots, and section bars.
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { PmixDashboardResult } from "@/lib/api";

// ─── Layout constants (tuned to fill one page comfortably) ───────────────────
// Sized to use the whole A4 portrait page without crowding. Bigger KPI cards
// + bigger rows = important figures are easy to read at a glance.
const M           = 30;
const GAP         = 8;
const ROW_H       = 15;            // item row height (more readable)
const KPI_H       = 86;            // taller KPI cards
const BAR_H       = 22;            // section bar
const SECTION_GAP = 12;

// ─── Palette ─────────────────────────────────────────────────────────────────
type RGB = [number, number, number];
const C: Record<string, RGB> = {
    rose:    [225,  29,  72],
    emerald: [16,  185, 129],
    blue:    [37,   99, 235],
    orange: [234,   88,  12],
    purple: [109,  40, 217],
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

    let y = M;

    // ── HEADER ───────────────────────────────────────────────────────────────
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(...C.purple);

    const isRange = !!(data.rangeFrom && data.rangeTo);
    const dateLabel = isRange
        ? `${formatDateMonDay(data.rangeFrom!)} – ${formatDateMonDay(data.rangeTo!)}`
        : formatDateMonDay(isoDateOnly(data.businessDate));
    doc.text(`${locationLabel.toUpperCase()} · ${dateLabel} PRODUCT MIX DASHBOARD`, M, y + 6);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...C.muted);
    const sub: string[] = [];
    if (isRange && data.dayCount != null) {
        const uc = data.uploadCount ?? 0;
        sub.push(`${data.dayCount}-day aggregate · ${uc} upload${uc === 1 ? "" : "s"}`);
    }
    sub.push(`Total Sales ${fmtMoney(data.totalSales)}`);
    sub.push(`Total Qty ${data.totalQty.toLocaleString()}`);
    doc.text(sub.join("  ·  "), M, y + 20);

    y += 34;

    // ── KPI ROW ──────────────────────────────────────────────────────────────
    const kpis: { label: string; pct: number; sales: number; colour: RGB }[] = [
        { label: "FOOD",     pct: data.macros.FOOD.pct,     sales: data.macros.FOOD.sales,     colour: C.rose },
        { label: "LIQUOR",   pct: data.macros.LIQUOR.pct,   sales: data.macros.LIQUOR.sales,   colour: C.emerald },
        { label: "BEVERAGE", pct: data.macros.BEVERAGE.pct, sales: data.macros.BEVERAGE.sales, colour: C.blue },
        { label: "DESSERT",  pct: data.macros.DESSERT.pct,  sales: data.macros.DESSERT.sales,  colour: C.orange },
    ];
    const kpiW = (contentW - GAP * (kpis.length - 1)) / kpis.length;

    kpis.forEach((k, i) => {
        const x = M + i * (kpiW + GAP);

        // Card body
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(...C.border);
        doc.setLineWidth(0.8);
        doc.roundedRect(x, y, kpiW, KPI_H, 6, 6, "FD");

        // Coloured left stripe (taller / bolder for visual prominence)
        doc.setFillColor(...k.colour);
        doc.roundedRect(x, y, 5, KPI_H, 2.5, 2.5, "F");
        doc.rect(x + 2.5, y, 2.5, KPI_H, "F");

        const px = x + 14;

        // Label
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9.5);
        doc.setTextColor(...k.colour);
        doc.text(k.label, px, y + 18);

        // Big % — measure width AT THE BIG SIZE before resizing
        doc.setFont("helvetica", "bold");
        doc.setFontSize(30);                 // bigger headline number
        doc.setTextColor(...C.text);
        const pctText  = String(k.pct);
        const pctWidth = doc.getTextWidth(pctText);
        doc.text(pctText, px, y + 50);

        // % glyph — sized down but still prominent, positioned using the
        // pre-measured width so it never overlaps the number.
        doc.setFont("helvetica", "bold");
        doc.setFontSize(15);
        doc.setTextColor(...k.colour);
        doc.text("%", px + pctWidth + 3, y + 50);

        // Sales amount — bold and dark for prominence
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.setTextColor(...C.text);
        doc.text(fmtMoney(k.sales), px, y + 68);

        // Sub-label
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(...C.muted);
        doc.text("of Total Sales", px, y + 78);
    });

    y += KPI_H + SECTION_GAP;

    // ── SECTION: Top Selling Items by Category (4 pinned cols) ───────────────
    drawSectionBar(doc, "TOP SELLING ITEMS BY CATEGORY", M, y, contentW);
    y += BAR_H + 4;

    const cats = (data.topByCategory ?? []).slice(0, 4);
    const colCount = Math.max(cats.length, 1);
    const topColW = (contentW - GAP * (colCount - 1)) / colCount;
    const topMaxItems = Math.max(...cats.map(c => c.items.length), 1);
    const topColH = 32 + topMaxItems * ROW_H + 8;
    cats.forEach((cat, i) => {
        const cx = M + i * (topColW + GAP);
        drawItemColumn(doc, cx, y, topColW, topColH, cat.category, cat.items, C.rose);
    });
    y += topColH + SECTION_GAP;

    // ── SECTION: Bar Performance + Dessert (5 cols combined for compactness) ─
    drawSectionBar(doc, "BAR PERFORMANCE  ·  DESSERT PERFORMANCE", M, y, contentW);
    y += BAR_H + 4;

    const barCols: { label: string; items: { itemName: string; qty: number }[]; colour: RGB }[] = [
        { label: "COCKTAILS", items: data.bar.cocktails, colour: C.rose },
        { label: "MOCKTAILS", items: data.bar.mocktails, colour: C.rose },
        { label: "BEER",      items: data.bar.beer,      colour: C.blue },
        { label: "BEVERAGE",  items: data.bar.beverage,  colour: C.blue },
        { label: "DESSERTS",  items: data.desserts,      colour: C.orange },
    ];
    const bw = (contentW - GAP * (barCols.length - 1)) / barCols.length;
    const barMaxItems = Math.max(...barCols.map(b => b.items.length), 1);
    const barColH = 32 + barMaxItems * ROW_H + 8;
    barCols.forEach((bc, i) => {
        const cx = M + i * (bw + GAP);
        drawItemColumn(doc, cx, y, bw, barColH, bc.label, bc.items, bc.colour);
    });
    y += barColH + SECTION_GAP;

    // ── SECTION: Key Insights + Management Focus (side-by-side 50/50) ────────
    const insightsW = (contentW - GAP) * 0.55;
    const focusW    = (contentW - GAP) * 0.45;
    const insightsX = M;
    const focusX    = M + insightsW + GAP;

    // Section bars
    drawSectionBar(doc, "KEY INSIGHTS",      insightsX, y, insightsW);
    drawSectionBar(doc, "MANAGEMENT FOCUS",  focusX,    y, focusW);
    y += BAR_H + 4;

    // Insights body
    const insightStart = y + 2;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    let iy = insightStart;
    for (const line of data.insights) {
        const wrapped = doc.splitTextToSize(line, insightsW - 22) as string[];
        doc.setFillColor(...C.emerald);
        doc.circle(insightsX + 7, iy + 5, 2.8, "F");
        doc.setTextColor(...C.text);
        doc.text(wrapped, insightsX + 16, iy + 7);
        iy += wrapped.length * 13 + 5;
    }

    // Focus body
    let fy = insightStart;
    const focus = data.focus.slice(0, 5);
    for (const f of focus) {
        // Title row
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.setTextColor(...C.purple);
        doc.text(f.title.toUpperCase(), focusX + 4, fy + 7);

        // Body wrapped
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...C.text);
        const wrapped = doc.splitTextToSize(f.body, focusW - 8) as string[];
        doc.text(wrapped, focusX + 4, fy + 18);

        fy += 22 + wrapped.length * 10;
    }

    y = Math.max(iy, fy) + 10;

    // ── Footer ───────────────────────────────────────────────────────────────
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.5);
    doc.line(M, pageH - 28, pageW - M, pageH - 28);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...C.muted);
    doc.text(`Generated ${new Date().toLocaleString("en-CA")}`, M, pageH - 14);
    doc.text("BOH Chiang Mai · Single-page report", pageW - M, pageH - 14, { align: "right" });

    // Filename
    const fileLabel = data.rangeFrom && data.rangeTo
        ? `${data.rangeFrom}_to_${data.rangeTo}`
        : isoDateOnly(data.businessDate);
    doc.save(`PMIX_Dashboard_${fileLabel}.pdf`);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function drawSectionBar(doc: jsPDF, label: string, x: number, y: number, width: number) {
    doc.setFillColor(...C.purple);
    doc.roundedRect(x, y, width, BAR_H, 4, 4, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(255);
    doc.text(label, x + 12, y + 14.5);
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
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.6);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, y, w, h, 5, 5, "FD");

    // Title (coloured + bigger)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...colour);
    doc.text(truncate(doc, title.toUpperCase(), w - 12), x + 9, y + 13);

    // Sub-header
    doc.setFontSize(6.5);
    doc.setTextColor(...C.muted);
    doc.text("ITEM", x + 9,     y + 24);
    doc.text("SOLD", x + w - 9, y + 24, { align: "right" });

    // Divider
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.4);
    doc.line(x + 7, y + 27, x + w - 7, y + 27);

    if (items.length === 0) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(7.5);
        doc.setTextColor(...C.muted);
        doc.text("No data", x + 9, y + 42);
        return;
    }

    items.forEach((it, idx) => {
        const ry = y + 27 + (idx + 1) * ROW_H;

        // Rank dot (bigger)
        const dotX = x + 13;
        const dotY = ry - 4;
        doc.setFillColor(...colour);
        doc.circle(dotX, dotY, 5.2, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor(255);
        doc.text(String(idx + 1), dotX, dotY + 2.4, { align: "center" });

        // Item name
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...C.text);
        const nameMaxW = w - 50;
        doc.text(truncate(doc, it.itemName, nameMaxW), x + 23, ry);

        // Qty
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.setTextColor(...C.text);
        doc.text(String(it.qty), x + w - 9, ry, { align: "right" });
    });
}

// Silence the unused-import warning while keeping autotable available for future use
void autoTable;

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
