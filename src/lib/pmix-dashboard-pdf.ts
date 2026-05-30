/**
 * Single-page PMIX Daily Dashboard PDF export.
 * Mirrors the on-screen layout: KPI strip → Top items grid → Bar + Dessert
 * → Key insights → Management focus.
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { PmixDashboardResult } from "@/lib/api";

const fmtMoney = (n: number) => `$${n.toLocaleString("en-CA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

// Brand-aligned palette (matches the on-screen pinks/purples/golds).
const C = {
    pink:    [219,  39, 119] as [number, number, number],
    green:   [16,  185, 129] as [number, number, number],
    blue:    [37,   99, 235] as [number, number, number],
    orange: [234,   88,  12] as [number, number, number],
    purple: [109,  40, 217] as [number, number, number],
    teal:   [13,  148, 136] as [number, number, number],
    gold:   [184, 134,  11] as [number, number, number],
    grey:    [55,  65,  81] as [number, number, number],
    light:  [248, 250, 252] as [number, number, number],
};

export function exportPmixDashboardToPDF(data: PmixDashboardResult, locationLabel: string) {
    const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.width;
    const pageH = doc.internal.pageSize.height;
    const M = 28;  // margin
    let y = 36;

    // ── Header ───────────────────────────────────────────────────────────────
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(...C.purple);
    const title = `${locationLabel.toUpperCase()} • ${formatDateMonDay(data.businessDate)} PRODUCT MIX DASHBOARD`;
    doc.text(title, M, y);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(data.businessDate, pageW - M, y, { align: "right" });
    y += 18;

    // ── KPI strip (4 cards) ──────────────────────────────────────────────────
    const kpiCards: { label: string; emoji: string; pct: number; sales: number; colour: [number, number, number] }[] = [
        { label: "FOOD",     emoji: "🍲", pct: data.macros.FOOD.pct,     sales: data.macros.FOOD.sales,     colour: C.pink },
        { label: "LIQUOR",   emoji: "🍸", pct: data.macros.LIQUOR.pct,   sales: data.macros.LIQUOR.sales,   colour: C.green },
        { label: "BEVERAGE", emoji: "🥤", pct: data.macros.BEVERAGE.pct, sales: data.macros.BEVERAGE.sales, colour: C.blue },
        { label: "DESSERT",  emoji: "🍰", pct: data.macros.DESSERT.pct,  sales: data.macros.DESSERT.sales,  colour: C.orange },
    ];
    const kpiW = (pageW - M * 2 - 18) / 4;  // 4 cards + 3 gaps
    for (let i = 0; i < kpiCards.length; i++) {
        const k = kpiCards[i];
        const x = M + i * (kpiW + 6);
        doc.setDrawColor(...k.colour);
        doc.setLineWidth(1);
        doc.roundedRect(x, y, kpiW, 64, 6, 6, "S");

        // Label
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(...k.colour);
        doc.text(k.label, x + 10, y + 14);

        // Big %
        doc.setFontSize(22);
        doc.setTextColor(...k.colour);
        doc.text(`${k.pct}%`, x + 10, y + 38);

        // Sales
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(40);
        doc.text(fmtMoney(k.sales), x + 10, y + 54);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(140);
        doc.text("of Total Sales", x + 10, y + 62);
    }
    y += 78;

    // ── Section title helper ─────────────────────────────────────────────────
    const drawSectionBar = (label: string) => {
        doc.setFillColor(...C.purple);
        doc.rect(M, y, pageW - M * 2, 18, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(255);
        doc.text(label, M + 8, y + 12);
        y += 24;
    };

    // ── Top Selling Items by Category ────────────────────────────────────────
    drawSectionBar("TOP SELLING ITEMS BY CATEGORY");

    const colCount = Math.max(1, Math.min(4, data.topByCategory.length));
    if (colCount > 0) {
        const colW = (pageW - M * 2 - (colCount - 1) * 8) / colCount;
        let maxRowsHeight = 0;
        for (let i = 0; i < colCount; i++) {
            const cat = data.topByCategory[i];
            const cx  = M + i * (colW + 8);

            // Column header
            doc.setFont("helvetica", "bold");
            doc.setFontSize(8);
            doc.setTextColor(...C.pink);
            doc.text(cat.category.toUpperCase(), cx + 4, y + 10);

            // Column sub-header row
            doc.setFontSize(6.5);
            doc.setTextColor(140);
            doc.text("ITEM", cx + 4, y + 22);
            doc.text("SOLD", cx + colW - 4, y + 22, { align: "right" });

            // Rows
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            doc.setTextColor(40);
            const startY = y + 34;
            cat.items.forEach((it, idx) => {
                const ry = startY + idx * 14;
                // Rank pill
                doc.setFillColor(...C.pink);
                doc.circle(cx + 8, ry - 3, 5, "F");
                doc.setFont("helvetica", "bold");
                doc.setFontSize(7);
                doc.setTextColor(255);
                doc.text(String(idx + 1), cx + 8, ry - 1, { align: "center" });

                // Item name (truncate to fit)
                doc.setFont("helvetica", "normal");
                doc.setFontSize(7.5);
                doc.setTextColor(40);
                const nameMax = colW - 36;
                const nameStr = truncate(doc, it.itemName, nameMax);
                doc.text(nameStr, cx + 18, ry);

                // Sold
                doc.setFont("helvetica", "bold");
                doc.text(String(it.qty), cx + colW - 4, ry, { align: "right" });
            });
            maxRowsHeight = Math.max(maxRowsHeight, cat.items.length * 14 + 34);
        }
        y += maxRowsHeight + 8;
    }

    // ── Bar Performance + Dessert Performance ────────────────────────────────
    drawSectionBar("BAR PERFORMANCE  ·  DESSERT PERFORMANCE");

    const barCols = [
        { label: "COCKTAILS", items: data.bar.cocktails, colour: C.pink },
        { label: "MOCKTAILS", items: data.bar.mocktails, colour: C.pink },
        { label: "BEER",      items: data.bar.beer,      colour: C.blue },
        { label: "DESSERTS",  items: data.desserts,      colour: C.orange },
    ];
    const bw = (pageW - M * 2 - 3 * 8) / 4;
    let maxBar = 0;
    barCols.forEach((bc, i) => {
        const cx = M + i * (bw + 8);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(...bc.colour);
        doc.text(bc.label, cx + 4, y + 10);

        doc.setFontSize(6.5);
        doc.setTextColor(140);
        doc.text("ITEM", cx + 4, y + 22);
        doc.text("SOLD", cx + bw - 4, y + 22, { align: "right" });

        const startY = y + 34;
        if (bc.items.length === 0) {
            doc.setFont("helvetica", "italic");
            doc.setFontSize(7);
            doc.setTextColor(160);
            doc.text("(none)", cx + 4, startY);
        }
        bc.items.forEach((it, idx) => {
            const ry = startY + idx * 14;
            doc.setFillColor(...bc.colour);
            doc.circle(cx + 8, ry - 3, 5, "F");
            doc.setFont("helvetica", "bold");
            doc.setFontSize(7);
            doc.setTextColor(255);
            doc.text(String(idx + 1), cx + 8, ry - 1, { align: "center" });

            doc.setFont("helvetica", "normal");
            doc.setFontSize(7.5);
            doc.setTextColor(40);
            doc.text(truncate(doc, it.itemName, bw - 36), cx + 18, ry);

            doc.setFont("helvetica", "bold");
            doc.text(String(it.qty), cx + bw - 4, ry, { align: "right" });
        });
        maxBar = Math.max(maxBar, bc.items.length * 14 + 34);
    });
    y += Math.max(maxBar, 50) + 8;

    // ── Page break check before insights/focus ───────────────────────────────
    if (y > pageH - 200) {
        doc.addPage();
        y = 36;
    }

    // ── Key Insights ─────────────────────────────────────────────────────────
    drawSectionBar("KEY INSIGHTS");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(50);
    data.insights.forEach((line, idx) => {
        const ly = y + idx * 14;
        // bullet
        doc.setFillColor(...C.green);
        doc.circle(M + 6, ly - 3, 3, "F");
        doc.setTextColor(50);
        doc.text(line, M + 16, ly);
    });
    y += data.insights.length * 14 + 12;

    // ── Management Focus ─────────────────────────────────────────────────────
    drawSectionBar("MANAGEMENT FOCUS");
    autoTable(doc, {
        startY: y,
        head: [data.focus.map(f => `${f.emoji} ${f.title}`)],
        body: [data.focus.map(f => f.body)],
        margin: { left: M, right: M },
        theme: "grid",
        styles: { fontSize: 7.5, cellPadding: 5, valign: "top", lineColor: [220, 220, 220], lineWidth: 0.4 },
        headStyles: { fillColor: [...C.light], textColor: [...C.purple], fontStyle: "bold", halign: "left", fontSize: 7.5 },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        bodyStyles: { textColor: [50, 50, 50] as any },
        columnStyles: data.focus.reduce<Record<number, { cellWidth: number }>>((m, _f, i) => {
            m[i] = { cellWidth: (pageW - M * 2) / data.focus.length };
            return m;
        }, {}),
    });

    // ── Footer ───────────────────────────────────────────────────────────────
    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(160);
        doc.text(`Generated ${new Date().toLocaleString("en-CA")}`, M, pageH - 18);
        doc.text(`Page ${p}/${totalPages} · BOH Chiang Mai`, pageW - M, pageH - 18, { align: "right" });
    }

    doc.save(`PMIX_Dashboard_${data.businessDate}.pdf`);
}

// ─── Utilities ───────────────────────────────────────────────────────────────
function truncate(doc: jsPDF, text: string, maxWidth: number): string {
    if (doc.getTextWidth(text) <= maxWidth) return text;
    // Binary trim with ellipsis
    let s = text;
    while (s.length > 1 && doc.getTextWidth(s + "…") > maxWidth) s = s.slice(0, -1);
    return s + "…";
}

function formatDateMonDay(iso: string): string {
    const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
    if (isNaN(d.getTime())) return iso;
    const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    return `${months[d.getMonth()]} ${d.getDate()}`;
}
