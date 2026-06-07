/**
 * PDF export for the Usage Report — polished, heat-graded, multi-unit cells.
 * Each weekday cell stacks every configured unit (e.g. "158 Order / 15 lb /
 * 3.75 Box"); the page passes the rendered strings + raw order counts (for the
 * heat shading).
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const NAVY: [number, number, number] = [30, 41, 59];
const MUTED: [number, number, number] = [148, 163, 184];
const INK:  [number, number, number] = [17, 24, 39];   // strong near-black for data text

export interface UsageExportRow {
    label: string;
    dayCells: string[];           // multi-line "value unit" per weekday ("" if none)
    dayOrders: (number | null)[]; // raw orders per weekday (for heat)
    total: string;                // multi-line all-units total
    avg: string;                  // single-line avg/day (primary unit)
}
export interface UsageExportSection { title: string; rows: UsageExportRow[] }
export interface UsageFlavorRow { flavor: string; cells: string[]; total: string }
export interface UsageReportExport {
    days: number;
    dowCounts: number[];
    sections: UsageExportSection[];
    iceCream: UsageFlavorRow[];
    fileLabel?: string;   // e.g. "main-protein" — used in the filename
}

export function exportUsageReportPDF(d: UsageReportExport) {
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.width;
    const pageH = doc.internal.pageSize.height;
    const M = 24;

    doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(...NAVY);
    doc.text("Usage Report", M, 36);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...MUTED);
    doc.text(`Last ${d.days} days · from PMIX sales`, M, 50);
    doc.text(`Generated: ${new Date().toLocaleString("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}`, pageW - M, 50, { align: "right" });

    const dowHead = DOW.map((dd, i) => `${dd}\n×${d.dowCounts[i] ?? 0}`);
    let y = 64;
    const DAY0 = 1, TOTAL = DAY0 + 7, AVG = TOTAL + 1;

    for (const s of d.sections) {
        if (s.rows.length === 0) continue;
        if (y > pageH - 80) { doc.addPage(); y = 40; }
        doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...NAVY);
        doc.text(`${s.title} — Last ${d.days} Days`, M, y + 4);
        y += 12;

        autoTable(doc, {
            startY: y,
            head: [["Item", ...dowHead, "Total", "Avg/d"]],
            body: s.rows.map(r => [r.label, ...r.dayCells, r.total, r.avg]),
            margin: { left: M, right: M },
            styles: { font: "helvetica", fontStyle: "bold", fontSize: 8, cellPadding: 3, textColor: INK, lineColor: [203, 213, 225], lineWidth: 0.4, valign: "middle" },
            headStyles: { fillColor: [241, 245, 249], textColor: NAVY, fontStyle: "bold", fontSize: 7.5, halign: "center", valign: "middle", lineColor: [203, 213, 225], lineWidth: 0.4 },
            columnStyles: {
                0: { halign: "left", cellWidth: 110, fontSize: 9 },
                [TOTAL]: { halign: "center", fillColor: [248, 250, 252] },
                [AVG]: { halign: "center" },
            },
            didParseCell: (data) => {
                const ci = data.column.index;
                if (data.section === "body" && ci >= DAY0 && ci < DAY0 + 7) {
                    data.cell.styles.halign = "center";
                    const v = s.rows[data.row.index]?.dayOrders[ci - DAY0] ?? 0;
                    if (v <= 0) data.cell.styles.textColor = MUTED;
                }
            },
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        y = (doc as any).lastAutoTable.finalY + 16;
    }

    if (d.iceCream.length > 0) {
        if (y > pageH - 80) { doc.addPage(); y = 40; }
        doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...NAVY);
        doc.text("Ice Cream — by flavour (orders)", M, y + 4); y += 12;
        autoTable(doc, {
            startY: y,
            head: [["Flavour", ...dowHead, "Total"]],
            body: d.iceCream.map(r => [r.flavor, ...r.cells, r.total]),
            margin: { left: M, right: M },
            styles: { font: "helvetica", fontStyle: "bold", fontSize: 8, cellPadding: 3, textColor: INK, lineColor: [203, 213, 225], lineWidth: 0.4 },
            headStyles: { fillColor: [241, 245, 249], textColor: NAVY, fontStyle: "bold", fontSize: 7.5, halign: "center" },
            columnStyles: { 0: { halign: "left", cellWidth: 180 } },
            didParseCell: (data) => { if (data.column.index >= 1) data.cell.styles.halign = data.column.index === 8 ? "right" : "center"; },
        });
    }

    const slug = (d.fileLabel ?? "report").replace(/\s+/g, "-").toLowerCase();
    doc.save(`usage-${slug}-${d.days}d-${new Date().toISOString().slice(0, 10)}.pdf`);
}
