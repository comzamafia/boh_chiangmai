/**
 * PAR / ROP Suggestion Report — multi-section PDF.
 *
 * Generates one PDF covering Main Protein / Main Dessert / Beverages /
 * Main Curry. Each section is a table of:
 *   Item | Unit | 7-day total | ADU | Current Stock | PAR Min | ROP | PAR Max
 *
 * Lean formula (matches DailyCalendarModal):
 *   ADU      = totalQty / days
 *   PAR Min  = ADU × 1                (1-day safety stock)
 *   ROP      = ADU × 1 + PAR Min      (2 days = lead-time + safety)
 *   PAR Max  = ADU × 3                (3-day max on hand)
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type {
    ProteinHeatmapResult,
    DessertHeatmapResult,
    BeverageHeatmapResult,
    CurryHeatmapResult,
} from "@/lib/api";

// ─── Lean PAR formula ────────────────────────────────────────────────────────
const SAFETY_MULT    = 1;
const LEAD_TIME_DAYS = 1;
const HOLDING_DAYS   = 3;

const fmt = (n: number) => n % 1 === 0 ? String(n) : n.toFixed(2);

interface SectionRow {
    name:         string;
    category?:    string;
    unit:         string;
    totalQty:     number;
    currentStock: number;
    tracked:      boolean;
}

interface Section {
    title:        string;
    colour:       [number, number, number];   // header fill
    days:         number;
    rows:         SectionRow[];
}

function rowsFromProtein(p: ProteinHeatmapResult): SectionRow[] {
    return p.items.map(r => ({
        name:         r.proteinType,
        unit:         r.unit,
        totalQty:     r.totalQty,
        currentStock: r.currentStock,
        tracked:      r.inventoryTracked !== false,
    }));
}
function rowsFromDessert(d: DessertHeatmapResult): SectionRow[] {
    return d.items.map(r => ({
        name:         r.itemName,
        unit:         r.unit,
        totalQty:     r.totalQty,
        currentStock: r.currentStock,
        tracked:      r.inventoryTracked !== false,
    }));
}
function rowsFromBeverage(b: BeverageHeatmapResult): SectionRow[] {
    return b.items.map(r => ({
        name:         r.itemName,
        category:     r.category,
        unit:         r.unit,
        totalQty:     r.totalQty,
        currentStock: r.currentStock,
        tracked:      r.inventoryTracked !== false,
    }));
}
function rowsFromCurry(c: CurryHeatmapResult): SectionRow[] {
    return c.items.map(r => ({
        name:         r.group,
        unit:         r.unit,
        totalQty:     r.totalQty,
        currentStock: r.currentStock,
        tracked:      r.inventoryTracked !== false,
    }));
}

export interface ParReportData {
    protein:   ProteinHeatmapResult  | null;
    dessert:   DessertHeatmapResult  | null;
    beverage:  BeverageHeatmapResult | null;
    curry:     CurryHeatmapResult    | null;
    fromDate:  string;   // YYYY-MM-DD
    toDate:    string;   // YYYY-MM-DD
}

export function exportParReportToPDF(data: ParReportData) {
    const sections: Section[] = [];

    if (data.protein?.items.length) {
        sections.push({
            title:  "Main Protein Usage",
            colour: [13, 148, 136],   // teal-600
            days:   data.protein.days,
            rows:   rowsFromProtein(data.protein),
        });
    }
    if (data.dessert?.items.length) {
        sections.push({
            title:  "Main Desserts Usage (every menu)",
            colour: [219, 39, 119],   // pink-600
            days:   data.dessert.days,
            rows:   rowsFromDessert(data.dessert),
        });
    }
    if (data.beverage?.items.length) {
        sections.push({
            title:  "Beverages Usage (every menu)",
            colour: [147, 51, 234],   // purple-600
            days:   data.beverage.days,
            rows:   rowsFromBeverage(data.beverage),
        });
    }
    if (data.curry?.items.length) {
        sections.push({
            title:  "Main Curry Usage (by group)",
            colour: [217, 119, 6],    // amber-600
            days:   data.curry.days,
            rows:   rowsFromCurry(data.curry),
        });
    }

    const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.width;
    const pageH = doc.internal.pageSize.height;

    // ── Cover header ─────────────────────────────────────────────────────────
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(20);
    doc.text("PAR / ROP Suggestion Report", 40, 50);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(110);
    doc.text("Lean formula: PAR Min = ADU × 1 · ROP = ADU × 2 · PAR Max = ADU × 3", 40, 68);

    const range     = `Period: ${data.fromDate} -> ${data.toDate}`;
    const generated = `Generated: ${new Date().toLocaleString("en-CA", {
        year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    })}`;
    doc.setFontSize(9);
    doc.text(range,     pageW - 40, 50, { align: "right" });
    doc.text(generated, pageW - 40, 68, { align: "right" });

    if (sections.length === 0) {
        doc.setFontSize(12);
        doc.setTextColor(140);
        doc.text("No data available for the selected period.", 40, 120);
        doc.save(`PAR_ROP_Report_${data.fromDate}_to_${data.toDate}.pdf`);
        return;
    }

    let cursorY = 90;

    sections.forEach((section, idx) => {
        // Section header bar
        doc.setFillColor(...section.colour);
        doc.rect(40, cursorY, pageW - 80, 22, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(255);
        doc.text(`${idx + 1}. ${section.title}`, 50, cursorY + 15);
        doc.setFontSize(9);
        doc.text(`${section.rows.length} items · ${section.days}-day window`, pageW - 50, cursorY + 15, { align: "right" });
        doc.setTextColor(0);

        const body: (string | { content: string; styles?: Record<string, unknown> })[][] = section.rows.map(r => {
            const adu      = r.totalQty / section.days;
            const parMin   = adu * SAFETY_MULT;
            const rop      = adu * LEAD_TIME_DAYS + parMin;
            const parMax   = adu * HOLDING_DAYS;
            const orderRec = parMin - (r.currentStock - 0); // not used as separate col but kept for parity

            const nameCell = r.category
                ? `${r.name}\n${r.category}`
                : r.name;

            const tracked = r.tracked
                ? ""
                : "  (not tracked)";

            void orderRec;

            return [
                { content: nameCell + tracked, styles: r.tracked ? {} : { textColor: [194, 65, 12] as [number,number,number] } },
                r.unit,
                fmt(+r.totalQty.toFixed(2)),
                fmt(+adu.toFixed(2)),
                fmt(+r.currentStock.toFixed(2)),
                fmt(+parMin.toFixed(2)),
                fmt(+rop.toFixed(2)),
                fmt(+parMax.toFixed(2)),
            ];
        });

        autoTable(doc, {
            startY: cursorY + 28,
            head: [[
                "Item", "Unit",
                `${section.days}-day Total`, "ADU/day",
                "Current Stock", "PAR Min", "ROP", "PAR Max",
            ]],
            body,
            margin: { left: 40, right: 40 },
            theme: "grid",
            styles: { fontSize: 8, cellPadding: 4, valign: "middle" },
            headStyles: {
                fillColor: [243, 244, 246],
                textColor: [55, 65, 81],
                fontSize: 8,
                halign: "center",
                fontStyle: "bold",
            },
            columnStyles: {
                0: { halign: "left", cellWidth: 140, fontStyle: "bold" },
                1: { halign: "center", cellWidth: 44 },
                2: { halign: "right",  cellWidth: 55 },
                3: { halign: "right",  cellWidth: 50 },
                4: { halign: "right",  cellWidth: 60 },
                5: { halign: "right",  cellWidth: 50, textColor: [194, 65, 12], fontStyle: "bold" },
                6: { halign: "right",  cellWidth: 50, textColor: [4, 120, 87],  fontStyle: "bold" },
                7: { halign: "right",  cellWidth: 50, textColor: [37, 99, 235], fontStyle: "bold" },
            },
        });

        // Move cursor below the table; jsPDF-autotable updates .lastAutoTable.finalY
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        cursorY = ((doc as any).lastAutoTable?.finalY ?? cursorY + 100) + 24;

        // Add page break if running out of room
        if (cursorY > pageH - 120 && idx < sections.length - 1) {
            doc.addPage();
            cursorY = 60;
        }
    });

    // ── Footer (every page) ──────────────────────────────────────────────────
    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(140);
        doc.text(
            "Legend: ADU = Avg Daily Usage · PAR Min = 1-day safety stock · ROP = reorder when below this · PAR Max = 3-day max on hand",
            40, pageH - 25,
        );
        doc.text(`Page ${p} / ${totalPages} · BOH Chiang Mai`, pageW - 40, pageH - 25, { align: "right" });
    }

    doc.save(`PAR_ROP_Report_${data.fromDate}_to_${data.toDate}.pdf`);
}
